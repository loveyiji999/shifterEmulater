# 遊戲參數與數據索引

## 現行遊戲使用的數據

目錄整理時保留既有數值與讀取方式。後續資料契約及逐面接觸實作見[車輛資料契約](VEHICLE_DATA_CONTRACTS.md)及[表面綁定](P0_SURFACE_BINDING.md)；既有JSON／localStorage相容性仍保留。

| 分類 | 定義位置（相對版本根目錄） | 內容 |
| --- | --- | --- |
| 車型與車身 | `desktop3d/public/physics.html` 的 `P`、`VEHICLES` | standard／city／turbo／diesel、質量、軸距、慣性、車輪與懸吊參數 |
| 引擎與傳動 | 同一物理核心的車型參數及傳動函式 | 扭力、齒比、終傳、離合器、同步器與 PRND 所需參數 |
| 輪胎與附著力 | 同一物理核心的輪胎參數及函式、`desktop3d/src/surface-map.mjs` | 既有乾／濕／雪／冰；3D逐面接觸、滑移、胎溫、胎壓、磨耗與輪胎對正 |
| 轉向與輔助 | `physics.html`、`desktop3d/src/steering-input.mjs` | 轉向預設、ABS／TCS／ESC、操控平衡及煞車比例 |
| 地圖設定 | `desktop3d/src/procedural-map.mjs` | v1/v2/v3 schema，V3預設；種子、生成參數及匯入／匯出驗證 |
| 道路生成 | `desktop3d/public/road-generator-v3.js`；v1/v2凍結相容 | V3唯一開發主線，線形／拓樸／立體結構與預留走廊 |
| 車型／外觀規格 | `desktop3d/src/vehicle-definition.mjs`、`vehicle-layout.mjs`、`appearance-assembly.mjs`、`tuning-profile.mjs` | 原值適配、revision、單位、共用車殼／輪拱、能力與安全套用要求；完整玩家工具待P4／P5 |
| 可選道路材質 | `desktop3d/src/pavement-definition.mjs`、`surface-map.mjs`、`road.mjs`、`main.mjs` | 10類路面×4條件接觸與PBR、獨立道路土／石profile、標線及原偏好保存；新增係數為project-illustrative，路肩仍未分類 |
| 接觸／材質資料 | `desktop3d/src/surface-definition.mjs`、`surface-map.mjs` | 已註冊40個道路及12個地形／岩石profile、預覽／未知限制、區域／層／三角面；綁定隨chunk建立釋放，不是玩家storage |
| 連續地表 | `desktop3d/src/terrain-geometry.mjs`、`terrain-world.mjs` | 種子地貌、實際道路裁切／高度約束、共邊法線與碰撞、車身位置串流；earth四條件為專案假設，非實地校準 |
| 洞內外光照 | `desktop3d/src/tunnel-light-field.mjs`、`tunnel-lighting.mjs`、`scene-lighting.mjs` | 同源洞體XYZ與sky／ID屬性、24m過渡、固定6燈、同層受光；數值是作者設定，不是工程照度 |
| 地形三層表面 | `desktop3d/src/terrain-surface.mjs`、`terrain-material.mjs`、`surface-map.mjs` | 同源土／碎石／裸岩遮罩、命中點重心內插、三軸岩面PBR、terrain_gravel四條件；係數為遊戲假設 |
| 種子造景 | `desktop3d/src/scenery-geometry.mjs`、`scenery-world.mjs`、`terrain-world.mjs` | 獨立座標雜湊、道路／結構避讓、根部埋入、土色變化、樹幹障礙及natural_stone岩石承載面；岩石係數為遊戲假設 |
| 碰撞空間分區 | `desktop3d/src/collider-partition.mjs`、`surface-map.mjs` | 原Float32三角面分組、緊密頂點、顯示面索引映射；保留CCD與形狀，不是LOD或碰撞簡化 |
| 地形背景串流 | `desktop3d/src/geometry-streamer.mjs`、`streaming.worker.mjs`、`streaming-geometry.mjs`、`road-snapshot.mjs` | V3唯讀快照、版本隔離、同源幾何、預載與分批啟用；不改變種子或玩家storage |
| 結構與地面足跡 | `desktop3d/src/road-engineering.mjs`、`road-geometry-v3.mjs` | 依實際地形足跡建立基礎、橫梁、支承、洞口與覆土；構件紀錄為生成資料，不新增玩家storage |
| 程序材質與光照 | `desktop3d/src/surface-materials.mjs`、`surface-uv.mjs`、`scene-lighting.mjs` | 10類外觀資料、色彩／法線／粗糙度、米UV、陰影與環境照明；外觀不決定輪胎係數 |
| 玩家偏好 | 瀏覽器 localStorage | `shiftlab.v189.settings`、`shiftlab.v189.procedural-map`；不屬於本機研究檔案 |
| 手動效能診斷 | `desktop3d/tests/manual-performance.mjs`、`tests/performance/` | DEV正常玩家操作的長幀／碰撞／串流記錄與本機JSON下載；不寫玩家storage、不進入production |
| 開發驗收 | `desktop3d/tests/acceptance/` | 固定參考地圖、standard 車型及五項工況；不納入玩家建置 |

## P2水系開發分析（尚未接入遊戲）

`desktop3d/src/terrain-drainage.mjs`採樣真實地形三角面，求局部溢出面、無循環接收圖與等面積格心累積。數據為河床規劃分析，不是已施工地形、水面、流量或玩家storage。原始三種子結果位於`artifacts/tests/p2-drainage-latest.json`；規格見[排水基礎](P2_DRAINAGE_FOUNDATION.md)。

`desktop3d/src/riverbed-proposal.mjs`產生局部挖方／裁切水面候選，保留受保護足跡、來源拓樸與明確拒絕原因；水面不是承載碰撞體。資料尚未進入遊戲或玩家storage。固定結果、離線預覽與接續缺口見[河床候選](P2_RIVERBED_PROPOSALS.md)。

`desktop3d/src/river-routing.mjs`以地形、保護足跡與作者設定開挖成本搜尋局部河床路線，可指定邊界接續點；邊界不是已驗證出口。僅接入外部施工fixture，未供遊戲直接載入。規格與固定比較結果見[局部河床尋路](P2_RIVER_ROUTING.md)。

河床候選水面現依正水深共邊連通與實際地形岸線裁切，保留原走廊診斷並另記外框／內部未解析濕邊；不把孤立窪地或零深度接觸視為連通水域。固定資料與限制見[相連水面與岸線](P2_RIVER_INUNDATION.md)。

`desktop3d/src/water-geometry.mjs`共用水面裁切／連通；`closed-lake.mjs`輸出不修改地形的封閉水平湖面及作者設定水位搜尋，尚未進入遊戲。`terrain-geometry.mjs`另修正Float32重複XZ高度／法線一致性，該修正會影響共用遊戲地形。來源與驗證見[封閉湖面](P2_CLOSED_LAKES.md)。

## 車輛研究與校準資料

| 分類 | 位置 | 代表內容 |
| --- | --- | --- |
| ADMA 感測器指標 | `research/metrics/adma_metrics.json` | 感測器一致性摘要 |
| Honda Civic 指標 | `research/metrics/civic_metrics.json`、`civic_observed_bins.csv` | 觀測加速區間 |
| Bucknell P1 參考 | `research/metrics/bucknell_p1_reference.json`、`bucknell_p1_steady_yaw.csv` | 來源車輛參考與模型指標 |
| 跨來源摘要 | `research/metrics/` 其餘 JSON／CSV | 擬合係數、來源評估及比較摘要 |
| BMW 擬合／驗證 | `research/results/bmw_*`、`v185_validated_reference.json` | 擬合比較及來源驗證摘要 |
| P1 力通道檢查 | `research/results/p1_force_*` | 通道品質、CSV 與圖表 |
| P1 校準 | `research/calibration/results/` | 擬合結果、來源清單、訓練／保留集指標 |
| P1 幾何敏感度 | `research/calibration/geometry_b115/` | 原 1.15 m 幾何假設的比較結果 |
| 工具 | `research/tools/`、`research/calibration/*.py` | 原資料處理、校準及繪圖程式 |

研究資料只作來源與比較證據，不代表現行車輛已完成真車校準。原 JSON、CSV、來源 hash 與圖片內容均保留；授權及來源界線見 [資料來源說明](reference/DATA_PROVENANCE.md)。

## 產物與歷史紀錄

- `artifacts/research/figures/`：研究圖表。
- `artifacts/research/screenshots/`：歷史介面截圖。
- `artifacts/tests/browser/`：現行遊戲／production 回歸截圖。
- `artifacts/tests/legacy-browser/`：歷史瀏覽器腳本之後產生的輸出。
- `archive/logs/`：已存在的歷史 QA log。
- `archive/releases/`：舊版說明及驗證報告。
- `archive/patches/`：原始 patch，保持原內容。

整理沒有執行資料下載、擬合重算、發布或部署。

## V3道路知識與生成資料

- 來源與版本索引：`docs/knowledge/road-design/catalog.json`；7份官方來源卡片在同目錄 `sources/`，逐筆標記閱讀範圍與限制。
- 專案估算與規劃規則：`docs/knowledge/road-design/DESIGN.md`；不含現實城市圖資。
- 遊戲道路幾何：`desktop3d/public/road-generator-v3.js` 與 `desktop3d/src/road-geometry-v3.mjs`。保存格式為 `shiftlab.road.v3` 種子設定，不保存或下載真實道路。
- 新測試截圖：`artifacts/tests/browser/v3-*.png`，不放入遊戲public assets。

## 道路材質與環境建模知識

- `docs/knowledge/road-environment/source-catalog.json`與`sources/`：第一手來源、版本、閱讀範圍與限制。
- `classification.json`：10種路面、6種狀態及10種環境的先期分類；`scope=documentation_only`，不供遊戲直接載入。
- 同目錄`ROAD_MATERIALS.md`、`ENVIRONMENT.md`、`ASSET_PIPELINE.md`、`INTEGRATION.md`：外觀、幾何、接觸、造景、資產及驗證規格；新增性能數值維持null待校準。

## 環境渲染前置研究

`docs/knowledge/road-environment/rendering/`收錄14份新增技術來源、所見即所得、地形、材質、光照與串流規格。`benchmark-plan.json`定義10場景及待量測欄位，`scope=planning_only`且所有結果未填寫；不作已實測的遊戲效能數據。
