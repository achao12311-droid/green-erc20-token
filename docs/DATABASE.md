# 資料庫

目標資料庫是 PostgreSQL。結構在 `backend/prisma/schema.prisma`。

包含使用者、錢包、活動種類、提交、影片、模型結果、風險結果、審核、獎勵政策、獎勵紀錄、鏈上交易、抽獎、抽獎入場與稽核。主鍵是 UUID。錢包與交易都帶鏈 ID。代幣數量使用字串，不用浮點數。沒有私鑰或助記詞欄位。同一位使用者的 idempotency key 唯一。每筆提交最多一筆獎勵。

## 遷移

尚未執行遷移，也沒有對既有資料做任何變更。資料庫準備好之後，在 `backend` 目錄執行：

```bash
npx prisma migrate dev --name init
```

這需要 `DATABASE_URL`。在遷移完成並且後端改接 Prisma 之前，API 仍使用行程內的記憶體，重新啟動就會清空。

Docker Compose 會啟動 PostgreSQL 與 Redis，但後端還沒把寫入交給它們。
