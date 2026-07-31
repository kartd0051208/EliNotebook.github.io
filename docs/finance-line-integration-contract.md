# EliNotebook 財務中心 × LINE 擴充契約

目前狀態是 `local-only`。本文件只定義未來介面，沒有後端網址、Channel secret、access token或使用者資料。

## 固定分層

1. `finance-core.js`：可用資金、發薪日及分期計算；不得讀取DOM、localStorage或網路。
2. `accounting.js`：網頁畫面與本機AES-GCM保險庫。
3. 未來後端：登入、裝置、資料庫、同步、衝突處理、稽核與LINE webhook。
4. LINE：只顯示後端授權後產生的摘要，不直接讀取GitHub Pages或瀏覽器localStorage。

## LINE自然語言新增與調整

未來可支援「午餐120現金」、「把昨天午餐改成150」、「完成聯絡客戶」等自然語言，但LINE不能直接改動網頁的localStorage。必須先完成帳號綁定、後端資料庫與雙向同步，再依下列兩階段執行：

1. **預覽**：後端解析訊息，只回傳預計動作、命中的單一資料、變更前後差異、短效`command_id`與失效時間，不寫入資料。
2. **確認**：使用者在LINE按下「確認」後，後端再次檢查帳號、`command_id`、資料`revision`及一次性`idempotency_key`，才寫入一次。
3. **結果**：回傳成功或衝突訊息；修改、刪除、完成事項與帳戶轉移一律不得略過確認。

支援範圍可逐步擴充，但每個動作都必須使用固定動作代碼，例如`finance.create`、`finance.update`、`finance.delete`、`note.create`、`note.update`、`note.complete`。自然語言只是輸入方式，不能直接成為資料庫指令。

以下情況必須拒絕，不可自行猜測：同時找到多筆可能紀錄、金額或日期不明、帳戶不存在、LINE帳號未綁定、簽章錯誤、指令過期、版本衝突、相同防重複鍵已執行。

## LINE摘要 v1

後端未來可使用 `EliFinanceCore.buildLineSummary()` 的欄位：

- `availableFunds`：目前帳戶總額－預留金－下次發薪日前應繳分期。
- `daysUntilPayday`、`payday`：依使用者設定的當地發薪日計算。
- `installmentRemainingAmount`：所有尚未完成分期的剩餘本金試算。
- `activeInstallmentCount`、`overdueInstallmentCount`。

LINE訊息不得包含財務密碼、AES金鑰、完整交易明細、完整帳號、Channel secret或access token。

## 未來後端最小要求

- 真正使用者帳號與MFA；短效session、裝置撤銷及遠端登出。
- 每位使用者資料列授權、靜態加密、傳輸TLS、備份與還原演練。
- 交易採不可預測ID、`idempotency_key`防重複及`revision`衝突偵測。
- 每次新增、修改、刪除及LINE查詢都留下不含敏感內容的稽核事件。
- LINE自然語言先預覽再確認；預覽指令短效且只能使用一次，變更時仍須通過資料版本檢查。
- LINE webhook必須先以原始request body及`x-line-signature`驗證HMAC-SHA256，驗證失敗立即拒絕。
- LINE與網站帳號使用官方一次性link token及至少128位元隨機nonce綁定；不可只靠LINE顯示名稱或手動輸入userId。
- 所有密鑰只能放在後端環境變數／秘密管理服務，禁止提交到GitHub。

## 建議API版本

- `GET /api/v1/finance/summary`
- `GET /api/v1/finance/changes?after={revision}`
- `POST /api/v1/finance/changes`
- `POST /api/v1/devices/revoke`
- `POST /api/v1/line/account-link/start`
- `POST /api/v1/line/commands/preview`
- `POST /api/v1/line/commands/{command_id}/confirm`
- `POST /webhooks/line`

未來新增功能時只能新增欄位或建立`v2`，不要改變既有欄位含義，讓舊版網站與LINE機器人仍可運作。
