# WebGLRenderer

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/docs/pages/WebGLRenderer.html)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：info memory/render、compileAsync及toneMapping；本機r180對照。

## 來源結論

info可記錄資源數與繪製統計；compileAsync可協助避免首次編譯卡頓。

## 專案套用

分別紀錄各pass與資源估算，預熱已選用的材質組合。

## 限制

textures／geometries是物件數，不是VRAM位元組；線上文件有較新欄位。
