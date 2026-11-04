# P2 洞內外光照與隧道側緣

日期：2026-10-29，第十二工作包。接續三層地形、種子造景及分幀GPU預上傳；整體P0–P5仍在進行。

## 實作與範圍

閉合tunnel原先直接接收全場Hemisphere與PMREM環境光，洞內也像室外。本批加入TunnelLightField，依V3實際中心線、橫坡、內牆寬度與頂板高度建立4m段的局部查詢。使用XYZ及路線層，牆外、頂板以上與地面以下不視為洞內；入口／出口24m內平滑由1過渡到深處.06的天空光比例。這些是作者選值，不是量測的天空可視因子或工程照度規範。

道路、地形、造景網格的每頂點skyVisibility與tunnelId在Worker生成，傳送自有Float32副本；GPU內插後只衰減間接漫射、天空IBL與環境反射，既有方向光與真實屋頂陰影保留。車輛使用實際Rapier車身位置的相同查詢，由uniform更新，沒有改變車色、碰撞、輪胎或受力。車身是一個空間樣點，不是逐片車殼或每輪獨立的GI解算。曝光固定1.05、ACES、解析度與2048方向光陰影保持。

深洞以最多6個共用PointLight照明，依目前已啟用chunk中的燈面選取最近來源；作者值為16m燈面間隔、光源intensity220、distance38、decay2、65m選取範圍與暖色#ffe4bb。這是可讀的遊戲照明，不是已校準光通量、照度、真實燈具或隧道安全設計。

燈面是既有天花板上的自發光飾面：四頂點以重心座標落在同一個原頂板三角面，用polygonOffset避免重疊閃爍。它不是凸出的硬燈殼；原天花板就是同位置的實際碰撞面，因此不新增一層碰撞或降低原淨高。PointLight位置在該頂板下方.12m。實際照明只作用於相同tunnelId且被局部遮蔽的接收面，避免照亮屋頂外、另一層道路或另一條隧道。

PointLight沒有新增陰影貼圖，轉彎處的燈光是局部解析遮罩近似，並非逐燈遮擋、全局光照或多次反彈；複雜彎角仍需P3畫質比較。閉合tunnel以外的橋下／地下道沿用既有方向光陰影，本批不以閉合洞體遮罩冒充其完整天空遮擋。

6個PointLight在場景生命週期固定存在，區塊只保存燈面／來源metadata，不隨chunk反覆建立Lights。未使用燈強度為0，shader依來源ID與接收層先跳過無效貢獻；固定燈數避免行駛中切換燈數導致shader變體重編譯，但洞外仍有固定燈數的shader成本。這是目前取捨，未宣稱為P3最佳設定。

## 同時修正的可見幾何問題

實際洞口畫面揭露，原地形只裁到6m路肩邊，內牆在6.2m，兩者間的地形會向上穿入洞內。現在每側用同源paved verge補齊6.0至6.2m，由相同三角面建立渲染、輪胎ground碰撞及TerrainField裁切；兩側繞序均朝上，不新增只藏畫面的遮罩。車道主體、既有頂板與內牆維持原形。

覆土頂蓋／土壁原先啟用vertexColors卻沒有color屬性，部分面呈黑色；現在明確提供中性白色頂點色，保留其PBR土色與乾濕條件。這是V3覆土的顯示修正，不改地形高度。行車洞體側緣已無原尖刺；洞外翼牆與山坡的美術銜接仍需後續完整場景檢查，沒有宣稱所有入口造景已定案。

原核心道路mesh來源比較涵蓋10個隧道chunk：既有asphalt、頂板／牆、護欄、earth與原shoulder全部三角面保持；只增加836個側緣小面及52個非實體燈面。工程基礎仍依目前實際地形另行驗證，不以這個來源比較推定所有舊地形數值相同。物理核心、chassis、車模、V3生成器與lockfile未變，120Hz／480Hz及每微步清力不變。

## 版本、失效與資源

靜態屬性沿用Worker快取／transfer、版本隔離、隱藏準備、整批啟用與原清理。續生成時，車身查詢依state／revision重建輕量光照索引，不呼叫會清除正在使用地形的TerrainWorld.prepare；已以實際V3再延伸96段驗證新隧道，原active colliders及terrain field保留。

同一材質的shader hook只登記一次，和TerrainMaterial既有PBR hook串接；車型更換後的舊材質以WeakRef／WeakMap追蹤，不保留強參照。dispose會恢復先前hook及cache key，控制器可以重新綁定。換圖立刻將燈與來源ID清空；scene結束移除固定燈池。V1／V2靜態網格補上中性光照屬性，sky=1、id=0，舊路徑不套閉合隧道遮蔽。

## 實際驗證

- node tests/validate-tunnel-lighting.mjs：PASS，三座洞體75個漸變樣點、牆外／屋頂上方／地面下方排除、19個已載入燈面與實際Rapier屋頂誤差低於0.1mm、兩側新增可承載路肩、兩百個洞內側緣地形查詢均無地形侵入、6燈上限、續生成版號、hook復原／重新綁定及清理。最後補強200點後單獨重跑PASS。
- node tests/validate-streaming.mjs：PASS，sky／tunnelIds連同權重可重複轉移，原快取不被detach；隱藏準備、整批可見／碰撞、revision、過期資料、換圖及失敗回退保留。
- node tests/validate-tunnel-baseline.mjs ../artifacts/tests/p2-tunnel-lighting-original-road-geometry.mjs：PASS，原核心道路三角面來源比較，僅有明示的verge與燈面變更；baseline module由本批before ZIP擷取並修正import，不是另一條生成器。
- node tests/validate-procedural-browser.mjs --tunnel-lighting：PASS，入口、門檻、深洞與出口的實際shader皆連結，完整車輛有接地、零無效輪荷，固定曝光，開關燈不改變Rapier位置。
- npm.cmd run build：PASS，41 modules，Worker約165.9kB；保留原大bundle警告。
- 一般瀏覽器及--production：PASS，四車型、V1–V3、手自排、接地與DEV模組／API隔離。tunnel-lighting-driver與inspectTunnelLighting／getTunnelLightingState未進正式建置。
- npm.cmd run qa:all：PASS（exit 0），48種子×96段、70組車道／結構、248座基礎／4996查詢、四車型、材質、地形、傳動與物理健康全部通過。
- --road-v3：PASS，54組上下層／反向／洞口／吊橋／路口實際通行，最低接地率100%，最大高度誤差約0.120m。

固定曝光下，深洞實際畫面取樣的平均display-luma約47.39（燈開）對12.11（燈關）；門檻約34.72對21.71，出口兩者約50.41。此數值是canvas RGB碼值加權後的對照，不是lux、實際亮度或視覺安全指標。真實畫面已檢視；PNG在p2-tunnel-{entry,threshold,interior,exit}-{withLights,withoutLights}-2026-10-29.png。

## 原生UHD770觀測

Chrome headless／WebGL2 ANGLE D3D11、1440×900 DPR1，完整原車輛模擬、曝光1.05。兩個案例獨立依序執行，量測期間沒有其他QA。

| 指標 | 洞外STREAM-TIMING-V1，45m/s滑行40秒 | LEVEL-1深洞P檔，30秒 |
| --- | ---: | ---: |
| 暖機時間 | 10s | 10s |
| 幀p50／p95／p99 | 17.7／19.1／19.7ms | 17.7／20.0／20.5ms |
| 最大幀時間 | 48.0ms | 25.9ms |
| GPU render pass p95 | 13.56ms | 10.66ms |
| 模擬／實際時間比 | 1.00131 | 1.00043 |
| 丟棄固定步 | 1 | 0 |
| 地形等待 | 0 | 靜止案例，不當作行駛等待驗收 |
| 洞外行駛距離 | 915.33m | 靜止P檔 |

洞外擷取期間串流CPU最大2.5ms，來源為p2-tunnel-final-outdoor-terrain-reveal-after-warm-2026-10-29.json。洞內6燈持續啟用，sky=.06，來源為p2-tunnel-native-performance-2026-10-29.json。洞外GPU樣本含零繪製預上傳pass，洞內靜止沒有相同串流pass，不能把兩個GPU分位數當成公平畫質比較。固定6燈的shader增加洞外GPU成本，但本次尾端幀時間沒有重大惡化；不宣稱整體加速或已達穩定60fps。

此處仍是兩個單次案例，不代表P3十場景、冷暖各三次、至少600秒、所有曲率或全部裝置的性能驗收。首次洞內量測因外部工具在已開啟drive模式下未解除pause而中止，修正工具切換流程後通過；沒有為此修改遊戲暫停邏輯。

## 剩餘範圍

本批完成閉合隧道的局部天空光與受限燈光，以及直接觀察到的洞內側緣問題。P2水系、其餘道路材質發布、外側入口造景及遠景品質仍待完成。P3完整畫質性能比較、P4調教／傳動設定及P5外觀創作工具保持原建置書範圍，沒有將整體目標視為完成。先前冰面低速滑移限制仍保留。

來源檢查點：artifacts/tests/p2-tunnel-lighting-source-2026-10-29.zip；hash及精確結果：p2-tunnel-lighting-verification-2026-10-29.json。聚焦patch集中於archive/patches/p2-tunnel-lighting-2026-10-29.patch；來源快照需原專案及既有依賴才能建置。
