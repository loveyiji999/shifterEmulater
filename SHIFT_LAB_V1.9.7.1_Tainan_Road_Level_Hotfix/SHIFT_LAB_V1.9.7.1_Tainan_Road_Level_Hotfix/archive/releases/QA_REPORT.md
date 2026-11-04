# 當次驗證

2026-10-28 的命令與結果見 [docs/AGENT_VERIFICATION.md](../../docs/AGENT_VERIFICATION.md)。以下僅保留車輛與種子地圖的歷史紀錄。

# 當前發行版：v1.8.9.3

最新 PRND、倒車／前進、坡道駐車及實機待驗範圍，請優先查看 `archive/releases/V1893_QA.md`。以下保留 v1.8.9.2 的歷史品質紀錄，不代表 v1.8.9.3 已完成 Rapier WebGL 驗收。

---

# v1.8.9.2 Stability Integration Gate (2026-10-21)

- **SOURCE QA PASSED**: segmented legacy and new Python/Chromium suites: 103 cases (101 PASS, 2 SKIP for unavailable raw measurement data). Node tests: all nine validation scripts PASS. Original four-wheel iframe core and manual Settings shift pass in Chromium.
- **NATIVE WEBGL GATE UNVERIFIED**: npm package registry DNS error `EAI_AGAIN` blocked installing Rapier/Three/Vite. Consequently no `npm run build`, full 3D acceptance or 30-minute endurance evidence was generated in this environment.
- **Release classification**: v1.8.9.2 source-complete stability candidate, NOT a fully browser-accepted production build.
- Detailed evidence and manual acceptance commands: `archive/releases/V1892_QA.md` and `archive/legacy/browser-tests/browser_v1892.py`.

---

# SHIFT//LAB V1.8.5 — Data and compatibility QA

## Genuine gasoline-car source

- BMW M235i original CAN CSV was read and numerically processed via GitHub connector in this conversation; source git SHA1 `9fb7b829265b9e94a09bbc188740dd7d350b0245`.
- 4708 original rows / 341.99s. No invented observations; model split was chosen before tuning.
- Train 1411 rows / holdout 1357 valid rows with 20s temporal gap; speed >5m/s. 60 model combinations are fitted **only on train**.
- Zero-prediction holdout RMSE: **0.69340 m/s²**.
- Static no-lag `v²*steer` holdout RMSE **0.40154 m/s²**, R² 0.664.
- Training-selected delayed nonlinearity holdout RMSE **0.40488 m/s²**, R² 0.658. **WORSE** than the simple no-delay model; failure visible in game panel and exported metrics.
- The connected tool read the entire CSV, but local artifact runtime has DNS blocked. **Do not claim the new Python downloader was executed against full BMW original in the local container**. It is provided for reproducibility on a network-enabled computer; its offline validation, checksum guards and math routines are unit-tested.

## Bucknell P1 raw MAT source check

- All 6 original 500Hz files processed locally after pinned SHA256 verification.
- Both-wheel Fz load plausibility gate: **0/6 passes**. Raw source sensor zero/sign/calibration ambiguity blocks direct transfer of empirical Fy/Fz tire coefficients.

## Ford Fiesta Titanium source check

- Published 2021 Data in Brief paper and original repository document vehicle CAN fields, including engine rpm, gear and clutch position.
- Repository individual CSVs are Git LFS pointer text rather than original observations; no Ford real fit claimed. Exact gasoline engine/gearbox specification not verified.

## Functional integrity

- V1.8.4 2DOF P1 calibrated surrogate and V1.8.3 sensor benchmarks remain unchanged in model functions.
- Runtime game wheel/steer/drivetrain physics parameters remain unchanged. Existing V1.8 reference calibration toggle OFF by default.
- Browser and data QA counts will be filled after running tests. Historical 900+ test suites from V0.4–V1.8 are **not** claimed in V1.8.5 unless rerun.
- The source archive will be ZIP-verified, patched back to V1.8.4 and checked for original raw-file exclusion.

## Executed final QA

- **51/51 total targeted suites**: 12 V1.8.3 + 20 V1.8.4 + 19 V1.8.5, zero failures.
- `P1_RAW_DIR=/mnt/data` explicitly enabled original-file tests for six institution-source MAT recordings. Raw files passed SHA256 checks and the intentional P1 force-channel quality rejection.
- All new Chromium desktop/mobile checks passed, including no horizontal overflow, preserved game debug functions and read-only source data panels.
- Source parity: V1.8.4 → V1.8.5 JS differences consist solely of the new frozen measured-reference object and debug export; no tire, suspension, steering rack, powertrain, replay or input physics algorithm changed.
- BMW published raw content was read using connected GitHub API and processed with deterministic JavaScript; the shipped standalone Python utility was not run on the full remote BMW raw source inside the DNS-restricted artifact container. Its numerical helper functions and checksum rejection were unit-tested.
