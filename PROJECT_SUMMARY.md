# Finance — 個人股票記帳系統

桌面型個人投資組合管理工具，支援台股 (TW) 與美股 (US) 雙市場。以 Electron + React + SQLite 打造，資料完全儲存於本機。

## 技術堆疊

| 層級 | 技術 |
|------|------|
| 桌面外殼 | Electron 33 |
| 前端框架 | React 18 + TypeScript 5.6 |
| 建構工具 | Vite 5 + vite-plugin-electron |
| 樣式 | Tailwind CSS 3.4 |
| 圖表 | ECharts 6 (echarts-for-react) |
| 狀態管理 | Zustand 5 |
| 資料庫 | sql.js (純 JS SQLite) |
| 測試 | Vitest 4 |
| 打包 | electron-builder |

## 專案結構

```
finance/
├── electron/              # 主行程 (Node)
│   ├── main.ts            # Electron 進入點
│   ├── preload.ts         # contextBridge 暴露 window.api
│   ├── ipc.ts             # IPC handler 註冊
│   ├── db/                # SQLite schema、repo
│   │   ├── schema.sql
│   │   ├── schema.ts
│   │   ├── repo.ts
│   │   └── index.ts
│   ├── csv.ts             # CSV 匯入/匯出
│   ├── quotes.ts          # 股價抓取
│   ├── fx.ts              # 匯率抓取 (USD→TWD)
│   └── backup.ts          # DB 備份/還原
├── src/                   # 前端 (Renderer)
│   ├── App.tsx            # 路由切換
│   ├── main.tsx
│   ├── types.ts           # 共用型別 + window.api 宣告
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── TransactionForm.tsx
│   │   ├── ui.tsx
│   │   └── dashboard/     # CashForm / HoldingsTable / PerformanceChart / PieBlock / Stat
│   ├── pages/             # Dashboard / Transactions / Holdings / Realized / Settings
│   └── lib/               # holdings / performance / realized + 對應 .test.ts
├── scripts/import-csv.mjs
├── sample-transactions.csv, import-tw.csv, import-us.csv
└── package.json
```

## 核心資料模型 (SQLite)

- **accounts** — 券商/子帳，`market ∈ {TW,US}`、`currency ∈ {TWD,USD}`
- **securities** — 股票主檔，`UNIQUE(symbol, market)`
- **transactions** — 交易紀錄，`type ∈ {BUY, SELL, DIVIDEND, FEE, SPLIT}`，含 `quantity / price / fee / tax / fx_rate`
- **fx_rates** — 每日 USD→TWD 匯率快照
- **price_history** — 股價歷史 (繪製績效用)
- **settings** — key/value 設定表

## 功能模組

| 頁面 | 功能 |
|------|------|
| Dashboard (TW / US) | 持倉統計、圓餅圖、績效曲線、現金管理 |
| Transactions | 交易 CRUD (買/賣/股利/手續費/分割) |
| Holdings | 目前持倉與市值試算 |
| Realized | 已實現損益 |
| Settings | 帳戶/股票主檔、CSV 匯入匯出、DB 備份還原、報價/匯率刷新 |

## IPC API (`window.api`)

由 `electron/preload.ts` 透過 `contextBridge` 暴露，分七個命名空間：

- `accounts` — list / create / remove
- `securities` — list / upsert
- `transactions` — list / create / createWithSecurity / update / updateWithSecurity / remove
- `csv` — exportFile / importFile
- `quotes` — refreshAll(market, {force}) / latest / history(securityId)
- `fx` — refresh / latest / history
- `cash` — balance / deposit / withdraw
- `backup` — exportDb / restoreDb
- `app` — relaunch

## 計算邏輯 (`src/lib`)

- **holdings.ts** — 由交易紀錄推算目前持倉、平均成本
- **realized.ts** — 已實現損益 (FIFO)
- **performance.ts** — 結合 price_history + fx_rates 產生績效時間序列

三者皆有對應 `*.test.ts` 與 `__fixtures__.ts`，使用 Vitest 跑單元測試。

## 開發指令

```bash
npm run dev          # 啟動 Vite + Electron (HMR)
npm run build        # tsc → vite build → electron-builder 打包
npm run preview      # 預覽 production build
npm test             # vitest 跑一次
npm run test:watch   # vitest watch 模式
```

## 特色設計

- **雙市場分離** — TW/US 各自獨立的 Dashboard 與現金餘額，避免幣別混淆
- **匯率快照** — 美股交易記錄當日 fx_rate，回看時不受未來匯率影響
- **本機優先** — sql.js 資料庫檔可備份/還原，無雲端依賴
- **CSV 雙向** — 支援批次匯入既有交易與匯出備份
