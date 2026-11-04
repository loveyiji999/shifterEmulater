# SHIFT//LAB V1.8.6 Desktop Driving – Engineering Notes

## What was modified

### Standalone `index.html` (offline, no new dependency)

1. **ESC**: corrected zero-steering / undesired yaw detection in `updateHandlingControl`. The actual wheel torque remains part of the wheel speed equation, not a yaw-rate edit. Split-mu deceleration also redistributes driver-requested braking away from the high-mu side if braking symmetry is causing unintended yaw. Local `w.absPressure` remains in the braking torque path, so ABS still limits lockup.
2. **High-yaw states**: removed the premature +/-1.65 rad/s production yaw clamp. +/-8 rad/s is an emergency numerical guard only, not a nominal handling limit. Low longitudinal speed now continues to use force/moment balance, with damping near rest instead of resetting yaw to a kinematic bicycle value.
3. **Keyboard/gamepad**: accelerated countersteering toward the opposite lock while retaining the original steering rack; added centered-analog jitter hysteresis; preserved V1.7 calibration and all existing pedals / shifter mapping. The optional Three.js host reads mapped conventional Gamepad axes and exposes mapping selectors.
4. **Tire limit/recovery**: added `balanced`, `sport`, `raw` presets. They modify only post-peak kinetic friction retention, not the peak lateral/longitudinal force capacity or total friction circle. Raw keeps legacy parameters for A/B comparisons.
5. **Offline road barriers**: replaced velocity multiplier, yaw multiplier, and instantaneous centerline-snapping with footprint-based wall penetration + one planar rigid-body impulse and bounded tangent friction. This is not a 3D rigid-body solution.
6. **External chassis bridge API**: `setExternalClock`, `setChassisBridge`, `hostControls`, `inputKeys` added to the debug surface. When a 3D bridge is installed, SHIFT LAB still integrates wheels, engine/clutch/transmission, tire forces, ABS/ESC, but it does NOT integrate the chassis position, attitude, or world velocity. Rapier becomes authoritative.

### Experimental `desktop3d/` Three.js + Rapier adapter

- Vite and modern ESM imports: `three`, `@dimforge/rapier3d-compat`.
- `public/physics.html` is an identical copy of the modified standalone physics page. It is loaded as a zero-sized *same-origin* iframe. Its internal requestAnimationFrame loop is halted by the host, then advanced at a fixed 120 Hz with four physics microsteps per tick.
- `src/road.mjs` produces bounded, streamed static road triangular meshes and 3D guardrail cuboid colliders from the ORIGINAL seeded road profile. Old chunks are removed outside the active arc-length window.
- `src/chassis.mjs` owns a single dynamic Rapier chassis with prescribed mass/inertia, CCD, four suspension raycasts and point-forces. Road contact force at each wheel is passed to the existing four-tire model; each wheel’s in-plane tire force is applied at that wheel’s contact patch (including its pitch/roll/yaw moment), while drag is applied at the CG; Rapier steps **once** per microstep. No duplicate manual yaw torque is injected. No independent planar integration is applied.
- `src/main.mjs` renders a lightweight Three.js scene and reads keyboard plus optional Gamepad input. Manual clutch and gear-selection rules of the original model remain in effect.

## Coordinate/force contracts

- World: `x` right, `y` up, `z` forward; vehicle yaw `+y` rotates forward `+z` toward right `+x`.
- Tire outputs: each wheel’s `fxBody` acts along vehicle forward, `fyBody` toward vehicle right; the existing `yawMoment` is a diagnostic sum, **not** separately applied in Rapier.
- The bridge body is located at CG (`world.y = road.y + P.cgHeight`) and provides instantaneous forward/lateral speed and yaw angular velocity to the SHIFT LAB wheel force solver after Rapier steps.
- The zero-mass shape collider and the explicit additional mass/inertia avoid doubling the prescribed vehicle mass.
- Three.js is rendering only; it never updates car physics by changing its mesh transform.
- Road meshes and guardrails are static colliders, while the car has CCD on. Wheel-ground contacts are sampled by Rapier raycasts. The legacy planar wall collision path is automatically disabled while a 3D bridge is active.

## Remaining realism/performance risks

- The experimental 3D adapter is not a finished physics vehicle model: individual unsprung masses and tires do not exist as Rapier dynamic bodies; suspension raycasts approximate vertical tire compliance. Rolling into the guardrail with enough speed may lead to rollovers because the rigid body has full 6DOF.
- The base four-wheel tire solver still uses a planar local contact patch approximation; steep bank angles, airborne wheel spin and landing transients need further validation.
- Road/collision meshes are procedural and not yet connected to asset streaming, lanes or network authoritative multiplayer.
- The 3D adapter is integrated in source, **but its WASM/browser run cannot be validated in the current offline container because npm packages could not be installed**. Execute the smoke test and an actual playthrough after `npm install` in an environment with registry access. Treat 3D as experimental until then.
- High-speed vehicle collisions and friction require multi-device desktop tests; code review alone is not enough for release approval.
- Mobile/touch/fill-rate optimization deliberately deferred.

## How to run

The default offline version: open `index.html` directly in a desktop Chrome or Edge browser.

To run the optional desktop 3D integration after installing Node 20.19+ or Node 22+:

```sh
cd desktop3d
npm install
npm run dev
```

Open the localhost URL reported by Vite. Press I to start, Shift to depress the clutch, select gear 1, release Shift gently, then accelerate using W. A/D steer, S brakes. Optional Gamepad X axis/trigger/button indices can be selected in the HUD. Note: the original transmission model intentionally stalls if the clutch is released abruptly at low RPM.

## Test command

```sh
sh tests/RUN_V186_QA.sh
```

Runs the inherited real-data software tests plus v1.8.6 simulated gameplay tests. This does **not** replace a Playwright WebGL smoke test and 3D in-browser performance/physics QA.
