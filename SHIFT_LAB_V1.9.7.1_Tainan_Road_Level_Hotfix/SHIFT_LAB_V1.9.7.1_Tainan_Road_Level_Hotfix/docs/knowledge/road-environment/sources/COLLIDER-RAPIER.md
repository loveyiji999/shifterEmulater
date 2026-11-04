# Colliders JavaScript User Guide

- 來源：Dimforge Rapier維護團隊。[原始文件](https://rapier.rs/docs/user_guides/javascript/colliders/)
- 版本：線上指南標示0.21；專案使用0.18.2。查閱：2026-10-28。
- 閱讀狀態：`sections_reviewed`。
- 閱讀範圍：Creation、triangle meshes、heightfields、friction。

## 來源結論

trimesh與heightfield是不同幾何表達；碰撞摩擦屬於接觸物理解算。

## 專案套用

以下為建模決策，不是來源的工程標準：單值高度場用於普通地形，洞穴／上下層使用獨立網格；輪胎力沿用專案核心。

## 適用限制

線上版本較新；本機僅核對既有宣告，未升級套件、使用新API或驗證新模型。
