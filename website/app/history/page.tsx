"use client";

import { Notice, Shell } from "../../components/Shell";

export default function HistoryPage() {
  return (
    <Shell title="活動紀錄">
      <Notice>登入後端之後，這裡會列出你自己的提交。目前沒有可用的持久化資料庫，所以不會顯示假的歷史紀錄。</Notice>
    </Shell>
  );
}
