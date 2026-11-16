"use client";

import { FormEvent, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { Notice, Shell } from "../../components/Shell";
import { apiUrl } from "../../lib/config";

const rewards = [
  ["撿垃圾", "0.5 ECO"],
  ["回收", "0.3 ECO"],
  ["公園清理", "1 ECO"],
  ["海灘清理", "1.5 ECO"],
  ["種樹", "2 ECO"],
  ["環境活動", "3 ECO"],
];

export default function SubmitPage() {
  const account = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [message, setMessage] = useState("選好行為並上傳影片。模型會自己看畫面，通過就準備 ECO，不需要等人審。");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("video");
    const action = String(form.get("action") || "");
    const description = String(form.get("description") || "");
    if (!(file instanceof File) || file.size === 0) {
      setMessage("請選擇一支影片。");
      return;
    }
    if (!account.address) {
      setMessage("請先連接錢包。網站不會向你要私鑰。");
      return;
    }
    setMessage("正在登入並送出影片…");
    const cookieOk = await signIn(account.address, signMessageAsync);
    if (!cookieOk) {
      setMessage("錢包登入沒有成功。請確認後端已在 4000 埠啟動。");
      return;
    }
    const created = await fetch(apiUrl + "/api/v1/submissions", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ action, description }),
    });
    if (!created.ok) {
      setMessage("提交沒有建立。");
      return;
    }
    const submission = await created.json();
    const uploaded = await fetch(apiUrl + "/api/v1/submissions/" + submission.id + "/video-upload", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": file.type || "video/mp4" },
      body: file,
    });
    if (!uploaded.ok) {
      setMessage("影片沒有存進伺服器。");
      return;
    }
    setMessage("模型正在看影片…");
    const verified = await fetch(apiUrl + "/api/v1/ai/verify/" + submission.id, { method: "POST", credentials: "include" });
    const verdict = await verified.json();
    if (!verified.ok || verdict.decision !== "approved") {
      setMessage("沒有通過：" + (verdict.reason || verified.status) + "。看到的物件：" + ((verdict.observedLabels || []).join("、") || "沒有"));
      return;
    }
    const claim = await fetch(apiUrl + "/api/v1/rewards/claim/" + submission.id, { method: "POST", credentials: "include" });
    const reward = await claim.json();
    if (!claim.ok) {
      setMessage("影片通過了，但獎勵沒有準備好：" + (reward.error || claim.status));
      return;
    }
    const eco = Number(BigInt(reward.wei) / 10n ** 16n) / 100;
    setMessage("通過，已準備 " + eco + " ECO。這筆還要證明人簽名後才會進錢包。");
  }

  return (
    <Shell title="用環境行為換 ECO">
      <div className="mb-4 grid gap-2 md:grid-cols-3">
        {rewards.map(([name, amount]) => (
          <div key={name} className="border border-white/10 p-3">
            <p>{name}</p>
            <p className="text-sap">{amount}</p>
          </div>
        ))}
      </div>
      <form className="grid max-w-xl gap-4" onSubmit={onSubmit}>
        <label className="grid gap-2 text-sm">活動
          <select className="bg-ink p-2" name="action">
            <option value="PICK_UP_LITTER">撿垃圾</option>
            <option value="RECYCLING">回收</option>
            <option value="PARK_CLEANUP">公園清理</option>
            <option value="BEACH_CLEANUP">海灘清理</option>
            <option value="TREE_PLANTING">種樹</option>
            <option value="ENVIRONMENTAL_EVENT">環境活動</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm">說明
          <textarea className="min-h-28 bg-ink p-2" name="description" required />
        </label>
        <label className="grid gap-2 text-sm">影片
          <input accept="video/mp4,video/webm" name="video" type="file" required />
        </label>
        <button className="w-fit bg-leaf px-4 py-2" type="submit">交給模型檢查</button>
      </form>
      <div className="mt-4"><Notice>{message}</Notice></div>
    </Shell>
  );
}

async function signIn(address: string, signMessageAsync: (args: { message: string }) => Promise<string>) {
  const nonceResponse = await fetch(apiUrl + "/api/v1/auth/nonce", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!nonceResponse.ok) return false;
  const nonce = (await nonceResponse.json()).nonce as string;
  const message = [
    window.location.host + " wants you to sign in with your Ethereum account:",
    address,
    "",
    "Sign in to ECO",
    "",
    "URI: " + window.location.origin,
    "Version: 1",
    "Chain ID: 11155111",
    "Nonce: " + nonce,
    "Issued At: " + new Date().toISOString(),
  ].join("\n");
  const signature = await signMessageAsync({ message });
  const verified = await fetch(apiUrl + "/api/v1/auth/verify", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  return verified.ok;
}
