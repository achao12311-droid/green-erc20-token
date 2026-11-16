import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { buildServer } from "./server.ts";
import { DEVELOPMENT_POLICY, type RewardPolicy } from "./rewards/policy.ts";

const user = new Wallet("0x" + "0".repeat(63) + "2");
const admin = new Wallet("0x" + "0".repeat(63) + "1");
const video = { contentType: "video/mp4", byteSize: 4096, sha256: "cd".repeat(32) };

const confirmed: RewardPolicy = {
  ...DEVELOPMENT_POLICY,
  conversionConfirmed: true,
  weiPerPoint: "1000000000000000000",
};

test("login, automatic verification, and one attestation request", async () => {
  const app = await buildServer({
    policy: confirmed,
    verifier: async () => ({
      decision: "approved",
      reason: "action_match",
      predictedAction: "RECYCLING",
      modelsConfigured: true,
      exactDuplicate: false,
      nearDuplicate: false,
      perceptual: "average_hash",
      observedLabels: ["water bottle"],
      frameHashes: ["aaaaaaaaaaaaaaaa"],
      model: "test-double",
    }),
  });
  const userCookie = await signIn(app, user);

  const created = await app.inject({
    method: "POST",
    url: "/api/v1/submissions",
    headers: { cookie: userCookie, "idempotency-key": "flow-key-1" },
    payload: { action: "RECYCLING", description: "sorted bottles" },
  });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id as string;

  const uploaded = await app.inject({
    method: "POST",
    url: "/api/v1/submissions/" + id + "/video-upload",
    headers: { cookie: userCookie, "content-type": "video/mp4" },
    payload: Buffer.from("recycling-video"),
  });
  assert.equal(uploaded.json().bytesStored, true);
  const verified = await app.inject({ method: "POST", url: "/api/v1/ai/verify/" + id, headers: { cookie: userCookie } });
  assert.equal(verified.json().decision, "approved");
  assert.equal(verified.json().reason, "action_match");
  assert.equal(verified.json().duplicateDetection.sha256.scope, "identical_bytes_only");

  const first = await app.inject({ method: "POST", url: "/api/v1/rewards/claim/" + id, headers: { cookie: userCookie } });
  const second = await app.inject({ method: "POST", url: "/api/v1/rewards/claim/" + id, headers: { cookie: userCookie } });
  assert.equal(first.statusCode, 201, first.body);
  assert.equal(second.statusCode, 200, second.body);
  assert.equal(second.json().id, first.json().id);
  assert.equal(second.json().wei, (30n * 10n ** 18n).toString());
  assert.equal(second.json().signature, null);
  assert.equal(second.json().status, "ready_for_attestation");
  const history = await app.inject({ method: "GET", url: "/api/v1/rewards/history", headers: { cookie: userCookie } });
  assert.equal(history.json().length, 1);
  await app.close();
});

test("an exact sha256 match is rejected and cannot be approved", async () => {
  process.env.ADMIN_ADDRESSES = admin.address.toLowerCase();
  const app = await buildServer({ policy: DEVELOPMENT_POLICY });
  const userCookie = await signIn(app, user);
  const adminCookie = await signIn(app, admin);
  const first = await create(app, userCookie, "flow-key-a");
  const second = await create(app, userCookie, "flow-key-b");
  for (const id of [first, second]) {
    await app.inject({
      method: "POST",
      url: "/api/v1/submissions/" + id + "/video-upload",
      headers: { cookie: userCookie },
      payload: video,
    });
  }
  const duplicate = await app.inject({ method: "POST", url: "/api/v1/ai/verify/" + second, headers: { cookie: userCookie } });
  assert.equal(duplicate.json().decision, "rejected");
  assert.equal(duplicate.json().reason, "exact_duplicate");
  assert.equal(duplicate.json().duplicateDetection.perceptual.status, "not_configured");
  const review = await app.inject({
    method: "POST",
    url: "/api/v1/admin/reviews/" + second,
    headers: { cookie: adminCookie },
    payload: { decision: "approved" },
  });
  assert.equal(review.statusCode, 409);
  assert.equal(review.json().error, "review_not_eligible");
  await app.close();
});

async function create(app: Awaited<ReturnType<typeof buildServer>>, cookie: string, key: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/submissions",
    headers: { cookie, "idempotency-key": key },
    payload: { action: "RECYCLING", description: "sorted bottles" },
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().id as string;
}

async function signIn(app: Awaited<ReturnType<typeof buildServer>>, wallet: Wallet): Promise<string> {
  const nonce = await app.inject({ method: "POST", url: "/api/v1/auth/nonce", payload: { address: wallet.address } });
  const issued = nonce.json().nonce as string;
  const message = [
    "localhost wants you to sign in with your Ethereum account:",
    wallet.address,
    "",
    "Sign in to ECO",
    "",
    "URI: http://localhost",
    "Version: 1",
    "Chain ID: 11155111",
    "Nonce: " + issued,
    "Issued At: 2026-11-03T00:00:00.000Z",
  ].join("\n");
  const signature = await wallet.signMessage(message);
  const verified = await app.inject({ method: "POST", url: "/api/v1/auth/verify", payload: { message, signature } });
  assert.equal(verified.statusCode, 200, verified.body);
  return String(verified.headers["set-cookie"]).split(";")[0];
}
