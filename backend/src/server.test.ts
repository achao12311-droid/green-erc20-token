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
  assert.equal(actions.json().conversionConfirmed, false);
  const claim = await app.inject({ method: "POST", url: "/api/v1/rewards/claim/missing" });
  assert.equal(claim.statusCode, 401);
  await app.close();
});

test("an approved submission cannot claim ECO while the conversion is unconfirmed", async () => {
  process.env.ADMIN_ADDRESSES = wallet.address.toLowerCase();
  const app = await buildServer({ policy: DEVELOPMENT_POLICY });
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
  const review = await app.inject({
    method: "POST",
    url: "/api/v1/admin/reviews/" + id,
    headers: { cookie },
    payload: { decision: "approved" },
  });
  assert.equal(review.statusCode, 200, review.body);
  const claim = await app.inject({
    method: "POST",
    url: "/api/v1/rewards/claim/" + id,
    headers: { cookie },
  });
  assert.equal(claim.statusCode, 409);
  assert.equal(claim.json().error, "conversion_unconfirmed");
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
