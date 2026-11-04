# EXT_disjoint_timer_query_webgl2

- 來源：Khronos WebGL working group。[原始文件](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：Revision 4，2023-06-01；Overview及結果查詢範例。

## 來源結論

計時查詢可回報GPU執行時間；結果需等候available且排除disjoint。

## 專案套用

採延後讀取的診斷取樣，無支援時標記不可用；不把CPU提交時間當GPU時間。

## 限制

擴充是否存在需實機檢查；未在本輪執行GPU量測。
