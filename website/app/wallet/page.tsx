"use client";

import { formatUnits } from "viem";
import { sepolia } from "wagmi/chains";
import { useAccount, useReadContract } from "wagmi";
import { Notice, Shell } from "../../components/Shell";
import { isAddress, tokenAddress } from "../../lib/config";

const abi = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] }] as const;

export default function WalletPage() {
  const account = useAccount();
  const enabled = Boolean(account.address && isAddress(tokenAddress));
  const balance = useReadContract({
    address: isAddress(tokenAddress) ? tokenAddress : undefined,
    abi,
    functionName: "balanceOf",
    args: account.address ? [account.address] : undefined,
    chainId: sepolia.id,
    query: { enabled },
  });

  return (
    <Shell title="錢包">
      <div className="grid gap-3">
        <Notice>
          {isAddress(tokenAddress)
            ? "合約 " + tokenAddress
            : "尚未設定 NEXT_PUBLIC_ECO_TOKEN_ADDRESS，所以不會顯示餘額。"}
        </Notice>
        <p>網路：Sepolia 11155111</p>
        <p>餘額：{balance.data !== undefined ? formatUnits(balance.data, 18) + " ECO" : "沒有讀到"}</p>
        {balance.error ? <p>{balance.error.message}</p> : null}
      </div>
    </Shell>
  );
}
