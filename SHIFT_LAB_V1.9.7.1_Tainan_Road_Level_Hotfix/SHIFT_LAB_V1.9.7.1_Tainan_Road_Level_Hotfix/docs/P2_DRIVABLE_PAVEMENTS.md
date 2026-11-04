# P2 可行駛混凝土與碎石路面

日期：2026-10-29。整體P0–P5目標保持；本批完成P2的一項缺口，不代表P2或全部建置完成。使用者要求繼續分階段開發，先前暫停紀錄保留為歷史。

## 玩家功能與資料邊界

設定加入柏油、混凝土、碎石道路材質；乾、濕、雪、冰另外選擇。材質保存在原shiftlab.v189.settings偏好鍵，新欄位road-material不改變地圖schema或V1／V2種子。舊圖維持原柏油並停用新選項，回到V3恢復偏好；重置、換車和重新載入保留有效選擇。碎石不顯示油漆標線，非同步準備中的路段也遵守相同規則。

既有顯示網格共用的材質參考原地更新，PBR紋理、顏色及粗糙度和實際逐輪命中類型一致。顯示幾何、碰撞分區、CCD與120／480Hz頻率保持。路面選擇前先建立紋理，失敗保留舊材質與接觸設定；局部表面區域仍可覆寫全域道路選擇，並按實際顯示面／道路層隔離。

幾何層ID仍保留v3:*:asphalt以保持既有區域資料相容；名稱表示原道路網格層，實際材質從profileId取得。路肩繼續legacy-unclassified，路外earth仍為原土路假設，未把它們重新標成混凝土或碎石。

## 接觸係數

下列是作者設定並經遊戲功能驗證的project-illustrative係數，不是實地量測或材料校準。未建立陷沙、滑水或可變形碎石。柏油保持原車型附著／滾阻參數，新增材質獨立使用本身的接觸參數，不再被柏油的P.surfaces或rollingCoeff蓋掉。

| 材質 | 條件 | tireMu | rollingCoefficient | colliderFriction |
| --- | --- | ---: | ---: | ---: |
| 混凝土 | dry | .98 | .013 | .65 |
| 混凝土 | wet | .65 | .013 | .65 |
| 混凝土 | snow | .31 | .020 | .65 |
| 混凝土 | ice | .13 | .020 | .65 |
| 碎石 | dry | .72 | .025 | .65 |
| 碎石 | wet | .52 | .030 | .65 |
| 碎石 | snow | .30 | .028 | .65 |
| 碎石 | ice | .12 | .020 | .65 |

註冊採原可信fingerprint機制，外來JSON不能以verified-gameplay文字自行發布任意係數；其他未支援材質及未知ID仍被拒絕。10種PBR樣板不等於10種已發布可行駛表面。

## 實際煞停與呈現

外部DEV工具使用standard、V3直路、初速12m/s、原手排空檔／離合流程與煞車力，逐個模擬固定步直到停車。每組保存四輪命中材質、狀態、輪胎力、容量、接地及軌跡，無非有限輪荷或結構碰撞。此為功能實驗，使用軟體WebGL，不是原生GPU性能量測。

| 材質 | dry距離m | wet距離m | snow距離m | ice距離m |
| --- | ---: | ---: | ---: | ---: |
| 原柏油 | 12.37 | 15.63 | 29.55 | 62.39 |
| 混凝土 | 12.52 | 16.26 | 29.55 | 59.27 |
| 碎石 | 14.67 | 19.08 | 29.37 | 62.24 |

每種材質的乾到冰煞停距離依序增加，不要求不同材質在所有條件下具有相同排序，因為滾阻也不同。數據在artifacts/tests/p2-pavement-braking-2026-10-29.json；三種實際遊戲乾燥畫面為p2-pavement-asphalt_dense-2026-10-29.png、p2-pavement-concrete-2026-10-29.png及p2-pavement-gravel-2026-10-29.png。性能量測metadata現在包含pavementMaterial，防止後續把不同材質場景混為同一基線。

## 當次驗證

- node tests/validate-pavement.mjs：PASS，三材質×四條件的真實Rapier命中、獨立mu／滾阻、共享材質、區域覆寫、標線、幾何不變、紋理失敗回復與舊圖限制。
- node tests/validate-surface-map.mjs及validate-streaming.mjs：PASS，原面綁定、分區、碰撞清理及非同步版本隔離保留。
- node tests/validate-performance-capture.mjs：PASS，原計時區間與GPU回收不變；不等於新材質性能驗收。
- node tests/validate-procedural-browser.mjs --pavement-contact：PASS，12組實際煞停、全域狀態、偏好重載及舊圖切換；加--screenshot保存外觀。
- 一般瀏覽器及--production：PASS，四車型、舊圖、手自排和正式版測試隔離。
- npm.cmd run build：PASS，34 modules；既有主bundle大於500kB警告保留。
- npm.cmd run qa:all：PASS，48種子×96段、70組車道／結構、248座基礎／4996地面查詢／14洞口、四車型、傳動、PRND及其餘整合回歸全部通過；最後標線／舊圖整合調整另跑pavement、streaming及build通過。
- 三種實際路面畫面已檢視；碎石無油漆標線。柏油四條件煞停距離與保存的原始基線完全相等。
- 正式版另經玩家選單切換三種材質，均到達實際四輪接觸，無測試API／模組。

重載測試起初讀到頁面切換中的初始值；已加上確認localStorage及新performance.timeOrigin後再等待ready，重測通過。未因此修改遊戲保存格式或放寬接觸斷言。

## 後續階段缺口

P2仍有地形混合與工程化邊坡細節、其餘路面接觸、植被岩石水系及洞內外過渡。P3仍需完整十場景、冷暖載入、三次原生GPU比較及600秒長時驗證；P4完整調教、P5創作工具未完成。本批不縮減這些要求。

來源快照：artifacts/tests/p2-pavement-source-2026-10-29.zip；來源hash與驗證結果：p2-pavement-verification-2026-10-29.json。快照為本專案內檢查點，需既有專案與依賴才能建置。
