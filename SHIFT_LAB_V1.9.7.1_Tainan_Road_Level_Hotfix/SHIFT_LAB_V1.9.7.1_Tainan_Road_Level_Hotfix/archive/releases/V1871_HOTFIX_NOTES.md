# SHIFT LAB v1.8.7.1 — 3D suspension and input hotfix

## Evidence / why the v1.8.7 failed

User ran full acceptance twice and reported 1/5 passes each time. Ramp started at s=118 m but advanced only to ~124-125 m; every wheel reported zero valid contacts. At `desktop3d/src/chassis.mjs` the 3D wheel-ray caster read `hit.toi` even though `Rapier RayColliderHit` in pinned v0.18 uses `timeOfImpact`. This created NaN spring forces when a ray hit the road; the wheel `contact` predicate became false without the old finite-vehicle QA detecting it. The hull then dragged on the road instead of running on tire forces. This is a source-established bug and a strong explanation of the supplied failure symptoms; real browser confirmation remains necessary.

Additional direct issues: test barrier physically existed in free mode only 34 m beyond free spawn; the QA suite left the simulation paused; focused select inputs swallowed movement keys.

## Changes

- Read ray hit `timeOfImpact` through `ray-contact.mjs` (validates all numeric bounds); safely zero missing/invalid wheel loads. Count valid ray hits, misses, suspension contacts and numeric faults.
- Treat nonfinite wheel normal data as a failing QA condition, not a nominal finite-state PASS. Require meaningful wheel contact durations on stationary and ramp cases.
- `AcceptanceObstacles.configure(scenario)` physically removes out-of-scenario colliders and graphics. Unlike `setEnabled(false)`, physical removal does not depend on the Rapier 0.18 disabled-collider issue. Free-driving scene has no transverse barrier/ramp; guardrails remain.
- Add clear `開始自由駕駛` CTA, reset/unpause and canvas keyboard focus. Select focus no longer persists after relevant control changes; Esc dismisses select focus. M switches quick-assisted/manual mode, and the original manual drivetrain remains available.
- Quick-assisted mode uses the existing engine/gear/clutch logic and does not run during scripted QA. It is a *new game-control adapter*, not changes to the inherited four-wheel solver.

## Re-test on your computer

1. Extract the whole hotfix ZIP into a **new directory**, not on top of an old active dev server. Close prior Vite process if it occupies port 5173.
2. In `desktop3d` run `npm install` and `npm run dev` or double-click `START_WINDOWS.cmd` on Windows. Visit `http://127.0.0.1:5173/` in Chrome/Edge. Reload with Ctrl+Shift+R.
3. Press `開始自由駕駛`, check wheels report 2–4 contacts on level road, and verify W/S/A/D operate. Test both quick-assisted and full manual modes. Free driving should NOT hit a cross-road barrier at ~104 m.
4. Run `完整自動驗收`, then export JSON. Contact rays and invalid wheel load metrics are now in the report. If any of the five cases fail, share JSON or the failing subchecks: do not trust a source-only unit-test PASS as a real 3D pass.
5. Run the real browser script `python desktop3d/tests/browser_v187.py --url http://127.0.0.1:5173/` if Python Playwright + Chromium are installed, or use the on-page suite; npm install is necessary only initially.

## Tested in build environment

- Original v1.8.6 standalone `index.html` and `desktop3d/public/physics.html` kept byte-identical.
- Full Python unittest suite: **75 total, 73 passed, 2 skipped** (raw Bucknell MAT originals unavailable), 0 failed.
- Node zero-dependency scenario QA + `ray-contact.mjs` unit tests: PASS.
- ESM syntax/HTML selectors: PASS.
- `npm install` was blocked by DNS `EAI_AGAIN`; this environment has NOT run the real Vite/Rapier/WASM 3D suite nor certified the collision results.

## Known risks

- A fixed 3D wheel-ray miss can still reveal other defects in spring/damper or road collision coupling, and a previously masked collision error may remain. The user must re-run browser acceptance.
- Ray suspension model is a simplified game model and still uses static chassis body mass/inertia; not full manufacturer kinematics.
- Quick-assisted up/downshift and clutch feel need practical tuning with keyboard/gamepad on real PC.
- Mobile remains out of scope.
