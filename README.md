# Green Eco Token（ECO）

ECO 是上限 1,000,000 枚的 ERC-20。新的幣只能在提交通過審核，且證明人對該筆提交簽名之後鑄出。Eco Points 是內部分數，不是碳排或垃圾重量。點數換成 ECO 的比率尚未確認，所以後端現在不會準備鑄幣。

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

桌面錢包的安裝檔：

```bash
npm run wallet:install
```

設定頁要分別填代幣合約與質押合約。舊的 Sepolia 合約 `0x444696e8926BBfce3B04B288D7983F286EC8B814` 使用已廢止的克數規則，不能再當成這個版本。

`.env` 不要提交。沒有得到明確指示時，不要執行 Sepolia 部署，也不要部署到主網。

## 尚未完成

- PostgreSQL 尚未接上，API 使用記憶體。
- 影片物件儲存、工作佇列與模型權重尚未設定。
- Chainlink VRF 與 CS2 皮膚發放都沒有實作。
- 點數與 ECO 的換算尚未確認。
