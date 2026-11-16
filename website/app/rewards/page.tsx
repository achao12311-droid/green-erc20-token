"use client";

import { Notice, Shell } from "../../components/Shell";

export default function RewardsPage() {
  return (
    <Shell title="用 ECO 買抽獎券">
      <div className="grid gap-4">
        <Notice>
          每一場活動有自己的票價。買票會把那個數量的 ECO 付進活動合約。活動若取消，票錢退回。活動完成之後，票錢不退，得主的 CS2 皮膚由主辦者在鏈下發放。
        </Notice>
        <p>公開網路上的抽獎在 Chainlink VRF 接上之前不能開獎。測試用的隨機數不會拿去部署。</p>
      </div>
    </Shell>
  );
}
