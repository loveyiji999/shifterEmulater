# 實際玩家操作的手動效能擷取

日期：2026-10-30。本工作包補上P0／P3的實際玩家診斷能力；使用者回報的大量地形載入與碰撞卡頓仍未確定根因，不能把擷取器完成當成效能已達標。完整P2水系／場景銜接、P3十場景、P4與P5範圍維持不變。

## 使用

使用原有 START_GAME.cmd 啟動開發版。在原本遊戲的同一個分頁開啟 http://127.0.0.1:5173/tests/performance/ ，按「載入遊戲並開始記錄」，接著照平常方式行駛並重現掉幀。遊戲就緒後記錄60秒，自動下載 shiftlab-performance-時間.json；按 Esc 開選單可提早結束並保留已記錄資料。

入口以同一分頁導向遊戲，沿用已保存的車型與地圖。不要為了記錄另外執行第二份遊戲。工具不指定種子、不自動轉向、不傳送車輛、不修改畫質或物理參數，也不把玩家視窗改成測試用的1440×900。初始化完成前的載入不在這份記錄內。

這個入口、查詢參數與記錄API僅存在Vite開發版；正式版沒有診斷頁、診斷選單或測試API。原本玩家入口保持不變。報告只下載到本機，不使用外部上傳、讀取其他分頁、偏好原始JSON或認證資料。

## 資料與閱讀方式

外層schema是 shiftlab.performance.manual.v1；baseline保留原始逐幀資料、CPU與GPU分布、模擬／牆鐘比率及丟步。initial／final包括地圖、車型、位置、路面、碰撞、載入模式及視窗資訊。

| 分類 | 記錄 |
| --- | --- |
| 實際環境 | 瀏覽器、繪製後端、內部解析度、DPR、視窗大小；逐幀記錄解析度、分頁可見性與焦點 |
| 長幀 | 原始frameMs、物理CPU、串流CPU、送繪CPU、資源數及GPU timer的可用／遺失狀態 |
| 物理／碰撞 | 每幀world.step及接觸回報CPU、最大單步、碰撞事件數；慢步另記Rapier broad phase／narrow phase／solver／CCD計時 |
| 地形載入 | activeColliders、colliderPending、visualPending、workerPending、worker／fallback模式、提交與錯誤 |
| 瀏覽器事件 | 可用時的longtask及long-animation-frame；只保留有限的函式名稱與時間，不收集頁面文字或完整腳本 |
| 中斷 | stopReason區分duration／paused／locked；context loss保留已收集的逐幀資料與錯誤，並恢復掛鉤 |

CPU分項存在巢狀，例如world.step包含於物理CPU，隱藏繪製亦包含於串流工作，不可把所有欄位直接相加當成總CPU。GPU timer包含所有已量測pass，分布不與逐幀資料一一配對。裝置不支援的觀測明確記錄為false／null；軟體繪製器仍可擷取，保留其身分供排查，不假裝原生GPU驗收。

慢事件最多4096筆、瀏覽器事件256筆、錯誤32筆；超量以固定容量保留最近資料，依時間排序輸出並記overflow計數。原始幀數由最多120秒擷取時間限制。預設開啟Rapier profiler及量測掛鉤會增加開銷，因此這是定位資料，不能直接當成沒有量測工具時的遊戲幀率。

long-animation-frame和longtask並非相同訊號，且瀏覽器支援與歸因範圍有限；實作使用功能檢測並記錄支援狀態。來源：[Chrome官方Long Animation Frames文件](https://developer.chrome.com/docs/web-platform/long-animation-frames)。本工具不因觀察到某個事件便自動宣稱其為卡頓根因。

## 實作與邊界

- tests/performance/index.html：外部啟動頁，使用單一分頁的正常連結。
- tests/manual-performance.mjs：正常操作觀察、固定容量事件、完整復原及本機Blob JSON下載。
- tests/game-driver.mjs：DEV入口、互斥擷取與一次性capture-performance參數；參數消耗後重新整理不再記錄。
- tests/performance-baseline.mjs：新增可選逐幀回呼與暫停提前結束；既有預設仍在暫停時拒絕。開始／逐幀回呼失敗均會恢復原掛鉤。地圖、材質、內部解析度與DPR metadata取開始時的副本。

沒有改動src/、public/、lockfile或production dependency。package.json只把新診斷測試接到qa:performance。正式版bundle仍需另行隔離驗證。

## 本輪驗證

npm.cmd run qa:performance已通過：原擷取行為、GPU查詢清理、暫停／回呼失敗復原、初始設定快照；手動擷取保留車型／地圖／位置、逐幀碰撞與佇列欄位、軟體後端、固定容量及無observer回退、context loss和profile開關。

原生瀏覽器 --manual-performance 已驗證完整擷取、暫停保留、互斥記錄、外部啟動頁、實際JSON下載、下載例外保留已收集資料並可再次記錄、保存設定還原及消耗參數後重新整理不再記錄。啟動頁1440×900截圖已人工檢視，按鈕與說明無遮擋。一次回歸因Page.reload回傳後讀到舊document的ready而失敗，已改為確認新的performance.timeOrigin後才讀取新頁API，重跑通過。

這些瀏覽器操作只驗證工具功能，並行QA期間的幀時間不作效能成績。npm.cmd run qa:all、npm.cmd run build、正式版隔離及一般瀏覽器回歸均已通過。最終重建與本輪初次建置的整個dist逐位元相同；src/、public/及lockfile亦和前一來源檢查點一致。最終結果記於 artifacts/tests/manual-performance-verification-2026-10-30.json。使用者實際手動行駛的記錄尚未取得。
