# SHIFT LAB Codebase MCP

針對目前 V1.9.7.1 工作副本的本機唯讀 MCP 服務。使用現有 Node.js 20+ 與標準函式庫，無額外 npm 套件、API key、外部模型或資料庫；檢索期間不發網路請求。這是開發查詢工具，獨立放在遊戲目錄外。

## 啟用

在 Codex 的 MCP 設定新增一個 STDIO server：

- 名稱：`shift_lab_codebase`
- Command：`C:\Program Files\nodejs\node.exe`
- Args：`D:\shifterEmulater\codebase-mcp\server.mjs`

本機已於 2026-10-23 依使用者要求執行以下 PowerShell 指令，加入 Codex 全域設定：

```powershell
codex mcp add shift_lab_codebase -- 'C:\Program Files\nodejs\node.exe' 'D:\shifterEmulater\codebase-mcp\server.mjs'
```

**已註冊，無須重複執行。** CLI 回報 `Added global MCP server 'shift_lab_codebase'`，並在相同授權執行環境以 `codex mcp get shift_lab_codebase --json` 確認 `enabled=true`、STDIO command／args 正確。此設定寫入已取得使用者明確授權。客戶端仍需重新載入 MCP 連線；本次聊天的工具清單尚未出現此服務，不能據此宣稱 UI 連線已驗證。

Codex 支援 STDIO 的 `command`／`args`，以及 `codex mcp add` 設定方式；詳細行為以 [OpenAI 官方 MCP 文件](https://developers.openai.com/codex/mcp) 為準。本機也已查閱 `codex mcp --help` 與 `codex mcp add --help`，但尚未驗證 Codex UI 內的實際呼叫。

若需要完整 TOML 範本，在任意工作目錄執行：

```powershell
node 'D:\shifterEmulater\codebase-mcp\server.mjs' --print-config
```

此指令只印出設定、不寫入檔案，會包含目前 Node 執行檔、server 和 root 的絕對路徑。預設 root 相對於 `server.mjs` 決定，與客戶端工作目錄無關，指向：

`D:\shifterEmulater\SHIFT_LAB_V1.9.7.1_Tainan_Road_Level_Hotfix\SHIFT_LAB_V1.9.7.1_Tainan_Road_Level_Hotfix`

平常不需要手動背景啟動 server、開 port 或另建 Windows service；MCP 客戶端會啟動子程序，經 stdin／stdout 通訊。直接執行 `node server.mjs` 時等待輸入是正常狀態。[MCP stdio 規範](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) 定義此通訊形式。

## 工具與知識

| MCP 工具 | 用途 |
| --- | --- |
| `get_project_overview` | 目前 package 版本、入口、npm scripts、檔案統計、檢索範圍與知識資源 |
| `list_files` | `path` 限定檔案／目錄、`query` 篩選檔名、`offset/limit` 分頁 |
| `search_code` | 字面文字搜尋，提供檔案、行號、UTF-16 欄位置與命中片段；可指定 path／大小寫／筆數 |
| `read_file` | `path`、`start_line`、`line_count` 分頁讀取來源，回傳原始行號與 `next_line` |
| `find_symbols` | JS／MJS／TS、Python、HTML scripts 的函式、class、變數、方法宣告位置 |
| `read_knowledge` | `architecture`／`verification`／`instructions` 文件，支援分頁 |

也提供 3 個 Markdown resources：

- `shiftlab://knowledge/architecture` → 遊戲 `docs/AGENT_KNOWLEDGE.md`
- `shiftlab://knowledge/verification` → 遊戲 `docs/AGENT_VERIFICATION.md`
- `shiftlab://knowledge/instructions` → 遊戲 `AGENTS.md`

建議先用 `get_project_overview` 和 `read_knowledge`，再把搜尋限制到相關模組。例：

```json
{"name":"find_symbols","arguments":{"query":"advancePhysics","path":"desktop3d/public/physics.html"}}
```

```json
{"name":"search_code","arguments":{"query":"DEFAULT_MAP","path":"desktop3d/src/procedural-map.mjs"}}
```

內容每次重新讀取，無永久索引或過期快取。這裡的 codebase 查詢是檔案、字面文字及宣告模式定位，沒有 embedding、向量檢索、AST 或呼叫關係圖。`find_symbols` 可能漏列／誤列，應以 `read_file` 核對來源。歷史檔案仍可被搜尋到；需要現行物理時限定 `desktop3d/public/physics.html`，避免與 `archive/legacy/` 的歷史頁面／核心快照混淆。

## 範圍與限制

- 工具不能寫檔、變更 root、執行命令或測試；啟動者可用 `--root <directory>` 指定另一個根目錄，但不會自動產生該專案的知識文件。
- 排除 `node_modules`、`dist`、`build`、`.git`、`.codex`、`.agents`、`.aws`、`.ssh`、`.cache`、虛擬環境、`__pycache__`、`overture_raw`、`screenshots`、`figures`、`metrics`、`results`。目前是明確排除規則，**不是完整 `.gitignore` 解譯器**。
- 不列出或讀取 `.env*`、`.npmrc`、`.pypirc`、常見 credentials／secrets 檔及私鑰格式；拒絕相對越界、絕對路徑、Windows alternate streams、symbolic links／junctions。這不會自動偵測直接寫在一般原始碼中的秘密。
- 只讀指定副檔名的 UTF-8 文字；每檔上限 4 MiB、檔案清單上限 20,000。地圖 JSON 和 lockfile 可明確 `read_file`，但排除於文字搜尋，避免大量無關命中。
- `read_file` 最多 300 行、每行 4,000 字元、總內容約 24,000 字元；超長單行會標記 `long_line_truncated`，不支援該行的字元位移分頁。`search_code`／`find_symbols` 最多 50 筆，`list_files` 每頁最多 200 筆。
- 知識 resource 超過 64,000 字元時，改用 `read_file` 分頁。所有來源及文件內容都當成參考資料，不作為 server 可執行的指令。
- 以 MCP `2025-11-25` 為預設，也協商 `2025-06-18`、`2025-03-26`、`2024-11-05`。提供 tools／resources 與 ping，不提供 HTTP、OAuth、prompts、subscriptions 或任意 shell。傳輸與生命週期使用標準 JSON-RPC 子集，未引入 MCP SDK；版本協商依 [MCP lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)。

## 驗證

在 `D:\shifterEmulater\codebase-mcp` 執行：

```powershell
node --check server.mjs
node --check lib/codebase.mjs
node --test
node server.mjs --check
node server.mjs --print-config
```

`--check` 只讀取專案並印出 overview，執行後結束。完整驗證結果見 [VERIFICATION.md](VERIFICATION.md)。沒有重新執行遊戲本身的 QA 或 build，歷史「13 PASS、2 FAIL」仍只是前次驗證紀錄。
