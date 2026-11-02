# 部署

目標網路是 Ethereum Sepolia，鏈 ID 11155111。不要部署到以太坊主網。本次沒有執行部署。

## 本機合約測試

在倉庫根目錄：

```bash
npm install
npx hardhat test
```

## 後端與模型

```bash
npm install --prefix backend
npm test --prefix backend
python -m unittest discover -s ai/tests -v
```

模型測試要在倉庫根目錄執行，讓 `ai` 可以被找到。Windows 若 `python` 不存在，改用 `py`。

後端：

```bash
npm start --prefix backend
```

模型服務要另外安裝 `ai/requirements.txt` 後，用 uvicorn 啟動 `ai.api.main:app`。沒有安裝時，決策測試仍可執行，但 HTTP 服務不會啟動。

## 網站

```bash
npm install --prefix website
npm run dev --prefix website
```

公開環境變數只放 API 位址、RPC 與合約地址。不要放私鑰。

## Docker

`docker-compose.yml` 提供 PostgreSQL、Redis、後端、模型與網站。這是本機開發組合。預設 session secret 只能用於本機。資料庫雖然會啟動，後端還沒把資料寫進 PostgreSQL。

## Sepolia

1. 複製 `.env.example` 為 `.env`。
2. 填入測試帳戶的 `SEPOLIA_RPC_URL` 與 `PRIVATE_KEY`。不要把 `.env` 提交。
3. `INITIAL_SUPPLY` 必須低於 1000000。
4. 確認換算率。未確認之前，即使部署成功，後端也不會準備鑄幣。
5. 得到明確指示後才執行：

```bash
npx hardhat run scripts/deploy/sepolia.js --network sepolia
```

腳本會部署代幣、質押、未設定的隨機來源與活動合約。隨機來源在 VRF 設定好之前會使抽獎關閉失敗。驗證指令寫在 `scripts/verify/sepolia.js`，它預設只印出步驟。

部署後把新地址填進桌面錢包的 Settings，以及網站的 `NEXT_PUBLIC_ECO_TOKEN_ADDRESS` 與 `NEXT_PUBLIC_ECO_STAKING_ADDRESS`。舊的克數合約地址不能繼續使用。
