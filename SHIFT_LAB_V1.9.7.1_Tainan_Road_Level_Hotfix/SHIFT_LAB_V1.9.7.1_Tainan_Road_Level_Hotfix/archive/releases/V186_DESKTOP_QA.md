# V1.8.6 Desktop QA Evidence

## Repeatable local software tests

`python -m unittest discover -s tests -p 'test_v18*.py'` using headless Chromium and Python unittest.

- **Total: 61** tests
- **Passed: 59**
- **Skipped: 2** because optional original P1 MAT files are not bundled
- Source syntax `node --check`: PASS for `archive/legacy/current_inline.js`, `desktop3d/src/road.mjs`, `chassis.mjs`, `main.mjs`.
- All 51 tests from V1.8.3–V1.8.5 remain unchanged and pass/skip exactly as before.

## Repeatable simulated scenario (not a real-car benchmark)

Controlled setup: 20 m/s, level initial road, vehicle forward, `splitMu=left_ice`, brake slider 100%, ABS enabled, 1.2 s simulation at 120 Hz with four 480 Hz physics substeps. Original four-wheel physics with new controls.

| Observable | ESC disabled | ESC enabled |
| --- | ---: | ---: |
| Final yaw rate | +1.070279 rad/s | +0.359224 rad/s |
| ESC wheel brake maximum | 0 | ~269 Nm |
| High-mu side brake pressure trim | 0 | >10% |

These are **deterministic simulator behavior tests only**. Vehicle deceleration differs between ESC ON and OFF because the stability controller intentionally sacrifices some peak braking performance to reduce yaw. Neither stopping distance nor real ESC accuracy was calibrated against a real vehicle.

## Other dynamic gates

- Extreme yaw >1.65 rad/s is not clipped by the former hard cap; numerical safety bound remains at 8 rad/s.
- Recoverability profile retains the same normalized peak force and friction circle; post-peak lateral force is ordered `raw < sport < balanced`.
- Keyboard opposite-direction steering responds and returns to neutral after release.
- Offline guardrail applies energy-dissipating planar impulse and corrections; no legacy 28%-speed multiplier or yaw `*=.55` survives.
- Installing an external chassis bridge disables the internal chassis pose integration (unit test ensures no double-stepping).

## Pending release gates

**Not tested here:** Actual Vite build (dependencies unavailable offline), WebGL+Rapier WASM load, continuous road-collider streaming under fast motion, landing/rollover recovery, FPS on desktop hardware, joystick hardware calibration, cross-browser input latency. These are required before calling the 3D prototype production-ready.
