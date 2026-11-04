# P2 地形多材質混合

日期：2026-10-29，第十一工作包。接續種子造景與分幀幾何預上傳，整體P0–P5目標保持進行。閉合隧道光照的後續成果見[P2洞內外光照](P2_TUNNEL_LIGHTING.md)，下方範圍保留本包歷史。

## 實作

連續地形由單一earth外觀改為土、碎石與裸岩三層MeshStandardMaterial。每個Float32頂點有三個非負權重，依世界座標的獨立53m噪聲及既有法線坡度生成；權重總和為1，普通坡地形成碎石斑塊，陡坡偏向裸岩。坡度門檻與噪聲分布都是作者值，不代表地質侵蝕模型。生成不讀取／推進V3 RNG，不改道路、地形高度、結構、物件位置或碰撞三角面。

GPU在相同三角面內插權重，混合三層色彩、法線及粗糙度；沿用主光、陰影、PMREM、ACES與米制UV。裸岩使用新增的exposed_rock內部程序貼圖，不拿有鋪石接縫的natural_stone樣板充當山壁。裸岩採世界三軸投影，色彩／粗糙度／法線一起投影，避免陡坡只以XZ取樣造成明顯拉伸；法線採保留原坡面的whiteout式組合，不改幾何或支撐。

土／碎石仍使用XZ米制UV，陡坡以裸岩為主；極端斜面、遠距重複與細節品質仍須P3比較，不能稱為照片級。程序細節最大約0.5–2mm級relief設定，只是照明紋理，不繪製深坑或另外施力。乾／濕／雪／冰從同一組表面資料更新色彩及粗糙度uniform，雪冰停用土色乘色；遮罩及幾何不隨天候移動。未增加積雪厚度或陷泥／滑水物理。

## 同源接觸

每個地形碰撞分區綁定原顯示indices、vertices、weights與renderFaces。車輪射線命中後，用實際ray起點＋方向×命中距離求接觸點；SurfaceMap依該層、該原始三角面作重心內插，採同一Float32頂點權重，混合tireMu與rollingCoefficient。沒有投影到另一道路層，也不從貼圖roughness推測摩擦。沒有提供接觸點的既有查詢仍可呼叫surfaceAtHit(hit)，混合面回傳面中心權重；實際車輪及新診斷會提供接觸點。此選用參數保留既有呼叫相容。

接觸回傳terrain_mix、三個components、來源profile IDs及project-illustrative-terrain-blend範圍。四條件係數沿用earth、gravel與natural_stone的作者假設，非實地校準；混合不是宣稱真實顆粒力學。地形剛體碰撞friction維持.7，新增terrain_gravel四條件profile明確記錄.7，輪胎／滾動係數與原gravel相同。原道路gravel的剛體friction .65不變。土及裸岩同樣為.7，故地形所有混合比例的剛體friction一致，沒有回報與Rapier不同的係數。舊覆土頂蓋仍為明確earth，非本批三層地形；V1／V2保持既有路徑。

原物理核心的力計算、120Hz／480Hz與每微步清力不變。chassis只把原本已計算出的射線命中點傳給SurfaceMap；沒有新增積分、吸地、力或修改原預設。

## 串流與資源

遮罩在Worker生成，傳送自有weights副本，原快取不被detach；重複請求、相鄰區塊、換圖及revision沿用原隔離。GPU預上傳也會上傳新屬性，全部完成後才整批可見／啟用碰撞。每個tile仍一個地形draw，沒有按材質另畫三次或增加地形碰撞數。

共用TerrainMaterial及貼圖保留到場景擁有者結束，tile只擁有幾何及碰撞。新增gravel與exposed_rock兩套256×256 RGB(A)程序貼圖，每套color／normal／roughness三張，RGBA8含完整mipmap估算額外約2MiB，不是實測VRAM。代表地圖library為18張貼圖；所有渲染資源以原生量測記錄為準，library統計不包含車輛、環境與陰影等資源。新增岩石貼圖是既有natural_stone材質類別的地貌外觀，不另開道路生成器或第十一種可選路面。

## 實際驗證

- node tests/validate-terrain-surface.mjs：PASS，900次實際Three／Rapier取樣，四條件、跨區Float32遮罩接縫、重心權重及真實輪胎helper；最大權重差約2.07e-8。普通與吊橋地貌均測試，實際權重範圍含純土、純碎石、純裸岩。混合足跡中的實際FL射線有正輪荷，原wheelSurfaceMu直接接收混合係數；來源V3 state保持不變。
- node tests/validate-streaming.mjs：PASS，weights傳送後快取可重建，與同源遮罩相同；原隱藏準備、整批啟用、失效清理及缺少地面保護保留。
- qa:terrain、qa:surface、qa:materials、qa:streaming：PASS。原先「所有新地形必為earth」的舊斷言更新為同源混合的加權接觸檢查，沒有放寬幾何或跨層正確性。
- node tests/validate-procedural-browser.mjs --terrain-blend：PASS，四條件各112個實際地形查詢、所有實際WebGL shader program連結成功、畫面已檢視；遮罩不因天候移動，畫面與碰撞高度誤差低於0.1mm。四張畫面由實際renderer的同一canvas當下擷取，避免下一個RAF重置相機造成錯圖。
- npm.cmd run build：PASS，39 modules，原大bundle警告仍在。
- npm.cmd run qa:all：PASS（exit 0），48種子×96段、70組車道／結構、248座基礎／4996查詢、車輛、表面、地形、傳動、PRND與物理安全全部通過。
- 一般瀏覽器及--production：PASS，四車型／V1–V3、接觸、重建、原玩家儲存格式及DEV隔離。terrain-blend-driver與inspectTerrainBlend未進入正式建置。
- --road-v3：PASS，54組上下層／反向／洞口／吊橋／路口真實車輛通行，最低接地率100%，最大高度誤差約0.120m。

四條件實際原核心制動採相同6m/s、TERRAIN-CONTACT-V1、standard車、x=10的既有真實地形；控制、懸吊與所有480Hz微步未替換，所有正式四條件結果均為零障礙碰撞、零無效輪荷並有四輪接觸及負輪胎力。

| 條件 | 原核心完整停止旗標 | 淨位移 | 觀察時間 |
| --- | --- | ---: | ---: |
| dry | true | 9.44m | 3.575s |
| wet | true | 11.74m | 4.092s |
| snow | true | 17.73m | 10.433s |
| ice | false，30秒末約0.125m/s低速滑移 | 37.03m | 30s |

冰面僅證明本次制動由6m/s減速至低於.2m/s，沒有宣稱完全停止或實車距離校準；原核心下的低速滑移仍列為限制。前一次12m/s冰面跑到176m，期間撞擊障礙18次，不能作純煞停證據，已保留為12mps-confounded檔。15秒與30秒觀察不足的原結果亦保留；沒有為了通過測試提高冰面摩擦或把速度強制清零。正式6m/s資料見p2-terrain-blend-braking-2026-10-29.json，停止旗標按每步檢查，稀疏儲存的最後一筆速度可能早於實際停止步。

## 原生UHD770觀測

相同STREAM-TIMING-V1、45m/s開始空檔滑行、1440×900 DPR1、WebGL2／ANGLE D3D11，暖機10秒再重置起點，獨立擷取40秒；量測時沒有其他QA運行。

| 指標 | 本次 |
| --- | ---: |
| frame p50／p95／p99 | 17.6／19.1／19.6ms |
| 最大幀時間 | 43.1ms |
| GPU render pass p95 | 11.37ms |
| 擷取期間串流CPU最大值 | 2.9ms |
| 模擬時間／實際時間 | 1.00136 |
| 丟步／地形等待 | 1／0 |
| 行駛距離 | 915.27m |

GPU樣本含可見及零繪製預上傳pass，不等於完整幀GPU時間。內容比單層土增加，不能以單次p99或最大值宣稱加材質會加速。這是單一直路，不涵蓋全部陡坡視角、離路行駛成本、冷暖三次、十場景或600秒長時關卡；P3仍需完整比較材質層數、投影與品質。原始資料為p2-terrain-blend-terrain-reveal-after-warm-2026-10-29.json。

## 尚未完成

本批完成三層地表外觀及同源接觸，不等於P2全部完成。水系、洞內外光照、其餘道路材質發布、遠景／LOD品質與完整環境檢查仍待完成；P3十場景／冷暖三次／600秒、P4完整調教及P5外觀創作工具保持原建置書範圍。

來源檢查點：artifacts/tests/p2-terrain-blend-source-2026-10-29.zip；hash及精確結果：p2-terrain-blend-verification-2026-10-29.json。聚焦patch集中於archive/patches/p2-terrain-blend-2026-10-29.patch，來源快照需原專案及既有依賴才能建置。
