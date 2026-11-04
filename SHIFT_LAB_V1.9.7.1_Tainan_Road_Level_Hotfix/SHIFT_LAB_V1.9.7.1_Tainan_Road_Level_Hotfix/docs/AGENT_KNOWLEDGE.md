# 第十九工作包 P2封閉湖面與地形精度

2026-11-02新增不挖地形的封閉湖面候選，共用河道水面幾何；三地域的實際濕邊界皆閉合，857次Rapier地面查詢最大誤差約0.0034mm。另修正Float32重複XZ高度：48塊比較中只有ROAD的16個頂點高度微調，最大約0.0017mm，XZ／索引／UV保持。法線統一於Float32位置取樣。詳見[P2封閉湖面](P2_CLOSED_LAKES.md)。地形修正會進遊戲，湖面仍是外部候選；河網、水體接觸、材質與Worker整合尚待完成，P2–P5及玩家卡頓完整目標保留。下方保留歷史。

# 第十八工作包 P2相連水面與實際岸線

2026-11-02改以實際濕三角面建立與河道相連的水面，排除孤立窪地及零深度岸線誤連；跨塊、缺面與未知濕邊界測試通過。LEVEL-2仍拒絕，已識別52條外框濕邊及61條內部濕邊。三種子772次實際地面射線最大誤差約0.012mm，原／新地面頂點、索引、法線與UV完全相同。詳見[P2水面與岸線](P2_RIVER_INUNDATION.md)。水系尚未接入遊戲，地域出口、自然形態、岸坡與串流待完成；卡頓與P2–P5完整目標保留。下方保留歷史。

# 第十七工作包 P2局部河床尋路

2026-11-02將道路／結構保護區及開挖成本納入河床尋路。LEVEL-1最大挖深38.454→20.909m並通過局部施工；LEVEL-2仍因濕區側界拒絕；ROAD-38274CD4維持候選但挖深略增。16組窮舉成本對照及三種子776次實際Rapier地面查詢通過，原始地形hash不變。詳見[P2局部河床尋路](P2_RIVER_ROUTING.md)。仍未接入遊戲，地域出口、自然形態、岸坡與串流待完成；卡頓仍待實際記錄，P2–P5完整目標保留。下方保留歷史。

# 第十六工作包 P2河床施工候選

2026-11-02完成局部河床挖方、水面裁切與施工拒絕檢查，並提供獨立離線3D預覽。三種子中LEVEL-1／LEVEL-2仍因挖深或連通問題拒絕；ROAD-38274CD4僅通過局部幾何檢查，出口待接續。769次實際Rapier查詢最大高度誤差約0.034mm。來源地形不變，未接入遊戲；岸坡折線、自然河網、全域出口、地表重烘焙及串流整合仍待完成。詳見[P2河床候選](P2_RIVERBED_PROPOSALS.md)。玩家卡頓尚待實際記錄；P2至P5完整範圍保留。下方為歷史紀錄。

# 第十五工作包 P2排水拓樸基礎

2026-10-30新增實際地形排水分析，完成最小溢出面、無循環接收圖、缺面／斜角屏障及面積累積；獨立minimax對照與三種子3254次有效面命中通過。LEVEL-1／LEVEL-2局部谷底約16m虛擬填平需求，後續須施工河床與出口。詳見[P2排水基礎](P2_DRAINAGE_FOUNDATION.md)。此模組未接入遊戲，不代表水系完成或卡頓已解除；P2水面／銜接、P3完整性能及P4／P5保留。下方保留歷史。

# 第十四工作包 實際玩家手動效能擷取

2026-10-30補齊P0／P3診斷：外部入口回到同一遊戲分頁，保留玩家設定與正常操作，記錄長幀、Rapier碰撞／射線／接觸耗時、串流佇列、實際後端／解析度／焦點，60秒或Esc後下載本機JSON。單元與原生瀏覽器流程通過；完整結果及限制見[手動效能擷取](PERFORMANCE_MANUAL_CAPTURE.md)。使用者嚴重卡頓尚未確定根因，P2水系／場景銜接、P3十場景、P4及P5仍未完成。下方保留歷史。

# 2026-10-30 大量載入與碰撞卡頓排查

本次將道路／地形／造景碰撞體建立拆入分幀佇列，先提交當前畫面再準備後續資源，並保留換圖及延後配置失敗回退。完整回歸、正式版隔離及54組立體道路通過；自然路線串流CPU最大3.8→2.2ms，但整體p99為20.8→21.6ms，尚未證明整體改善，也尚未重現使用者實際視窗的嚴重碰撞停頓。不要把局部工作預算修正當成所有卡頓已解決。詳見[分幀碰撞體預算](PERFORMANCE_TERRAIN_COLLIDER_BUDGET.md)；下方保留歷史。

# 第十三工作包 十類道路材質

2026-10-30接續P2，把10類PBR樣板接入道路選單與40組四條件接觸；40組實際煞停全部停止且零碰撞，原12組距離／步數完全保持。土／石鋪面與地形／岩石profile分開，鋼板金屬度及標線／偏好還原同步。原生UHD770鋼板單場景40秒p99約19.6ms、waits=0。詳見[P2十類路面](P2_TEN_PAVEMENTS.md)。P2水系與場景銜接、P3至P5仍未完成；下方保留歷史。

# 第十二工作包 洞內外光照

2026-10-29接續P2，加入閉合隧道的局部天空光、24m入口漸變、固定6燈及同層限制；同時補齊每側.2m可承載路肩，修正洞內地形尖刺及覆土黑面。75光照樣點、200側緣查詢、原幾何比較與實際畫面通過，原生UHD770洞內30秒p99約20.5ms／零丟步，洞外40秒p99約19.7ms／waits=0。詳見[P2洞內外光照](P2_TUNNEL_LIGHTING.md)。整體目標仍進行，P2水系及其餘材質、P3至P5尚未完成；下方保留歷史。

# 第十一工作包 三層地形與同源接觸

2026-10-29接續P2，加入土／碎石／裸岩PBR混合及裸岩三軸投影，實際輪胎依相同Float32遮罩與命中點重心內插。900次取樣權重誤差約2.07e-8，原生UHD770單場景40秒p99約19.6ms、waits=0。四條件制動資料保留冰面低速滑移限制，沒有宣稱冰面完全停止。詳見[P2地形混合](P2_TERRAIN_BLEND.md)。P2仍部分完成，P3至P5維持原範圍；下方保留歷史。

# 最新修正：地形首次顯示的分幀預上傳

2026-10-29依最新掉幀回報，新增隱藏網格逐幀上傳，完成後才整批可見及啟用碰撞。原生40秒觀測中，第1秒後可見 bufferData／包圍球均為0；提交幀可見繪製 CPU 最大1.8→0.6ms，p99仍19.7ms，重置附近長幀尚未解決。完整數據與限制見[地形預上傳](PERFORMANCE_TERRAIN_GPU_PREPARATION.md)。下方為歷史工作包；本次只處理使用者回報的效能問題。

# 第十工作包 種子造景與地表色調

2026-10-29持續P2，新增同源樹幹／岩石碰撞、獨立種子群落、地表色調及Worker造景串流，沒有改動V3道路或物理頻率。代表視窗262樹／55岩石，實際渲染與碰撞誤差最大約0.004mm；原生UHD770單場景40秒p99約19.6ms、1丟步。詳見[P2造景](P2_SCENERY.md)。整體目標持續進行，P2多材質地形與水系、P3至P5仍未完成；下方工作包保留歷史。

# 已恢復分階段開發 第九工作包

2026-10-29依使用者最新要求繼續P0–P5建置。本批P2加入混凝土／碎石可行駛路面、三種材質選擇、四條件接觸及偏好保存；12組實際煞停、舊圖限制與正式版隔離已通過。詳見[P2可行駛路面](P2_DRIVABLE_PAVEMENTS.md)。整體目標尚未完成，P2仍有環境混合與造景，P3至P5保留完整範圍；下方暫停描述是先前歷史。

# 最新修正：地形出現與CCD掉幀

2026-10-29進一步將大型靜態網格分成緊密碰撞區塊，保持CCD與全部原三角面、畫質及物理頻率。UHD770高速40秒比較：幀p99為304.9→22.3ms，丟步86→2，仍有少量物理尖峰。當次修改及驗證見[新地形掉幀修正](PERFORMANCE_TERRAIN_REVEAL.md)。整體P0–P5開發維持暫停。

# 最新修正：行駛地形串流效能

2026-10-29依使用者新回報修正同步地形生成造成的卡頓，改用背景Worker及分批碰撞／渲染啟用。原生UHD770直路比較，主執行緒地形尖峰203→3.6ms；重置後物理尖峰仍存在。修改、量測邊界與當次驗證見[地形串流效能](PERFORMANCE_TERRAIN_STREAMING.md)。整體P0–P5開發維持暫停，不代表開啟下一工作包。

# SHIFT LAB 專案知識

2026-10-29第八工作包：[P2_PBR_AND_GRADING.md](P2_PBR_AND_GRADING.md)。本批完成後依使用者指示暫停；恢復前不要自行開下一包。`terrain-profile.mjs`及連續里程投影處理橋端漸變；`surface-materials.mjs`提供10類程序PBR，`surface-uv.mjs`提供公尺UV，`scene-lighting.mjs`提供ACES／主光陰影／程序PMREM。地形customDepthMaterial只改陰影深度偏移，不改碰撞。新材質樣板、pbr-preview與configurePBRPreview只在DEV；玩家仍只有原已支援的接觸類型。工程報告今後輸出p2-engineering-latest.json，日期封存與舊來源重播分開；目前248座／4996查詢／14洞口與完整回歸通過，P2整體及P3至P5未完成。

2026-10-29第七工作包：[P2_ENGINEERING.md](P2_ENGINEERING.md)。`road-engineering.mjs`依`TerrainWorld.footprint()`的實際Float32地形建立基礎、橋墩橫梁／支承及洞口覆土／翼牆；footprint完整裁切並檢查覆蓋面積，`surfaceAt()`在16m索引內查詢實際面。`buildRoadChunkV3`的第三個options由RoadWorld提供surfaceAt及groundFootprint；雙參數的基礎網格仍供TerrainField推導，避免循環依賴，不是另一條道路主線。cover為自然覆土頂面並綁定earth；earthWall、門楣及其他結構仍為barrier。三種子248座基礎／5587查詢／14洞口及實際CCD已通過；P2地形整形、材質光照造景與P3至P5尚未完成。

2026-10-29第六工作包：[P2_CONTINUOUS_TERRAIN.md](P2_CONTINUOUS_TERRAIN.md)。`terrain-geometry.mjs`從V3實際網格裁切並約束連續地表，`terrain-world.mjs`由RoadWorld擁有並統一clear；原V3earth不再重複繪製／建立碰撞。`road.ensure(s,position)`可依實際車身位置載入周邊地形及道路，舊單參數呼叫保留。新增earth四條件為project-illustrative遊戲假設，不能稱為實地校準；路肩仍保留legacy-unclassified相容。P2工程邊坡、結構接地、材質光照與P3至P5尚未完成。

更新日期：2026-10-28（Asia/Taipei）。本版本僅保留種子生成道路與車輛駕駛設計。

## 入口與資料流

1. `desktop3d/index.html` 是玩家介面，載入 `src/main.mjs` 與隱藏的 `public/physics.html` iframe。
2. `main.mjs` 透過 `__SHIFT_LAB_DEBUG__` 接上物理核心、恢復設定與種子，建立 Three、Rapier、`RoadWorld` 及 `RapierChassisBridge`，然後開始自由駕駛。
3. `procedural-map.mjs` 支援 `shiftlab.road.v1/v2/v3`；`public/road-generator-v3.js` 是唯一開發主線與新圖預設。核心V1與 `public/road-generator-v2.js` 僅作凍結舊圖相容。
4. `road.mjs` 依弧長串流 100 m chunks，渲染和碰撞共用中心線、橫坡；道路重建會清除舊碰撞體，失敗時還原。
5. 主迴圈固定 `1/120 s`，物理核心每次四個 `1/480 s` 微步。Rapier 是車身運動的單一權威；原核心保留引擎、輪胎、離合器、同步器及 ABS／TCS／ESC。
6. 遊戲只使用玩家的車型／地圖；五項物理驗收、路障、評分和 JSON 報告已移至 `tests/acceptance/` 的獨立頁面。遊戲沒有測試選單、F2 入口或驗收流程。
7. `tests/game-driver.mjs` 僅在 Vite DEV 提供瀏覽器回歸控制；production build 會移除該動態 import 及測試 API。正式遊戲仍保留 `assertPhysicsHealth()` 防止無效數值破壞行駛。

## 修改定位

| 功能 | 檔案（相對 desktop3d） |
| --- | --- |
| 啟動、主迴圈、重置及玩家介面 | `src/main.mjs`、`index.html` |
| 四輪輪胎、車型、動力與換檔 | `public/physics.html` |
| 剛體、懸吊射線及施力 | `src/chassis.mjs`、`src/ray-contact.mjs` |
| 種子設定／匯入匯出 | `src/procedural-map.mjs` |
| 道路生成與呈現／碰撞 | `public/road-generator-v3.js`、`src/road-geometry-v3.mjs`、`src/road.mjs` |
| 輸入、手排、自排與 PRND | `src/steering-input.mjs`、`src/manual-gear.mjs`、`src/automatic-transmission.mjs`、`src/automatic-range.mjs` |
| 駕駛、選單及設定切換 | `src/game-modes.mjs` |
| 獨立開發驗收頁、工況及路障 | `tests/acceptance/index.html`、`tests/acceptance/main.mjs`、`tests/acceptance/scenarios.mjs`、`tests/acceptance/obstacles.mjs` |
| 僅限 DEV 的瀏覽器回歸橋接 | `tests/game-driver.mjs` |

`standard`、`city`、`turbo`、`diesel` 四種車型及其校準資料均保留。`archive/legacy/current_inline.js`、`archive/legacy/`、`research/calibration/`、根目錄 `archive/legacy/tests/`、`research/metrics/` 與 `research/results/` 是車輛研究或歷史驗證基準，不是現行遊戲入口。

## 執行與相容性

- 既有依賴為 Three.js `0.180.0`、Rapier `0.18.2`、Vite `7.1.0`；沿用 npm 與既有 lockfile。
- 在版本根目錄執行 `START_WEB_WINDOWS.cmd`；或在 `desktop3d` 執行 `npm.cmd run dev`。不要以 `file://` 取代 Vite 驗證。
- 玩家設定 key 保留 `shiftlab.v189.settings`；地圖設定 key 保留 `shiftlab.v189.procedural-map`。
- `npm.cmd run qa:all` 執行種子、物理及傳動相關 Node 測試；`npm.cmd run build` 產生 `dist/`，不直接編輯 generated output。
- 發行清單與 checksum 已隨本次範圍清理移除，不能使用原發行包的清單判斷此工作副本。

## 目錄整理後的位置

- 完整導覽：`docs/ORGANIZATION.md`；參數與研究數據分類：`docs/DATA_CATALOG.md`。
- 根目錄只保留遊戲啟動／導向頁、README、AGENTS、CHANGELOG 及用途分類目錄。
- 研究資料、校準與工具位於 `research/`，圖表／截圖位於 `artifacts/`；原始數值不變。
- 舊 patch／版本文件／log／Python 及瀏覽器測試集中在 `archive/`；目前 npm 測試與獨立驗收位置維持不變。
- 打包輔助指令位於 `scripts/distribution/`；本次沒有執行發布。

## V3立體道路與知識庫

- 官方來源、實際閱讀範圍與限制：`docs/knowledge/road-design/README.md`、`catalog.json`、`sources/`；設計與數值對照：`DESIGN.md`。
- V3生成器維護中心線、同層連通節點、上下穿越及橋梁／地下道／隧道／吊橋的走廊預留。相同種子、分批延伸須重現中心線、拓樸與結構；已承諾隧道／吊橋不可被未來道路取消。
- `road-geometry-v3.mjs` 同時供渲染與碰撞；`road.mjs` 依XY及里程載入多層道路。結構禁止混入輪胎地面白名單，保留Rapier車身權威與固定微步。
- `qa:map` 包含真實Rapier結構與資源回歸；`qa:map:driving` 是DEV真實車輛通行測試。測試driver與原物理驗收均不進正式bundle。

## 道路材質與環境建模先期研究

入口：`docs/knowledge/road-environment/README.md`。分類含10類路面、6種表面狀態、10類環境；16份第一手來源逐筆標記閱讀範圍。僅為研究與規格，尚未加入遊戲。新增材質物理參數保持待校準，不能將PBR粗糙度、Rapier接觸摩擦及輪胎mu混為一談。整合定位與後續驗證見同目錄`INTEGRATION.md`。

## 環境渲染優先順序

使用者已明確要求先完成環境渲染，讓路面、邊坡與山體所見即所得，賽事功能後置。前置知識與實作關卡在`docs/knowledge/road-environment/rendering/README.md`。近景渲染與碰撞同源是硬門檻，最高畫質需指定裝置實測，不能以WebGPU名稱或歷史SwiftShader功能測試宣稱性能。14份新增來源及10場景量測計畫目前均屬文件；未切換renderer或修改遊戲。

## 綜合開發規劃

總規劃見[車輛與環境整合開發規劃書](DEVELOPMENT_PLAN.md)。建議依P0共用規格、P1基準車可見接觸、P2環境、P3畫質性能、P4完整調教、P5外觀創作推進；保留V3單一主線與既有物理。各階段為待實作規劃，文件建立不代表已執行；賽事功能維持後置。

後續已開始分階段實作，最新進度見[DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md)。`src/vehicle-definition.mjs`（相對desktop3d）提供現有四車型契約與純讀取適配；`chassis.mjs`的`wheelVisualState`供遊戲輪心顯示，保留原施力。獨立接地診斷位於`desktop3d/tests/vehicle-diagnostics/`，不加入玩家選單或production build。`qa:vehicle`已納入`qa:all`；診斷瀏覽器指令為`node tests/validate-procedural-browser.mjs --vehicle-diagnostics`。P0／P1仍未全數完成，P2至P5尚待實作，原生GPU性能未量測。

第二工作包更新：共用資料契約見[VEHICLE_DATA_CONTRACTS.md](VEHICLE_DATA_CONTRACTS.md)，`tuning-profile.mjs`／`appearance-assembly.mjs`／`surface-definition.mjs`只準備及驗證資料，尚未開放玩家套用。外部接地診斷現含36組及V3坡道／坡頂／橫坡／上下層。已量得現有簡化靜止場景的[P0原生GPU基線](P0_PERFORMANCE_BASELINE.md)，與十場景環境驗收分開；後者仍未執行。`tests/performance-baseline.mjs`只經DEV driver載入；GPU等待不計入模擬區間，不新增額外量測query；`qa:performance`納入`qa:all`。前段未量測的描述是首輪歷史狀態，最新邊界以進度及P0基線文件為準。

2026-10-29第三工作包：[P1_REFERENCE_VEHICLE.md](P1_REFERENCE_VEHICLE.md)。`src/vehicle-layout.mjs`是車身／車頂的幾何來源；`vehicle-visual.mjs`供遊戲與外部診斷共用。`chassis.mjs`有主車身與零密度車頂兩個collider，必須共同處理接觸及清理；主collider公開屬性保留。`wheelPhases`只由每個微步的原輪速導出，用於顯示，不是第二套輪胎物理。appearance預設revision2，舊revision1仍可讀。P1輪拱／全行程間隙尚未完成；舊P0基線不可沿用為新模性能。

第四工作包已完成P1程序基準車關卡，取代第三工作包的未完成判斷，見[P1_WHEEL_WELLS.md](P1_WHEEL_WELLS.md)。預設appearance／layout revision3，revision1／2只保留資料相容。`bridge.colliders`為40個車殼／車頂部件，`bridge.bumpStops`另有4個零密度／零摩擦的地面觸底限位；paint車殼繪製外表面聯集，單一Mesh／材質。`bridge.physicsHooks`必須與`bridge.eventQueue`一起傳入物理步進，否則Rapier0.18會忽略接觸過濾；`dispose()`釋放剛體及queue。輪拱有20mm包絡間隙證據，36工況動態行程檢查通過。下一工作包是P0材質分界／P2連續地形與表面，P3至P5仍未完成。

第五工作包：[P0_SURFACE_BINDING.md](P0_SURFACE_BINDING.md)。P0／P1基礎關卡已通過，當前接續P2。`surface-map.mjs`註冊既有柏油4條件，從Rapier實際triangle feature ID取材質；`road.mjs`的區域候選重建、綁定釋放與渲染群組共用indices。`chassis.mjs`使用castRayAndGetNormal並填`wheelModel[id].contactSurface`；核心`wheelSurfaceMu`與`contactSurfaceAverage`接收局部接觸及輪荷加權阻力／操控參考，不重複施力。已驗證52組工況及局部面煞停；新材質與連續地形仍待P2。舊路外資料明確標示legacy-unclassified，不能宣稱已校準土路。P1舊來源另存`artifacts/tests/p1-gate-source-2026-10-29.zip`；本輪核心輸入邏輯已改，不能再聲稱整檔SHA未變，但原參數值保留。
