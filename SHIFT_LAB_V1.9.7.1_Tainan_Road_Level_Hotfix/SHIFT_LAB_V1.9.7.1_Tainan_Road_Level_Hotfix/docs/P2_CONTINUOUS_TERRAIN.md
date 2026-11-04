# P2 連續地表與實際土路接觸

更新：2026-10-29。這是P2的第一個實作工作包，P2至P5尚未完成。

後續結構接地與洞口已接續實作，最新內容見[P2_ENGINEERING.md](P2_ENGINEERING.md)；本頁保留連續地表工作包的驗證與當時邊界。

## 已接入遊戲的能力

`desktop3d/src/terrain-geometry.mjs`以128m世界座標分塊、8m基礎網格建立地表。地貌使用獨立的種子雜湊、不同尺度取樣及座標擾動，不消耗V3道路的隨機序列。道路走廊附近以現有道路三角面約束高度，遠處逐步回到世界座標地貌。

地表依實際瀝青／路肩三角面裁切，交界高度取自三角面線性插值；不以另一片地面蓋在路面上。原V3路外、山脊與峽谷的earth網格改作高度約束，由新地表統一呈現及碰撞，避免兩份地面交疊。橋面不裁掉谷底，橋下使用較低的地面約束。這些仍是程序地貌，沒有宣稱完成地質或水文模擬。

鄰塊使用相同世界座標及固定查詢範圍，法線由跨塊取樣計算。彎坡道追加測試找出裁切延長線造成的T型接縫，已統一鄰塊邊界分割點並對塊內三角面補齊共同頂點；直線及三處彎坡道的Float32邊界檢查通過。渲染及Rapier共用同一份Float32頂點和Uint32索引，公尺尺度UV亦已提供。可到達地表加入輪胎地面集合；側壁、頂板、護欄等結構維持原分類。

`desktop3d/src/terrain-world.mjs`維護車輛周邊3×3塊地表，路外行駛時依實際剛體位置載入；道路空間查詢也納入此位置。新塊分配失敗會釋放候選並保持原有地表；離開的塊與其綁定、碰撞及geometry一起回收，地形取樣快取亦限定在周邊。此時仍採同步生成，Worker及完整場景原子切換屬後續工作。

## 土路參數與驗證範圍

新連續地表具有獨立的earth profile，不沿用乾柏油摩擦。`surface-definition.mjs`新增`project-illustrative`依據分類；參數為專案遊戲假設，透過內部受信任登錄供接觸使用，並非實地校準。匯入檔案自行填入verified字串仍無法取得登錄信任。

| 條件 | 輪胎mu | 滾動係數 | 剛體摩擦 |
| --- | --- | --- | --- |
| dry | 0.62 | 0.035 | 0.7 |
| wet | 0.38 | 0.045 | 0.7 |
| snow | 0.28 | 0.030 | 0.7 |
| ice | 0.12 | 0.020 | 0.7 |

四條件已檢查實際Rapier命中及接觸值；乾土路另以遊戲內standard、12m/s、原煞車及ABS流程驗證，煞停約30.762m／5.750s。保留原核心的路外附著力折減，這不是與瀝青單一變因比較，更不是實車煞停標定。初次在距路中心40m的山坡測試未於15秒內完全停止；正式固定工況改用距中心10m的路側地表，山坡停車能力仍需另作坡度工況驗證。

逐輪命中面、土路參數、輪胎力及接地數據見[實際接觸紀錄](../artifacts/tests/terrain-contact-2026-10-29.json)，[遊戲畫面](../artifacts/tests/terrain-contact-2026-10-29.png)已目視核對。

## 已執行檢查

- `node tests/validate-terrain.mjs`：通過確定性與生成順序、道路資料不變、Float32接縫、共享法線、精確道路裁切、真實Rapier支撐、共用buffers、四條件接觸、路外串流、快取限界、候選失敗復原與零殘留。
- `node tests/validate-road-structures.mjs`：通過70個車道位置及既有結構、上下層、路口與資源檢查。
- `npm.cmd run qa:vehicle`、`npm.cmd run qa:scenarios`：通過既有基準車、輪拱、接觸及控制回歸。
- `node tests/validate-procedural-browser.mjs --terrain-contact`：通過實際四輪土路接觸及原輪胎煞車力；測試模組僅由DEV driver載入。
- `npm.cmd run build`：通過26 modules，保留既有大於500kB bundle警告。

完整`npm.cmd run qa:all`已通過48種子×96段、70車道位置及其餘回歸；一般瀏覽器四車型／V1–V3保存重載、外部驗收5/5亦通過。最終共邊修正後，`qa:terrain`、70車道結構檢查、`--terrain-contact`、`--road-v3`的54組通行、`--vehicle-diagnostics`的52組接地、`build`及`--production`均通過；`--terrain-overview`的吊橋地形畫面亦已目視核對。詳見[本階段驗證紀錄](../artifacts/tests/p2-terrain-2026-10-29.json)及[吊橋畫面](../artifacts/tests/terrain-suspension-2026-10-29.png)。早期`--road-v3 --screenshot`在Page.captureScreenshot逾時，不列為通過；已產生的中途畫面也不當作完整通行證據。

## 未完成的P2交付

目前不是完整環境關卡：仍需工程化挖填方與坡腳坡頂、擋牆、橋台／橋墩／錨碇接地、洞口覆土與跨層邊界細修、10類材質樣板及其接觸驗證、PBR貼圖、主光陰影、曝光／環境照明，以及植被、岩石與水系。現有土路仍以單一美術色呈現，濕泥、雪冰細節與變形尚未實作。

128m／8m與3×3載入視窗是目前實作值，尚未透過P3十場景原生GPU測試定案，也不能以舊P0靜止基線宣稱新場景畫質效能已達標。同步生成、遠景覆蓋及串流尖峰仍須改善。

實作前備份：`C:/Users/jho/AppData/Local/Temp/shiftlab-p2-terrain-hyxcv5rx/`。未新增依賴、建立commit或發布。

本階段來源快照：[p2-terrain-source-2026-10-29.zip](../artifacts/tests/p2-terrain-source-2026-10-29.zip)。
