# 2026-10-28 — V3單一地圖開發主線

- 先建立官方道路設計知識庫，再實作連續線形、前瞻重試、同層拓樸、上下穿越、橋梁、地下道、山脊隧道與峽谷吊橋。
- V3成為新建地圖唯一選項；V1／V2凍結相容，保留種子與既有儲存鍵。
- 共用Three／Rapier網格、橋厚與全寬淨空、引道坡度、結構碰撞分類、三維查路與空間串流；驗證工具保持遊戲外部。
- 完整驗證紀錄見 `docs/AGENT_VERIFICATION.md`，設計邊界見 `docs/knowledge/road-design/DESIGN.md`。

## 2026-10-28 · 專案資料夾整理

- patch、歷史版本文件、log 及舊測試集中於 `archive/`。
- 車輛研究與校準數據、工具歸入 `research/`，圖表／測試產物歸入 `artifacts/`。
- 原遊戲目錄及啟動方式不變；新增工作區 `START_GAME.cmd` 轉交既有入口。
- 更新相對路徑、文件導覽與數據索引；保留物理核心、車型參數、種子生成器與原始研究數據。

## 2026-10-28 · 物理驗收移出遊戲本體

- 移除玩家驗收選單、F2 入口、工況切換、驗收數據面板與報告匯出。
- 原工況、路障、量測及評分保留於 `desktop3d/tests/acceptance/` 獨立開發工具。
- 瀏覽器回歸橋接僅在 DEV 載入，production build 不含測試模組或 QA API。
- 保留車輛／種子生成器、一般駕駛、手排／自排及行駛安全檢查。

## 2026-10-28 · 種子地圖與車輛版本

- 依使用者要求清除現實地圖模組、圖資、資料工具、研究報告與專用測試。
- 保留程序化道路 v1/v2 的種子、設定格式及車輛／傳動／四輪物理設計。

# SHIFT LAB v1.9.0 — 程序化道路生成器 v2（2026-10-22）

- 新增 `road-generator-v2.js`：完整髮夾彎折返路段、成對平滑彎道、獨立坡度控制及確定性的路線延伸。
- 空間網格檢查非相鄰道路取樣點的水平間距；加入坡度、曲率、取樣連續性與非有限值稽核，不讓失敗幾何進入新場景。
- 舊版 v1 生成器保持原始演算法，原有 v1 JSON／瀏覽器存檔維持原版地圖；新使用者預設 v2，可在統一設定中選回 v1。
- 新增 v2 種子大量回歸、增量延伸一致性、Chromium 原始物理頁面實測，以及玩家／測試地圖互相切換測試。
- 1,000 種子 × 96 路段幾何測試全通過；110 項 Python／Chromium 回歸（108 通過／2 跳過），Node 原有物理及 PRND 測試通過；正式 WebGL/Rapier 3D 驗收待完成。
- 車輛、手排、自排、PRND 與四輪動力學不做重新調校；3D 地形及優化場景串流不屬於本版範圍。

---

# SHIFT LAB v1.8.9.3 — PRND 自排倒車與安全換檔（2026-10-22）

- 修復自排缺少倒車範圍及倒檔離合器無法接合的問題。
- 加入 P/R/N/D 選檔，P 採用四輪駐車制動的物理近似，N 保持脫開，D 繼續六速 AMT 自動升降檔。
- 換 R/P/D 須完全停穩且踩住煞車；在暫停的設定介面停穩時允許選擇。N 可於移動中使用。禁止 R/D/P 不安全跨向切換，原始同步器仍主導實際齒輪。
- 儀表盤 PRND 輕量操作、設定統一選項、鍵盤 P/R/N/F；手排 Shift + R、0～6 保留。
- 原四輪模型實測、10 組 Node 模組驗證、110 項 Python/Chromium 回歸（108 通過／2 跳過）；WebGL/Rapier 驗收待實機執行。

---

# SHIFT LAB v1.8.9.2 — 3D 物理整合穩定候選版（2026-10-21）

- **手排設定修復**：停車且處於手排時，設定畫面選檔由原始離合器斜率、同步器及 `requestGear` 完成；移動中不強制入檔，保留倒檔安全鎖定。
- **自排驗證**：新增四車型連續減速回一檔與既有油門／煞車／自排鍵盤隔離的回歸；保留 v1.8.9.1 的 AMT 物理方式。
- **車型統一**：將 2.2L 柴油車加入單頁設定。
- **道路生命週期**：清空並檢核舊 Rapier Collider 與 Three.js 道路資源；測試路障材質一併釋放；重建失敗嘗試回復原地圖。
- **數值安全**：每次物理步進檢查剛體姿態、速度、傳動與四輪數值；異常即明確報告 FAIL／停止駕駛並提供重載。
- **瀏覽器自動化**：更新舊測試進入單頁自由駕駛的方式；新增 `browser_v1892.py`，可執行真實 WebGL 五項驗收與 30 分鐘耐久測試。
- **測試結果**：Node 九組模組測試通過；103 項分段 Python／Chromium 回歸中 101 通過、2 跳過；實際 Three.js／Rapier WASM 建置及端到端驗收因 npm DNS 失敗仍待用戶本機完成。
- **架構保留**：原四輪 `physics.html`、程序化生成器與測試工況不重寫，仍維持原生網頁版本。

---

# SHIFT LAB v1.8.9.1 — 自排換檔修補（2026-10-21）

- **修正**：自排降檔不再僅看 `engine RPM < 1200` 加速條件，而根據輪速／各檔齒比推算工作轉速，結合制動、油門、回差與換檔冷卻判斷。
- **修正**：接近停車時直接回 1 檔、低轉速自動分離離合器避免熄火，維持原手排同步器和傳動物理。
- **隔離**：自排時忽略 `Shift`（手排離合器）、數字鍵／小鍵盤檔位、`R`，並停用手排檔位下拉選單；不再因更改下拉檔位偷偷切成手排。
- **保留**：手排模式完整的 Shift、1–6、0、R 換檔操作；單頁網頁、地圖、四輪力學、Rapier 碰撞和五項 QA 情境保持不變。
- **驗證**：Node 四車型獨立自排策略測試、Chromium 真鍵盤隔離測試，以及真實 SHIFT LAB 引擎加速／制動／再加速回歸；3D WASM 仍需用戶瀏覽器複驗。

---

# SHIFT LAB v1.8.9 · 程序化地圖與遊戲模式介面

- **新增**：全螢幕自由駕駛（速度／RPM／檔位 HUD）、集中設定與獨立 QA 測試抽屜。
- **新增**：沿用舊 seeded route generator 的 3D 隨機道路選單（種子／彎道／坡度／JSON／路線預覽）。
- **新增**：更換地圖即移除老道路網格及碰撞體，重新建立 Three.js／Rapier 所需場景與護欄。
- **新增**：固定 QA 路線與玩家隨機路線分離，測完自動還原玩家地圖。
- **新增**：路面柏油／路肩／草地外觀及低多邊形路邊植栽（視覺專用）。
- **保留**：v1.8.8 的四輪物理核心、底盤受力、ESC、鍵盤轉向、五項固定測試腳本；手機最佳化仍延後。
- **已測試**：92 項單元/Chromium 程式測試中 90 通過、2 跳過；真實 Rapier WASM／WebGL 待使用者複驗。

---

# v1.8.8 — 單頁桌面網頁駕駛 + 左右轉修正

- **修正**：3D 世界 +Z 車頭方向與 Three.js chase 視角的 X 軸水平投影不一致，致 A/D 及搖桿的畫面左右顛倒。只在 UI-to-core bridge 校正，不更動輪胎力、車身力矩和 Rapier 剛體。
- **整合**：玩家只需進入 3D 頁面；舊 2D 控制頁改為歷史測試資料與不可見計算引擎，合併車型／路況／ABS／TCS／ESC／駕駛輔助等控制。
- **網頁優先**：根目錄只提供單一 3D 導引；一鍵 Windows/Unix 本機啟動與正式靜態網頁發佈腳本。
- **可用性**：可收合監測、車型重置、控制設定記憶、QA 與玩家設定隔離。
- **驗證**：84 項回歸測試（82 pass、2 optional skip），且底層車輛求解器與 3D 碰撞程式與 v1.8.7.2 位元相同。
- **限制**：本環境沒有 npm registry 連線，尚無實際 v1.8.8 3D/WebGL WASM 重新驗收或 production dist build。

---

# v1.8.7.2 — Force lifecycle and stationary stability candidate

- Rapier forces and torques now reset per physics microstep and during scene teleports.
- 3-second stationary mock-dynamics regression: 1,440 successful force/torque clearing cycles.
- Added current-step external force/torque monitoring and force-lifecycle grading.
- Full suite stops on stationary failure, avoiding invalid high-speed results.
- Legacy wheel/transmission HTML unchanged; actual browser/Rapier WASM validation still pending.

---

## v1.8.7.1 (2026-10-21) — Desktop 3D hotfix (browser re-acceptance pending)

- Fix invalid `hit.toi` access: Rapier 0.18 `RayColliderHit` reports `timeOfImpact`; invalid/missing rays cannot produce silent NaN wheel normal forces.
- Track suspension ray hits, invalid load samples and time with wheel contacts in QA; tighten stationary/ramp gates.
- Test-only transverse barrier and ramp are now created only when the matching scenario is loaded; free drive is no longer blocked 34 m ahead.
- Add clear one-click free drive, canvas keyboard focus, paused-state recovery, quick assisted engine/clutch/gear option; retain full original manual driving mode and physics solver.
- Full inherited source/regression test suite passes with original optional authentic data skips, but real Rapier/WASM/WebGL acceptance must be run again on a desktop browser.

# SHIFT//LAB V1.8.6 — Desktop handling, roadway collision and experimental 3D bridge

- ESC intervenes on centered steering/undesired yaw; split-μ braking trim on high-adhesion side adds yaw control while preserving ABS wheel-lock pressure logic.
- 1.65 rad/s yaw hard ceiling removed; tire solver stays force/moment based even through low-longitudinal-speed spins; emergency numerical guard widened.
- Keyboard opposite-lock response improved and analog stick center hysteresis added; historical keyboard/gamepad calibration and manual shift workflow retained.
- Selectable post-peak tire recovery in balanced/sport/raw modes, without increasing the tire force peak or bypassing friction-combined-force caps.
- Original 2D Canvas simulator road barriers now use geometric rigid-body *planar impulse*, not speed/yaw multipliers.
- Optional `desktop3d/` Vite/Three/Rapier single-authority vehicle adapter with static road meshes, 3D guardrail colliders, four spring raycasts and Rapier CCD. **Experimental: runtime dependencies unavailable for local browser validation.**
- Desktop only. Phone UI, touch and mobile performance work deferred.
- 61 inherited+new software tests; 59 pass and 2 optional original MAT-data tests skip.

---

# SHIFT//LAB V1.8.5

- New gasoline combustion vehicle **BMW M235i** original CAN source analysis and structured holdout benchmark, compared with a simple baseline. The 0.10s-lag training-selected model **underperforms** the no-lag baseline on untouched BMW data.
- Confirmed independent Ford Fiesta Titanium IO-VNBD source has steering, engine rpm, gear, clutch and yaw but CSV files require Git LFS; no fabricated Ford fitting.
- Validated P1 six 500Hz source sessions' wheel-normal-load channels and found **0/6 runs passed** paired positive-load quality gate. No fitting from unverified Fy/Fz/Mz.
- V1.8.5 read-only in-game benchmark and developer-accessible source metadata; no drivetrain, tire, suspension, ESC, keyboard, gamepad or physics integrator changes.
- Reproducible Python tools, exact source hashes, licensing caveats, chart/QA updates.

## v1.8.7 (2026-10-21) — Desktop 3D collision acceptance beta

- Added real-3D-browser acceptance UI, static transverse barrier/ramp, deterministic collision presets, finite-state/impulse/penetration gates, full-suite button, CSV-free JSON export, and Playwright browser automation entrypoint.
- Fixed missing gamepad mapping dropdowns in v1.8.6 Three.js host, included run helpers, updated relative static asset paths.
- Zero changes to inherited four-wheel physics and standalone offline driver; v1.8.6 root `index.html` remains identical.
- All 71 source/regression tests complete: 69 pass, 2 original-data skips; actual Vite/Rapier WASM browser test is blocked by offline npm registry and remains pending.
