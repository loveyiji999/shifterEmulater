# 2026-10-30 排水補充

新增WATER-DRAINAGE來源後，目錄為17份、14份指定段落閱讀與3份索引閱讀；原16筆來源欄位保持不變。來源ID／卡片／引用及JSON已重新檢查。排水程式與三種子實測見[排水基礎](../../P2_DRAINAGE_FOUNDATION.md)。下方2026-10-28的16份結果是歷史快照，不代表新的runtime整合狀態。

# 道路材質與環境知識庫驗證

日期：2026-10-28（Asia/Taipei）。本輪只有研究與文件，沒有開發或套用新的遊戲材質、模型、天候或物理參數。

## 檢查範圍

以PowerShell UTF-8管線執行`python -X utf8 -`，校驗JSON、來源ID、卡片閱讀狀態、本機Markdown連結、待校準欄位及受保護檔案的SHA256。結果全部PASS：16份來源、10類材質、6種表面狀態、10類環境；49個本機引用目標有效；新增物理／PBR參數維持null；160個既有遊戲、研究與封存檔案hash不變。

## 來源與版本限制

16份第一手來源中，13份讀取指定段落，3份僅能讀取官方索引段落。CMHA頁面及USFS大型PDF逾時，MnDOT文件無法直接開啟，已逐筆保留閱讀限制。未以搜尋引擎標示的發布日期取代文件原始版本，也未使用第三方轉載作工程數值依據。

已唯讀核對本機Three.js 0.180.0的MeshStandardMaterial、InstancedMesh及LOD相關宣告，以及Rapier 0.18.2的trimesh、heightfield與setFriction宣告。Rapier線上指南標示0.21；不據此宣稱專案已支援新版功能。

## 變更與回復

新增本知識庫及`docs/knowledge/README.md`，並在`docs/AGENT_KNOWLEDGE.md`、`docs/DATA_CATALOG.md`及`docs/knowledge/road-design/README.md`加入入口。既有文件備份及受保護檔案hash清單：`C:/Users/jho/AppData/Local/Temp/shiftlab-road-environment-knowledge-mkp8jy0w/`。

工作目錄不是Git repository；未commit、push、發布或部署。本輪未將圖片、模型、第三方全文或現實城市圖資存入專案，沒有新增production dependency。

## 未執行項目

沒有重跑遊戲建置、物理驗收或GPU效能測試；遊戲程式沒有變更。新材質與環境的實際畫面、接觸模型及性能尚未實作與驗證。後續開發門檻見[INTEGRATION.md](INTEGRATION.md)。
