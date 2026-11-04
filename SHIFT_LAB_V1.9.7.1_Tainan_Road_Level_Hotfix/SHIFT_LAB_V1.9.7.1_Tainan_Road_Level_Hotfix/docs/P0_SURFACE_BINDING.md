# P0 材質分界與逐面接觸

日期：2026-10-29。此工作包完成 P0 的材質分界與實際輪胎查詢關卡；P0 與 P1 基礎關卡通過，P2–P5 仍待完成。

## 實作

[surface-map.mjs](../desktop3d/src/surface-map.mjs) 記錄 collider handle、實際 triangle feature ID、chunk／網格種類形成的 layer ID、表面 profile 與區域狀態。輪胎由 Rapier `castRayAndGetNormal` 的真正命中面查詢，不按車輛平面座標或目前里程猜材質。

區域設定只指定已驗證 profile ID、明確 layer IDs 與世界座標範圍，驗證型別、大小、重複與同層重疊。分類單位是實際三角面；範圍以面中心分類，畫面邊界沿該面邊緣，不宣稱可用任意精度裁切矩形。視覺材質群組與碰撞共用重排後的同一份 Float32 vertices／Uint32 indices 和表面表。

未設定區域的正常路面走快速路徑，保持原三角面順序。條件選單改變時更新預設柏油顏色及 roughness，明確區域條件優先於全域預設。材質重建先建立候選，全部成功後才釋放舊 chunks；分配失敗會清除候選，保留舊可見物件、碰撞體及綁定。切換道路 state 時清除舊區域，釋放 chunk 時同步解除面綁定。

物理核心的 `wheelSurfaceMu()` 接收各輪接觸係數，維持原輪胎力、熱／胎壓／磨耗、split-mu與摩擦限幅流程。滾動阻力與操控參考使用接地輪荷加權輸入，仍由原函式施力，沒有新增第二組輪胎力或車身積分。全輪輸入相同時保留原係數值，獨立核心、V1／V2及外部舊工況維持原讀取方式。

## 現在可用與仍未知的數值

這一關卡沿用原先柏油的 dry／wet／snow／ice 示範係數 `1.02／0.68／0.32／0.13`，車型原有滾動係數也保留。PBR外觀參數是專案美術設定；不是由 roughness 推算摩擦，也不把示範數值稱為實地量測。

現有路肩／路外網格先以 `material:null`、`scope:legacy-unclassified-ground`、`profileId:legacy-unclassified.<condition>` 明確標記，暫時維持既有全域接觸行為；不將其冒稱為已校準的碎石或土路。其他新材質仍為 preview-only 或尚未註冊；未註冊 profile（例如 `concrete.dry`）會被拒絕。P2 必須另做材質與地形整合，不能沿用這個相容介面宣稱已完成土路物理。

此時區域編排為內部／開發用 API，未新增玩家材質編輯器、持久化地圖 schema、storage key 或修改 V1／V2 的種子對應。P2可在同一管線建立已驗證的環境材質；不另開地圖生成路線。

## 驗證

| 檢查 | 結果 |
| --- | --- |
| `npm.cmd run qa:surface` | PASS：真實 Rapier 面 ID、左右乾濕、渲染／碰撞 buffers一致、上下層隔離、全域條件、無效資料、分配失敗復原、清理與原核心力輸入 |
| `npm.cmd run qa:all` | PASS：新增 surface 檢查及既有車輛／地圖／結構／傳動／健康／PRND回歸；48種子×96段、70車道位置 |
| `node tests/validate-procedural-browser.mjs` | PASS：四車型、V1／V2／V3切換、保存重載、手自排、可見輪組及暫停 |
| `--vehicle-diagnostics` | PASS：52組＝13工況×4車型，含左右輪、前後輪乾濕分界，上層濕／下層乾的實際車輛查詢 |
| `--surface-contact` | PASS：全域選單保持dry，以局部面覆寫驅動四條件煞停，確認真正輪胎力有差異 |
| `--road-v3` | PASS：54組上下層、反向、橋梁、隧道、吊橋及路口通行 |
| `--acceptance` | PASS：五項獨立物理驗收 5／5 |
| `npm.cmd run build` | PASS：24 modules，保留既有大於500kB bundle警告 |
| `--production` | PASS：正式版新圖及四種既有條件確實進入逐輪綁定；無開發煞停／驗收模組或API |

工作目錄為 `desktop3d`；`--...` 指 `node tests/validate-procedural-browser.mjs --...`。結果沒有引用先前 P1 的 PASS 代替本輪執行。

固定直線V3、standard、初速12m/s、原全煞車與ABS流程，得到：

| 面條件 | 遊戲內煞停距離 m | 模擬時間 s |
| --- | --- | --- |
| dry | 12.366 | 2.292 |
| wet | 15.635 | 2.983 |
| snow | 29.545 | 5.683 |
| ice | 62.395 | 11.992 |

這是模型管線的功能實驗，不是實車煞停或材料摩擦標定。原始逐輪接觸與輪胎力見[煞停資料](../artifacts/tests/surface-braking-2026-10-29.json)；[52組診斷](../artifacts/tests/vehicle-diagnostics-2026-10-28.json)、[左右分界畫面](../artifacts/tests/surface-split-2026-10-29.png)、[前後分界畫面](../artifacts/tests/surface-front-2026-10-29.png)已保存，畫面已目視核對。

## 後續邊界

P0 的車輛／調教／外觀／表面契約、四預設相容、真實診斷與本機原生基線現已具備。完整性能預算、十場景最高畫質屬P3；此關卡不把未知數填成已量測。P1完成來源已在[p1-gate-source快照](../artifacts/tests/p1-gate-source-2026-10-29.zip)保留；本輪刻意修改核心的逐面輸入邏輯，原參數值保留，但不再宣稱整個physics.html SHA與P0相同。

下一工作包是連續地表、道路挖填方／邊坡及已驗證材質。此處沒有完成山體、造景、完整PBR、全類材質校準、調教工具或創作工具。

修改前快照：`C:/Users/jho/AppData/Local/Temp/shiftlab-p2-surface-binding-wtjigjg6/`；未建立commit或發布。
