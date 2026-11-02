# 開發進度

日期：2026-11-03。沒有部署新合約，也沒有提交 Git。

## 已完成

- 審查舊倉庫，寫入 `docs/INITIAL_AUDIT.md`。
- 移除克數換算。鑄幣改為提交 ID、獎勵金額、nonce、期限與紀錄雜湊。
- 保留 1,000,000 ECO 上限、EIP-712、兩段所有權，以及不能凍結轉帳。
- 質押改到 `EcoStaking`。沒有利息。
- 活動合約會鎖定 ECO 並在結束或取消後退回。公開用的隨機來源沒有設定，呼叫就會失敗。測試隨機數只在測試裡使用。
- 桌面錢包改為對獨立質押合約授權後鎖定。
- 後端有 SIWE、提交冪等、管理員審核與未確認換算的拒絕。
- Prisma 結構已寫好，尚未遷移。
- 模型決策與 SHA-256 有測試。沒有下載模型權重。
- 網站可以建置，頁面包含首頁、儀表板、提交、紀錄、驗證、錢包、質押、活動、個人與審核。

## 測試

- `npx hardhat test`：18 通過。
- `npm test --prefix backend`：8 通過。
- `python -m unittest discover -s ai/tests -v`：6 通過。
- `npm run build --prefix website`：成功，12 個路由。

這些測試沒有連上 Sepolia，也沒有連上 PostgreSQL。

## 已知限制

- API 資料在記憶體，重啟即失。
- 沒有 S3 簽章上傳，也沒有 BullMQ 工作者。
- 模型不會辨識影片，也不會自動核准。
- Eco Points 換成 ECO 的比率未確認，領取會回 `conversion_unconfirmed`。
- Chainlink VRF 沒有設定。CS2 皮膚沒有發放流程。
- 舊 Sepolia 合約 `0x444696e8926BBfce3B04B288D7983F286EC8B814` 仍是克數版本，與新介面不相容。
- 證明人仍是受信任角色。這不是多簽。

## 下一步

1. 由專案所有者確認點數與 ECO 的換算，或明確維持不鑄幣。
2. 準備 PostgreSQL 後執行 Prisma 遷移，再把 API 從記憶體換過去。
3. 設定物件儲存與模型權重。不要在安裝時自動下載大檔。
4. 得到明確指示後，才部署新的 Sepolia 合約並更新錢包設定。
