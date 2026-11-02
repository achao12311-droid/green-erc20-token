export const ACTIONS = [
  "PICK_UP_LITTER",
  "RECYCLING",
  "PARK_CLEANUP",
  "BEACH_CLEANUP",
  "TREE_PLANTING",
  "ENVIRONMENTAL_EVENT",
] as const;

export type ActionCode = (typeof ACTIONS)[number];

export type RewardPolicy = {
  version: number;
  conversionConfirmed: boolean;
  weiPerPoint: string | null;
  points: Record<ActionCode, number>;
};

export const DEVELOPMENT_POLICY: RewardPolicy = {
  version: 1,
  conversionConfirmed: false,
  weiPerPoint: null,
  points: {
    PICK_UP_LITTER: 50,
    RECYCLING: 30,
    PARK_CLEANUP: 100,
    BEACH_CLEANUP: 150,
    TREE_PLANTING: 200,
    ENVIRONMENTAL_EVENT: 300,
  },
};

export function pointsFor(policy: RewardPolicy, action: string): number {
  if (!Object.hasOwn(policy.points, action)) {
    throw new Error("unknown_action");
  }
  const points = policy.points[action as ActionCode];
  if (!Number.isInteger(points) || points <= 0) {
    throw new Error("invalid_points");
  }
  return points;
}

export function rewardWei(policy: RewardPolicy, action: string): { ok: false; reason: "conversion_unconfirmed" } | { ok: true; wei: string } {
  const points = pointsFor(policy, action);
  if (!policy.conversionConfirmed || policy.weiPerPoint === null) {
    return { ok: false, reason: "conversion_unconfirmed" };
  }
  if (!/^[1-9]\d*$/.test(policy.weiPerPoint)) {
    throw new Error("invalid_conversion");
  }
  return { ok: true, wei: (BigInt(points) * BigInt(policy.weiPerPoint)).toString() };
}
