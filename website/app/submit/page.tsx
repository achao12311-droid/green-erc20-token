"use client";

import { FormEvent, useState } from "react";
import { Notice, Shell } from "../../components/Shell";

const actions = ["PICK_UP_LITTER", "RECYCLING", "PARK_CLEANUP", "BEACH_CLEANUP", "TREE_PLANTING", "ENVIRONMENTAL_EVENT"];

export default function SubmitPage() {
  const [message, setMessage] = useState("選擇活動並準備影片。影片不會在這個頁面被假裝成已驗證。");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("上傳需要已登入的後端與物件儲存。這兩項目前都還沒設定，所以沒有送出檔案。");
  }

  return (
    <Shell title="提交環境活動">
      <form className="grid max-w-xl gap-4" onSubmit={onSubmit}>
        <label className="grid gap-2 text-sm">活動
          <select className="bg-ink p-2" name="action">{actions.map((action) => <option key={action}>{action}</option>)}</select>
        </label>
        <label className="grid gap-2 text-sm">說明
          <textarea className="min-h-28 bg-ink p-2" name="description" required />
        </label>
        <label className="grid gap-2 text-sm">影片
          <input accept="video/mp4,video/webm" type="file" />
        </label>
        <button className="w-fit bg-leaf px-4 py-2" type="submit">檢查提交條件</button>
      </form>
      <div className="mt-4"><Notice>{message}</Notice></div>
    </Shell>
  );
}
