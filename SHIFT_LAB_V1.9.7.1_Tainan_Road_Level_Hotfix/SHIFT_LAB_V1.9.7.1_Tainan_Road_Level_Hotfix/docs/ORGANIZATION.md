# 專案目錄導覽

整理日期：2026-10-28。保留雙層版本目錄及 `desktop3d/` 的原位置；未更動遊戲物理、車型參數、種子生成器或儲存格式。

```text
版本根目錄/
├─ START_WEB_WINDOWS.cmd / START_WEB_UNIX.sh  原啟動入口
├─ index.html / README.md / AGENTS.md / CHANGELOG.md
├─ desktop3d/                                現行遊戲與開發驗證
│  ├─ index.html                             玩家介面
│  ├─ src/                                   駕駛、地圖、輸入與呈現
│  ├─ public/                                物理核心、種子生成器
│  ├─ tests/                                 現行 Node／瀏覽器／獨立驗收
│  ├─ scripts/                               本機服務工具
│  ├─ dist/                                  自動建置產物
│  └─ node_modules/                           既有 npm 依賴
├─ archive/
│  ├─ patches/                               11 份原始版本 patch
│  ├─ releases/                              舊版 README、實作與 QA 文件
│  ├─ logs/                                  歷史驗證輸出
│  └─ legacy/                                舊 2D 頁、核心快照與歷史測試
│     ├─ tests/                              歷史 Python 測試與啟動器
│     └─ browser-tests/                      歷史 Playwright 測試
├─ research/
│  ├─ metrics/                               感測器／車輛指標、摘要與 CSV
│  ├─ results/                               BMW／P1 擬合及驗證結果
│  ├─ calibration/                           P1 校準工具、結果與幾何敏感度
│  └─ tools/                                 資料取得、處理與繪圖工具
├─ artifacts/
│  ├─ research/figures/                       研究圖表
│  ├─ research/screenshots/                   歷史介面證據
│  └─ tests/browser/                          現行瀏覽器測試截圖
├─ docs/
│  ├─ AGENT_KNOWLEDGE.md / AGENT_VERIFICATION.md
│  ├─ DATA_CATALOG.md                         遊戲參數與研究數據索引
│  └─ reference/                             來源與歷史實作說明
└─ scripts/distribution/                     原打包／發布輔助指令
```

工作區另提供 `D:\shifterEmulater\START_GAME.cmd`；原下載 ZIP 存於工作區 `archives/packages/`，沒有覆寫內容。

## 使用規則

- 玩家從現有啟動腳本進入遊戲。現行 `desktop3d` 的 npm 指令、網址與獨立驗收頁路徑保持不變。
- 舊 patch 只存放在 `archive/patches/`，不在遊戲啟動時載入。原 patch 保留當年的路徑及內容，使用前須對照原始版本。
- 歷史 Python／Playwright 測試位於 `archive/legacy/`；僅修正搬移造成的讀寫路徑，不把它們的舊 UI／版本斷言當成目前規格。
- 新研究輸出使用 `research/`，可視化與測試截圖使用 `artifacts/`。不要把原始研究資料或測試產物放進 `desktop3d/public/`。
- 遊戲內部參數仍由原程式定義；詳細分類見 [數據索引](DATA_CATALOG.md)。研究結果不會自動覆寫玩家車型或輪胎參數。
- 所有搬移保留原檔名。完整舊／新位置及整理前 hash 見工作區 `archives/organization-2026-10-28.json`。
