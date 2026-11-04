# V3 道路規劃知識庫

2026-10-28 依使用者要求先建立知識庫，再進行立體道路V3完整開發。本庫以正式機關文件為主；不恢復任何已刪除的現實城市地圖或圖資。

## 使用方式

1. 從 [來源清單](catalog.json) 查機關、版本、閱讀狀態與範圍，再讀 `sources/` 中的卡片。
2. 來源結論（S編號）、專案推論及當次實測分開記錄。`metadata_only` 不可作為數值依據；索引段落不能冒稱全文審閱。
3. 先看 [V3需求與驗證矩陣](REQUIREMENTS.md)，再變更生成、結構、路面或碰撞程式。

| 主題 | 來源卡片 |
| --- | --- |
| 臺灣現行規範目錄 | [TW-ROAD-2026](sources/TW-ROAD-2026.md) |
| 平縱線形與過渡 | [ALIGN-FHWA](sources/ALIGN-FHWA.md) |
| 平面交叉 | [JUNCTION-FHWA](sources/JUNCTION-FHWA.md) |
| 橋梁與淨空 | [BRIDGE-CDOT-2026](sources/BRIDGE-CDOT-2026.md) |
| 隧道設計背景 | [TUNNEL-FHWA-2009](sources/TUNNEL-FHWA-2009.md) |
| 隧道淨空定義 | [TUNNEL-NTI-2015](sources/TUNNEL-NTI-2015.md) |
| 懸索橋構件 | [SUSPENSION-WSDOT](sources/SUSPENSION-WSDOT.md) |

官方頁面／PDF可讀範圍、過時內容與工具存取限制均已列入卡片。沒有重製整份第三方文件，也沒有把美國轄區數值說成臺灣規定。

## 實作對照

- [V3設計值、幾何求解與適用邊界](DESIGN.md)
- [需求與驗證矩陣](REQUIREMENTS.md)

相關先期研究：[道路材質與環境建模](../road-environment/README.md)。
