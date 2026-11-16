"use client";

import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { sepolia } from "wagmi/chains";
import { useAccount, useReadContract } from "wagmi";
import { Notice, Shell } from "../../components/Shell";
import { apiUrl, isAddress, tokenAddress } from "../../lib/config";

const abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export default function DashboardPage() {
  const account = useAccount();
  const [health, setHealth] = useState("正在讀取後端");
  const [approved, setApproved] = useState("讀取中");
  const [points, setPoints] = useState("讀取中");
  const canReadBalance = Boolean(account.address && isAddress(tokenAddress));
  const balance = useReadContract({
    address: isAddress(tokenAddress) ? tokenAddress : undefined,
    abi,
    functionName: "balanceOf",
    args: account.address ? [account.address] : undefined,
    chainId: sepolia.id,
    query: { enabled: canReadBalance },
  });

  useEffect(() => {
    fetch(apiUrl + "/api/v1/health")
      .then((response) => response.json())
      .then((body) => setHealth(body.conversionConfirmed ? "點數換算已確認。" : "點數換算尚未確認，目前不會鑄幣。"))
      .catch(() => setHealth("後端沒有啟動。"));
  }, []);

  useEffect(() => {
    if (!account.address) {
      setApproved("尚未連接錢包");
      setPoints("尚未連接錢包");
      return;
    }
    let cancelled = false;
    setApproved("讀取中");
    setPoints("讀取中");
    Promise.all([
      fetch(apiUrl + "/api/v1/auth/me", { credentials: "include" }).then((response) => response.json()),
      fetch(apiUrl + "/api/v1/submissions", { credentials: "include" }),
      fetch(apiUrl + "/api/v1/rewards/balance", { credentials: "include" }),
    ])
      .then(async ([me, submissionsResponse, balanceResponse]) => {
        if (cancelled) return;
        const signedIn = typeof me.address === "string" && me.address.toLowerCase() === account.address?.toLowerCase();
        if (!signedIn || !submissionsResponse.ok || !balanceResponse.ok) {
          setApproved("尚未登入");
          setPoints("尚未登入");
          return;
        }
        const submissions = await submissionsResponse.json();
        const reward = await balanceResponse.json();
        const count = Array.isArray(submissions) ? submissions.filter((row) => row.status === "approved").length : 0;
        setApproved(String(count));
        setPoints(String(reward.points ?? 0));
      })
      .catch(() => {
        if (!cancelled) {
          setApproved("讀不到");
          setPoints("讀不到");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [account.address]);

  const eco = !account.address
    ? "尚未連接錢包"
    : !isAddress(tokenAddress)
      ? "合約未設定"
      : balance.data !== undefined
        ? formatUnits(balance.data, 18)
        : balance.isError
          ? "讀不到"
          : "讀取中";

  const cards = [
    ["ECO 餘額", eco],
    ["已核准活動", approved],
    ["Eco Points", points],
  ];

  return (
    <Shell title="儀表板">
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="border border-white/10 p-4">
            <p className="text-sm text-sap/70">{label}</p>
            <p className="mt-2 text-2xl">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Notice>
          {account.address
            ? "錢包已連接。鏈上餘額要等 ECO 合約地址設定後才讀得到。活動和點數要先到個人頁簽名登入。"
            : "請先連接錢包。"}
          {health}
        </Notice>
      </div>
    </Shell>
  );
}
