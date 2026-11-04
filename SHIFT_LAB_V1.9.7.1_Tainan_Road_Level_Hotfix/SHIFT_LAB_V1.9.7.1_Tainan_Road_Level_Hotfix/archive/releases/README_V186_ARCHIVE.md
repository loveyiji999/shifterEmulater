# SHIFT//LAB V1.8.6 — desktop driving physics and experimental Three.js / Rapier bridge

**This release adds actual gameplay-physics changes to V1.8.5.** ESC now intervenes during unwanted straight-line yaw and coordinates high-friction brake pressure on split-μ surfaces. The legacy 1.65-rad/s yaw clamp is removed, keyboard/gamepad steering is revised, configurable post-peak tire recovery is provided, and the standalone HTML uses impulse-based planar guardrail contacts.

## Start the desktop offline game (fully self-contained)

Open the top-level `index.html` in Chrome or Edge. No internet, package manager or local server is needed. The handling section has `均衡 / 靈敏 / 原始物理` tire limit tuning and an optional ESC switch (still OFF by default in the inherited test UI for comparison). If you want more forgiving driving, select ESC ON.

## Optional Three.js / Rapier desktop preview (experimental)

See [`archive/releases/V186_DESKTOP_IMPLEMENTATION.md`](V186_DESKTOP_IMPLEMENTATION.md). The Vite host in `desktop3d/` renders real WebGL geometry, streams procedural 3D road colliders and uses a dynamic CCD-enabled Rapier body. It steps the **same** in-page SHIFT LAB wheel, tire and manual drivetrain solver as a source of forces, applies those forces at four wheel-contact points, then imports Rapier pose and speed; it never integrates the vehicle twice.

Run from a network-enabled PC with Node 20.19+ or 22+:

```sh
cd desktop3d
npm install
npm run dev
```

**Testing caveat:** Network access to npm is unavailable in this creation container; the 3D browser runtime and Vite production build were not exercised here. The new integration is a source-complete, syntax-checked experimental prototype, not an approved production 3D vehicle implementation. The offline standalone version *was* runtime tested in headless Chromium.

## QA

`sh tests/RUN_V186_QA.sh` — 61 tests: 59 passed, 2 source-data skips. See [`archive/releases/V186_DESKTOP_QA.md`](V186_DESKTOP_QA.md). The simulated split-μ full-braking scenario shows yaw-rate reduction from 1.070 to 0.359 rad/s with ESC ON after 1.2 seconds; this is not real-car validation.

## Inherited measured-data research

All V1.8.5 BMW and Bucknell read-only research results, provenance, calibration scripts and quality gates are preserved. The addition of post-peak tire tuning does not imply real BMW tire coefficients or an empirical ESC fit. Do not use the simulated dynamic QA as real-car evidence.

---

## Archived V1.8.5 readme

# SHIFT//LAB V1.8.5 — gasoline measurements and data-quality gates

V1.8.5 preserves the stand-alone HTML driving simulator, with all four manual-car models, keyboard/gamepad driving, 480-Hz four-corner vehicle model and V1.8.4's Bucknell P1 research baseline. It adds a **read-only** evidence panel under **Vehicle setup → V1.8 reference calibration → V1.8.5 gasoline**. The physical integrator and default vehicle parameters are deliberately unchanged.

## What we actually validated

**BMW M235i gasoline**, [cloudpose repository](https://github.com/cloudpose/smartphone_driving_dataset): real CAN measurements, April 8, 2018, 4,708 rows / 341.985 seconds. Steering angle, speed, accelerator, RPM and longitudinal/lateral acceleration. Full dataset read directly from the repository through a connected GitHub file service. Source blob SHA1 `9fb7b829265b9e94a09bbc188740dd7d350b0245`. Data was *not* reproduced from charts, nor fabricated. We tested only an input-to-lateral-acceleration **surrogate**, not the SHIFT//LAB full-car model.

Data processing: mph→m/s; g→m/s²; degrees→radians; reject speed ≤5m/s; use time 0–185s for training, 185–205s excluded, and 205–end for untouched holdout; 1,411 valid training rows, 1,357 holdout rows. Predeclared grid: 10 candidate steering delays × 6 speed saturation terms = 60. Calibrated linear gain and offset selected by **training data only**. Model `ay = intercept + k*v²*steering(t-lag)/(1+c*v²)`. Final holdout: zero prediction 0.69340; no-delay static v²×steer 0.40154; training-selected 0.10s lag/c=0.002 0.40488 m/s² RMSE. Complex model **does not generalize better**. We do not promote either coefficient to a real-world tire or EPS part number; steering angle is not confirmed as a measured road-wheel angle, and the recording has no independent yaw-rate channel.

**Ford Fiesta Titanium**, [IO-VNBD](https://github.com/onyekpeu/IO-VNBD): researched and confirmed the source schema for steering, yaw, wheel speeds, engine rpm, gear, clutch and throttle. The repository's individual full CSVs are Git LFS pointer files. They could not be obtained as verified full measurements within the current execution session. The exact experimental engine fuel type and manual/automatic transmission variant also were not established. Therefore Ford is a **future full-vehicle-validation candidate**, **not** in the new measured fit metrics.

**Bucknell P1**, original SHA256-verified measured 500Hz MAT recordings: additionally audited front wheel force sensor plausibility in six sessions. Both front normal-load channels cannot be confirmed as simultaneously valid; a labelled force sensor channel can have missing calibration, offsets or incompatible conventions. This prevents scientifically reliable four-corner tire-force estimation from those channels at present. Check `research/results/p1_force_channel_quality.json` and `research/results/p1_force_quality_gate.png`.

## Quick start: run the offline game

Open `index.html` in Chrome or Edge. No network and no Python needed. Open **車輛設定 → V1.8 公開資料參照校正 → V1.8.5 汽油車實測驗證**. The benchmark is read-only; the previous vehicle-data reference toggle remains OFF by default.

## Reproduce the studies (optional, Python)

```
python -m pip install numpy scipy matplotlib numba
python calibration/validate_bmw_m235i.py --download --out results/bmw_reproduced
python calibration/validate_p1_force_channels.py --source-dir /path/to/original_Bucknell_mat --out results/p1_force_reproduced.json
python calibration/plot_v185_evidence.py
P1_RAW_DIR=/path/to/original_Bucknell_mat sh tests/RUN_V185_QA.sh
```

The BMW downloader requires normal external network access, which was unavailable from the local artifact container. A connected GitHub service read and analyzed the entire original source in this creation session. **The supplied Python downloader was independently unit-tested, but was not run against the complete raw file in this artifact container**. To check from a local raw file: `--input dataset1_car.csv` instead of `--download`. Hashes and exact row count are verified before analysis; alterations fail.

University P1 public `.mat` measurements used for tests were accessed and processed in the development environment, but are **not included** in the distributed ZIP. P1 is an electric research vehicle, and none of its coefficients are automatically applied to passenger-car profiles.

## Model limitations

BMW vehicle is a gasoline road car, but its steering-column-to-front-wheel ratio, tires, precise axle loads and yaw inertia are not established in these measurements. It has no yaw sensor field. Even accurate fitted BMW input-to-ay behavior does **not** prove correct tire force, aligning torque, suspension, drivetrain or SHIFT//LAB full 6DOF response. The P1 channel plausibility failure similarly does **not** prove the P1 force sensors themselves are faulty—it only establishes that the available exported values cannot yet pass a defined quality gate without verification of calibration and channel mapping.

No unverified source model parameters were inserted into SHIFT//LAB's dynamic model. Future work: retrieve full Ford Fiesta Git LFS ECU observations, verify exact model/engine and steering front-wheel ratio; obtain calibrated front tire contact force channels from Bucknell or independent tire rig; validate the *actual SHIFT//LAB four-corner solver* under comparable test-road conditions.

## Source & license notes

See `docs/reference/DATA_PROVENANCE.md`. GitHub public availability does not guarantee permission to redistribute raw measurements or use them commercially. Only derived statistics, scripts and charts are included, and source references and pinned hashes are provided.
