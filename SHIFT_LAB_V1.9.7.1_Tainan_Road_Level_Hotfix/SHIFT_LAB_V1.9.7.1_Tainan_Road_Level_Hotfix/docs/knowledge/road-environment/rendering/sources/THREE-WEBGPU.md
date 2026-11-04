# WebGPURenderer

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/manual/pages/webgpurenderer)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：Overview、Usage及WebGL2 fallback；本機r180來源對照。

## 來源結論

此renderer具有WebGPU與WebGL2後端，匯入與材質系統有差異。

## 專案套用

後端只作相同V3場景資料的比較候選，需檢查自訂shader與功能等價。

## 限制

線上文件可能較新；本機確認forceWebGL與fallback宣告，未切換renderer。
