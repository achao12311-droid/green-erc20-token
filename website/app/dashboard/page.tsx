"use client";

import { useEffect, useState } from "react";
import { Notice, Shell } from "../../components/Shell";
import { apiUrl } from "../../lib/config";

export default function DashboardPage() {
  const [health, setHealth] = useState<string>("正在讀取後端");

  useEffect(() => {
    fetch(apiUrl + "/api/v1/health")
      .then((response) => response.json())
      .then((body) => setHealth(body.conversionConfirmed ? "點數換算已確認" : "點數換算尚未確認，目前不會鑄幣"))
      .catch(() => setHealth("後端沒有啟動"));
  }, []);

  return (
    <Shell title="儀表板">
      <div className="grid gap-4 md:grid-cols-3">
        {["ECO 餘額", "已核准活動", "Eco Points"].map((label) => (
          <div key={label} className="border border-white/10 p-4">
            <p className="text-sm text-sap/70">{label}</p>
            <p className="mt-2 text-2xl">尚未連線</p>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Notice>{health}。這裡不會顯示尚未由合約讀到的餘額。</Notice>
      </div>
    </Shell>
  );
}
