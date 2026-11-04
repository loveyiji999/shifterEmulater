# 新地形出現時的掉幀修正

日期：2026-10-29。延續[背景地形生成修正](PERFORMANCE_TERRAIN_STREAMING.md)，處理使用者回報「大延遲已消失，但新地形進入視野仍掉幀」。這是既有問題修正，整體P0–P5開發仍暫停。

## 原因與處理

原生內顯高速測試顯示，主要耗時在Rapier步進，GPU繪製仍約6.5ms；跨區的bufferData及首次包圍球計算不足以解釋數百毫秒停頓。CPU取樣主要落在World.step內的WASM函式。獨立診斷暫停CCD時，最大幀時間約21ms，定位到CCD防穿透檢查的負擔；此開關只用於DEV診斷，未用作正式修正或成功成績。

原本整個100m道路材質網格、兩側護欄或128m地形共用大型碰撞體。它們的AABB可能包住道路中心的空白區域，導致車輛CCD進入無關網格的搜尋。現在將原三角面依空間分區：地面16m，護欄／牆體／結構8m；每個碰撞體只保留自身用到的緊密頂點緩衝，避免未使用的遠端頂點再次放大包圍盒。這個尺寸是專案工程選擇，不是實體建模精度變化。

分區不裁切、不簡化、不移動三角面，保留Float32座標、繞序及每一面的出現次數。顯示網格、法線、UV、材質、陰影和解析度不變。背景Worker負責分區與傳送，主執行緒延續原分幀建立及整批啟用。地形tile擁有多個碰撞體，保留第一個的collider相容別名，並統一啟用、回收和錯誤復原。面索引經renderFaces映回原顯示三角面，維持材質區域與上下層接觸正確。

車身40個碰撞外殼、四個機械限位、CCD、固定120Hz與四次480Hz微步均保留。main、chassis、物理核心、種子生成器及lockfile的SHA256與前次來源快照相同。分區增加固定碰撞體與CPU記憶體管理數量，換取更精確的空間排除；快取和清理仍隨原串流窗口限制。

[Rapier官方CCD文件](https://rapier.rs/docs/user_guides/javascript/rigid_body_ccd/)說明CCD沿物體運動尋找碰撞；本次瓶頸判斷與分區效果依本機測量及實際AABB測試，不把官方一般原理當成本專案成績。依[Three.js渲染器文件](https://threejs.org/docs/pages/WebGLRenderer)，著色器預編譯屬另一階段；本次未加入額外GPU預熱繪製。

## 原生內顯比較

Intel UHD Graphics 770、Chrome 156 headless、WebGL2／ANGLE D3D11、1440×900、DPR 1。兩次均使用上一輪Worker串流、standard車、STREAM-TIMING-V1直路，初速45m/s空檔滑行，暖機10秒後重置相同起點並量40秒。兩次正式比較均開啟CCD，量測時沒有其他QA負載。

| 數值 | 大型碰撞網格 | 空間分區 |
| --- | ---: | ---: |
| 幀時間p50 | 17.1ms | 16.6ms |
| 幀時間p95 | 80.4ms | 21.1ms |
| 幀時間p99 | 304.9ms | 22.3ms |
| 最大幀時間 | 378.9ms | 72.7ms |
| 物理CPU p99 | 301.2ms | 8.5ms |
| 地形處理最大值 | 4.3ms | 3.1ms |
| GPU繪製中位時間 | 6.52ms | 6.49ms |
| 超過50ms幀數 | 109 | 4 |
| 模擬時間／實際時間 | 0.762 | 1.000 |
| 丟棄物理步計數 | 86 | 2 |
| 實際行駛距離 | 805m | 915m |

修正後跑得更遠是模擬速度恢復的結果，並非比較期間縮短路程；28批背景工作完成，waits=0、error=null。仍有四幀超過50ms，最慢幀物理CPU約69.5ms，不能宣稱完全無卡頓。測量是單一種子40秒直路，不涵蓋全部場景及硬體，也不等於P3完整效能驗收。

正式原始資料為artifacts/tests/terrain-reveal-before-warm-2026-10-29.json及terrain-reveal-after-warm-2026-10-29.json；摘要為terrain-reveal-comparison-2026-10-29.json。diagnostic檔與CPU取樣屬定位證據，不混入正式比較。前後DEV操作量測略有差異：後測額外包住物理方法記錄長呼叫，未扣除該開銷；正式40秒後測未開啟Rapier內建profiling或CPU取樣器。

## 當次驗證

- 實際Rapier分區測試通過：兩側護欄合併時包圍盒穿越車道，分區後車道中心的廣相位候選由1降至0；全部原三角面、繞序、面索引映射及緊密頂點均保留。
- 地形與逐面材質測試通過，含區域材質、上下層、碰撞分配失敗復原及清理；Worker版本隔離、準備時隱藏／停用、整批啟用及換圖回收通過。
- 原先依賴「一個顯示網格對一個碰撞體」的陣列相等測試，改為逐面重建的完整集合／次數比較。分區接縫上的同高多命中，驗證為同一顯示層與支撐高度，仍禁止地形遮住柏油或出現額外支撐層。
- `npm.cmd run build`通過，34 modules；原有主bundle超過500kB警告保留。
- 一般瀏覽器四車型／V1–V3及`--production`通過。
- `node tests/validate-foundation-ccd.mjs`通過，三條錨碇碰撞軌跡含三角面接縫，CCD維持防穿透。
- `node tests/validate-procedural-browser.mjs --road-v3`通過54組立體道路通行，接地率最低100%，最大高度誤差約0.120m。
- `npm.cmd run qa:all`兩次執行分別在舊的一對一碰撞體數量／路口命中數斷言停止；修正表示相關斷言後，單獨重跑`node tests/validate-road-structures.mjs`通過70組車道／結構檢查，並重跑`qa:transmission`、`qa:manual`、`qa:health`及`qa:prnd`全部通過。
- qa:all前段的串流、車輛、表面、地形、整形、材質、248座基礎／4996地面查詢／14洞口、計時、物理情境、地圖格式，以及48種子×96段已通過。所有項目分段完成；未宣稱最後一次聚合指令exit 0，也未重跑未改動且已通過的多種子長測。

量測指令為`node tests/validate-procedural-browser.mjs --reveal-performance --native-gpu --before --warm`及去除`--before`的相同指令。此reveal模式的before只選擇存檔名稱，兩次均是Worker路徑；不同於前一輪streaming-performance模式用before切回同步載入。

來源快照為`artifacts/tests/terrain-reveal-fix-source-2026-10-29.zip`；來源hash及精確執行結果在`terrain-reveal-fix-verification-2026-10-29.json`。54組通行另存`terrain-reveal-driving-2026-10-29.json`。來源檢查點需原專案及既有依賴才能建置。

## 修改定位

src/collider-partition.mjs提供原三角面的空間分組；streaming-geometry.mjs於背景分區；road.mjs與terrain-world.mjs建立及管理局部碰撞體；surface-map.mjs映回原顯示面；geometry-streamer.mjs統一啟用每個tile的所有碰撞體。新增測試位於desktop3d/tests，量測仍只由DEV載入。
