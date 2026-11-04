# P2 橋端整形與材質光照

更新：2026-10-29。本工作包完成後依使用者指示暫停；P2整體與P3至P5仍未完成。

## 地形過渡

橋梁及吊橋下方地形改以連續里程投影取樣，在橋端32m範圍由橋板下方保留空間逐步過渡到谷底。這是獨立的地形整形，沒有改動V3中心線、道路拓樸、種子序列或原車輛物理。

LEVEL-1與LEVEL-2的實際錨碇足跡高差約2.02–2.83m；原先橋端可能落在突變的深谷約束上。沿路側每0.5m查詢實際地面，最大高度步差約0.449m與0.529m，通過本次橋端連續性檢查。這不是所有山坡均已滿足可駕駛坡度的證明；完整挖填方、坡腳坡頂、擋牆及複雜地形仍需後續整合。

整形後重新核對三個種子的248座基礎、4,996個實際地面查詢及14個洞口。橋塔側向射線改查露出的上段柱面，避免射線穿過橋板卻將橋板命中誤判為柱面尺寸錯誤。幾何與碰撞仍共用同一份Float32頂點及索引。

數據：[橋端整形](../artifacts/tests/p2-grading-2026-10-29.json)、[本輪結構結果](../artifacts/tests/p2-engineering-grading-2026-10-29.json)。後續重跑工程檢查輸出至`p2-engineering-latest.json`，保留已封存的階段結果。

## 材質與UV

`surface-materials.mjs`提供10類程序材質：密級配／開級配瀝青、混凝土、混凝土磚、黏土磚、天然石、碎石、土路、木板及鋼板。各類具有色彩、法線及粗糙度貼圖；色彩使用sRGB，資料貼圖使用NoColorSpace，具mipmap、重複取樣與最多8倍各向異性。

道路UV採橫向／里程的公尺座標，跨chunk連續；材質貼圖依自身公尺尺度取樣。結構採面向投影，地形採世界座標。細部法線的作者設定高度不超過2mm，不改變碰撞，也不代表深車轍、坑洞或地表變形已完成。

遊戲已套用瀝青、土路、混凝土結構及鋼材外觀；路肩保留既有接觸分類。乾／濕／雪／冰的瀝青與土路外觀跟隨現有接觸條件。這些是美術設定，沒有由roughness推算摩擦，也沒有新增混凝土／碎石等未驗證的可行駛係數。

10類外觀樣板位於`desktop3d/tests/material-gallery/`，僅供DEV預覽，不在玩家選單或正式bundle。其餘材質可預覽不等於已發布為可行駛路面。[樣板畫面](../artifacts/tests/material-gallery-2026-10-29.png)與[樣板資料](../artifacts/tests/material-gallery-2026-10-29.json)已保存。

## 光照與陰影

遊戲與樣板共用`scene-lighting.mjs`：固定ACES曝光、方向主光、半球補光及程序天空生成的PMREM環境照明。主光陰影使用2048貼圖，跟隨車輛並對齊陰影取樣格；地形另使用有深度偏移的陰影材質，減少自陰影條紋。

在固定車輛與相機下，比較關閉陰影、原1024設定、調整後2048設定及關閉法線貼圖的畫面。指定平坦道路區塊的灰階標準差由約4.316降至1.967，與無陰影的該區塊相同；這只用於本次條紋排查，不是一般畫質評分或GPU性能量測。主光仍保留車輛、護欄及洞口陰影。

對照：[陰影設定](../artifacts/tests/pbr-shadow-study-2026-10-29.json)、[區塊量測](../artifacts/tests/pbr-shadow-diagnostic-2026-10-29.json)、[最終遊戲畫面](../artifacts/tests/pbr-portal-2026-10-29.png)。目前材質庫的貼圖容量欄位只是含mip的貼圖估算，不含完整環境、陰影及驅動資源，不能當作VRAM實測。

## 實際驗證

工作目錄為`desktop3d`。

| 指令 | 結果 |
| --- | --- |
| `npm.cmd run qa:all` | PASS：車輛、材質、整形、248座基礎、48種子×96段、70車道結構、傳動／健康／PRND |
| `npm.cmd run qa:engineering:ccd` | PASS：三條實際剛體撞擊軌跡未穿過錨碇近面 |
| `node tests/validate-procedural-browser.mjs --road-v3` | PASS：54組實際車輛通行 |
| `--vehicle-diagnostics` | PASS：52組接地及表面分界 |
| `--surface-contact` | PASS：局部乾濕雪冰實際輪胎力與煞停次序，保持原係數 |
| 一般瀏覽器回歸 | PASS：四車型、V1／V2／V3切換、手自排、保存重載 |
| `--material-gallery` | PASS：10類材質實際渲染，無runtime或關鍵HTTP錯誤 |
| `--pbr-shadow-study`、`--engineering-overview` | PASS：實際光照對照及遊戲畫面，已目視核對 |
| `npm.cmd run build`、`--production` | PASS：31 modules、正式版接地與隔離；既有大於500kB bundle警告保留 |

`--...`代表同一瀏覽器腳本的參數。新的陰影預覽API及材質樣板也已檢查未進正式bundle。最後的工程測試修改僅將報告目的地改為latest檔名，已另做語法與目的地核對。

## 保存與未完成範圍

本輪畫面與資料已另存。先前工程畫面曾被共用檔名的測試更新，已由第七工作包來源快照重繪並恢復其248座／5,587查詢結果，明確記錄為[舊來源重播](../artifacts/tests/engineering-phase7-replay-2026-10-29.json)，沒有以它替代本輪驗證。

尚未完成的範圍包括完整工程邊坡與地形混合材質、新路面接觸發布、植被／岩石／水系、P3十場景原生GPU最高穩定畫質驗收，以及P4調教和P5外觀創作工具。目前的陰影／貼圖設定仍須在P3量測定案，未宣稱已達最佳性能。

修改前備份：`C:/Users/jho/AppData/Local/Temp/shiftlab-p2-grading-materials-m_10gnnn/`。沒有新增production dependency、commit或發布。

[本工作包來源快照](../artifacts/tests/p2-pbr-grading-source-2026-10-29.zip)及[驗證索引](../artifacts/tests/p2-pbr-grading-verification-2026-10-29.json)已保存。
