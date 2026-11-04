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

# 最新驗證入口：P2連續地表

第八工作包完成橋端過渡、程序PBR、UV及陰影修正；完整回歸及實際渲染／行駛通過，依使用者指示存檔後暫停。最新證據與仍未完成的P2至P5範圍見[P2_PBR_AND_GRADING.md](P2_PBR_AND_GRADING.md)。下方第七工作包的5587查詢為歷史狀態，新整形後為4996查詢；舊資料由來源快照重播保留，不能混作本輪證據。

第七工作包新增結構接地及洞口，詳見[P2_ENGINEERING.md](P2_ENGINEERING.md)。248座基礎的實際地面高度最大誤差約0.166mm；14個洞口與54組實際通行通過。原始結果與完整回歸狀態以該文件及建置進度為準。

2026-10-29：連續地表、共邊修正、土路實際輪胎力、資源回收及驗證邊界見[P2_CONTINUOUS_TERRAIN.md](P2_CONTINUOUS_TERRAIN.md)與[建置進度](DEVELOPMENT_PROGRESS.md)。P2仍在實作；不能把P0／P1通過或新增地表視為完整場景、PBR與最高畫質效能已完成。

# P0逐面材質及P1程序基準車

2026-10-29：最新逐面材質、52組接地及四條件實際煞停見[P0_SURFACE_BINDING.md](P0_SURFACE_BINDING.md)；車殼、輪拱、動態觸底、四預設及正式版驗證見[P1_WHEEL_WELLS.md](P1_WHEEL_WELLS.md)與[DEVELOPMENT_PROGRESS.md](DEVELOPMENT_PROGRESS.md)。P0／P1基礎關卡通過，P2至P5仍待完成。核心逐面輸入邏輯、參考車造型及對應碰撞已更新，原參數與固定步進保留，不能把下方歷史的「程式／外觀未變」當作最新狀態。

# 歷史驗證：V3單一主線與立體道路

日期：2026-10-28（Asia/Taipei）。本節取代下方歷史紀錄的「目前」判斷。使用Node v24.18.0、Windows、隔離Chrome、WebGL2與真實Rapier WASM。

## 修改與結果

- 先搜尋官方道路文件並建立7份來源卡片，再開發V3。同層路口與分層不連通的交會各有拓樸資料；橋梁、地下道、山脊隧道與峽谷吊橋有實體結構與碰撞。
- 自然線形沿用連續曲率／坡度，固定12段前瞻、確定性重試與回溯；分層剖面受最大坡度及坡變率限制，依完整路寬、橋厚與橫坡餘量檢查淨空。
- 隧道／吊橋預留走廊保持不變，新增道路不能取消舊結構；同XY多層道路依空間索引一起載入，切換地圖重建索引，三維查路只在宣告的同層節點連通。
- `src/road-geometry-v3.mjs` 供Three與Rapier使用相同Float32網格；橋底、側壁、頂板、塔索與護欄不進輪胎地面白名單。路口兩條道路經裁切，由單一平台補齊。
- 新建地圖固定V3；V1／V2種子、格式、既有儲存鍵保持凍結相容。車型、車輛外觀、傳動、輪胎接觸與480Hz力重置維持原樣，並與修改前ZIP比對。

## 實際執行

除特別註明外，工作目錄為 `desktop3d`。

| 指令 | 結果與範圍 |
| --- | --- |
| `npm.cmd run qa:all` | PASS：48種子×96段，混合一般、全左／全右髮夾、全直平路、最大上坡及低坡全下坡；物理、轉向、重建、自排、手排、健康檢查及PRND回歸 |
| `node tests/validate-road-v3.mjs --determinism` | PASS：中心線、路口、立體交會、結構範圍、已預留地形的分批生成一致性；168段延伸、失敗參數不變與幾何竄改檢查 |
| `node tests/validate-road-structures.mjs` | PASS：真實Rapier，70個車道位置淨空量測、多層同時載入、切圖索引、隧道頂板／側壁射線與CCD剛體撞擊、唯一共用路口平台、路口選路、吊橋構件、共享網格及零殘留 |
| `node tests/validate-procedural-browser.mjs --road-v3 --screenshot` | PASS：54組真實四輪車輛滑行通行，含上下穿越、反向、隧道入口／中段／出口、吊橋兩端／中段、路口兩路直行及跨支路轉彎；每組接地比例100%、結構碰撞0、無效輪荷0，無runtime exception或關鍵HTTP錯誤 |
| `npm.cmd run qa:map:compatibility` | PASS：80組V2種子×96段、確定性延伸與幾何回歸 |
| `node tests/validate-procedural-browser.mjs` | PASS：四車型接地、V1／V2／V3切圖、種子重現、儲存回復、手排與自排前進；無runtime exception、關鍵HTTP錯誤或現實地圖請求 |
| `npm.cmd run build` | PASS：18 modules；`index-_cJeBgRM.js`，既有bundle大於500kB警告保留 |
| `node tests/validate-procedural-browser.mjs --production` | PASS：正式版設定、V3重建與接地，無驗收UI、測試API或測試模組 |
| `node tests/validate-procedural-browser.mjs --acceptance` | PASS：獨立參考車型／V1參考地圖五工況5/5，不在遊戲選單 |
| `D:\shifterEmulater\codebase-mcp`：`node --test`、`node server.mjs --check` | PASS：10 tests、0 fail；唯讀查詢邊界未變，預設生成器斷言同步V3 |
| Python來源比對／知識索引驗證 | PASS：V1生成本體、車型定義與車輛渲染片段相同；V2引擎、chassis、輪胎接觸、傳動、lockfile及research／archive的SHA256不變；7來源卡片、閱讀範圍與本機連結有效 |

48種子批次的最大坡度為11.9849814%，最大曲率0.0179721153 rad/m，拒絕5888個不可行候選。平面最小間距可為0，代表合法路口／上下穿越，不能再用V2的平面間距指標當V3唯一品質標準。設計最小行車淨空為專案估算5.5m，非臺灣法規認證。

開發中曾在加入預留走廊後，於 `V3-BATCH-8` 第24段發現前瞻無解；原因是逃逸路徑未納入65m走廊。修正後該種子96段與48組批次均通過。滑行測試採足夠初速跨越上坡，沒有降低通行或碰撞門檻。

## 檔案與回復

- 來源知識、設定值、設計邊界：`docs/knowledge/road-design/`。
- 機器可讀結果：`artifacts/tests/v3-verification-2026-10-28.json`；逐案通行數據：`artifacts/tests/v3-driving-2026-10-28.json`；畫面：`artifacts/tests/browser/v3-*.png`。原有production截圖保持不變，V3版本另存 `production-game-v3.png`。
- V3開發前備份：`C:\Users\jho\AppData\Local\Temp\shiftlab-road-v3-es_762_a\before.zip`；立體道路前檢查點：`C:\Users\jho\AppData\Local\Temp\shiftlab-v3-levels-wt659ilg\before.zip`。
- 沒有Git repository；沒有commit、push、PR、部署或發布。沒有新增production dependency，沒有恢復現實地圖資料。

## 未驗證與適用邊界

- 本次執行48組混合種子，未執行200組 `qa:map:stress`、長時間人工駕駛或所有可能參數組合。
- 交通部11507版附件全文尚未取得；其卡片僅標記官方目錄與版本，沒有引用未讀附件數值。部分大型官方PDF僅讀到索引段落，逐筆標記。
- 地形為生成的道路走廊／山脊／峽谷；未完成完整地質水文高度場、號誌車流、結構荷載／風振／地基、消防通風或現地工程安全認證。詳見 `docs/knowledge/road-design/DESIGN.md`。

---

# 最新驗證：專案資料夾整理

日期：2026-10-28（Asia/Taipei）。Windows PowerShell、Node `v24.18.0`。本節為最新結果，下方保留先前階段紀錄。

## 整理範圍

- 59 個已核對來源／目的地的搬移操作，共重新安置 127 個既有檔案；沒有刪除資料。
- 11 份 patch 集中於 `archive/patches/`；版本文件／log／舊測試分別集中於 `archive/releases/`、`archive/logs/`、`archive/legacy/`。
- 研究指標、擬合結果、校準與工具歸入 `research/`；圖片與測試輸出歸入 `artifacts/`。研究工具的預設輸出路徑跟隨分類，明確傳入的 CLI 路徑仍保留。
- 原始下載 ZIP 移至工作區 `archives/packages/`，SHA256 不變；原雙層版本目錄及 `desktop3d/` 原位不動。
- 新增工作區 `START_GAME.cmd` 轉交原 Windows 啟動器；根目錄保留啟動／導向頁、README、AGENTS、CHANGELOG 與用途目錄。
- 原始遊戲頁、全部 `src/`、物理核心、v1/v2 種子生成器、package／lockfile 及原啟動腳本內容未變。所有既有研究 JSON／CSV、patch、log、圖片與舊核心快照保留內容。
- 唯一修改的現行瀏覽器測試邏輯是截圖輸出位置；沒有改遊戲行為。歷史測試只更新位置引用，未調整舊版本斷言。

## 搬移與備份

- 文件索引：`docs/ORGANIZATION.md`、`docs/DATA_CATALOG.md`。
- 工作區搬移清單：`D:\shifterEmulater\archives\organization-2026-10-28.json`，含原／新位置及整理前後 hash。
- 備份：`C:\Users\jho\AppData\Local\Temp\shiftlab-organize-luvllfdu\before.zip` 與 `manifest.json`。原始下載 ZIP 採原檔搬移，不重複壓入備份；它的原路徑及 hash 已記錄。
- 清理僅移除原 `desktop3d/tmp/` 下空目錄；既有檔案搬移後全數存在。當次 production 截圖另存 `artifacts/tests/browser/production-game-organization-2026-10-28.png`，原截圖內容保留。

## 實際驗證

| 工作目錄／指令 | 結果 |
| --- | --- |
| `desktop3d`：`npm.cmd run qa:all` | PASS：既有地圖、外力、轉向、傳動、健康與 PRND 測試；80 個 v2 種子 |
| `desktop3d`：`npm.cmd run build` | PASS：17 modules；bundle 檔名仍為 `index-0IayK8hP.js`；保留既有 bundle 大於 500 kB 提示 |
| `desktop3d`：`node tests/validate-procedural-browser.mjs --production --screenshot` | PASS：正式版啟動、設定、換車、種子重建、接地，仍無驗收 UI／API／模組 |
| `codebase-mcp`：`node --test` | PASS：10 tests、0 fail，包含實際遊戲來源與知識讀取 |
| 一次性 Python 完整性稽核（stdin） | PASS：原 176 個列冊檔案存在；研究 JSON／CSV／圖片、patch、log、ZIP、舊核心與遊戲來源 hash 核對 |
| Python `ast.parse`（34 個研究／歷史腳本） | PASS：語法檢查，不匯入可選研究依賴 |
| `v190_compat.check_v1_preserved()` | PASS：新位置可找到舊頁並確認 v1 種子核心未變 |
| 相對 Markdown 連結稽核 | PASS：專案及新工作區 README 的本機連結可定位 |
| `cmd.exe /d /c D:\shifterEmulater\START_GAME.cmd`（測試中 mock npm） | PASS：實際轉交兩層舊啟動腳本，最終工作目錄為原 `desktop3d`、參數為 `run dev:open`；沒有額外啟動瀏覽器或安裝依賴 |
| 備份 ZIP CRC | PASS |

## 驗證邊界

- 未執行封存的完整 Python／Playwright 舊測試；其 UI 與版本斷言保留歷史用途。本機缺少 SciPy、Matplotlib、Playwright，沒有為整理安裝依賴、下載來源或重算研究結果。
- 新版資料夾下的研究工具已檢查語法與來源／輸出路徑，未執行需要外部原始資料的校準工作。Unix 打包輔助腳本只核對路徑，未在 Unix 系統執行。
- 未執行打包／發布輔助指令、部署、commit 或 push；遊戲儲存格式與玩家 localStorage 未修改。

---

# 前一階段：物理驗收移出遊戲本體

日期：2026-10-28（Asia/Taipei）。本節是本次最新結果；下方保留先前清除現實地圖的歷史紀錄。

## 修改內容

- 玩家遊戲移除驗收面板、F2、工況／路障建立、量測評分、報告及單步測試按鈕。保留一般儀表、選單、設定、空白鍵暫停與重置。
- `src/scenarios.mjs`、`src/obstacles.mjs` 原內容搬至 `tests/acceptance/`；原量測／判定邏輯另由獨立頁 `tests/acceptance/index.html` 執行。
- `tests/game-driver.mjs` 僅於 DEV 載入。正式建置沒有 QA 全域 API、測試頁或驗收模組；遊戲不建立驗收路障。
- `public/physics.html`、車輛呈現、車型參數、四輪／Rapier bridge、v1/v2 種子生成器及 lockfile 未改；行駛數值安全檢查保留。
- 修改前檔案備份：`C:\Users\jho\AppData\Local\Temp\shiftlab-extract-acceptance-e3kwe437\before.zip`；同目錄有 SHA256 清單。

## 實際執行

在版本根目錄執行以下語法檢查，全部 PASS：

```powershell
node --check desktop3d/src/main.mjs
node --check desktop3d/tests/game-driver.mjs
node --check desktop3d/tests/acceptance/main.mjs
node --check desktop3d/tests/validate-procedural-browser.mjs
```

在 `desktop3d` 執行：

| 指令 | 結果 |
| --- | --- |
| `npm.cmd run qa:all` | PASS：既有種子、外力生命週期、轉向、手排／自排、健康及 PRND 回歸 |
| `npm.cmd run build` | PASS：17 modules；單一 bundle 大於 500 kB 的既有提示仍在 |
| `node tests/validate-procedural-browser.mjs` | PASS：四種車型、v1/v2 種子重現、儲存還原；實際停車手排選檔及自排 D 檔前進 |
| `node tests/validate-procedural-browser.mjs --acceptance` | PASS：獨立工具五項工況 5/5，保留原門檻 |
| `node tests/validate-procedural-browser.mjs --production --screenshot` | PASS：正式遊戲設定、種子重建、接地；無驗收 UI、F2 行為、測試 API、測試模組請求或產物 |

瀏覽器使用隔離 Chrome、真實 Rapier WASM；遊戲資產 HTTP errors 與 runtime exceptions 皆為 0（沿用排除 favicon 404 的規則）。正式選單截圖為 `artifacts/tests/browser/production-game.png`。

## 邊界

- 舊紀錄中「換車後立即執行遊戲內驗收」的流程已移除；獨立工具使用固定參考車，五項測試通過。未修改原車輛物理來處理舊流程。
- 未測長時間人工駕駛、實體手柄或耐久；未 commit、push、發布或部署。

---

# 前一階段：移除現實地圖的驗證

日期：2026-10-28（Asia/Taipei）。Windows、Node `v24.18.0`、npm `11.16.0`。以下只記錄本次清理與實測，沒有使用歷史城市 QA 充當新結果。

## 修改及來源保留

- 指定遊戲版本移除 657 個現實地圖專用檔案，約 382.05 MiB：runtime 模組、編譯圖資、原始道路／建物／高程、資料工具、專項測試、研究資料庫、報告、歷史補丁及過期發行清單。
- 清除主程式、物理核心、選單及設定事件的相關入口；啟動直接使用程序化道路。
- 工作區另刪除過期的 `已知問題.md` 實景開發清單，更新開發查詢入口及實際專案測試。
- 與刪除前 SHA256 清單比對，指定版本其餘 149 個既有檔案未變。`road-generator-v2.js`、`procedural-map.mjs`、`road.mjs`、`package-lock.json` 完全相同；`makeCar()` 車輛呈現及 `VEHICLES` 車型／校準區塊逐字相同。
- 四種車型 `standard`、`city`、`turbo`、`diesel`、既有 v1/v2 地圖格式與儲存 key 保留，未新增依賴。
- 原始下載 ZIP 未覆寫。被刪除或編輯的檔案另有系統暫存備份：`C:\Users\jho\AppData\Local\Temp\shiftlab-seeded-only-q0hi8v11\before.zip`，清單為同目錄的 `manifest.json`。

## 已執行命令與結果

在版本根目錄：

```powershell
node --check desktop3d/src/main.mjs
node --check desktop3d/src/chassis.mjs
node --check desktop3d/src/game-modes.mjs
```

三項語法檢查 PASS。

在 `desktop3d`：

```powershell
npm.cmd run qa:all
npm.cmd run build
node tests/validate-procedural-browser.mjs --screenshot
```

- `qa:all` PASS：工況、懸吊射線、外力生命週期、轉向、v1/v2 匯入匯出、碰撞體清理、80 個 v2 種子、四種車型自排、手排、物理健康與 PRND。
- build PASS：19 modules，輸出只有玩家入口、物理頁、種子生成器與 bundle，沒有實景圖資。既有單一 bundle 大於 500 kB 的警告仍存在。
- 本機隔離 Chrome／WebGL2／Rapier PASS：預設 v2 種子場景、選單／設定／測試切換、四種車型皆四輪接地、v1/v2 同種子重建一致、進出測試還原玩家種子／車型、重新載入後設定還原。
- 固定 standard 參考車型五項實際物理工況 PASS：settle、frontal、glancing、fast、ramp；runtime exceptions 0，實景圖資請求 0，遊戲資產 HTTP errors 0。
- 瀏覽器額外的 `/favicon.ico` 404 不列入遊戲資產失敗。截圖：`artifacts/tests/browser/procedural-only.png`，已目視確認種子道路、車輛與儀表。
- 預設沙箱的 Chrome GPU 子程序啟動曾遭拒，改以授權環境執行同一個隔離瀏覽器測試後通過，沒有修改 Chrome 系統設定。

## 開發查詢服務驗證

在 `D:\shifterEmulater\codebase-mcp` 執行 `node --test`：10 tests、0 fail；`node server.mjs --check`：PASS，119 個允許的文字檔、5 個入口、3 個知識資源。初次測試仍引用已刪除的城市高程檔，已改為讀取 `procedural-map.mjs/DEFAULT_MAP` 和當次 QA；工作目錄也改正後重跑以上命令通過。

## 驗證邊界

- 初次整合測試先切換到 diesel 後立即執行 QA，遇到初始 `bodyMassKg=0` 使 settle 的質量比例門檻失敗；本次保留車輛／QA 邏輯，沒有放寬判定。最終五項 QA 以獨立的 standard 參考車 fixture 執行；換車、地圖重建及設定還原另行驗證。此結果不代表已修正切換車型後立即啟動 QA 的讀值問題。
- 未測長時間人工駕駛、真實手柄硬體或長時間耐久；沒有 commit、push、PR、發布或部署。
