import assert from "node:assert/strict";
import test from "node:test";
import { Wallet } from "ethers";
import { buildServer } from "./server.ts";
import { DEVELOPMENT_POLICY } from "./rewards/policy.ts";

const wallet = new Wallet("0x" + "0".repeat(63) + "1");

test("actions expose points and an unauthenticated claim is rejected", async () => {
  const app = await buildServer();
  const actions = await app.inject({ method: "GET", url: "/api/v1/actions" });
  assert.equal(actions.statusCode, 200);
  assert.equal(actions.json().conversionConfirmed, true);
  const claim = await app.inject({ method: "POST", url: "/api/v1/rewards/claim/missing" });
  assert.equal(claim.statusCode, 401);
  await app.close();
});

test("an approved submission prepares the scheduled ECO amount", async () => {
  process.env.ADMIN_ADDRESSES = wallet.address.toLowerCase();
  const app = await buildServer({
    policy: DEVELOPMENT_POLICY,
    verifier: async () => ({
      decision: "approved",
      reason: "action_match",
      predictedAction: "PARK_CLEANUP",
      modelsConfigured: true,
      exactDuplicate: false,
      nearDuplicate: false,
      perceptual: "average_hash",
      observedLabels: ["ashcan"],
      frameHashes: ["0000000000000000"],
      model: "test-double",
    }),
  });
  const cookie = await signIn(app);
  const created = await app.inject({
    method: "POST",
    url: "/api/v1/submissions",
    headers: { cookie, "idempotency-key": "idem-123456" },
    payload: { action: "PARK_CLEANUP", description: "bags of litter" },
  });
  assert.equal(created.statusCode, 201, created.body);
  const id = created.json().id as string;
  const again = await app.inject({
    method: "POST",
    url: "/api/v1/submissions",
    headers: { cookie, "idempotency-key": "idem-123456" },
    payload: { action: "TREE_PLANTING", description: "different" },
  });
  assert.equal(again.json().id, id);
  const draftReview = await app.inject({
    method: "POST",
    url: "/api/v1/admin/reviews/" + id,
    headers: { cookie },
    payload: { decision: "approved", reason: "too early" },
  });
  assert.equal(draftReview.statusCode, 409);
  assert.equal(draftReview.json().error, "review_not_eligible");
  assert.ok(draftReview.json().blockers.includes("video_missing"));
  const uploaded = await app.inject({
    method: "POST",
    url: "/api/v1/submissions/" + id + "/video-upload",
    headers: { cookie, "content-type": "video/mp4" },
    payload: Buffer.from("video-bytes"),
  });
  assert.equal(uploaded.statusCode, 200, uploaded.body);
  assert.equal(uploaded.json().bytesStored, true);
  const verified = await app.inject({ method: "POST", url: "/api/v1/ai/verify/" + id, headers: { cookie } });
  assert.equal(verified.statusCode, 200, verified.body);
  assert.equal(verified.json().decision, "approved");
  assert.equal(verified.json().models.action.status, "configured");
  const claim = await app.inject({
    method: "POST",
    url: "/api/v1/rewards/claim/" + id,
    headers: { cookie },
  });
  assert.equal(claim.statusCode, 201, claim.body);
  assert.equal(claim.json().wei, (100n * 10n ** 16n).toString());
  assert.equal(claim.json().signature, null);
  await app.close();
});

async function signIn(app: Awaited<ReturnType<typeof buildServer>>): Promise<string> {
  const nonce = await app.inject({ method: "POST", url: "/api/v1/auth/nonce", payload: { address: wallet.address } });
  assert.equal(nonce.statusCode, 200, nonce.body);
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
  const setCookie = String(verified.headers["set-cookie"]).split(";")[0];
  return setCookie;
}
