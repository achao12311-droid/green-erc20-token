"use client";

import { FormEvent, useState } from "react";
import { formatUnits, getAddress, isAddress as isWalletAddress, parseUnits } from "viem";
import { sepolia } from "wagmi/chains";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Notice, Shell } from "../../components/Shell";
import { isAddress, tokenAddress } from "../../lib/config";
import { config } from "../../lib/wagmi";

const abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export default function WalletPage() {
  const account = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState("把收款地址貼給對方，對方就能把 ECO 轉過來。收款人不需要先同意。");
  const enabled = Boolean(account.address && isAddress(tokenAddress));
  const balance = useReadContract({
    address: isAddress(tokenAddress) ? tokenAddress : undefined,
    abi,
    functionName: "balanceOf",
    args: account.address ? [account.address] : undefined,
    chainId: sepolia.id,
    query: { enabled },
  });

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const to = String(form.get("to") || "").trim();
    const amount = String(form.get("amount") || "").trim();
    if (!account.address) {
      setStatus("請先連接 ECO Wallet 或瀏覽器錢包。");
      return;
    }
    if (!isAddress(tokenAddress)) {
      setStatus("尚未設定 NEXT_PUBLIC_ECO_TOKEN_ADDRESS，所以不能送出。");
      return;
    }
    if (!isWalletAddress(to)) {
      setStatus("請輸入對方的錢包地址。");
      return;
    }
    if (getAddress(to) === getAddress(tokenAddress)) {
      setStatus("不能把 ECO 轉進代幣合約自己。");
      return;
    }
    let value: bigint;
    try {
      value = parseUnits(amount, 18);
    } catch {
      setStatus("請輸入大於 0 的數量。");
      return;
    }
    if (value <= BigInt(0)) {
      setStatus("請輸入大於 0 的數量。");
      return;
    }
    setStatus("請在錢包裡允許這筆轉帳。Sepolia 上還需要一點 ETH 當手續費。");
    try {
      const hash = await writeContractAsync({
        address: tokenAddress,
        abi,
        functionName: "transfer",
        args: [getAddress(to), value],
        chainId: sepolia.id,
      });
      setStatus("交易已送出，等待入塊：" + hash);
      await waitForTransactionReceipt(config, { hash, chainId: sepolia.id });
      setStatus("已轉出 " + amount + " ECO 到 " + to);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "轉帳沒有送出。");
    }
  }

  async function copyAddress() {
    if (!account.address) return;
    await navigator.clipboard.writeText(account.address);
    setStatus("地址已複製。任何人都可以把 ECO 轉到這個地址。");
  }

  return (
    <Shell title="錢包">
      <div className="grid gap-4">
        <Notice>
          {isAddress(tokenAddress)
            ? "ECO 可以轉給任何地址，也可以從任何地址收下。合約 " + tokenAddress
            : "尚未設定 NEXT_PUBLIC_ECO_TOKEN_ADDRESS。連上錢包之後可以看到地址，但還不能讀餘額或轉帳。"}
        </Notice>
        <p>網路：Sepolia 11155111</p>
        <p>餘額：{balance.data !== undefined ? formatUnits(balance.data, 18) + " ECO" : "沒有讀到"}</p>
        <div>
          <p className="mb-2 text-sm">你的收款地址</p>
          <p className="break-all">{account.address || "尚未連接"}</p>
          {account.address ? (
            <button className="mt-2 border border-sap/40 px-3 py-2 text-sm" onClick={copyAddress} type="button">
              複製地址
            </button>
          ) : null}
        </div>
        <form className="grid max-w-xl gap-3" onSubmit={onSend}>
          <label className="grid gap-2 text-sm">
            對方地址
            <input className="bg-ink p-2" name="to" spellCheck={false} />
          </label>
          <label className="grid gap-2 text-sm">
            數量
            <input className="bg-ink p-2" inputMode="decimal" name="amount" />
          </label>
          <button className="w-fit bg-leaf px-4 py-2" type="submit">
            轉出 ECO
          </button>
        </form>
        {balance.error ? <p>{balance.error.message}</p> : null}
        <Notice>{status}</Notice>
      </div>
    </Shell>
  );
}
