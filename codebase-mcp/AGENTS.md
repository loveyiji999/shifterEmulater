# Codebase MCP 維護

- 這是專案外置的開發工具，不是遊戲 runtime；預設只讀取指定的 V1.9.7.1 版本。
- 使用 Node.js 20+ 與標準函式庫，沒有 npm dependencies。不要為本工具修改遊戲 `desktop3d/package.json` 或 lockfile。
- `server.mjs`：MCP stdio、協定生命週期、工具 schema、啟動參數；`lib/codebase.mjs`：專案內檔案／程式碼／知識檢索。
- stdio 模式的 stdout 只能輸出逐行 JSON-RPC 訊息；診斷使用 stderr。`--check` 與 `--print-config` 是會結束的 CLI 模式。
- 所有工具保持唯讀、限定 root；不可透過工具更改 root、執行 shell、讀環境變數或發網路請求。保留路徑、敏感檔案、symlink／junction、UTF-8 與輸出上限檢查。
- `find_symbols` 是宣告模式辨識，不是 AST、語意搜尋或 call graph；不要將它的結果描述成完整靜態分析。
- 知識及 QA resources 每次讀取現有檔案；歷史 QA 不代表重新執行測試。`--root` 是啟動者指定的替代根目錄，不是客戶端工具參數。
- 驗證在本目錄執行 `node --test`、`node server.mjs --check`。測試只在自行建立且已檢查路徑的系統暫存目錄清理 fixtures，真實遊戲整合測試保持唯讀。
- 完整使用與客戶端設定見 [README.md](README.md)。2026-10-23 已依使用者明確授權執行 CLI 註冊全域 `shift_lab_codebase`，確認 `enabled=true`；服務本身沒有設定寫入工具。目前聊天的工具載入仍需客戶端重新連線後確認。
