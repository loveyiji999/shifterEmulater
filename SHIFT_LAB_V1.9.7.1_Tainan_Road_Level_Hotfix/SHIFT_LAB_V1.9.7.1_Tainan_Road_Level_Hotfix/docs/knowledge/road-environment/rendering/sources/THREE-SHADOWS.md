# Shadows

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/manual/pages/shadows.html)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：開頭shadow map成本與啟用陰影段落。

## 來源結論

投影光源會增加渲染工作；renderer、光源與物件的陰影設定都影響結果。

## 專案套用

先處理近景主光與受光接觸，再量測陰影距離、解析度與額外燈數。

## 限制

範例非專案量測；陰影外觀不能代替碰撞或接地驗證。
