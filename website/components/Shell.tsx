"use client";

import Link from "next/link";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "@wagmi/core";
import { sepolia } from "wagmi/chains";

const links = [
  ["/", "首頁"],
  ["/dashboard", "儀表板"],
  ["/submit", "提交"],
  ["/history", "紀錄"],
  ["/wallet", "錢包"],
  ["/staking", "質押"],
  ["/rewards", "月度活動"],
  ["/profile", "個人"],
  ["/admin", "審核"],
];

export function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const account = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const wrongChain = account.isConnected && account.chainId !== sepolia.id;

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-8 px-6 py-8 md:grid-cols-[220px_1fr]">
      <aside className="border border-white/10 bg-moss/80 p-4">
        <p className="text-xs uppercase tracking-[0.25em] text-sap/70">Green Eco</p>
        <h1 className="mt-2 text-2xl font-semibold">ECO</h1>
        <nav className="mt-8 grid gap-2 text-sm">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="border-l border-leaf px-3 py-1 hover:bg-white/5">
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-3xl font-semibold">{title}</h2>
          {account.isConnected ? (
            <button className="border border-sap/40 px-3 py-2 text-sm" onClick={() => disconnect()} type="button">
              {account.address?.slice(0, 6)}…{account.address?.slice(-4)}
            </button>
          ) : (
            <button className="bg-leaf px-3 py-2 text-sm" onClick={() => connect({ connector: injected() })} type="button">
              連接錢包
            </button>
          )}
        </div>
        {wrongChain ? <p className="mb-4 border border-amber-300/40 p-3 text-sm">請切換到 Sepolia（鏈 ID 11155111）。這個網站不會送出其他網路的交易。</p> : null}
        {children}
      </main>
    </div>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <p className="border border-white/10 bg-black/20 p-4 text-sm leading-6 text-sap/90">{children}</p>;
}
