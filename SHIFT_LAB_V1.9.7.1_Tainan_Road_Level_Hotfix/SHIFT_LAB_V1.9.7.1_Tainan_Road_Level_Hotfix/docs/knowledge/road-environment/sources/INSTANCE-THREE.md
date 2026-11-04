# InstancedMesh

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/docs/pages/InstancedMesh.html)
- 版本：線上API；本機Three.js 0.180.0對照。查閱：2026-10-28。
- 閱讀狀態：`sections_reviewed`。
- 閱讀範圍：類別介紹、instanceMatrix、bounds、dispose。

## 來源結論

相同幾何與材質的實例可減少draw calls；位置改動涉及資料更新及包圍範圍。

## 專案套用

以下為建模決策，不是來源的工程標準：樹、石、燈柱按chunk與材質批次化，資源分開管理。

## 適用限制

實例化不是保證FPS；透明過繪、陰影與碰撞成本需各別量測。
