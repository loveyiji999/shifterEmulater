# 工作區導覽

此目錄目前不是 Git repository。進行變更前，仍應確認實際工作目錄是否另有 Git，以及既有檔案狀態。

目前使用者指定的分析版本是：

`SHIFT_LAB_V1.9.7.1_Tainan_Road_Level_Hotfix/SHIFT_LAB_V1.9.7.1_Tainan_Road_Level_Hotfix/`

處理這個版本時，先閱讀版本根目錄的 `AGENTS.md`，再依任務閱讀：

- `docs/AGENT_KNOWLEDGE.md`：架構、資料、操作、相容性與修改定位。
- `docs/AGENT_VERIFICATION.md`：目前種子地圖與車輛版本的實測、精確指令與驗證邊界。

雙層同名目錄是現有解壓結構；不要自行搬移、合併或改名。使用者後續若指定其他版本，應以新指定目錄為準，不要把本版結論直接套用到別版。

## 本機 Codebase MCP

`codebase-mcp/` 是此版本的獨立唯讀開發查詢服務，提供檔案／文字搜尋、來源讀取、宣告定位及現有知識資源；使用方式見 [codebase-mcp/README.md](codebase-mcp/README.md)。有可用的 `shift_lab_codebase` MCP 連線時，先使用 `get_project_overview`／`read_knowledge` 定位，再讀取相關程式；未連線時可照常使用本機檔案工具。

維護 MCP 本身時先讀 `codebase-mcp/AGENTS.md`。它沒有遊戲依賴或寫入工具；2026-10-23 已依使用者明確要求註冊全域 `shift_lab_codebase`，確認 `enabled=true`。聊天能否使用仍以重新載入後的工具清單為準。

## 整理後入口

- 工作區 `START_GAME.cmd` 轉交目前版本原有的 Windows 啟動腳本。
- 原始下載 ZIP 集中於 `archives/packages/`；舊／新位置與整理前 hash 見 `archives/organization-2026-10-28.json`。
- 遊戲版本內的分類與資料索引見 `docs/ORGANIZATION.md`、`docs/DATA_CATALOG.md`。原雙層版本目錄與 `desktop3d/` 沒有搬移。
