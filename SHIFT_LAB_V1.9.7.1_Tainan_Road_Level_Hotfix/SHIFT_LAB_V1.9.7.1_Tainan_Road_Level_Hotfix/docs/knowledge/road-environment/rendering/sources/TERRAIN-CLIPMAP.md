# Terrain Rendering Using GPU-Based Geometry Clipmaps

- 來源：Asirvatham / Hoppe；NVIDIA GPU Gems 2。[原始文件](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-2-terrain-rendering-using-gpu-based-geometry)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：2.1、2.2與過渡區段落。

## 來源結論

以巢狀規則格與過渡區表達不同地形細節，可重用幾何並增量更新。

## 專案套用

借用近密遠疏、連續銜接與增量更新原則；先評估分塊高度場。

## 限制

歷史DirectX實作與舊硬體FPS不能直接搬到網頁；本輪未照搬shader。
