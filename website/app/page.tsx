"use client";

import Link from "next/link";
import { Shell } from "../components/Shell";

export default function HomePage() {
  return (
    <Shell title="用實際的環境行動取得 ECO">
      <div className="grid gap-4">
        <p className="max-w-2xl text-lg leading-8 text-sap/90">
          提交環境活動影片，經過模型與人工審核之後，才有資格取得 ECO。ECO 是部署在以太坊上的 ERC-20，質押不會變成以太坊驗證者，也不會產生利息。
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {["提交影片", "等待審核", "再決定是否鑄幣"].map((item) => (
            <div key={item} className="border border-leaf/40 bg-moss p-4">{item}</div>
          ))}
        </div>
        <Link href="/submit" className="w-fit bg-sap px-4 py-2 text-ink">開始提交</Link>
      </div>
    </Shell>
  );
}
