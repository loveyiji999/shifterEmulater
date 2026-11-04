# SHIFT LAB v1.8.8 · 整合式 3D 網頁駕駛

**開發目標：** 將原本 2D 與 3D 兩套可見操作介面統一為一套 3D 網頁、修正左／右轉向顛倒，保留 v1.8.7.2 的碰撞與四輪物理功能。手機最佳化仍延後。

## 直接開始（Windows 桌面）

1. 解壓縮本專案 ZIP，**關閉舊版 Vite 終端機**，避免仍開啟 v1.8.7.2。
2. 已有 Node.js 22+（或 20.19+）的電腦，雙擊根目錄的 **`START_WEB_WINDOWS.cmd`**。
3. 第一次會自動 `npm install`，需要連線 npm。安裝完成後會啟動 Vite HTTP 服務並開啟 Chrome／Edge 的 **`http://127.0.0.1:5173/`**。
4. 點「開始自由駕駛」，按 **W** 加速、**S** 煞車、**A** 左轉、**D** 右轉；也支援方向鍵和手柄。快速駕駛預設自動輔助發動／換檔，原本手排仍保留。

macOS/Linux：執行 `sh START_WEB_UNIX.sh`（或 `cd desktop3d && npm install && npm run dev`）。

**這仍是純網頁遊戲：** 玩家操作都在 Chrome / Edge 的 **單一 3D 頁面**中，不需要安裝原生遊戲程式。開發包第一次啟動需要 Node/npm 以提供本機 HTTP 伺服器；無法直接以 `file://` 雙擊 HTML 載入 ES modules 與 Rapier WASM。

## 部署到正式網站（玩家不需 Node/npm）

進入 `desktop3d/` 後執行：

```sh
npm install
npm run build
```

把 `desktop3d/dist/` 裡面的完整內容部署到任何支援靜態網站的 HTTPS 伺服器（例如一般 CDN/靜態主機）。**玩家只需要瀏覽器及遊戲網址**；不需安裝 Node、npm、Vite 或用兩個頁面操作。Vite 使用相對 `base:'./'`，可發布在子路徑。伺服器必須正確提供 JS 與 `.wasm` 靜態資產。

**本交付環境無法下載 npm，尚未產生真實 build 後的 dist，也尚未對新版執行實際 Rapier WASM/Three.js 3D 畫面驗收。** 開發原始碼及一鍵啟動／發佈腳本已包含。v1.8.7.2 的五項測試通過是使用者先前回報的基準；v1.8.8 需要獨立複驗。

## 統一操作面板

- **3D 駕駛**：鍵盤、手柄、快速／手排、ESC、輪胎抓地手感、鏡頭和檔位
- **車輛設定**：標準／城市／渦輪車型、乾地／濕地／雪／冰、ABS/TCS、操控平衡、煞車比例、轉向特性
- **測試與數據**：正面撞擊、斜角擦撞、CCD 高速、坡道與靜止穩定共五項，保留 JSON 匯出、碰撞監測與數據面板收合

所有設定都在 `desktop3d/index.html`，不需要開啟根目錄舊的 2D 頁面。舊計算核心位於 `desktop3d/public/physics.html`，會被**不可見**的 iframe 載入；它不是第二個玩家操作介面。舊版完整畫面只在 `archive/legacy/shiftlab-2d-reference.html` 保留為回歸測試資料。

## 改版說明與測試

- `archive/releases/V188_IMPLEMENTATION.md`：轉向座標修正、介面整合、風險與設計限制
- `archive/releases/V188_QA.md`：已完成的測試／實際 3D 待驗證項目
- `archive/patches/V1.8.7.2_to_V1.8.8.patch`：原始碼差異

```sh
sh tests/RUN_V187_QA.sh
cd desktop3d && npm run qa:scenarios
```

不包含真實地圖、網路同步、多玩家服務或手機最佳化；輪胎參數仍是娛樂級擬真模型，不是實車安全驗證。
