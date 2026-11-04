# v1.8.9 實作說明

## 設計邊界

- **玩家單頁**：`desktop3d/index.html` 是唯一可見操作頁；hidden iframe `public/physics.html` 仍負責引擎及 seeded route 生成。
- **三個 UI 狀態**：`src/game-modes.mjs` 中 `drive/settings/tests/menu` 控制模式。駕駛時僅渲染速度／轉速／檔位 HUD；設定位於 modal；測試位於側邊抽屜，3D 場景保持可見。進入工具畫面會暫停車輛並清除所有按鍵輸入。
- **唯一道路真相**：`src/procedural-map.mjs` 管理舊 `shiftlab.road.v1` 設定資料驗證與 JSON 匯入匯出，並不包含第二個地圖生成器。真正中心線／坡度由隱藏四輪核心 `generateRoad()` 建立。
- **Rapier 與 Three 同步**：`src/main.mjs` 的 `rebuildRoad()` 執行 `obstacles.dispose()` → `road.clear()` → `d.generateRoad(config)` → `road.ensure(70)` → `world.updateSceneQueries()`；最後 `resetDriving('free')` 依新路線重生。
- **分離 QA**：`ensureScenarioMap(id)` 規定 QA 使用固定 `REFERENCE_MAP`，自由駕駛使用 `userMapConfig`。切回自由駕駛會先重建地圖，再重置車身，防止舊路障殘留。
- **地表與場景視覺**：`src/road.mjs` 維持原本 Rapier 三角網格 `indices` 不變。僅 Three.js mesh 使用每區塊三組視覺材質（柏油／路肩／草地）；中心線與低多邊形植栽跟隨 chunks 的生命週期，未建立新的植栽物理 collider。
- **物理模型保護**：`public/physics.html`、`chassis.mjs`、`obstacles.mjs`、`scenarios.mjs`、`steering-input.mjs` 與 v1.8.8 完全一致。沒有引入第二個車身積分器。

## 狀態與 UX 邊界

- `drive`: `paused=false`，畫面 HUD 可見，鍵盤／手柄輸入正常。
- `menu/settings/tests`: 開啟時 `paused=true`，清除 `trackedKeys` 和 `d.inputKeys`／host 操作值，防止打字／切換選單時車輛動作。
- 測試腳本使用原本 `advancePhysics(1/120)` 的單一路徑，不受一般遊玩模式的自動換檔輔助影響。
- 切換車型或變更輔助駕駛方式仍可能重置車輛，但**設定畫面保持開啟、模擬保持暫停**。

## 尚未完成事項

- 不能保證每個隨機種子生成的髮夾彎或不同高度道路都不自交／互相覆蓋。現階段生成器延用舊設定模型，建議下一版加入道路自交/高差驗證。
- 植栽為視覺裝飾，沒有物理碰撞。
- 目前為本機 Vite 開發專案或部署後靜態網站。`file://` 不保證 ES Modules／WASM 會載入。
- 不能將 Chromium DOM 模擬或 Rapier 受力替身測試視為真實 WebGL／WASM 的完整 3D 驗收。請重新執行五項實機測試。
