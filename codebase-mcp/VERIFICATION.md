# 2026-10-28 · 種子地圖版本相容性

已將主要道路入口與實際專案查詢測試改為程序化地圖。原資料夾排除與路徑安全檢查保留。在 `codebase-mcp` 實際執行 `node --test`：10 tests、0 fail；`node server.mjs --check`：PASS，辨識 119 個允許的文字檔、5 個入口及 3 個知識資源。未改變服務的唯讀或路徑安全邊界。

# Codebase MCP 驗證紀錄

日期：2026-10-23（Asia/Taipei）。Windows PowerShell、Node `v24.18.0`；此工具要求 Node 20+，本次只實測目前的 Node 24。沒有安裝套件，也沒有新增遊戲或 MCP 的第三方依賴。

## 已執行

工作目錄 `D:\shifterEmulater\codebase-mcp`：

| 指令 | 結果 |
| --- | --- |
| `node --check server.mjs` | PASS |
| `node --check lib/codebase.mjs` | PASS |
| `node --test` | PASS：10 tests、0 fail、0 skipped |
| `node server.mjs --check` | PASS：讀取指定 V1.9.7.1，178 個允許的文字檔，辨識 5 個主要入口及 3 個知識資源 |
| `node server.mjs --print-config` | PASS：只印出目前主機適用的 Codex TOML，未寫入設定 |

10 項測試包含：

1. 檔案清單、分頁、排除規則、檔案新增／移除立即反映。
2. CRLF 行號、讀取範圍、UTF-8／二進位驗證、長行／4 MiB 上限。
3. 字面文字搜尋、大小寫、路徑限制、地圖／lockfile 排除及修改後重新讀取。
4. JS 宣告／方法、Python、HTML inline 物理程式的原始行號。
5. `../`、絕對路徑、UNC、NTFS stream、`.env*`、憑證檔及實際建立的 Windows junction 隔離。
6. 專案 overview、知識 resources、知識檔修改後重新讀取。
7. 啟動真正 Node 子程序，以獨立 JSON-RPC 測試客戶端完成 stdio 握手、6 個工具呼叫、3 個資源、輸入 schema、協定／工具錯誤及 parse-error 復原。
8. 舊版協定回應不含 structuredContent；未知版本回應 server 可支援的協定。
9. 超過 1 MiB 的輸入 frame 被拒絕後，仍可接收下一個有效 ping。
10. **真實專案整合**：透過 MCP 讀取版本、找到 `physics.html/advancePhysics()` 的宣告並回讀同一行、搜尋種子設定 `DEFAULT_MAP` 與 `generator:2`、讀取當次 `npm.cmd run qa:all` QA 與全部知識 resources。

測試中的刪除只清理自身在系統暫存目錄建立且已檢查位置的 fixture；遊戲資料保持唯讀。

## Codex 設定解析

本機執行 `codex mcp --help`、`codex mcp add --help`、`codex mcp get --help` 確認目前 CLI 介面。另以 Python `subprocess.run()` 傳入參數陣列執行相當於下列指令的**當次覆寫**：

```text
codex -c 'mcp_servers.shift_lab_codebase.command="C:/Program Files/nodejs/node.EXE"' -c 'mcp_servers.shift_lab_codebase.args=["D:/shifterEmulater/codebase-mcp/server.mjs"]' -c 'mcp_servers.shift_lab_codebase.enabled=true' mcp get shift_lab_codebase --json
```

結果 PASS，CLI 正確辨識 `name=shift_lab_codebase`、`enabled=true`、`transport.type=stdio` 以及 server 路徑。輸出只保留這些非機密欄位，沒有印出其他既有設定。`-c` 只套用該次執行，沒有註冊或修改全域設定；此檢查也**不代表 Codex 已連線並呼叫工具**。

## 檔案與驗證邊界

- 新增檔案均位於 `D:\shifterEmulater\codebase-mcp/`，另外在工作區 `AGENTS.md` 增加入口與使用指引。
- 建立前後比對指定遊戲版本的 **238 個檔案 SHA256，無變更**；比對範圍排除 `node_modules`、`dist`、`__pycache__`。沒有改遊戲程式、測試、圖資、package／lockfile、歷史知識或發行 manifests。
- 未執行遊戲 QA／build、未啟動瀏覽器、未建立 Git commit 或發布；本機仍不是 Git repository。
- 建立服務當時未註冊；其後同日依使用者明確要求完成全域註冊，詳見下方補記。此聊天或 Codex UI 實際載入新工具仍未驗證。
- MCP 是零額外依賴的 stdio 實作；協定驗證使用獨立 wire-level 測試客戶端，未使用官方 SDK／Inspector 作互通測試。不要將這個界線描述成已完成所有 MCP 客戶端認證。

## 全域註冊補記（2026-10-23）

使用者明確要求執行啟用指令後，於工作目錄 `D:\shifterEmulater` 執行：

```powershell
codex mcp add shift_lab_codebase -- "C:\Program Files\nodejs\node.exe" "D:\shifterEmulater\codebase-mcp\server.mjs"
```

此指令需寫入工作區外的全域 Codex 設定，已透過授權執行完成；exit code 0，回報 `Added global MCP server 'shift_lab_codebase'`。

後續在相同授權環境執行 `codex mcp get shift_lab_codebase --json`，確認 `enabled=true`、`transport.type=stdio`，以及預期 Node／server 路徑。一般沙箱環境的同一查詢仍回報找不到，雖兩者顯示相同設定路徑；本次以授權環境讀回結果確認實際全域註冊，不對沙箱差異另作未證實推論。

另執行 `node server.mjs --check` 通過，辨識 V1.9.7.1 與 178 個允許的文字檔。沒有改服務程式或遊戲，未重跑測試套件；只更新註冊狀態文件。目前聊天工具清單尚無 `shift_lab_codebase`，需要客戶端重新載入連線後再驗證實際工具呼叫。
