# Texture

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/docs/pages/Texture.html)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：anisotropy、filter與mipmap欄位。

## 來源結論

提高各向異性取樣可改善斜視貼圖，但會增加取樣成本。

## 專案套用

道路以駕駛視角調整mip與取樣；選擇實測有效值，不全設裝置最大值。

## 限制

功能宣告不代表已完成shader、貼圖或畫質驗證。
