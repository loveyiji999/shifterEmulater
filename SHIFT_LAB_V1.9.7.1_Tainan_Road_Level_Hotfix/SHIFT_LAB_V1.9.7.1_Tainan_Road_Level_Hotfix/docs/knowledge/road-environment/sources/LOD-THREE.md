# LOD

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/docs/pages/LOD.html)
- 版本：線上API；本機Three.js 0.180.0對照。查閱：2026-10-28。
- 閱讀狀態：`sections_reviewed`。
- 閱讀範圍：介紹、levels、addLevel hysteresis、update。

## 來源結論

LOD可依距離切換物件，hysteresis可緩和邊界切換。

## 專案套用

以下為建模決策，不是來源的工程標準：近中遠景分級；畫面LOD不應改變正在行駛的碰撞面。

## 適用限制

本輪沒有選定硬體或量測合適的距離與面數預算。
