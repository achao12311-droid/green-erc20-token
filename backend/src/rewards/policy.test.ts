import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEVELOPMENT_POLICY, pointsFor, rewardWei } from "./policy.ts";

test("development policy does not convert points into ECO", () => {
  assert.equal(DEVELOPMENT_POLICY.conversionConfirmed, false);
  assert.equal(pointsFor(DEVELOPMENT_POLICY, "BEACH_CLEANUP"), 150);
  assert.deepEqual(rewardWei(DEVELOPMENT_POLICY, "BEACH_CLEANUP"), {
    ok: false,
    reason: "conversion_unconfirmed",
  });
});

test("a confirmed test policy uses integer wei and ignores no caller amount", () => {
  const policy = {
    ...DEVELOPMENT_POLICY,
    conversionConfirmed: true,
    weiPerPoint: "1000000000000000",
  };
  assert.equal(rewardWei(policy, "RECYCLING").ok && rewardWei(policy, "RECYCLING").wei, (30n * 10n ** 15n).toString());
});

test("the published policy file matches the development policy", () => {
  const file = JSON.parse(readFileSync(new URL("../../../records/reward-policy.json", import.meta.url), "utf8"));
  assert.equal(file.version, DEVELOPMENT_POLICY.version);
  assert.equal(file.conversionConfirmed, false);
  assert.equal(file.weiPerPoint, null);
  assert.deepEqual(file.points, DEVELOPMENT_POLICY.points);
});
