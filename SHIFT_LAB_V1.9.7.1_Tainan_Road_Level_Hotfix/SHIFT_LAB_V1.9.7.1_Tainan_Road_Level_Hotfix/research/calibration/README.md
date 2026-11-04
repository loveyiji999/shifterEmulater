# Bucknell P1 real-track vehicle dynamics benchmark (V1.8.4)

This is a **measured-data-based lateral/yaw benchmark**, NOT a claimed full-car physics validation. Original university `.mat` files are not included in the distributable ZIP.

## Source and scope

- Public research archive: https://www.projects.bucknell.edu/Beal_Automotive/
- Research vehicle: electric, independently driven rear wheels, independently steerable front wheels.
- Primary vehicle reference (institution web page): m=1724 kg, Iz=1300 kg*m^2, CG->front a=1.35m, CG->rear b=1.10m, Cf=75,000 N/rad, Cr=135,000 N/rad.
- **Conflicting geometry**: the linked historical MATLAB parameter file `p1_params.m` states b=1.15m and explicitly calls Iz/C cornering estimates from prior least-squares/hand-fitting; it is not a guaranteed 2018 actual configuration. See `P1_DATA_PROVENANCE.md` and `results/p1_geometry_sensitivity.json`.
- The records were published as real 500-Hz instrumented drive-by-wire experiments. Six test runs are fit/validated here, including left/right gradual steer, step steer, circle, road-track oval, and straight.
- The actual front road-wheel angle (`PostProc` equivalent Ackermann steer, array y[:,100]) and a measured/estimated longitudinal speed (`SSest` y[:,70]) are replayed into the mathematical model. INS measured yaw rate y[:,12], lateral velocity estimate y[:,73], and CG lateral acceleration estimate y[:,75] provide outputs.
- The university labels and recorded MAT files, **not** a reconstructed image trace, determine channel assignments. Sample rate 500Hz. We subsample 10:1 to 50Hz and apply modest smoothing.

## Reproduction

Python 3.10+ with NumPy, SciPy, Matplotlib; Numba is optional for faster fitting. The single-file SHIFT//LAB HTML still needs no Python or internet connection.

```
python -m pip install numpy scipy matplotlib numba
python -m pip install gdown   # Optional, only to fetch university .mat originals
python research/calibration/get_public_p1.py --out /path/to/original_mat --all
python research/calibration/fit_p1_real_runs.py --source-dir /path/to/original_mat --out research/calibration/results
python research/calibration/fit_p1_real_runs.py --source-dir /path/to/original_mat --rear-b-m 1.15 --out research/calibration/geometry_b115 --no-plots
python research/calibration/plot_geometry_sensitivity.py
P1_RAW_DIR=/path/to/original_mat python -m unittest discover -s archive/legacy/tests -p 'test_v184.py' -v
```

These commands can be run from the root of the unpacked V1.8.4 project. If the university changes its raw files, the SHA256 integrity gate fails intentionally; review the new source before updating checksums. SHA256 checks cover all six selected university source files. No synthetic data are substituted when originals are absent.

## Model equations

With lateral CG velocity vy, yaw rate r, measured road-wheel angle delta and measured longitudinal velocity vx:

```
alpha_f = delta - atan2(vy + a*r, |vx|)
alpha_r = -atan2(vy - b*r, |vx|)
N_f = m*g*b/(a+b); N_r = m*g*a/(a+b)
Fy_f = mu*N_f*tanh(Cf*alpha_f/(mu*N_f))
Fy_r = mu*N_r*tanh(Cr*alpha_r/(mu*N_r))
d_vy = (Fy_f*cos(delta)+Fy_r)/m - vx*r
d_r  = (a*Fy_f*cos(delta)-b*Fy_r)/Iz
```

A two-state nonlinear bicycle surrogate is integrated with midpoint RK2. The tire tanh function is a chosen modeling hypothesis, not the exact existing SHIFT//LAB Fiala-inspired model and not a measured tire bench curve. `mu` is the effective saturation coefficient *under this tanh choice*.

- Train (declared before fitting): left gradual steer 40-93s only, 2651 samples at 50Hz.
- Holdout: independent right-hand ramp steering test, variable-speed steering-step test, increasing-speed circle, track oval, low-speed straight, and left-test steering release.
- Fit parameters: one shared front/rear cornering stiffness scale, one common effective saturated mu. Minimize normalized yaw and lateral-acceleration residuals. Do not use holdout to optimize.
- Each test is initialized with the measured initial yaw rate and lateral CG speed estimate. This means RMSE does not include cold initialization error.
- Actual road speed is given to the model, so these tests DO NOT validate drivetrain, gearbox, brakes, drag, suspension, heave, roll or tire heating. Changes to those subsystems would require separate inputs and validation.

## Core results (webpage b=1.10m)

| Test | Split | Baseline yaw RMSE deg/s | Fitted yaw RMSE deg/s |
|---|---|---:|---:|
| left ramp | Train | 3.336 | 0.614 |
| left release | Holdout | 4.062 | 1.086 |
| right ramp | Holdout, opposite turn | 3.796 | 2.370 |
| step steer, different speeds | Holdout | 1.197 | 0.859 |
| accelerating fixed circle | Holdout | 2.085 | 0.879 |
| test track oval | Holdout | 0.654 | 0.713 (WORSE) |
| slow straight | Holdout | 0.454 | 0.450 |

The baseline is the institutional chassis parameters + our chosen tanh tire saturation with mu=1, not an official Bucknell software simulation. A 1.15m geometry prior changes the fitted shared stiffness multiplier from 0.8226 to 1.0001 while producing comparable holdout yaw accuracy. This prevents identification of the physical cornering stiffness from these data alone.

## Release boundaries

- `index.html` retains the same full four-wheel simulation behavior as V1.8.3. The P1 model is a read-only side benchmark panel and debug constant (`P1_REAL_DYNAMICS`). No P1 coefficients have been pushed into its four production-car archetypes.
- P1 has unusual mass layout, electrical drive system, independent actuator design and experimental tires; its coefficients cannot simply be copied to SHIFT//LAB's manual FWD cars.
- Public access is not itself a re-licensing grant. We ship analysis scripts, source links, checksums, model results and graphs, **not** the original `.mat` matrices or linked MATLAB parameter scripts.

## Next physical-parameter work

1. Confirm 2018 P1 CG and sensor zero offsets; bank/camber of the oval test. Without these, fitted steering and tire stiffness are confounded.
2. Verify wheel force transducer channels against `DataDescription` and non-driving low-speed tests before fitting 4 individual contact patches.
3. Fit front/rear tire separate combined-slip curves with varying loads, surface and speed, using validation with unseen maneuvers and actual Fy/Fz.
4. Identify roll stiffness/damping from independent roll and IMU channels; then compare 4-corner model, not only bicycle model.
5. Use dedicated powertrain/braking road data matching the same test car, or adopt a different vehicle with documented manual powertrain; P1's dual electrical drivetrain does not match a 6MT car.
6. Only transfer physically identified coefficients to the actual four-wheel simulator when *unseen* measured yaw, lateral acceleration, wheel forces and slip improve jointly.
