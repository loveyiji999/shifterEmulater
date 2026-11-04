# 行駛地形載入效能修正

日期：2026-10-29。此項依使用者新回報處理效能問題；P0–P5 整體開發仍暫停，不開始下一環境／車輛功能工作包。

## 確認原因與修改

行駛的固定物理步驟原先同步呼叫地形生成、道路網格與碰撞建立。跨越128m地形格時，主執行緒會停住；獨立原始程式量測曾達244–269ms，路線revision重建窗口達約1290ms。這能解釋GPU使用率偏低時仍卡頓，不能以GPU百分比單獨判斷全部瓶頸。

V3現在提前約兩秒、至少48m預載道路與地形。單一Web Worker使用同一生成幾何程式，以版本化路線快照計算頂點、索引、法線與UV，轉移自有ArrayBuffer；背景快取不被轉移操作清空。主執行緒每幀以2ms軟預算建立Three與Rapier資源，單一資源建立可能超出預算。準備中的網格隱藏、碰撞停用，整批完成才同步啟用，之後回收舊窗口。限制一個背景工作；換圖與revision隔離過期回覆，保留舊地面直到替代品可用。

地面未備妥時保留畫面並暫停該物理步，避免車輛落入未載入區域，並記錄waits及模擬時間比例。Worker建立／執行／傳送失敗會回退原同步路徑。初次啟動、選單換圖與明確傳送仍同步準備，不宣稱已消除其等待。

渲染與碰撞共用Float32幾何，畫質、地形密度、陰影、120Hz物理與四個480Hz微步不變。物理核心、V3生成器及lockfile與前次來源存檔SHA256相符；未新增依賴。

## 原生內顯實測

Chrome 156 headless、WebGL2／ANGLE D3D11、Intel UHD Graphics 770、1440×900、DPR 1。相同standard車、STREAM-TIMING-V1直路種子、手排空檔以14m/s開始滑行，暖機10秒後重置相同起點，再量25秒。兩次各行駛約215／216m，跨越多個地形窗口。同步對照使用同一份程式停用Worker，幾何與畫質相同；測量時不執行其他QA。

| 數值 | 原同步路徑 | 背景串流 |
| --- | ---: | ---: |
| 主執行緒地形處理最大值，包含分批準備 | 203.0ms | 3.6ms |
| 整段幀時間p95 | 22.6ms | 18.7ms |
| 整段幀時間p99 | 71.9ms | 64.6ms |
| 整段最大幀時間 | 219.9ms | 102.2ms |
| GPU繪製中位時間 | 6.56ms | 6.67ms |
| 模擬時間／實際時間 | 0.976 | 0.987 |
| 丟棄固定步計數 | 16 | 13 |

重置車輛後前三秒兩條路徑均有物理CPU尖峰（最大約98／99ms），因此同時保留全段數據，未把它隱藏為成功。若只檢查第3秒後的穩定行駛區間，最大幀時間為219.9→25.3ms，p99為24.1→21.5ms，超過50ms的幀由2降至0。背景工作的最慢純生成約251ms，已離開主執行緒；本次waits=0、error=null。整體卡頓尚未全部消除，仍需區分重置後的物理瞬態。

原始資料：`artifacts/tests/streaming-before-warm-2026-10-29.json`與`streaming-after-warm-2026-10-29.json`。`*-warm-initial-*`與非warm檔是早期觀測；前者受RAF舊時間戳影響，非正式比較依據。量測已改用一致的performance.now()，避免同步設定落在既有RAF批次時產生負幀時間。

這是單一直路、25秒的地形串流比較，不代表完整P3場景、所有地圖、不同瀏覽器或所有內顯的效能驗收。

## 驗證

當次結果：

- `npm.cmd run qa:all`：PASS，包括48種子×96段、70組實際Rapier車道／結構、248座基礎／4996地面查詢、車輛、輪胎表面、地形、材質、傳動及物理安全回歸。
- `node tests/validate-streaming.mjs`：最終補強後另跑PASS；真實Worker、路線適配數值一致、道路頂點／索引及地形頂點／索引／法線／UV一致、轉移快取、單一排隊、準備階段不可見且無碰撞、revision替換、缺少支撐時阻止物理步、過期回覆清理、Worker建立／執行／傳送失敗回退。
- `node tests/validate-procedural-browser.mjs`：PASS，四車型、V1–V3、手排與自排實際駕駛，無runtime exception或HTTP錯誤。
- `node tests/validate-procedural-browser.mjs --road-v3`：PASS，54組上／下層、反向、洞口、吊橋及路口通行；接地率最低100%，最大高度誤差約0.120m。
- `npm.cmd run build`：PASS，33 modules，Worker獨立chunk約143kB。原有主bundle超過500kB警告仍存在。
- `node tests/validate-procedural-browser.mjs --production`：最終建置PASS，四輪路面條件、換圖、接觸與DEV模組隔離。
- `node tests/validate-procedural-browser.mjs --streaming-performance --native-gpu --before --warm`與相同指令去除`--before`：PASS原生行駛量測，數據見上表，未把擷取成功等同全部效能關卡通過。

正式版路面條件檢查起初在固定300ms等待後兩次讀到前一個條件；資料顯示四輪仍接觸舊條件，並非空接觸。改為最多5秒等待真實四輪接觸結果，保留原完全一致斷言，最終通過。未為此修改遊戲表面係數或物理行為。新增測試開發過程中的重複變數、預載範圍假設及固定等待錯誤亦已修正，最後單獨測試PASS。

來源快照：`artifacts/tests/streaming-fix-source-2026-10-29.zip`；檔案hash、指令及當次結果：`streaming-fix-verification-2026-10-29.json`；摘要：`streaming-comparison-2026-10-29.json`。快照是本專案內的來源檢查點，需原專案與既有依賴才能建置。

## 主要來源

- `desktop3d/src/geometry-streamer.mjs`：工作佇列、提前載入、版本隔離、分批準備與同步啟用。
- `desktop3d/src/streaming.worker.mjs`、`streaming-geometry.mjs`、`road-snapshot.mjs`：同源背景幾何及唯讀路線適配。
- `desktop3d/src/road.mjs`、`terrain-world.mjs`、`main.mjs`：現行遊戲串流與原同步回退。
- `desktop3d/tests/validate-streaming.mjs`：真實Worker、Rapier與幾何一致性測試。
- `desktop3d/tests/streaming-profile.mjs`：僅DEV的實際行駛量測；正式版不載入。
