# SHIFT LAB：agent 入口

本文件適用於此版本及其子目錄。沿用工作區與使用者的全域指示，預設使用繁體中文。

## 現行範圍與啟動

- 2026-10-28 依使用者要求，只保留種子生成地圖與車輛設計；不再維護現實地圖及相關資料流程。
- 地圖唯一開發主線為V3；V1／V2僅保留凍結相容。道路研究來源與設計約束見 `docs/knowledge/road-design/README.md` 與 `DESIGN.md`，先區分來源原則和專案估算值。
- 主程式在 `desktop3d/`，是瀏覽器駕駛遊樂場。Windows 在版本根目錄執行 `START_WEB_WINDOWS.cmd`，或在 `desktop3d` 執行 `npm.cmd run dev`。
- PowerShell 使用 `npm.cmd`，不變更系統執行原則。網址為 `http://127.0.0.1:5173/`。
- 架構與修改定位見 `docs/AGENT_KNOWLEDGE.md`；當次驗證與邊界見 `docs/AGENT_VERIFICATION.md`。歷史版本文件不等於目前狀態。

## 必須保留的行為

1. 現行物理核心是 `desktop3d/public/physics.html` 的 inline script，由隱藏 iframe 的 `__SHIFT_LAB_DEBUG__` API 供 `src/main.mjs` 呼叫；`archive/legacy/current_inline.js` 和 `archive/legacy/` 是歷史基準。
2. Rapier 統一控制車身位置、姿態與碰撞；原核心計算四輪輪胎力、動力、離合器、同步器及輔助系統，不可重複積分車身或施加偏航／坡度力。
3. 保留主迴圈 `1/120 s` 和核心四個 `1/480 s` 微步；`chassis.mjs` 每個微步的 `resetForces()`、`resetTorques()` 不可省略。
4. 種子路面渲染與碰撞共用生成器中心線與橫坡；護欄、路障不加入輪胎 `groundHandles`。切換道路前須釋放碰撞體與 Three geometry，保留失敗復原。
5. 保留 `shiftlab.road.v1/v2` 格式、v1/v2 種子對應及既有 localStorage keys。獨立開發驗收位於 `desktop3d/tests/acceptance/`，使用參考車型與地圖；遊戲不包含驗收介面或工況。
6. 轉向正負號只在 `steering-input.mjs` 的輸入／顯示邊界轉換；換檔走 `requestGear()`、離合器與同步器，不能直接指派 `state.gear`。
7. `city` 是既有 1.6L 輕型轎車的車型 ID，必須保留其參數、校準資料與相容性。
8. 不新增 production dependency，不更換 package manager，不自行 commit、push 或發布。

## 驗證

在 `desktop3d` 執行任務相關的 `node tests/<test>.mjs`；跨入口變更執行 `npm.cmd run qa:all` 與 `npm.cmd run build`。瀏覽器實測和 Node 測試分開回報，不把歷史 QA 當成當次驗證。

驗收工況、專用路障與評分不得重新引入 `desktop3d/src/` 或玩家選單。`tests/game-driver.mjs` 僅於 Vite DEV 載入；正式建置不得包含驗收模組或開發測試 API。`assertPhysicsHealth()` 是行駛安全檢查，仍需保留。

## 目錄整理規則

- 先讀 `docs/ORGANIZATION.md` 與 `docs/DATA_CATALOG.md`。保留雙層版本目錄與 `desktop3d/` 入口。
- patch 放在 `archive/patches/`；版本文件放在 `archive/releases/`；歷史 log 放在 `archive/logs/`。
- 現行驗證位於 `desktop3d/tests/`；歷史 Python／Playwright 位於 `archive/legacy/`，不要把歷史 UI 斷言當成目前規格。
- 研究資料與處理工具放在 `research/`；圖片與測試產物放在 `artifacts/`。不要將研究或封存檔案複製進遊戲 public assets。
- 研究 JSON／CSV 與 patch 內容保持來源原樣；搬移時更新引用並記錄前後路徑及 hash。玩家 localStorage、物理參數與種子資料格式不得因整理而改動。
