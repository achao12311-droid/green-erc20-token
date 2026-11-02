# API

基底路徑是 `/api/v1`。後端預設埠是 4000。

## 狀態

`GET /health` 會說明儲存是否仍是記憶體、換算是否已確認，以及 AI、物件儲存是否已設定。

## 登入

使用 Sign-In with Ethereum。鏈 ID 必須是 11155111。

- `POST /auth/nonce`，內容 `{ "address": "0x..." }`
- `POST /auth/verify`，內容 `{ "message", "signature" }`，成功後設定 HttpOnly cookie
- `POST /auth/logout`
- `GET /auth/me`

伺服器不會要求私鑰。nonce 十分鐘內有效，而且只能用一次。

## 提交

需要登入，並帶 `Idempotency-Key`。

- `GET /actions`
- `POST /submissions`
- `GET /submissions`
- `GET /submissions/:id`
- `POST /submissions/:id/video-upload`：沒有 `S3_BUCKET` 時回 503 `storage_not_configured`
- `POST /submissions/:id/complete`

## 驗證與獎勵

- `POST /ai/verify/:id` 只會得到 `pending_review` 與 `ai_not_configured`。它不會核准，也不會鑄幣。
- `GET /ai/results/:id`
- `POST /ai/retry/:id` 回 503，因為佇列尚未設定。
- `GET /rewards/balance`
- `GET /rewards/pending`
- `GET /rewards/history`
- `POST /rewards/claim/:id`：提交必須先由管理員核准。換算未確認時回 409 `conversion_unconfirmed`。金額來自政策，不採用前端傳來的數字。
- `GET /rewards/transaction/:id`

## 活動與管理

抽獎路由在合約地址設定前回 `not_configured`。

`POST /admin/reviews/:id` 只接受 `ADMIN_ADDRESSES` 裡的錢包。決定只能是 `approved` 或 `rejected`，並寫入稽核紀錄。`GET /admin/audit` 同樣受限。
