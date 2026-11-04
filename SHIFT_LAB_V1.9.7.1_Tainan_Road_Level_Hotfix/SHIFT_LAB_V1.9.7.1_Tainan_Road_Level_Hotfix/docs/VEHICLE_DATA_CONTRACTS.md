# 車輛、調教、外觀與表面資料契約

日期：2026-10-28。屬於建置書 P0 的實作規格；玩家工具與安全套用仍按 P4／P5 推進。

## 資料邊界

| 文件 | 實作 | 責任 |
| --- | --- | --- |
| `shiftlab.vehicle.v1` | [vehicle-definition.mjs](../desktop3d/src/vehicle-definition.mjs) | 讀取四預設的有效核心參數、SI 單位、座標、掛點、現有程序車身及碰撞描述 |
| `shiftlab.tuning.v1` | [tuning-profile.mjs](../desktop3d/src/tuning-profile.mjs) | 以覆寫保存調教；綁定基準車 ID、revision 與參數 fingerprint，不保存瞬時速度、檔位或輪荷 |
| `shiftlab.appearance.v1` | [appearance-assembly.mjs](../desktop3d/src/appearance-assembly.mjs) | 塗裝槽、受約束的尺寸、部件掛點、貼紙、資產版號與來源，以及質量／碰撞影響聲明 |
| `shiftlab.surface.v1` | [surface-definition.mjs](../desktop3d/src/surface-definition.mjs) | 10 類材質、6 種狀態，分開 PBR 與接觸參數；綁定實際 collider／face／layer |

純資料讀取共用 [design-data.mjs](../desktop3d/src/design-data.mjs)：限制文字、深度與項目數，拒絕非有限數、存取器及原型危險鍵；不執行匯入內容或下載外部參照。fingerprint 用來偵測基線改變，不是密碼學簽章。

既有 `shiftlab.v189.settings`、`shiftlab.v189.procedural-map` 及 V1／V2／V3 地圖讀取不變。新契約目前不會寫入這些儲存鍵，也不會將舊偏好靜默轉成新格式。

## 調教準備與安全套用

`makeTuningProfile()` 從已驗證的基準建立空覆寫；`readTuningProfile()` 驗證文件，`prepareTuning()` 回傳完整候選車輛、變更差異及套用要求。準備成功或失敗都不會更動原車輛、核心 `P`、剛體或儲存資料。

| 套用類型 | 目前欄位 | 後續宿主必須完成 |
| --- | --- | --- |
| `live` | `frontBrakeBias`；無變更也屬此類 | 使用原本煞車比例入口同步 UI；不能繞過驗證 |
| `reset` | 齒比／終傳、彈簧／阻尼／行程、防傾、輪胎抓地比例、煞車力、既有差速鎖定參數 | 確認停車，經原機械流程與重置建立一致狀態 |
| `rebuild` | 質量、慣性、輪徑、軸距輪距、重心與前軸靜荷比例 | 確認停車；準備輪組、碰撞與剛體，在全部成功後共同替換；失敗保留原車 |

候選軸距與輪距會一起更新輪組掛點、既有車身長度與簡化 hull。沒有實作宿主交易套用、重新計算慣性或玩家工具之前，不可僅把候選 `physics` 指派給核心便稱為完成。P4 必須驗證上述實際行為與復原。

目前保留 FWD 與六前進檔。齒比需包含倒檔、N 和六個遞減前進比，拒絕新增第七檔、直接寫入 `gear`、`velocity` 等瞬時狀態。`TUNING_RULES` 中的範圍是初期遊戲數值驗證包絡，不是車廠限制或工程安全認證；實際可用範圍仍需 P4 動態驗證。

相同車型但基準參數改變（例如切換參照校準）會使舊調教與外觀綁定失效。需明確遷移或重新建立，不允許默默套到另一組數值。

## 外觀與資產

車輛共用座標為右 `+X`、上 `+Y`、前 `+Z`，模型原點為車身質心。資產另記 `metersPerUnit`、`upAxis`、`forwardAxis`，必須在 P5 匯入時轉換，不能假定任意模型都符合本遊戲座標。

支援的掛點標識為車身、前後保桿及 FL／FR／RL／RR；同一掛點不能重複占用。每個部件聲明質量增量與 `cosmetic-within-hull`／`rebuild-hull` 規則。變更尺寸、質量或碰撞影響會要求重建剛體，不能只修改畫面。

目前契約保存車身材質槽的色彩、roughness、metalness；貼紙保存受長度限制的文字與 UV 位置。尺寸控制限制在原型的 0.8–1.2 倍。這是資料契約，尚未完成塗裝顯示、部件掛載、貼紙烘焙、車身網格編輯或作品管理 UI。

資產以本機 `.glb` 檔識別；拒絕 URL、路徑穿越與外部程式。記錄來源、作者、授權聲明與版號。初期每組外觀的保守包絡為 250,000 vertices、150,000 triangles、32 MiB 檔案、16 張不超過 2048×2048 的貼圖及 24 個部件；合計也要檢查。這不是性能已達標證明，P3 實測後才定案。

目前只檢查資產宣告。P5 還必須解析實際 GLB，核對檔案長度、幾何、貼圖與外部參照，預覽後驗證 UV／LOD／碰撞與慣性。匯入檔內自行宣告的小面數或合法授權，不足以證明實際資產符合限制。

## 表面資料與通行資格

材質／狀態 ID 對應現有知識庫分類；研究 JSON 仍維持 `documentation_only`，沒有直接匯入遊戲。PBR 的色彩、roughness、metalness 與公尺尺度 UV，和 `tireMu`、rolling coefficient、剛體摩擦各自保存，不互相推算。

`contact:null` 或 `candidate` 必須維持 `preview-only`，不可行駛發布。`requireDrivableSurface()` 除了檢查數值與狀態，也要求宿主內部受信任表面登錄表中的完整 fingerprint；匯入檔自行寫 `verified-gameplay` 不會取得通行資格。登錄表由後續實際校準／通行驗證建立，不能從匯入檔直接接收。

`legacy-illustrative` 明確表示沿用既有示範數值；`measured` 需另外保留來源證據。契約不會把未知材質補成乾燥瀝青。每輪依命中 collider、face 與道路 layer 查詢的整合，以及材質邊界的物理驗證，仍屬 P2。

## 驗證入口

在 `desktop3d` 執行 `npm.cmd run qa:vehicle`。新增的 `validate-design-contracts.mjs` 使用核心的真實四預設 × 兩種校準模式，檢查差異、套用模式、掛點更新、基線失效、輸入錯誤、預覽材質限制與資產包絡。這些資料驗證不能代替 P4／P5 的實際玩家套用、模型創作及行駛驗收。
