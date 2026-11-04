# 獨立物理驗收工具

本工具已從玩家遊戲移出；不會出現在遊戲選單或 production build。使用相同四輪核心、Rapier bridge、原工況參數及原評分門檻。

## 開啟工具

在 `desktop3d` 執行 `npm.cmd run dev`，直接開啟：

`http://127.0.0.1:5173/tests/acceptance/index.html`

可單獨執行靜止穩定、正面碰撞、斜角擦撞、高速 CCD、坡道離地，或執行五項驗收並匯出 JSON。固定使用 standard 車型與 `REFERENCE_MAP`；不讀取玩家的車型／地圖偏好。Rapier 的質量／查詢資料在量測前完成初始化。

## 自動驗證

在 `desktop3d` 執行 `npm.cmd run qa:acceptance`。需要 Node 22+ 和本機 Chrome／Edge，測試會開啟隔離暫存瀏覽器及自有本機服務，完成後關閉。

`scenarios.mjs` 和 `obstacles.mjs` 從原 `src/` 搬移，內容未變。`main.mjs` 保留原量測、評分與失穩中止門檻，只處理獨立參考工況。玩家駕駛回歸由 `npm.cmd run qa:browser` 執行；`npm.cmd run qa:production` 另外確認正式建置完全排除驗收入口、測試 API 與模組。
