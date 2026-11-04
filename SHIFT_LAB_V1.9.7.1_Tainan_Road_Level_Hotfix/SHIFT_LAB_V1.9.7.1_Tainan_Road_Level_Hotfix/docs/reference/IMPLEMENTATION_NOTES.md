# Engineering Implementation — V1.8.5

## Real BMW recorded gas car: measured signal benchmark

Input columns `Seconds`, `Speed (MPH)`, `Steering Angle`, `Lateral Gs`. Raw units are deliberately preserved until conversion; x and y use `speed * 0.44704` and `latG * 9.80665`. Steering angle degrees converted to radians. The CAN file is indexed from first recorded timestamp. Asynchronous sampling is supported by interpolation of **earlier** measured steering, not using future steering values in each evaluated prediction.

Fit target `a_y(t) = b + k * (v(t)^2 * steering(t - lag)/(1 + c*v(t)^2))` on measured examples exceeding 5 m/s. Train 0–185s, embargo 185–205s, holdout 205–342s. Predeclare 10 `lag` and 6 `c` values (60 candidates), minimize training RMSE only. Comparison baseline uses no lag/no saturation. Output is computed by the fully published `validate_bmw_m235i.py`; never use holdout points for selection.

**Important:** This model's steering coefficient is a compound response that contains unknown steering ratio and understeer/roll/sensor terms. Do not interpret its `k` as the published tire stiffness or as a direct `P.cornerStiffFront` replacement. The source lacks independently measured yaw rate and mechanical steering geometry.

## Source quality gate: P1 wheels

Load original SHA256-pinned Bucknell MAT matrices and check explicit signal group `15 Wheel Forces`, Fz columns at zero-based offsets 127/135 (from 145 total). A necessary, conservative paired-load plausibility gate requires both front normal loads to exceed 15% of the approximate static front-wheel force in at least 65% of downsampled original measurements. P1 mass 1,724kg, CG front/rear 1.35/1.10m. All 6 recordings fail; **do not use wheel force channels to fit tire combined-slip or pneumatic trail** until source calibration/axis sign has been confirmed.

The gate does not prove transducer malfunction; offset, sign, sensor placement, missing calibration or labels may explain it. It is intentionally fail-closed. The rest of the V1.8.4 measured yaw/ay model remains available for research.

## Software compatibility

Added only an immutable JS reference object in the original inline IIFE and a nested `<details>` read-only panel under Vehicle setup. No `P` physical parameters, tire force formulas, steering input curves, data persistence formats or replay schema were changed. The new exported debug reference is `window.__SHIFT_LAB_DEBUG__.V185_GASOLINE_VALIDATION`.

## Reproduction and copyright

Original third-party measurement matrices or CAN CSV are intentionally excluded from the ZIP because public read access is not equivalent to commercial re-distribution permission. BMW file must match exact Git SHA1 before processing. P1 recordings must match the 6 SHA256 digests pinned in the inherited `fit_p1_real_runs.py`.
