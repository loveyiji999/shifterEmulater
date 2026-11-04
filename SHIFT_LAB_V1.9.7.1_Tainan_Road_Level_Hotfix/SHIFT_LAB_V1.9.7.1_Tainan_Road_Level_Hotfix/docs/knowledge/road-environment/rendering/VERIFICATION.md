# 渲染前置知識驗證

日期：2026-10-28（Asia/Taipei）。本輪為前置研究及文件整理，未實作新渲染器、地形或材質。

## 檢查方式

以PowerShell UTF-8管線執行`python -X utf8 -`，檢查JSON、來源卡片、閱讀範圍、本機連結、10場景計畫、未量測欄位及既有檔案SHA256。結果全部PASS：14來源卡片、10個不重複場景、48個有效本機引用；實測結果保持空值；160個遊戲、研究與封存檔案hash保持不變。

## 研究範圍

14份新增第一手技術來源均讀取指定段落；卡片標明閱讀範圍與限制，未宣稱全文審閱。舊GPU Gems的DirectX特性與硬體FPS僅作方法背景，不作WebGL2能力或本專案速度證據。原有16份材質與造景來源保持原目錄與狀態。

本機Three.js 0.180.0唯讀核對WebGPURenderer的forceWebGL／fallback、KTX2Loader的支援偵測與worker設定、WebGLInfo計數、compileAsync及PMREM相關方法。線上文件可能較新，不把宣告存在當成整合成功。

## 變更位置

新增`docs/knowledge/road-environment/rendering/`，並更新知識庫索引、材質環境README／INTEGRATION、`docs/AGENT_KNOWLEDGE.md`與`docs/DATA_CATALOG.md`，記錄環境渲染優先於賽事。原有文件備份與受保護檔案hash位於`C:/Users/jho/AppData/Local/Temp/shiftlab-rendering-knowledge-mx8zhx7g/`。

工作目錄不是Git repository；未commit、push、部署或發布。未新增production dependency，未把第三方全文、模型、貼圖或現實圖資存入專案。

## 未量測項目

本輪沒有執行瀏覽器GPU benchmark、畫質截圖比較、遊戲建置或物理回歸。量測計畫的results為空、每場景result為null；硬體、解析度、記憶體與幾何誤差門檻仍待基線確認。60fps及時間配置為測試提案，不能當成已達成成績。歷史SwiftShader功能驗證不代表原生GPU效能。
