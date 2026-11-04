# SHIFT LAB · 種子生成地圖與車輛駕駛

地圖採用唯一開發主線V3，保留V1／V2舊圖相容、四種車型、四輪輪胎與 Rapier 車身物理、手排／自排 PRND、鍵盤／手柄與車輛設定。物理驗收已移出遊戲本體，保留為獨立開發工具。

2026-10-28 依使用者要求，已清除現實地圖模組、圖資、來源資料、下載／轉換工具、專用測試與研究報告。遊戲直接以玩家種子生成道路。

## 開發規劃

目前開發方向與分階段驗收見[車輛與環境整合開發規劃書](docs/DEVELOPMENT_PLAN.md)：先確立車輛基準與共用規格，完成所見即所得的環境及畫質效能，再擴充完整調教與外觀創作。

## Windows 啟動

在版本根目錄執行 `START_WEB_WINDOWS.cmd`。也可在 `desktop3d` 執行：

```powershell
npm.cmd run dev
```

開啟 `http://127.0.0.1:5173/`。選單中的「車輛與種子地圖設定」可修改種子、道路參數及車型；新建地圖固定使用V3，既有V1／V2地圖JSON與儲存設定繼續支援。V3支援自然線形、同層路口、上下穿越、橋梁、地下道、隧道與峽谷吊橋；淨空不足或引道不可行時重新規劃。

## 驗證與建置

在 `desktop3d` 執行：

```powershell
npm.cmd run qa:all
npm.cmd run build
```

當次測試結果見 [docs/AGENT_VERIFICATION.md](docs/AGENT_VERIFICATION.md)。舊版文件集中於 `archive/releases/`。

## 獨立開發驗收

遊戲選單與正式建置不含物理驗收。原五項工況、路障、評分及報告保留於 `desktop3d/tests/acceptance/`，詳見 [工具說明](desktop3d/tests/acceptance/README.md)。

在 `desktop3d` 可分別執行：

```powershell
npm.cmd run qa:browser
npm.cmd run qa:acceptance
npm.cmd run qa:production
```

`qa:production` 先建置，再檢查正式遊戲沒有驗收介面、測試 API 或測試模組。瀏覽器測試要求 Node 22+ 及本機 Chrome／Edge，使用隔離暫存設定檔。

## 目錄與數據

遊戲入口維持在 `desktop3d/`。patch 與歷史檔案集中於 `archive/`，車輛研究數據與工具集中於 `research/`，圖表／測試產物集中於 `artifacts/`。原打包輔助指令移至 `scripts/distribution/`。

詳見 [目錄導覽](docs/ORGANIZATION.md) 與 [遊戲參數／數據索引](docs/DATA_CATALOG.md)。工作區根目錄的 `START_GAME.cmd` 可直接轉交原 Windows 啟動腳本；原啟動方式仍保留。

道路官方知識庫與專案設計值見 [道路設計知識庫](docs/knowledge/road-design/README.md)。新增通行回歸：`npm.cmd run qa:map:driving`；驗證工具仍獨立於正式遊戲。
