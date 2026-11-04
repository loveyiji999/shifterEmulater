# P1 共用參考車與碰撞對齊

更新：2026-10-29（Asia/Taipei）。下文保留第三工作包 revision 2 的歷史實作與限制；後續已完成 revision 3 的輪拱、全行程間隙與觸底限位，P1 最新關卡與證據見[P1_WHEEL_WELLS.md](P1_WHEEL_WELLS.md)。整體 P0–P5 尚未完成。

## 實作與資料來源

- [vehicle-layout.mjs](../desktop3d/src/vehicle-layout.mjs) 定義參考外框。保留原主碰撞盒半尺寸 `.87／.28／max(1.55, wheelbase*.70)`，以相同尺寸呈現車身；車頂尺寸及位置另列為零密度碰撞部件。
- [vehicle-visual.mjs](../desktop3d/src/vehicle-visual.mjs) 供正式遊戲及外部診斷共同建立車身、車頂、燈、輪胎、輪圈與輪輻；不再各自建立不同的車輛模型。
- [chassis.mjs](../desktop3d/src/chassis.mjs) 建立同一份布局的主車身／車頂碰撞，保留原 additional mass properties 與所有零密度 hull。候選剛體及兩個 collider 完整建立後才移除舊車；中途失敗移除候選及其部分資源。
- 車頂碰撞納入原本的護欄／路障統計。正式遊戲沒有新增診斷選單或 QA API。
- 輪胎幾何先轉到實際 X 輪軸，轉向由父節點控制，輪軸轉動由子節點控制。帶輪輻的輪圈可觀察實際旋轉方向。
- 可見輪相位由原求解器的 omega 每個 480Hz 微步累積，沒有新增輪速物理或車身積分。渲染只讀取相位；暫停或重複繪圖不會使輪胎繼續轉動。前進方向對應正 X 軸旋轉，輪胎頂點向 +Z 移動。

車輛契約的參考 appearance 更新至 revision 2，保留 revision 1 文件讀取。四款車的有效核心參數、質量、慣性、重心、FWD、傳動流程與設定 key 不變。對齊刻意改變的是可見車身尺寸及原先沒有的車頂碰撞行為。

## 已執行驗證

| 檢查 | 結果 |
| --- | --- |
| `node tests/validate-vehicle-model.mjs` | PASS：四車型 × 兩種校準模式；Three 車身／車頂 AABB 對實際 Rapier collider 外框，最大數值差約 7.2e-9 m；門檻為 1 mm |
| 質量／慣性／COM | PASS：相同核心參數與原 principal inertia；零密度車頂沒有重複增加質量或移動 COM |
| 車頂碰撞 | PASS：上方射線、車頂專屬重疊接觸統計、20 m/s 對上方障礙碰撞，四車型及兩種校準模式均驗證 |
| 套用失敗 | PASS：無效質量、候選第二個 collider 分配失敗，舊剛體與兩個 collider 保留；部分候選資源清除 |
| 轉向／轉動／暫停 | PASS：前輪轉向父節點與輪軸相位獨立，480Hz 相位含離地輪；重複繪圖不改變物理相位；瀏覽器以實際行駛後的輪速驗證暫停 |
| 資源釋放 | PASS：共用輪胎／輪圈／輪輻 geometry 與 material 各釋放一次，車型切換不重複 dispose 同一資源 |
| `--vehicle-diagnostics` | PASS：36 工況、落穩 144 輪；輪胎實際頂點對 Rapier 命中平面的最大絕對距離約 6.19 mm，低於預定 15 mm |
| `--road-v3` | PASS：54 組真實車輛上／下層、反向、洞口／中段、吊橋／路口通行，接地比例最低 1、最大高度誤差約 0.120 m；此高度誤差與上項輪胎網格誤差定義不同 |
| `--acceptance` | PASS：獨立物理驗收五工況 5／5 |
| 一般瀏覽器回歸 | PASS：四車型、舊圖及 V3、保存恢復、手排／自排、實際輪心、轉向、相位及暫停回歸 |
| `npm.cmd run qa:all` | PASS：全部相關回歸，含 48 種子 × 96 段 V3 生成與 70 車道結構檢查；V3 生成約 330 秒 |
| `npm.cmd run build`、`--production --vehicle-screenshot` | PASS：21 modules；保留既有 bundle 警告；正式版無開發模組／API，另存側視畫面 |

命令工作目錄為 `desktop3d`；`--...` 指 `node tests/validate-procedural-browser.mjs --...`。第一個暫停瀏覽器檢查的初態曾在量測前重置車輛，導致沒有輪速；已將檢查放在實際前進後、重置前，再執行回歸，沒有降低輪速門檻。

證據：[模型／碰撞讀值及來源 hash](../artifacts/tests/p1-vehicle-model-2026-10-29.json)、[逐輪接地資料](../artifacts/tests/vehicle-diagnostics-2026-10-28.json)、[共用模型診斷畫面](../artifacts/tests/vehicle-diagnostics-2026-10-28.png)、[正式遊戲側視畫面](../artifacts/tests/browser/production-vehicle-p1.png)。診斷檔名沿用既有輸出位置，當前檔案已包含本工作包的輪胎頂點及共用模型結果。

## 容許誤差與未完成項目

1 mm 僅用於車身／車頂的外框對齊，不代表整個碰撞體積或輪胎力具有毫米級真實精度。裝飾燈允許 10 mm 外伸。輪胎為有限寬度的程序圓柱，懸吊則是射線／原輪胎力模型，因此預定局部路面顯示門檻為 15 mm；驗證的是命中平面的距離，尚未證明任意立體石塊或路緣邊界的完整接觸。

當前車身仍是簡化盒狀參考造型，輪拱、全行程／全轉角時的車殼空間、左右輪姿態的造型檢視仍需完成。輪胎沒有新增獨立的實體側碰撞；不能把程序車模或射線接地宣稱為輪胎變形、任意輪組或完整車輛創作工具。

輪拱及其碰撞簡化規則完成後，才重新審核 P1 完成狀態。P0 的材質分界與 P2 連續地形、材質、光照仍待整合。P0 原生 GPU 數字屬先前版本，這次車模與 collider 已變更，不沿用其數字宣稱新版本性能。

修改前快照：`C:/Users/jho/AppData/Local/Temp/shiftlab-p1-model-eaf99o8v/before.zip` 及 `manifest.json`；未建立 commit 或發布。
