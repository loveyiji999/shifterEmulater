# P0 原生 GPU 基線

日期：2026-10-28。這是現有簡化場景的靜止基線，不能作為完整道路材質、地形、植被、陰影或 P3 十場景已完成的證明。

## 固定條件

- CPU：Intel Core i5-13500；GPU：Intel UHD Graphics 770，驅動 31.0.101.5081；系統記憶體 33,934,594,048 bytes。
- 隔離 Chrome 156.0.8078.48，headless 模式、原生 ANGLE／D3D11／WebGL2；量測拒絕 SwiftShader 或無法辨識的原生後端。
- 1440×900 drawing buffer、DPR 1；standard、V3 種子 `P0-NATIVE-BASELINE-V1`，轉彎與坡度機率 0，停車 P 檔、固定追車鏡頭。
- 每組暖場 10 秒、擷取 60 秒，共 3 組；每組 3,601 個 frame 樣本與 3,601 個有效 GPU query。
- 門檻在擷取前固定為 frame p95 ≤20 ms、p99 ≤33.34 ms、模擬／牆鐘時間比 ≥0.98、丟棄步數 0。記憶體及 GPU 時間上限尚未定案，不假裝已驗收。

[固定目標](../artifacts/tests/performance/p0-target-2026-10-28.json)、[原始逐幀數據](../artifacts/tests/performance/p0-native-baseline-2026-10-28.json)、[固定畫面](../artifacts/tests/performance/p0-native-baseline-2026-10-28.png)、[來源 hash](../artifacts/tests/performance/p0-baseline-source-hashes-2026-10-28.json)及[可恢復來源快照](../artifacts/tests/performance/p0-baseline-source-2026-10-28.zip)均已保存。

## 實測結果

| 組次 | frame p95／p99 ms | GPU render p95 ms | 模擬／牆鐘比 | 丟棄步數 | 上述門檻 |
| --- | --- | --- | --- | --- | --- |
| 1 | 16.8／16.8 | 0.843 | 1.00002 | 0 | PASS |
| 2 | 16.8／16.8 | 0.828 | 1.00036 | 0 | PASS |
| 3 | 16.8／16.8 | 0.826 | 1.00022 | 0 | PASS |

各組 physics CPU p95 約 0.7 ms／frame、道路 ensure CPU p95 約 0.1 ms、render submission CPU p95 約 0.3 ms。GPU query 為非同步可用性查詢，沒有讀取尚未就緒的結果；disjoint 與未就緒丟棄數皆為 0。CPU 分項包含量測包裝成本，未測量儀器開銷的獨立差值。

末幀記錄 35 draw calls、6,936 triangles、35 geometries、0 textures。這些是渲染計數，不能換算成已量得的 VRAM；`resourceMemoryBytes` 保持 null。幀時間接近顯示排程間隔，不代表 GPU 已飽和或本機最高 FPS 只有 60。

## 量測工具修正與邊界

最初擷取發現 GPU 結果等待期間仍被納入模擬時間，且新 GPU query 持續加入，使模擬比約高估 0.8%。已加入決定性測試重現並修正：在擷取終點凍結模擬／牆鐘區間、停止新增 query，之後僅非同步回收原區間的 GPU 結果。修正後重新執行完整三組，不以重算舊報告替代重測。

舊批次另存為 `p0-native-baseline-pre-fix-2026-10-28.json`，明確標記 invalidated，門檻結果設為 null，供追查，不作完成依據。

目前沒有冷載入、移動畫面、完整環境、十場景、長時資源平台、記憶體估算或多品質比較。後續模型、光照、地形或資產改變後，應對新狀態重新量測；不能把本紀錄數字沿用成新場景成績。知識庫十場景計畫維持尚未執行。

## 重現

在 `desktop3d` 執行：

```powershell
npm.cmd run qa:performance
node tests/validate-procedural-browser.mjs --baseline-performance --native-gpu
```

第一個指令檢查量測區間、GPU 可用性／disjoint、清理、原生後端限制及中斷復原；第二個指令啟動擁有獨立設定檔的 Chrome 和本機 Vite，完成後自行關閉。正式遊戲不含量測模組或 API。
