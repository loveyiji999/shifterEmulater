# SHIFT LAB v1.8.7.2 — 3D force-accumulation hotfix

## Observed failure

The actual user's v1.8.7.1 browser run reported 0/5 scenarios passing, with a ramp speed maximum of 727.7458 m/s, a vertical excursion of 134.5147 m, and no wheel-ground contact counted. A flat-ground car was already repeatedly launching and tumbling before user input. These readings are not credible vehicle behavior and indicate a numerical/force-integration defect.

## Verified source-level root cause

Rapier 0.18 `RigidBody.addForce`, `RigidBody.addForceAtPoint`, and the associated torque retain their effect across `world.step()` until manually cleared. The earlier bridge issued wheel strut and tire forces on every substep but never called `RigidBody.resetForces()` or `resetTorques()`. Normal static suspension forces were **accumulated over multiple 1/480s microsteps**, producing an increasing upward net force and pitching/rolling torques. The earlier ray-field bug had obscured this second independent problem. This explanation is supported by the actual source and documented Rapier force semantics; the user's observations are consistent with it.

Rapier official reference: https://rapier.rs/docs/user_guides/javascript/rigid_body_forces_and_impulses/

## Changes

- In `RapierChassisBridge.beforeForces()`, `resetForces(true)` and `resetTorques(true)` run BEFORE any new suspension or tire force is applied, once for each mechanical microstep.
- `reset()` and `teleport()` now clear residual user forces and torques as well as velocity.
- The Rapier `userForce()` and `userTorque()` are measured after the current substep's tire/spring loads are summed, before stepping, and their peak magnitudes exported to HUD / JSON report; the microstep reset counter is also measured.
- Scenario grading now rejects obvious accumulated external forces or lack of force clearing.
- If the static settling test fails, the suite aborts before frontal, highway-speed and ramp tests. If severe speed/boundary instability arises during a case, the case stops rather than simulating further uncontrolled flight. No artificial speed clamp is added to the car's physics.
- `tests/validate-force-lifecycle.mjs` executes the actual `RapierChassisBridge` code with a minimal Rapier-like deterministic stepping double implementing documented persistent-force semantics. This ensures that a stationary car stays supported for 3 simulated seconds, all 1,440 microsteps reset forces/torques, and reset/teleport leave zero stale force. This is NOT a Rapier WASM or WebGL runtime test.
- The inherited SHIFT LAB stand-alone physics `index.html` and `desktop3d/public/physics.html` are unchanged.

## Testing performed

1. Before the fix, the force lifecycle regression failed with **0** resets out of 1,440 microsteps.
2. After the fix, the identical lifecycle regression passed: force reset and torque reset occur once per microstep, stationary support is stable within the mock integrator, and reset/teleport clear residual loads.
3. Node source QA (`npm run qa:scenarios`): passed all 3 modules.
4. Full Python source/legacy-browser regression: **77 collected, 75 passed, 2 skipped** because original Bucknell MAT data is not included.
5. ES module syntax check passed.
6. `npm install` failed with `EAI_AGAIN` for registry.npmjs.org, so the genuine `Rapier 0.18` WASM/Three.js browser run and production bundle remain **unverified in this environment**. This is a patched candidate, not a certified 5/5.

## Re-test sequence (do not start with high-speed or ramp tests)

1. Unzip v1.8.7.2 into a **new folder**, stop the old Vite instance, and launch `desktop3d/START_WINDOWS.cmd` (requires Node/npm and first-run npm network access).
2. In Chrome/Edge visit http://127.0.0.1:5173/ and hard-refresh with Ctrl+Shift+R. Confirm the version reads v1.8.7.2.
3. Choose `靜止穩定` then `執行此工況`; this MUST pass before moving on. Wheels should normally report 2–4 contacts, car should not bounce violently. New HUD `外力峰值／力矩峰值` should remain finite and in a plausible range rather than growing on every physics step.
4. Choose `開始自由駕駛` and confirm W/A/S/D inputs work and car remains supported.
5. Only then run full automatic suite. If stationary fails, the suite automatically stops and reports only stationary.
6. If any failure remains, export JSON and provide its `maxExternalForceN`, `maxExternalTorqueNm`, `forceResetCount`, `maxSpeed`, `maxTiltDeg`, `rayHits`, and `validWheelSteps`. This distinguishes force lifecycle, collision, contact geometry, and tuning problems.

## Known follow-up risks

- A repaired force lifecycle does not prove all tire forces, contact geometry, chassis-collider proportions, obstacle geometry or grade/ramp transitions are correct. These require actual Rapier/Chromium results.
- Spring and tire inputs are entertainment-model parameters rather than manufacturer telemetry. Mobile work remains deferred.
