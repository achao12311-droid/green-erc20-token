# Green Eco Token（ECO）

ECO 是上限 1,000,000 枚的 ERC-20。環境行為通過審核後，依獎勵表準備 ECO。撿垃圾 0.5、回收 0.3、公園清理 1、海灘清理 1.5、種樹 2、環境活動 3。這些是獎勵，不是碳排或垃圾重量。真正入帳仍要證明人簽名。

質押只是把 ECO 鎖在應用合約裡，之後原數取回。它不是以太坊驗證者質押，也沒有利息。

詳細說明：

- [架構](docs/ARCHITECTURE.md)
- [代幣規則](docs/TOKENOMICS.md)
- [API](docs/API.md)
- [資料庫](docs/DATABASE.md)
- [模型驗證](docs/AI_VERIFICATION.md)
- [安全](docs/SECURITY.md)
- [部署](docs/DEPLOYMENT.md)
- [初始審查](docs/INITIAL_AUDIT.md)
- [進度](docs/DEVELOPMENT_PROGRESS.md)

## 本機

```bash
npm install
npx hardhat test
npm install --prefix backend
npm test --prefix backend
npm start --prefix backend
python -m unittest discover -s ai/tests -v
npm install --prefix website
npm run dev --prefix website
npm run wallet
```

先打開桌面錢包並解鎖，再在網站按 ECO Wallet。錢包只聽 127.0.0.1:3939，每次簽名或轉帳都會在錢包視窗問一次。ECO 可以轉給任何地址。

桌面錢包的安裝檔：

```bash
npm run wallet:install
```

設定頁要分別填代幣合約與質押合約。舊的 Sepolia 合約 `0x444696e8926BBfce3B04B288D7983F286EC8B814` 使用已廢止的克數規則，不能再當成這個版本。

`.env` 不要提交。沒有得到明確指示時，不要執行 Sepolia 部署，也不要部署到主網。

## 尚未完成

- PostgreSQL 尚未接上，API 使用記憶體。
- 影片物件儲存、工作佇列與模型權重尚未設定。
- 抽獎券用 ECO 購買。活動取消才退票。CS2 皮膚由主辦者在鏈下發給得主。
- 公開網路的開獎仍要 Chainlink VRF。目前沒有接上。
