# SHIFT LAB v1.8.9.2 — 3D Stability & Integration

Date: 2026-10-21. Source baseline: `SHIFT_LAB_V1.8.9.1_Automatic_Transmission_Fix.zip`.

## Scope and implementation

| Item | Code delivered | Validation status |
|---|---|---|
| 01 Rapier / four-wheel integration safeguards | `src/physics-health.mjs`; checks after each 120 Hz step; fail-stop and visible error | Node health checks; full WASM pending |
| 02 Automatic transmission verification | Retains v1.8.9.1 AMT logic; new monotonic braking-to-first checks for four configurations | Node stress + real legacy-core drivetrain tests pass |
| 03 Manual/automatic separation | Retains Shift/number/R interception and mode reset; additional regression | Chromium isolated UI and Node tests pass |
| 04 Paused manual selector | New `src/manual-gear.mjs` slowly actuates the original clutch, calls original `requestGear`, waits for original synchro; stationary lockout; engine button interlock assistance | Mock tests + actual legacy iframe physics browser probe pass |
| 05 Keyboard/controller input | Maintains corrected visual-to-legacy steering mapping | Existing keyboard/controller synthetic tests pass; physical gamepad pending |
| 06 Vehicle presets | Exposes the already-implemented `diesel` preset in Settings | Static + real drivetrain 4-car regression pass |
| 07 Map rebuild lifecycle | `RoadWorld.assertClean`/`resourceStats`, obstacle mesh material disposal; rollback old map if regeneration fails | Fake-Rapier resources + live legacy iframe route-switch browser probe pass |
| 08 Browser acceptance automation | New `browser_v1892.py`; old `browser_v187.py` delegates to it | Script syntax passes; actual Vite/WASM pending |
| 09 Error reporting | Finite value checks for 3D body, drivetrain and wheels; QA error records fail, game displays reload option | Node health gates pass |
| 10 Package/deployment verification | Version uplift, launch/build scripts preserved, npm QA commands added | npm dependency download blocked by DNS `EAI_AGAIN`; no dist/lockfile created |
| 11 Long drive endurance | Real-browser tool supports `--drive-seconds 1800` | Automation supplied, 30-minute run NOT executed here |

## Compatibility constraints

- The native four-wheel physics source `desktop3d/public/physics.html` and the legacy reference file are **byte-identical and unchanged** from v1.8.9.1.
- Core vehicle dynamics, gear synchronizer, clutch, tire force calculation, collision scenarios, and seeded route generation are not rewritten.
- `desktop3d/src/automatic-transmission.mjs` continues to describe an automatic-controlled manual gearbox (AMT), **not** a torque-converter hydraulic automatic.
- Vite + Three.js + Rapier are loaded from npm in local development. This package is source-only, not a built offline-ready website.
- The driver still sees only the 3D scene, speed/RPM instruments and gear; Settings and Tests remain separate.
- Existing `shiftlab.v189.settings` and `shiftlab.v189.procedural-map` localStorage keys are preserved for migration-free preferences.

## Implementation details

**Paused manual gear:** In Settings, choosing gear while almost stationary briefly advances the unmodified physics engine with a fully depressed clutch and brake, then requests the target gear via the original `requestGear`. It waits up to 420 physics steps for the synchronizer. It never writes `state.gear` to bypass the drivetrain, never forces reverse at speed, and restores host pedal targets. Engine startup while in gear also respects the original clutch interlock. Dynamic shifting must still use Shift with the driving keyboard.

**Map lifecycle:** acceptance obstacles are removed first; owned road collision bodies and visual meshes are cleared; no orphan collider handles may remain; next route is generated and rendered; scene query structures are updated. If the process fails, the last route is regenerated to recover. The selected map is committed to localStorage only after the vehicle reset succeeds.

**Physics health:** no non-finite position, rotation, speed, wheel speed, normal load, engine speed, or control pedal value is allowed through. During 3D acceptance, the failure is graded as FAIL instead of fabricating a PASS. During free drive, the renderer stops and an error/reload action appears. Error recovery cannot guarantee restoration of a catastrophically corrupted WASM runtime; reloading is intentional.

## Outstanding acceptance

In a machine with network access, run `npm install` / `npm run dev` in `desktop3d/`, then `python desktop3d/tests/browser_v1892.py`. Also run the 30-minute soak with `--drive-seconds 1800` and repeat on the intended browsers and physical gamepad. The real-WebGL results are not inferred from stub tests.
