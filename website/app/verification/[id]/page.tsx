"use client";

import { useParams } from "next/navigation";
import { Notice, Shell } from "../../../components/Shell";

export default function VerificationPage() {
  const params = useParams<{ id: string }>();
  return (
    <Shell title="驗證狀態">
      <Notice>提交 {params.id} 的模型結果尚未產生。未設定的模型不會被顯示成已辨識的活動，也不會自動鑄幣。</Notice>
    </Shell>
  );
}
