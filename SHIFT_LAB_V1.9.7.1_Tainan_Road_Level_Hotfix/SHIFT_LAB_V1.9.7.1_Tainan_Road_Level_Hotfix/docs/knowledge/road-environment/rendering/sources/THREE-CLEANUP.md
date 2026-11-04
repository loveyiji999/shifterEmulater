# Cleanup

- 來源：Three.js維護團隊。[原始文件](https://threejs.org/manual/pages/cleanup.html)
- 查閱：2026-10-28。閱讀狀態：`sections_reviewed`。
- 範圍：介紹及geometry／material／texture dispose。

## 來源結論

場景移除不會自動釋放所有Three GPU資源，需要明確生命週期管理。

## 專案套用

按chunk所有權及共享引用回收，檢查重建與長時間串流。

## 限制

可保留合理快取，驗證應對照暖機後基線，不要求所有內部資源一律歸零。
