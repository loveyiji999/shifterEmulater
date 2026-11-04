# PMREMGenerator

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/docs/pages/PMREMGenerator.html)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：類別介紹；本機r180 fromScene／fromEquirectangular對照。

## 來源結論

預濾波環境圖可供不同粗糙度材質取用相應反射模糊。

## 專案套用

固定光照基準，預計算環境照明，檢查洞內外分區與曝光。

## 限制

未據線上新版細節假定r180採同一取樣演算法；不是全局光照或洞體遮蔽的替代品。
