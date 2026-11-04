# P2 結構基礎與隧道洞口

更新：2026-10-29。此工作包接續[連續地表](P2_CONTINUOUS_TERRAIN.md)，P2整體及P3至P5仍未完成。

## 接地與結構連接

`desktop3d/src/road-engineering.mjs`沿用V3既有中心線及結構範圍建立橋墩、橋台、橫梁、支承、吊橋橋塔及錨碇。渲染與Rapier仍使用同一份頂點／索引；沒有更動種子序列或加入第二條道路開發路線。

基礎取樣來自`TerrainWorld`實際Float32地形三角面，不使用理想高度函式代替已建立的承載網格。以旋轉後的完整基礎矩形裁切地形，核對覆蓋面積，取所有交點的最高／最低值；取樣點轉換為Float32後重新查詢真正所在面，避免在陡坡共邊外插高度。16m查詢索引加速面查詢，不改變幾何。

基礎底面在足跡最低地面以下至少0.8m，頂部與柱體依實際地形及橋面高度連接。這是專案建模值，未計算地基承載力、配筋、荷載或抗震。橋墩兩側以橫梁及支承連到橋板底部，橋塔兩側配對建立，避免只調整柱長卻留下懸空橫桿。

構件建立前檢查其他道路的三維空間；穿越道路附近的橋墩／橫梁可以省略並記錄原因，不向下層行車空間增加障礙。雙柱或橋塔只有一側可成立時，整組候選幾何會撤回。不能把這種遊戲幾何避讓當作真實橋梁結構安全證明。

## 洞口與覆土

隧道增加與側山體銜接的覆土頂面、端部土壁、實體頂板側邊與洞口門楣，以及兩側翼牆。洞口正面不封閉車道；設計名義內高沿用6.5m，真正車道淨空以Rapier量測並維持至少5.5m的專案門檻。

可到達覆土頂面使用獨立cover網格及earth接觸資料，供車輛在山體上方查詢。土壁、門楣、翼牆、頂板、橋墩與護欄仍為結構碰撞，不加入輪胎地面集合。覆土與結構的分類不因顏色或材質名稱推斷。

## 驗證範圍

`node tests/validate-road-engineering.mjs`使用LEVEL-1、LEVEL-0及LEVEL-2三個實際V3種子，逐座核對基礎足跡與Rapier地面、埋入深度、構件側面碰撞、洞口通行、覆土承載面、車道淨空、共享幾何、道路狀態不變及零殘留。此指令已納入`qa:engineering`及`qa:all`。

LEVEL-2一個錨碇的中央射線恰好命中三角形共邊時，Three與Rapier的射線結果不同；偏離共邊後Rapier命中預期近面。`node tests/validate-foundation-ccd.mjs`另以真實剛體沿中央及兩條偏移軌跡撞擊同一構件，三次均有結構接觸，最大前進約1.89m，未越過距起點2m的近面。此項驗證使用原Rapier CCD，不以射線結果替代剛體碰撞。

三個種子共通過248座基礎、5,587個實際地面查詢及14個洞口；[逐座原始結果](../artifacts/tests/p2-engineering-2026-10-29.json)已保存。`--road-v3`的54組實際通行亦通過；正式版隔離與車輪接地通過，門楣及頂板側邊補齊後的[洞口畫面](../artifacts/tests/engineering-portal-2026-10-29.png)已目視核對，[吊橋畫面](../artifacts/tests/engineering-suspension-2026-10-29.png)另存，未覆寫前一工作包的畫面。

工作目錄為`desktop3d`；`--...`代表`node tests/validate-procedural-browser.mjs --...`。建置通過27 modules，仍有既有大於500kB bundle警告。完整`npm.cmd run qa:all`通過，含新增engineering、48種子×96段、70車道結構及既有車輛／傳動／健康／PRND回歸；52組接地診斷、一般瀏覽器四車型／V1–V3保存重載、五項獨立物理驗收也全部通過。CCD專項另提供`npm.cmd run qa:engineering:ccd`，不以單一中央射線作為構件碰撞的唯一證據。

## 後續交付

工程化坡腳／坡頂、擋牆及局部地形整形仍需細修；10類材質、道路UV、PBR、光照、植被岩石水系及P3性能定案尚待完成。現有同步幾何生成及材質仍屬開發中，不宣稱已達最高穩定畫質。

修改前備份：`C:/Users/jho/AppData/Local/Temp/shiftlab-p2-engineering-3a7tz_0o/`。未新增production dependency、commit或發布。

來源快照：[p2-engineering-source-2026-10-29.zip](../artifacts/tests/p2-engineering-source-2026-10-29.zip)；[本工作包驗證索引](../artifacts/tests/p2-engineering-verification-2026-10-29.json)。
