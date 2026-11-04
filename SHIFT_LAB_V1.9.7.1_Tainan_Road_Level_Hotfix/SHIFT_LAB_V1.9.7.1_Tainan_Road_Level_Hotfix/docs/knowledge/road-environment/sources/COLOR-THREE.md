# Color Management

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/manual/pages/color-management.html)
- 版本：線上手冊；本機Three.js 0.180.0對照。查閱：2026-10-28。
- 閱讀狀態：`sections_reviewed`。
- 閱讀範圍：Roles of color spaces、Input color space。

## 來源結論

顏色貼圖使用適合的sRGB標記；法線和粗糙度等資料貼圖不使用顏色轉換。

## 專案套用

以下為建模決策，不是來源的工程標準：記錄每張貼圖用途及色彩空間，避免整包貼圖一律設成sRGB。

## 適用限制

本輪未匯入貼圖或作螢幕色彩校正。
