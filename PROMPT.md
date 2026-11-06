# 玩擲：接續開發提示

請把這個 Expo demo 專案，從目前的舊 UI 做成下面描述的新版本。開始前先讀完本文件和 `README.md`。

## 產品

一個給「三分鐘熱度、選擇困難、需要新鮮感」的人玩的休閒遊戲 App。

| 特質 | 設計回應 |
| --- | --- |
| 三分鐘熱度 | 每局 3 分鐘內結束，列表標示預估時間，打開就能玩，結束後一鍵換下一款 |
| 選擇困難 | 「幫我選」直接決定一款，優先挑沒玩過的；可保留「就決定是你了！」這句文案 |
| 需要新鮮感 | Gemini 持續出新題、避開近期題目、標示還沒玩過的遊戲 |

## 需求

1. **登入／註冊**：版面參考 bilibili（吉祥物、輸入密碼時遮眼、登入與註冊按鈕並排），但吉祥物和視覺都要原創，不可使用 bilibili 的名稱、角色或素材。
2. **認證**：只用 email + 密碼（自架 API）。不做簡訊驗證、第三方登入，也不接任何寄信服務。訪客可以先逛。
3. **首頁**：上半部放兩種遊戲類型（益智遊戲、挑戰遊戲），同時要能進入「我的收藏」和「聊天室」。
4. **遊戲**：益智、挑戰各 10 款，共 20 款，清單在 `src/games/catalog.js`。
5. **出題**：題目由 Gemini 生成。不適合 AI 出題的遊戲（數獨、迷宮、2048 等）用程式在本機生成。
6. **收藏與聊天室**：資料存自架 Postgres；聊天室用 WebSocket 即時更新，登入後才能發言。
7. **中英雙語**：保留，預設繁體中文。

## 限制

- 這是 demo，所有程式都放在這個 Expo 專案內，不架後端、不寫 Edge Function，也不要過度設計。
- Gemini 只由後端呼叫（`backend/src/questions.js`），金鑰放部署用 `.env` 的 `GEMINI_API_KEY`，只有 API 容器讀得到，不可寫進程式或提交到 git。
- 沒有金鑰或呼叫失敗時要退回內建題庫，遊戲不能卡住。
- 所有 AI 回傳內容都要先驗證才顯示。
- 不要重建 `src/legacy/` 的舊畫面。除非使用者要求，也不要刪除它們。

## 設計

使用 `apple-design` 和 `apple-fluid-motion` 兩個 skill，並遵守：

- **主視覺**：有厚度的遊戲方塊，按下會下沉，選取時停在半下沉狀態（`Tile`，在 `src/components/ui.js`）。
- **導覽**：底部分頁（首頁、收藏、聊天室、我的），Android 實體返回鍵要能回上一層。
- **顏色**：使用 `src/theme/tokens.js`，支援淺色與深色，文字對比至少 4.5:1。狀態不可只靠顏色表達。
- **動效**：用彈簧動畫，從目前畫面上的值開始，可中途打斷；只有手勢帶動量時才加回彈。要支援「減少動態效果」。
- **回饋**：在畫面內顯示（`Banner`），不要用 `Alert.alert`，它打斷遊戲，在 web 上也沒有作用。
- **版面**：觸控目標至少 44pt，依可用寬度調整，放大字體後不破版。用 `react-native-safe-area-context`，不要用 RN 的 `SafeAreaView`。
- 切換到新 UI 時，把 `app.json` 的 `userInterfaceStyle` 改成 `automatic`。

## 目前狀態

- 技術：Expo SDK 55、React Native 0.83、React 19.2、自架 Node API（`backend/`）與 Postgres。
- 分支：`main` 的 `a4df767` 是基準還原點，開發在 `redesign` 分支。
- 新 UI 已接上畫面：登入／註冊、首頁、幫我選、20 款遊戲、收藏、聊天室、我的。
- 資料表已建立（`favorites`、`plays`、`chat_messages`）。

已在 web（無頭 Chrome）實際測過：訪客流程、20 款遊戲開啟、部分遊戲玩到結果頁、收藏重新整理後保留、語言切換、深色模式、減少動態效果。

**尚未測過：**

- 實際登入、註冊、登出，以及登入後收藏與遊玩紀錄寫入資料庫（agent 不可在正式專案建立帳號）。
- 聊天室發訊息與 Realtime 即時更新（需要登入）。
- Android 模擬器。

## 後端與部署

- `docker-compose.yml` 一次部署網站、API 與資料庫，所有容器都不對外開 port，需由反向代理或 tunnel 連到 web 容器的 80 port，資料庫密碼不會進 App。
- API 在 `backend/`，schema 在 `backend/migrations/`，API 啟動時自動套用；App 只透過 `src/lib/api.js` 存取。
- 手機與本機預覽用 `EXPO_PUBLIC_API_URL` 指向部署位址。

## Gemini

- 模型：`gemini-3.5-flash-lite`。
- 端點：`POST https://generativelanguage.googleapis.com/v1beta/interactions`
- 標頭：`x-goog-api-key`。不可加 `Api-Revision`，CORS 預檢會回 403，web 上的呼叫會全部失敗。
- JSON 輸出：`response_format: { type: 'text', mime_type: 'application/json', schema }`
- 回應文字位置：`steps[]` 中 `type` 為 `model_output` 的項目 → `content[]` → `text`

**已驗證**（2026-11-05）：金鑰有效，JSON 輸出與回應解析正確，Chrome 上 CORS 可通過。遊戲畫面內的完整流程尚未測試。

## 工作步驟

1. 接上 `StoreProvider`、`SafeAreaProvider` 和底部分頁，取代舊路由。
2. 做登入／註冊頁，取代未使用的 `src/legacy/AuthScreen.js`。
3. 做首頁、「幫我選」、遊戲列表、收藏頁。
4. 做共用遊戲框架：倒數、結果畫面（再來一局、換一款、收藏）、載入與題目來源標示。
5. 實作 20 款遊戲，舊有 5 款改用新 UI。
6. 做聊天室，以及「我的」頁（語言、登出）。
7. 測試後，每完成一個階段就提交一次。

## 驗證

- 用 `npx expo start --port 8081` 啟動，並在 web 上實際操作每條流程；Chrome 擴充功能連不上時，改用無頭 Chrome 透過 CDP 操作。截圖要親自看過。
- Android 模擬器上的 Expo Go 為 SDK 55，專案也已升到 SDK 55，但尚未確認能成功開啟，也要測。
- 回報時要明確區分「實際測過」和「只寫好沒測」。

## Git

- 在 `redesign` 分支上開發，不要直接提交到 `main`。
- `*.apk`、`.env*`（`.env.example` 除外）不可提交。
- 提交訊息結尾加上工具要求的 attribution。
