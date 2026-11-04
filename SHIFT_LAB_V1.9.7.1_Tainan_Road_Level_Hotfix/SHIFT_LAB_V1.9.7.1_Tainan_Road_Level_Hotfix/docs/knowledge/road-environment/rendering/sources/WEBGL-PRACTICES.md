# WebGL best practices

- 來源：MDN / Mozilla。[原始文件](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：Avoid blocking API calls、per-pixel VRAM budget、batching、mipmaps及back buffer。

## 來源結論

GPU同步查詢、過量資源及像素成本會限制渲染；需要檢查實際能力。

## 專案套用

先分辨瓶頸，再配置解析度、材質與批次；不能把所有效能問題都歸於三角形數。

## 限制

線上維護文件，不提供本專案FPS或跨裝置固定預算。
