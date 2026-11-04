# MeshStandardMaterial

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/docs/pages/MeshStandardMaterial.html)
- 版本：線上API；本機Three.js 0.180.0對照。查閱：2026-10-28。
- 閱讀狀態：`sections_reviewed`。
- 閱讀範圍：metalness、roughness、normalMap、bumpMap、displacementMap與envMap。

## 來源結論

金屬度與粗糙度描述外觀；normal／bump不改變幾何，displacement改變渲染頂點。

## 專案套用

以下為建模決策，不是來源的工程標準：粗糙度與輪胎摩擦分開；可行駛起伏需同步碰撞幾何。

## 適用限制

線上文件可能新版；本機已核對相關欄位，未實作或實測新材質。
