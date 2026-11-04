# P2 十類可駕駛道路材質

日期：2026-10-30，第十三工作包。依原建置書的10類材質發布要求，把現有樣板接入實際道路選擇、逐面接觸及四條件驗證；沒有將水系或P3–P5移出範圍。

## 完整選擇與接觸

道路選單現有密級配柏油、開放級配柏油、混凝土、混凝土鋪面磚、黏土鋪面磚、天然石鋪面、碎石、壓實土路、木板鋪面及實心鋼板。既有asphalt_dense／concrete／gravel選擇值保持，新增值沿用原surface-definition.mjs的MATERIAL_IDS；沒有另一條地圖生成器或新存檔格式。

新pavement-definition.mjs統一道路材質ID、標線政策、profile ID及七類作者參數；SurfaceMap仍是實際命中collider／面／道路層的資料權威。原12個柏油／混凝土／碎石profiles不改；原地形土、岩石、terrain_gravel的12個profiles也不改，已把全部24個舊profile與before來源逐值比對。

土路與天然石道路使用pavement_earth.*／pavement_natural_stone.*，和既有earth.*地形及natural_stone.*岩石分開，避免把岩石外觀／UV或其.7剛體摩擦直接套到道路。10種道路的剛體摩擦沿用既有road collider的.65，返回值與實際碰撞一致；輪胎mu、rollingCoefficient與PBR各自明列，不從roughness猜測摩擦。共40個道路profile，加上12個原地形／岩石profile，可信登錄共52個。

七類新增參數均為project-illustrative作者值，四條件為dry／wet／snow／ice，通過功能測試後作verified-gameplay使用；不是實地校準、各材料真實摩擦排名或道路工程安全數值。原密級配柏油仍讀取原車型的surfaces與rollingCoeff，保留四車型／兩種校準模式相容。

| 材質 | dry / wet / snow / ice tireMu | rollingCoefficient |
| --- | --- | --- |
| 開放級配柏油 | .99 / .70 / .32 / .13 | .014 / .014 / .02 / .02 |
| 混凝土鋪面磚 | .92 / .60 / .30 / .12 | .018 / .020 / .024 / .022 |
| 黏土鋪面磚 | .88 / .55 / .29 / .12 | .019 / .022 / .026 / .022 |
| 天然石鋪面 | .90 / .57 / .30 / .12 | .020 / .022 / .026 / .022 |
| 壓實土路 | .62 / .38 / .28 / .12 | .035 / .045 / .030 / .020 |
| 木板鋪面 | .75 / .45 / .28 / .12 | .017 / .019 / .022 / .020 |
| 實心鋼板 | .74 / .42 / .24 / .10 | .012 / .014 / .020 / .020 |

## 畫面、幾何與切換

沿用已存在的公尺UV與程序color／normal／roughness貼圖，沒有新增外部圖像、套件或模型下載。鋼板在dry／wet的metalness為.85，雪冰覆蓋為0；共用路面材質每次同步metalness，避免切回混凝土後殘留金屬參數。UV及relief metadata跟隨所選材質。

鋪面維持既有同源Float32道路幾何及碰撞；磚縫、木紋、骨材與鋼板花紋僅為約0.5–2mm設定的照明細節，不宣稱已有深坑、開孔格柵、木板破壞、土壤沉陷、孔隙排水或滑水。鋼板／木板為實心承載面；任何需要明顯輪廓或輪胎支撐起伏的深形狀，仍需後續真正幾何。

碎石、土路、木板與鋼板不畫公路標線，其餘保留原標線。準備中的chunk只更新hiddenForPavement，維持不可見；GeometryStreamer啟用時才依目前政策顯示，材質切換不使暫存網格提前現身。紋理建立失敗時，仍保留原選擇及接觸；不把錯誤材料寫成成功。

同一Three material reference由已載入mesh共享，材質切換不改地形、道路、RNG、車身、collider handles或物理頻率。沿用shiftlab.v189.settings的road-material；重新載入可恢復新ID。V1／V2仍強制柏油、停用選單，返回V3會恢復原偏好。正式遊戲沒有加入測試介面或驗收工況。

## 實際驗證

- node tests/validate-pavement.mjs：PASS，10材質×4條件，實際Rapier面命中、每材質mu／rolling與PBR、metalness、.65剛體摩擦、標線、原ground handles、暫存chunk、分配失敗復原、區域條件及舊圖限制。原「steel必須拒絕」改成未知ID必須拒絕，不移除未知輸入防護。
- node tests/validate-surface-map.mjs：PASS；原不受信任鋼材示範改用未登錄ID，合法鋼板已有自己的可信profile，未知profile仍拒絕。
- 原來源比對：PASS，全部24個既有profile保留；原12組煞停的距離及步數與前一批JSON完全相等。物理核心、chassis、main、V3生成器、surface-definition／surface-materials及lockfile逐byte保持。
- node tests/validate-procedural-browser.mjs --all-pavements --screenshot：PASS，40組真實原核心煞停，全部停止、零障礙碰撞及零無效輪荷；四輪接觸、負輪胎力、接觸ID及條件一致。鋼板偏好reload、全域wet、V2限制及回V3還原通過。原--pavement-contact三材質模式保留。
- qa:surface、qa:materials、qa:streaming：PASS；原三層地形、岩石與Worker功能亦通過。
- npm.cmd run build：PASS，42 modules，原大bundle警告保留。
- npm.cmd run qa:all：PASS（exit 0），48種子×96段、70組車道／結構、248座基礎／4996查詢、車輛、表面、地形、光照、傳動與PRND全部通過。
- --production與--road-v3：PASS，正式版隔離及54組立體道路實際通行；最低接地率100%、最大高度誤差約0.120m。一般四車型／V1–V3瀏覽器回歸亦PASS。

## 真實制動資料

standard、P2-PAVEMENT-V1、平直V3、12m/s起速、原手排空檔／離合器與煞車控制；逐案以實際三角面區域設定條件，不以全域指示燈代替四輪命中。120Hz／480Hz保留，不直接改速度或gear。最長允許30秒觀察，原三材質在原15秒窗口內已停止，新增較低mu鋼板也實際停止。

以下為淨位移（m），順序dry / wet / snow / ice；不是實車煞停距離。

| 材質 | 四條件距離（m） |
| --- | --- |
| 密級配柏油 | 12.37 / 15.63 / 29.55 / 62.39 |
| 開放級配柏油 | 12.46 / 15.26 / 28.82 / 59.27 |
| 混凝土 | 12.52 / 16.26 / 29.55 / 59.27 |
| 混凝土鋪面磚 | 12.77 / 17.25 / 29.86 / 60.96 |
| 黏土鋪面磚 | 13.12 / 18.52 / 30.40 / 60.96 |
| 天然石鋪面 | 12.91 / 17.90 / 29.61 / 60.96 |
| 碎石 | 14.67 / 19.08 / 29.37 / 62.24 |
| 壓實土路 | 16.17 / 23.20 / 30.72 / 62.24 |
| 木板鋪面 | 14.50 / 22.17 / 31.80 / 62.24 |
| 實心鋼板 | 14.76 / 23.77 / 36.36 / 70.32 |

每種材質在本次工況均為dry < wet < snow < ice；這只是此組作者參數與既有核心的結果，不證明真實材料間的排名。先前地形冰面低速滑移仍保留，平直道路煞停通過不代表所有地形冰面已修正。

原始資料為artifacts/tests/p2-ten-pavements-braking-2026-10-30.json，摘要p2-ten-pavements-results-2026-10-30.json；十張實際遊戲畫面為p2-ten-pavement-{material}-2026-10-30.png。木板、黏土磚及鋼板畫面已實際檢視，另有其餘材質完整擷取。

## 原生UHD770單場景觀測

Chrome／WebGL2 ANGLE D3D11、1440×900 DPR1、standard、STREAM-TIMING-V1、實心鋼板、45m/s空檔滑行；暖機10秒後40秒擷取。量測獨立於其他QA，metadata已驗證pavementMaterial實際為steel。

| 指標 | 本次 |
| --- | ---: |
| 幀p50／p95／p99 | 16.8／18.9／19.6ms |
| 最大幀時間 | 49.0ms |
| GPU render pass p95 | 13.19ms |
| 擷取期間串流CPU最大值 | 3.3ms |
| 模擬／實際時間比 | 1.00134 |
| 丟步／地形等待 | 1／0 |
| 行駛距離 | 924.87m |

GPU樣本含零繪製預上傳pass；單一鋼板案例不代表全部10材質、整體最高畫質、十場景或600秒驗收。原生資料為p2-ten-pavements-steel-performance-2026-10-30.json；它是runner舊日期命名產物的逐byte副本，原始名稱p2-ten-pavements-steel-terrain-reveal-after-warm-2026-10-29.json亦保留，實際時間以recordedAt為準。沒有藉改變物理頻率或畫質取得成績。

## 邊界與剩餘範圍

本批完成原10類的四條件可駕駛發布，不是整個P2完成。水系、外側入口地形銜接及遠景品質仍保留；puddled／muddy的獨立液體／變形機制未發布。P3冷暖三次／十場景／600秒、P4完整調教與傳動編輯及P5創作工具保持原目標。

首次擴充測試在40組制動完成後，因舊斷言仍固定期待gravel而停止；修正為所選steel後完整重跑通過。初次測試編輯腳本的引號錯誤未寫入程式，後續修正再執行，不把當時誤跑的一般瀏覽器回歸當成40組結果。

來源快照：artifacts/tests/p2-ten-pavements-source-2026-10-30.zip；hash與精確結果：p2-ten-pavements-verification-2026-10-30.json。聚焦patch集中於archive/patches/p2-ten-pavements-2026-10-30.patch；來源快照需要原專案與既有依賴才能建置。
