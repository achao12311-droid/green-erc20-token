"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { Notice, Shell } from "../../components/Shell";
import { apiUrl } from "../../lib/config";

export default function ProfilePage() {
  const account = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [status, setStatus] = useState("尚未登入");

  async function signIn() {
    if (!account.address) {
      setStatus("請先連接錢包。這個網站不會向你索取私鑰。");
      return;
    }
    const nonceResponse = await fetch(apiUrl + "/api/v1/auth/nonce", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: account.address }),
    });
    if (!nonceResponse.ok) {
      setStatus("後端沒有發出登入nonce。");
      return;
    }
    const nonce = (await nonceResponse.json()).nonce as string;
    const message = [
      window.location.host + " wants you to sign in with your Ethereum account:",
      account.address,
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
    setStatus(verified.ok ? "已登入 " + account.address : "簽名沒有通過");
  }

  return (
    <Shell title="個人">
      <button className="bg-leaf px-4 py-2" onClick={signIn} type="button">用錢包簽名登入</button>
      <div className="mt-4"><Notice>{status}</Notice></div>
    </Shell>
  );
}
