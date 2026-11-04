# KTX2Loader

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/docs/pages/KTX2Loader.html)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：介紹、detectSupport、transcoder path與worker limit；本機r180對照。

## 來源結論

載入器依裝置能力轉碼，並依賴JS／WASM轉碼器資產。

## 專案套用

素材管線需包含離線編碼、版本化轉碼器與有界載入佇列。

## 限制

本輪僅核對本機宣告，未下載轉碼器或匯入壓縮材質。
