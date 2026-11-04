# Transferable objects

- 來源：MDN / Mozilla。[原始文件](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：資源所有權、ArrayBuffer移轉及detached說明。

## 來源結論

移轉ArrayBuffer後原端失去該資源的使用權。

## 專案套用

生成工作與主畫面分離時明確管理buffer所有權及過期請求。

## 限制

本輪未建立Worker；不是所有物件都可移轉，也不保證移到Worker就能消除GPU上傳卡頓。
