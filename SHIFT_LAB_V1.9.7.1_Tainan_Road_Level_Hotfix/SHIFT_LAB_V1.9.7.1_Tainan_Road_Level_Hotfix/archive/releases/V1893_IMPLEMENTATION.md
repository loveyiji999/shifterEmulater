# SHIFT LAB v1.8.9.3 — PRND Reverse and Park Integration

Date: 2026-10-22. Baseline: `SHIFT_LAB_V1.8.9.2_Stability_Integration.zip`.

## Problem and root cause

v1.8.9.2 provided automatic gear scheduling only for mechanical gears 1..6. The UI deliberately disabled the manual shifter while assisted mode was active, leaving no route to mechanical gear -1 (reverse). Even simply adding a reverse shortcut would not make the car move, because the automatic clutch function treated any `gear <= 0` as permanently disengaged. There was no P/N/R/D selector or P-specific immobilization.

## Changes

1. New `desktop3d/src/automatic-range.mjs` defines the selectable automatic **ranges** P/R/N/D separately from the original mechanical **gears** -1,0,1..6. Range selection is validated before commit: stationary threshold <=0.35 m/s and brake >=20% for P/R/D. N can disengage at speed. Settings allows selection only while paused and stationary; it does not waive motion checks. A pending synchronizer blocks R/D, but neutral and stationary P can cancel it.
2. The automatic actuator requests neutral before changing reverse/forward direction; then requests original `d.requestGear(-1)` or the existing 1..6 automatic scheduler. It never assigns `d.state.gear`. It maintains the original synchronizer/gearbox/clutch and does not mix manual hotkeys into assisted mode.
3. `automaticClutch` now treats mechanical reverse (-1) as a torque-transmitting drive gear, with the same gentle near-zero-speed slip control as first. The original road speed and grade, signed tire loads and rigid-body bridge remain authoritative.
4. New independent P-range parking brake request (`hostControls.parkPawl`) enters the existing per-wheel brake torque model and static parking condition. P also requests neutral. It is independent from service-brake input, does not teleport/freeze Rapier bodies, and is cleared by switching to R/N/D, manual mode and QA resets. This is a **wheel-end parking brake approximation**, not a simulated actual automatic-transmission parking pawl tooth or park mechanism.
5. The driver sees a compact PRND selector attached to the existing gear instrument and transient warnings only when an unsafe request is rejected. A matching selector exists in Settings. Keyboard bindings: auto `P` park, `R` reverse, `N` neutral, `F` drive; `A/D` steering and `W/S` throttle/brake remain unchanged. Manual `Shift+R` and `Shift+0..6` are unchanged.
6. HUD distinguishes selected P/N ranges and actual engaged R/1..6; `snapshot()` also reports range, signed longitudinal velocity and parking brake status. All new state is reset when switching car/scenario or entering manual; 3D reference acceptance still runs unchanged.

## Implementation constraints

- `desktop3d/src/chassis.mjs`, road generator, acceptance obstacles and five scenario scoring logic are unchanged.
- `desktop3d/public/physics.html` and `archive/legacy/shiftlab-2d-reference.html` are kept byte-identical; only the park control and braking path changed within the mechanical core.
- The assisted gearbox is still an AMT. A hydraulic torque converter, planetary automatic transmission and production-grade parking pawl will be separate engineering projects.
- Automatic mode starts in **P**, unlike the previous neutral-to-first auto-launch. Player explicitly selects D or R; this is an intentional safety/interface change.
- Local saved car/steering/map preferences retain the `shiftlab.v189.*` storage keys; selected PRND range intentionally resets to P rather than persisting across sessions.

## Tests

- `node desktop3d/tests/validate-automatic-range.mjs`: PRND transition interlocks, N/P de-coupling, R demand and clutch engagement, D scheduler interoperation.
- `python -m unittest tests/test_v1893_core_prnd.py`: real Chromium iframe with actual engine, wheels, brake torque and synchronizers; R produces negative signed road speed; N returns zero transmission torque, D produces positive speed, P holds a simulated 9% grade.
- `python -m unittest tests/test_v1891_drivetrain.py`: existing four vehicle configurations accelerate, decelerate, return to first, re-accelerate.
- `python desktop3d/tests/browser_v1893.py`: **real WebGL2 + Rapier** end-to-end script, requiring npm dependencies and a running Vite server (not executed in this environment if registry DNS unavailable).

## Remaining verification and risk

- Actual Rapier rigid body parking on real gradients and full reverse collisions must still be measured in the real Vite/WebGL setup.
- A 30-minute continuous 3D drive and physical gamepad PRND operation are still pending.
- A body on a low-friction slope can still skid with locked wheels; the separate park brake is not an absolute pose freeze. This matches the goal of preserving tire/road physics but is not a full parking pawl or drivetrain parking lock simulation.
