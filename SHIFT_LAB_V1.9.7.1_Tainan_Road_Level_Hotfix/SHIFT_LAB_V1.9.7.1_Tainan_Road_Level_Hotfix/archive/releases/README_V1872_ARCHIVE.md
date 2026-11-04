# SHIFT//LAB v1.8.7.2 — desktop 3D force-stability candidate

**Critical repair:** clears Rapier rigid-body user forces and torques at every 1/480-second microstep. v1.8.7.1 unintentionally accumulated suspension loads and could launch the stationary car. The old model remains untouched. Read [`archive/releases/V1872_FORCE_STABILITY_FIX_NOTES.md`](V1872_FORCE_STABILITY_FIX_NOTES.md) for the isolated regression, real-browser re-test steps and limitations.

**Do not start with the full collision suite. Test `靜止穩定` first.** The suite now stops automatically if that foundation case fails. Actual browser 3D/Rapier results have not been verified in this build environment.

---

# SHIFT//LAB v1.8.7.1 — 3D suspension / driving hotfix

**Status:** source-level hotfix for v1.8.7. Physical browser acceptance is **not yet re-tested** in this build environment; do not infer PASS from the source regression suite. Full diagnosis, changes and steps: `archive/releases/V1871_HOTFIX_NOTES.md`.

# SHIFT//LAB v1.8.7 — Desktop 3D Driving & Collision Acceptance

**Scope:** The `desktop3d/` browser lab is expanded into a scenario-based Three.js + Rapier 3D collision acceptance tool. The legacy root `index.html` driving simulator is retained byte-for-byte from v1.8.6. Mobile optimisation is deferred.

## Launch a real 3D browser scene

Requirements: Desktop Chrome/Edge, WebGL2 support, Node.js 22+ (or 20.19+), npm access to the public registry **on first installation**.

**Windows:** Double-click `desktop3d/START_WINDOWS.cmd`. When the server reports ready, open **http://127.0.0.1:5173/** in Chrome or Edge.

**macOS/Linux:**

```sh
cd desktop3d
sh START_UNIX.sh
```

or manually:

```sh
cd desktop3d
npm install
npm run dev
```

Visit `http://127.0.0.1:5173/`. This is a genuine local web page. Do **not** double-click `desktop3d/index.html`: native ESM imports, WebGL and Rapier WASM require the Vite HTTP server (or a production build). After dependencies are installed, the server can run without reinstalling each time using `npm run dev`.

## How to test

1. Select `正面碰撞` and click `執行此工況`: the car is seeded at 20 m/s before a fixed cross-road barrier.
2. Choose `斜角擦撞`: the car is seeded near the right guardrail at 23 m/s with an initial steering heading offset.
3. Choose `高速 CCD`: 42 m/s into the barrier with continuous collision detection enabled.
4. Choose `坡道及離地` or `靜止穩定` to inspect vertical/suspension dynamics.
5. Click `完整自動驗收` for deterministic scenarios. `PASS` requires the stated numerical gates; `FAIL` is explicitly displayed with its failed subchecks. Export JSON for offline review. `暫停` / `單步` help inspect contact poses. Use the camera selector for side/chase/top views.

Press **開始自由駕駛** to enter a clear road with driving focus. Choose 快速駕駛 for assisted engine/clutch/shifts or 手排練習 for the original full manual gearbox. W/S accelerate/brake, A/D steer, Shift full clutch (manual), 1–6/R/0 gears (manual), I ignition, M switches drive mode, Space pause, Backspace resets. The standalone legacy manual drivetrain logic is unchanged. Standard Xbox-style gamepad controls can be mapped from the panel; mapping selection does not bypass the real manual drivetrain.

The numerical measurements come from Rapier contacts and the original four-wheel integration: contact events, positive normal solver impulses (N·s), contact penetration distances, rigid-body orientation, four wheel-contact states, speed, render FPS, and step-time cost. They are **simulator acceptance metrics, not real-vehicle safety predictions**.

## Publish to a static website

After installing packages:

```sh
cd desktop3d
npm run build
npm run preview
```

`desktop3d/dist/` will contain the site assets (including the preexisting `physics.html`) and can be hosted under a sub-path due to Vite's relative base. The development package does **not** contain an already built `dist` because npm downloads were blocked in the creation environment.

## Tests

- `sh tests/RUN_V187_QA.sh`: inherited Python/Chromium physics tests, cross-file integrity and new scenario gate logic. These tests **do not run Rapier in WebGL**.
- `cd desktop3d && npm run qa:scenarios`: zero-dependency validation of the scenario acceptance gate definitions.
- With a Vite dev server running and Python Playwright installed: `python desktop3d/tests/browser_v187.py --url http://127.0.0.1:5173/`. This **does** run the actual WebGL/Rapier browser acceptance and writes a screenshot and machine-readable report to `artifacts/tests/browser/`. It returns a failure code if launch or a criterion fails.

**Development-environment status:** inherited and new logic tests: **71 total, 69 pass, 2 optional P1 source-data skips**. The `npm install` attempt returned DNS `EAI_AGAIN`. The production Vite bundle and real Three.js/Rapier 3D browser acceptance were **not executed here**. See [`archive/releases/V187_3D_QA.md`](V187_3D_QA.md).

For the earlier standalone and actual-vehicle research notes see [`archive/releases/README_V186_ARCHIVE.md`](README_V186_ARCHIVE.md) and `archive/releases/V186_DESKTOP_IMPLEMENTATION.md`.
