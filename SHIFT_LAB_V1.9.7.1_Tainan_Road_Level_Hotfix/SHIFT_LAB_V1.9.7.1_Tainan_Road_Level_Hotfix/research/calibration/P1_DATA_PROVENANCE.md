# Source lineage and licensing notes

## Primary institutional source

- Bucknell P1 Garage: https://www.projects.bucknell.edu/Beal_Automotive/
- This university page explains P1's two independent rear drive motors, independent front steering and MEMS/GPS fusion to 500Hz. It links actual MATLAB vehicle test files and a parameter file.
- Six included benchmark cases (with their exact Google Drive IDs) are enumerated in `fit_p1_real_runs.py` and pinned by SHA256 in `results/p1_source_manifest.json`.
- Each source is a full MATLAB v5 `.mat` downloaded from a verified institutional link (not inferred from a paper figure), identified by the `info` and `DataDescription` internal structs. Data are never silently synthesized.
- An additional three real `.mat` records were inspected this session (2018/08 low-friction and 2019/06 stationary tests). Their experimental regimes do not provide an equivalent validated comparison for the chosen two-DOF model, so they are not included in the seven benchmark windows.

## Published P1 geometry discrepancy (important)

Institutional table: `m=1724kg, Iz=1300 kg*m^2, a=1.35m, b=1.10m, Cf=75000N/rad, Cr=135000N/rad`.

Its linked MATLAB parameter script (`p1_params.m`, SHA256 `da94d8ae54d6b73cc6d58864f72e92972317d82fd79642f8f83b8a849799c760`) states `b=1.15m` and indicates Iz and lateral stiffness were estimated from earlier fitting. The script contains historical 2008/2010 tire-setting comments. It is not proof of the specific test vehicle's 2018 setup.

The 5cm change in CG-to-rear geometry moves the fitted common tire stiffness multiplier from 0.822631 to 1.000144. The tanh effective saturation parameter stays near 0.875. See `results/p1_geometry_sensitivity.json` and chart. **Do not claim the absolute 2018 physical tire stiffness is identified.**

## Real data interpretation

- Original sample rate 500Hz; 50Hz used for fitting after subsampling.
- `y[:,12]` INS yaw (rad/s), `y[:,70]` SSest forward CG speed (m/s), `y[:,73]` SSest CG lateral speed (m/s), `y[:,75]` processed SSest CG lateral acceleration (m/s2), `y[:,100]` derived equivalent Ackermann steering (rad).
- SSest signals combine inertial/GPS and model-based state estimates. They are **not guaranteed independent ground truth**. Correlations and low RMSE must not be framed as performance against fully independent raw sensors.
- Steering uses measured front road-wheel angle, not driver's handwheel intention. Consequently these fits do not validate V1.7 keyboard/gamepad mapping or V1.6 steering-rack actuation.
- Missing from surrogate: longitudinal engine/brake force generation, roll/pitch/heave, road bank, nonlinear left/right wheel contact and thermal phenomena.

## Licensing

The university public Drive share permits retrieving records but the web page does not specify a commercial data redistribution license. No original university `.mat`, institutional MATLAB `.m`, or high-resolution recorded input trajectories are shipped in the offline game package. We include only locally derived aggregate RMSE, source checksums, model-fitting code and original plots. Contact the data holder to confirm if any commercial reuse of individual records or model extraction is planned.

## Reproduction/identity checks

- `python research/calibration/get_public_p1.py --out DIR --all` (requires optional gdown).
- `python research/calibration/fit_p1_real_runs.py --source-dir DIR ...`; aborts on source SHA256/schema mismatch.
- `p1_source_manifest.json` contains original file IDs, sizes (via sample count), exact hashes and the physical channel mappings.
- Data timestamps and sensor units are checked; model windows were fixed before fitting, with no holdout-driven retuning.
