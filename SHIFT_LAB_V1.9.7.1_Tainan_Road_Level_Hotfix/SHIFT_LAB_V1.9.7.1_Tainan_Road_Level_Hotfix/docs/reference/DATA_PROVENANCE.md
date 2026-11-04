# External vehicle research data provenance — V1.8.5

| Evidence | Original published source | Recorded vehicle and format | Verified access | License / transfer decision |
|---|---|---|---|---|
| Gasoline lateral/acceleration data | https://github.com/cloudpose/smartphone_driving_dataset (`dataset1_car.csv`) | BMW M235i, original 2018-04-08 CAN, 4,708 rows, around 342 s; 11 columns | Raw file fully fetched via GitHub connector, Git blob SHA1 `9fb7b829265b9e94a09bbc188740dd7d350b0245`; derived metrics computed directly on source | No explicit data re-distribution license discovered; **do not redistribute 4708 raw rows**; observational proxy only |
| Conventional-car gearbox + vehicle dynamics | https://github.com/onyekpeu/IO-VNBD ; https://doi.org/10.1016/j.dib.2021.106885 | Ford Fiesta Titanium, ECU with 29 vehicle signals, 10Hz (published paper), CSV stored with Git LFS | Repo README/source schema and pointer checked. `V-Vta1a.csv` is an LFS pointer (sha256 object `9522a6f4...`, original 5,444,513 bytes). **Original bytes NOT fetched** | Academic open publication does not imply repository datasets can be bundled. Fuel/gearbox exact variant unverified; no derived Ford fit claimed |
| Full vehicle lateral/yaw runs | https://www.projects.bucknell.edu/Beal_Automotive/ | Bucknell P1 research EV, original `craig_2018-07-19_aa/ab/ac/ad/ai/ak.mat`, 500Hz | 6 originals in developer environment; SHA256 checked per `research/calibration/fit_p1_real_runs.py`. New wheel sensor gate read original `y` matrices | University download publicly accessible; no clear redistribution permission; raw sources absent from ZIP. P1 is NOT a production combustion vehicle. |
| Previous measured sensor checks | https://github.com/MB-Team-THI/UAHL-RevStED | ADMA/OBD sensor samples | Previously compared/retained in V1.8.3 reports | Do not treat same-sensor correspondence as full real vehicle model proof |

## Scientific levels of trust

- **Measured:** raw BMW CAN speed, steering angle, lateral acceleration, RPM and throttle; P1 500Hz original instrumented channels.
- **Derived from measured:** BMW surrogate model coefficients and holdout errors; P1 force-channel plausibility statistics. Not identical to independently measured vehicle sub-system constants.
- **Not measured / not verified:** steering-wheel ratio and tire forces for BMW; the exact gasoline/diesel/gearbox configuration in Ford; right-front P1 sensor calibration. No claim to identify full engine torque curves or lateral tire characteristics.
- **Unchanged:** the V1.8.4 full driving simulator's four-wheel integrator and default vehicle parameters.

## Rights

There is no source raw BMW/Ford/P1 vehicle data in the output ZIP. The code and derived aggregate result files have been authored for this project. For distribution in a commercial game, revisit any data-dependent model transfer and attribution requirements; obtain express source permissions for raw data reuse if necessary.
