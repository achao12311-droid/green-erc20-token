import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEVELOPMENT_POLICY, pointsFor, rewardWei } from "./policy.ts";

test("development policy pays ECO from the point schedule", () => {
  assert.equal(DEVELOPMENT_POLICY.conversionConfirmed, true);
  assert.equal(pointsFor(DEVELOPMENT_POLICY, "PARK_CLEANUP"), 100);
  const reward = rewardWei(DEVELOPMENT_POLICY, "PARK_CLEANUP");
  assert.equal(reward.ok && reward.wei, (100n * 10n ** 16n).toString());
});

test("an unconfirmed policy still refuses to price a reward", () => {
  const policy = { ...DEVELOPMENT_POLICY, conversionConfirmed: false, weiPerPoint: null };
  assert.deepEqual(rewardWei(policy, "BEACH_CLEANUP"), {
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
  assert.equal(file.conversionConfirmed, true);
  assert.equal(file.weiPerPoint, DEVELOPMENT_POLICY.weiPerPoint);
  assert.deepEqual(file.points, DEVELOPMENT_POLICY.points);
});
