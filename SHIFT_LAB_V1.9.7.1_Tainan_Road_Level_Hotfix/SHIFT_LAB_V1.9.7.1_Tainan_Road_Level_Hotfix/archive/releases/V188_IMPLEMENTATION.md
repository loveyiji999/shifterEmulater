# v1.8.8 工程實作紀錄

## 1. 左右轉方向修正

原先的四輪力學採用 **+Z 車頭前方、+X 車體右方、正偏航往 +X** 的平面座標，而 Three.js 的 chase camera 從車後沿 +Z 觀察、up=+Y，觀看投影的畫面右方實際為 **世界 −X**。因此畫面左右相對物理核心的正號顛倒。

`desktop3d/src/steering-input.mjs` 提供唯一的輸入邊界轉換：

- 左鍵 A／← 輸入，在核心轉為舊版的 `d`；右鍵 D／→ 轉為 `a`。
- Xbox/標準搖桿水平軸同樣反相；保留額外反轉開關，供硬體不一致時調整。
- 監測 HUD 的左右顯示從 **畫面視角** 出發，而不是直接使用核心方向符號。
- W/S、手排、ABS/TCS/ESC、四輪 `fxBody/fyBody`、yaw moment、Rapier `addForceAtPoint` **完全不變**。

這是現階段**最小範圍且有回歸測試的修復**，避免對已通過的車身懸吊與碰撞重新做風險較高的全世界座標反射。後續若進入多人同步／全球地圖，建議正式建立左／右手座標轉換介面並以獨立測試覆蓋。

## 2. 單頁網頁版

玩家入口只有 3D：`desktop3d/index.html`。專案根目錄 `index.html` 是導引頁，不再直接執行第二套 2D 介面。`archive/legacy/shiftlab-2d-reference.html` 只供測試。`desktop3d/public/physics.html` 以隱藏 iframe 提供成熟的原有四輪引擎 API；**單一權威位置／速度／碰撞仍由 Rapier 決定**。

已在 3D 頁合併下列原有控制：三車型、四種路面摩擦條件、ABS、TCS、ESC、輪胎極限、操控平衡、煞車分配、轉向曲線；新增設定記憶、車輛切換重置與監測面板收合。

**驗收模式與玩家設定隔離：** 五項自動驗收使用標準車、乾地、ABS/TCS 開啟、標準操控與標準煞車分配；自由駕駛使用玩家在整合頁面設定的車型及抓地條件。避免前一項玩家調校污染碰撞測試結果。

## 3. 瀏覽器交付

桌面 Windows `START_WEB_WINDOWS.cmd` 可一鍵建立或使用本地依賴、啟動單一 Vite 網頁服務並開啟瀏覽器。`scripts/distribution/PUBLISH_WEB_WINDOWS.cmd` 可建立正式靜態網站。部署 `desktop3d/dist/` 後，終端玩家僅透過網頁網址進入。

技術條件：WebGL2 + WASM；ES modules 必須透過 HTTP(S)，不能把未打包的 `index.html` 視為直接可用的 `file://` 單檔遊戲。

## 4. 本版沒有更動

`desktop3d/src/chassis.mjs`、`road.mjs`、`obstacles.mjs`、`scenarios.mjs` 及 `desktop3d/public/physics.html` 與 v1.8.7.2 **位元相同**。因此底層剛體能量守恆、外力清除、碰撞工況不是本次重新調整的目標。

## 5. 仍需在玩家機器確認

A/D 在追尾鏡頭正確左右、手柄水平搖桿同向；所有五項碰撞工況通過；自由駕駛 10 分鐘以上沒有非預期重置／輸入焦點遺失；切換車型後四輪接地與車體碰撞穩定；WebGL2 / Rapier WASM 在 Chrome 與 Edge 均能載入。這些未在目前的離線套件環境完成實際 3D 瀏覽器驗收。
