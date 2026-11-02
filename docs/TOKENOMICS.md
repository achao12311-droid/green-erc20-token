# 代幣規則

## 已確定的部分

| 項目 | 值 |
| --- | --- |
| 名稱 | Green Eco Token |
| 符號 | ECO |
| 小數 | 18 |
| 上限 | 1,000,000 ECO |
| 網路 | 先使用 Ethereum Sepolia，鏈 ID 11155111 |

ECO 是部署在以太坊上的 ERC-20。以太坊自己的權益證明保護的是以太坊網路。鎖定 ECO 只是這個應用程式的功能，不是成為以太坊驗證者，也不會產生利息或年化報酬。

新的 ECO 只能由被授權的證明人簽名之後鑄出。簽名包含收款地址、提交 ID、ECO 數量（wei）、nonce、期限、紀錄雜湊、合約與鏈 ID。同一筆提交與同一個證明人的同一個 nonce 都不能再用。超過上限的鑄幣會失敗。

## Eco Points

Eco Points 是內部記分，不是碳排、垃圾重量或任何科學測量。

開發用的分數在 `records/reward-policy.json`：

| 活動 | 分數 |
| --- | --- |
| PICK_UP_LITTER | 50 |
| RECYCLING | 30 |
| PARK_CLEANUP | 100 |
| BEACH_CLEANUP | 150 |
| TREE_PLANTING | 200 |
| ENVIRONMENTAL_EVENT | 300 |

這些數字是占位，不是最終規則。政策有版本號。

## 尚未確認的換算

`conversionConfirmed` 目前是 `false`，`weiPerPoint` 是空的。後端因此拒絕把分數換成 ECO。這個專案沒有默默訂下永久匯率。

要啟用鑄幣，必須先由專案所有者確認匯率，把該版政策標成已確認，再由獨立的證明人金鑰簽名。模型服務不能持有這把金鑰。

## 質押與月度活動

質押鎖定的 ECO 可以原數取回。月度活動若鎖定 ECO，活動結束或取消後也要能取回。CS2 皮膚不在鏈上發放。隨機抽籤在 Chainlink VRF 設定好之前不能在公開網路進行。測試用隨機來源只存在 `contracts/test/`。

## 供給用盡

總量到達 1,000,000 ECO 之後，再合法的簽名也無法鑄幣。合約不會自動提高上限。
