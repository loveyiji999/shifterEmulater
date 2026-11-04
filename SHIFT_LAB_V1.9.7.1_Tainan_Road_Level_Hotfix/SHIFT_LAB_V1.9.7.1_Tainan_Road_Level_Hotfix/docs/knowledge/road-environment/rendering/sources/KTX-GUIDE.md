# KTX 2.0 Basis Universal Developer Guide

- 來源：Khronos Group。[原始文件](https://raw.githubusercontent.com/KhronosGroup/3D-Formats-Guidelines/main/KTXDeveloperGuide.md)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：Container、block compression、ETC1S與UASTC overview/runtime usage。

## 來源結論

容器、傳輸壓縮與GPU格式是不同層；需按能力轉碼，部分情況會回退未壓縮格式。

## 專案套用

按基色、法線及資料貼圖選編碼並檢查畫質；紀錄實際轉碼格式與成本。

## 限制

未將硬體列表當保證；本輪未編碼素材或量測節省比例。
