# Remaining evidence needed before claiming a realistic full-car model

| Area | Existing evidence | Missing verification | Proposed next source/test |
|---|---|---|---|
| Horizontal CG/yaw response | Bucknell P1 steering, INS yaw, processed CG lateral accel, 7 fixed run windows | Prior geometry conflict, yaw test-track case worsens | Official 2018 geometry survey, road bank and sensor zero check |
| Four independent tire forces | P1 two Michigan Scientific 6-axis wheel force transducers and wheel-force channels | Channel/unit/frame origin and transformations, measured slip/Fz mapping | Reprocess P1 tire sensor calibration runs and steering-slip tests |
| Suspension roll/vertical | P1 INS roll, roll rate, some Fz | Spring/damper installation motion ratio, accurate wheel vertical displacement, wheel contact model | Published P1 roll parameters plus clean change-of-surface/step maneuvers |
| Steering rack force | P1 tie rod loads, motor angle, PostProc torque | Motor geometry mapping and independent yaw coupling | Historical P1 sglu lookup arrays, stationary sweeps |
| Longitudinal vehicle dynamics | OpenLKA and previous P1 acceleration snippets | Torque and clutch input from same manual vehicle | Vehicle-specific acceleration/braking tests with actual throttle or axle torque |
| Combined tire slip | Custom illustrative SHIFT LAB tire model | Measured simultaneous Fx,Fy, normal force under transients | Instrumented tire rig on known tire with commercial license |
| Tire thermal/pressure | SHIFT LAB thermal demo | Logged tread/carcass temp, pressure, surface temps from actual tires | Independently published tire thermal dataset |
| Generalization | Left P1 training, 6 P1 holdouts | Independent vehicle, road surface, speed and weather | Licensed 100Hz multi-car field dataset with known vehicle geometry |

**No physical subsystem should be called validated solely because internal regression tests pass.**
