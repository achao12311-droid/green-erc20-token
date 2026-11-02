"use client";

import { FormEvent, useState } from "react";
import { Notice, Shell } from "../../components/Shell";
import { apiUrl } from "../../lib/config";

export default function AdminPage() {
  const [result, setResult] = useState("只有 ADMIN_ADDRESSES 裡的錢包可以審核。");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(apiUrl + "/api/v1/admin/reviews/" + form.get("id"), {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: form.get("decision"), reason: form.get("reason") }),
    });
    setResult(response.ok ? "已記錄審核" : "拒絕：" + response.status);
  }

  return (
    <Shell title="審核">
      <form className="grid max-w-xl gap-3" onSubmit={onSubmit}>
        <input className="bg-ink p-2" name="id" placeholder="提交 ID" required />
        <select className="bg-ink p-2" name="decision"><option value="approved">核准</option><option value="rejected">退回</option></select>
        <input className="bg-ink p-2" name="reason" placeholder="原因" />
        <button className="w-fit bg-leaf px-4 py-2" type="submit">送出審核</button>
      </form>
      <div className="mt-4"><Notice>{result} 審核動作會寫入稽核紀錄。模型不能自行鑄幣。</Notice></div>
    </Shell>
  );
}
