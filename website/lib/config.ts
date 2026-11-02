export const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export const tokenAddress = process.env.NEXT_PUBLIC_ECO_TOKEN_ADDRESS as `0x${string}` | undefined;

export const stakingAddress = process.env.NEXT_PUBLIC_ECO_STAKING_ADDRESS as `0x${string}` | undefined;

export function isAddress(value: string | undefined): value is `0x${string}` {
  return Boolean(value && /^0x[a-fA-F0-9]{40}$/.test(value));
}
