# Generating Complex Procedural Terrains Using the GPU

- 來源：Ryan Geiss；NVIDIA GPU Gems 3。[原始文件](https://developer.nvidia.com/gpugems/gpugems3/part-i-geometry/chapter-1-generating-complex-procedural-terrains-using-gpu)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：1.1–1.2、1.5、1.6.1文字。

## 來源結論

體積表面能表達洞穴／懸挑；三平面投影可緩和陡面貼圖拉伸，遠近應分級。

## 專案套用

普通山體用高度場，洞口與懸崖局部補網格；岩壁材質評估三平面投影。

## 限制

原文依DirectX10特性；不代表WebGL2可直接使用geometry shader或同等吞吐。
