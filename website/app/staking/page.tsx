"use client";

import { formatUnits } from "viem";
import { sepolia } from "wagmi/chains";
import { useAccount, useReadContract } from "wagmi";
import { Notice, Shell } from "../../components/Shell";
import { isAddress, stakingAddress } from "../../lib/config";

const abi = [{ type: "function", name: "staked", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }] as const;

export default function StakingPage() {
  const account = useAccount();
  const enabled = Boolean(account.address && isAddress(stakingAddress));
  const staked = useReadContract({
    address: isAddress(stakingAddress) ? stakingAddress : undefined,
    abi,
    functionName: "staked",
    args: account.address ? [account.address] : undefined,
    chainId: sepolia.id,
    query: { enabled },
  });

  return (
    <Shell title="質押">
      <Notice>這是應用程式裡的 ECO 鎖定，不是以太坊驗證者質押，也沒有年化報酬。解除鎖定會拿回同一數量的 ECO。</Notice>
      <p className="mt-4">
        {staked.data !== undefined ? "已鎖定 " + formatUnits(staked.data, 18) + " ECO" : "尚未設定質押合約或尚未讀到鏈上資料。"}
      </p>
    </Shell>
  );
}
