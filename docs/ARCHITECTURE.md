# 架構

系統分成五塊，彼此只用明確的介面連接。

```text
網站 (Next.js) ── REST ── 後端 (Fastify)
                           ├── 記憶體儲存（正式環境應換 Prisma）
                           ├── 獎勵政策
                           └── 簽章鑄幣（金鑰尚未接上）
模型服務 (FastAPI) ── 只回傳審查材料，不能鑄幣
合約
  EcoToken          上限與 EIP-712 鑄幣
  EcoStaking        無利息的鎖定
  EcoRewardManager  活動入場與退回
  UnconfiguredRandomness  公開部署用，呼叫就失敗
桌面錢包          轉帳與質押，私鑰留在本機
```

鏈上只放收款地址、提交 ID、獎勵數量、nonce、期限與紀錄雜湊。影片、個人說明與模型分數留在鏈下。

後端現在使用記憶體。`backend/prisma/schema.prisma` 是 PostgreSQL 的目標結構，遷移還沒有對任何資料庫執行。物件儲存、Redis 佇列與模型權重都還沒接上。缺少這些設定時，API 會回報尚未設定，不會製造一筆成功的驗證或交易。

Sepolia 是目前的目標網路。部署腳本遇到以太坊主網會拒絕執行。本次沒有部署新合約。
