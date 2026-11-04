# 車輛研究資料

- `metrics/`：來源指標、感測器與車輛參考、CSV 及彙總。
- `results/`：BMW／P1 擬合、來源驗證及力通道品質結果。
- `calibration/`：原 P1 校準程式、`results/` 與 `geometry_b115/`。
- `tools/`：下載、處理及繪圖工具。

來源與數據分類見 [數據索引](../docs/DATA_CATALOG.md) 及 [資料來源](../docs/reference/DATA_PROVENANCE.md)。所有既有 JSON／CSV 保持原內容，研究結論不會自動改寫遊戲參數。

研究工具若未指定輸出位置，預設寫入本目錄的 `metrics/recomputed/`、`results/` 或 `raw/obd/`；明確傳入的 CLI 路徑仍照常使用。研究圖表存於 `../artifacts/research/figures/`，瀏覽器產物存於 `../artifacts/tests/`。原始資料下載仍需使用者自行執行相應指令，本次未下載任何資料。
