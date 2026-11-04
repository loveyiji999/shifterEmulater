# 地形首次顯示：分幀預上傳修正

日期：2026-10-29。處理行駛中新地形進入視野時的集中工作，延續既有 Worker 與緊密碰撞分區，不新增環境功能。

## 已確認原因與修改

Worker 已產生頂點與碰撞分區，但 Three 的 BufferGeometry 建立不代表 GPU 緩衝區已上傳。原程式在整批啟用後，才由第一個可見繪製進行 bufferData 與 computeBoundingSphere。這部分工作確實集中在地形首次出現；它不能解釋量測中的全部長幀。

新增 GeometryUploadPreparer，使用 Three 公開渲染流程，於獨立 1×1 render target 進行零索引數量的 offscreen draw；Three 正常建立所有屬性與索引緩衝區，但沒有繪製地形三角面。每幀最多處理一個隱藏網格，順便預算包圍球；沒有直接接觸 Three 私有 WebGLAttributes 或自行管理原始 GL buffer。小型基本材質與 render target 在啟動時初始化。這只預備幾何，不宣稱預先編譯所有未出現的實際 PBR shader 變體。

GeometryStreamer 把新道路、地表、樹幹、樹冠與岩石的網格排入同一準備佇列；整批幾何上傳完成後才同時顯示並啟用碰撞。準備時沿用舊地面，換圖、revision、錯誤與清理會丟棄佇列並釋放暫存資源。原本 2ms CPU 軟預算仍在，單一 Three／Rapier 呼叫並非硬性可中斷工作。額外的準備幀會增加載入延遲，代表高速測試未出現支撐等待，但不能保證所有速度／複雜場景。

預上傳後恢復原 drawRange、render target、cube face、mipmap level 與 shadowMap.autoUpdate；來源網格可見性與所有碰撞旗標不被此步修改。幾何仍由原 chunk／tile 擁有及 dispose。維持地形精度、畫面解析度、陰影、CCD、120Hz／480Hz及種子／玩家儲存格式。額外固定資源為 1×1 target、共用基本材質及一個工作 Mesh；不複製串流頂點。

## 本次原生內顯量測

Chrome headless、UHD 770／ANGLE D3D11、WebGL2、1440×900 DPR 1；standard、STREAM-TIMING-V1、45m/s 空檔滑行、暖機10秒再重置起點、擷取40秒。兩次依序獨立執行，期間未跑其他 QA；路程約913／912m。這是單場景觀測，不是完整效能驗收。

| 數值 | 修改前 | 修改後 |
| --- | ---: | ---: |
| 全段幀時間 p99 | 19.7ms | 19.7ms |
| 全段最大幀時間 | 278.2ms | 436.9ms |
| 全段串流 CPU 最大值 | 3.6ms | 2.7ms |
| 提交幀的可見繪製 CPU 最大值，明確取第1秒後 | 1.8ms | 0.6ms |
| 第1秒後可見繪製的 bufferData 次數 | 548 | 0 |
| 第1秒後可見繪製的包圍球計算次數 | 116 | 0 |
| 地形支撐等待 | 0 | 0 |
| 丟棄固定物理步數 | 2 | 2 |

修改後第1秒後有560次 bufferData、119次包圍球計算，全在 hidden-preparation 階段；沒有刪掉這些工作或降低畫質。提交幀樣本前15／後16個，不是逐幀配對，不能把最大值差異當成普遍 FPS 增幅。完整數據保留了所有重置附近幀，沒有裁掉後宣稱整段成功；全段最慢幀反而較高，其主要時間未落在已量測的串流／繪製工作，原因仍未確認。第1秒後仍有物理或其他尖峰，最大幀26.6／28.1ms。

串流累計 maxUploadMs 曾達54.2ms，發生在正式40秒擷取區間外的暖機階段；所以這個做法減少首次可見負擔，並不能保證每次單網格上傳都低於幀預算。全段 p99 沒有改善，不能宣稱已消除全部卡頓。GPU timer 會同時觀察新增的零繪製準備 pass 和可見 pass，樣本分布與修改前不完全同義，故未使用其分位數宣稱效能改善。

原始資料在 artifacts/tests/reveal-v2-before-terrain-reveal-after-warm-2026-10-29.json、reveal-v2-after-terrain-reveal-after-warm-2026-10-29.json；摘要與區間明示在 terrain-reveal-v2-comparison-2026-10-29.json。歷史 terrain-reveal 與 P2 造景量測沒有覆寫。

## 驗證

- `node tests/validate-geometry-upload.mjs`：PASS，成功及注入失敗均恢復狀態，不釋放來源幾何。
- `node tests/validate-streaming.mjs`：PASS，真實 Worker／Rapier、每幀最多一次隱藏準備、全部完成才整批可見／啟用、revision 舊地面支撐、佇列清理與失敗回退。
- 原生瀏覽器原始資料檢查：PASS，第1秒後可見上傳／包圍球均為0、實際隱藏上傳大於0、waits=0。
- `npm.cmd run build`：PASS，37 modules；保留既有 bundle 超過500kB警告。
- `node tests/validate-procedural-browser.mjs --production`：PASS，正式版設定、種子重建、接地與 DEV 模組隔離。
- `node tests/validate-procedural-browser.mjs`：PASS，四車型、V1–V3、手排／自排、無 runtime／HTTP 錯誤。
- `npm.cmd run qa:all`：PASS（exit 0），含48種子×96段、70組車道／結構、248座基礎／4996查詢、車輛、材質、地形、傳動與物理安全。最後新增的上傳佇列中途換圖測試另以 `node tests/validate-streaming.mjs` 重跑 PASS。
- `node tests/validate-procedural-browser.mjs --road-v3`：PASS，54組上下層、反向、洞口、吊橋及路口通行，最低接地率100%、最大高度誤差約0.120m；先前一輪因本次來源換行格式更新觸發 Vite reload 中止，穩定後重跑通過。

原生擷取指令為 `node tests/validate-procedural-browser.mjs --reveal-performance --native-gpu --warm --capture-label=reveal-v2-before`，修改後把 label 改為 reveal-v2-after。label 僅決定產物名稱，不影響遊戲路徑。首次沙箱內 Chrome 因 GPU 程序不可用中止，經核准於沙箱外重新執行，原生兩次擷取完成。

來源檢查點：artifacts/tests/terrain-gpu-preparation-source-2026-10-29.zip（需原專案與既有依賴）；hash 與執行結果：terrain-gpu-preparation-verification-2026-10-29.json。聚焦 patch 集中於 archive/patches/terrain-gpu-preparation-2026-10-29.patch。
