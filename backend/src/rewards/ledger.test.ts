import assert from "node:assert/strict";
import test from "node:test";
import { RewardLedger, type RewardAuthorization } from "./ledger.ts";

test("a submission can be authorized once", () => {
  const ledger = new RewardLedger();
  const first = authorization("submission-1");
  const again = { ...authorization("submission-1"), id: "different-id", wei: "1" };
  const created = ledger.authorize(first);
  const duplicate = ledger.authorize(again);
  assert.equal(created.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.record.id, first.id);
  assert.equal(duplicate.record.wei, first.wei);
  assert.equal(duplicate.record.signature, null);
  assert.equal(ledger.listFor(first.wallet).length, 1);
});

function authorization(submissionId: string): RewardAuthorization {
  return {
    id: "auth-" + submissionId,
    submissionId,
    wallet: "0xabc",
    points: 30,
    wei: "30",
    policyVersion: 1,
    status: "ready_for_attestation",
    signature: null,
  };
}
