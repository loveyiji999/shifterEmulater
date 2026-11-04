# V1.8.7 — 3D Collision Acceptance Implementation

## Changes from v1.8.6

- Resolved fatal `null` control references in the v1.8.6 3D page: the new HTML now defines all four gamepad mapping selectors, gamepad selection, camera selection, scenario selection, and QA controls. The JavaScript startup path has explicit error handling.
- Added five controlled simulation cases (plus manual free drive): settle, frontal barrier, guardrail glancing strike, high-speed CCD barrier, and ramp/vertical motion.
- Added a full-width fixed transverse solid Rapier barrier with visible painted geometry, and a separate collision-mesh ramp. Both are built into the acceptance track and are not baked into the base tire model.
- Contact metrics are sampled from Rapier `contactPair` manifolds using `contactImpulse(i)` and `contactDist(i)`. Rail and transverse-barrier episode counts are tracked separately. No hypothetical force/impulse has been added to the car based solely on test thresholds.
- Added safe test-preset teleports with synchronized Rapier rigid-body pose/velocities, local route position and all four wheel angular speeds. This prevents the two solvers from fighting each other during test setup.
- Preserved single-authority 6-DOF Rapier chassis. SHIFT LAB computes tires, wheel angular velocities, suspension contact spring/damping, manual engine/clutch/transmission, ABS, TCS, ESC. Per-corner forces go to Rapier with `addForceAtPoint`. `world.step()` remains a single call per 1/480-second microstep. Independent planar vehicle-pose integration is disabled when a 3D bridge is active.
- Created a deterministic auto-QA interface accessible as `window.__SHIFT_LAB_3D_QA__` for browser automation; methods include `.snapshot()`, `.loadScenario(id)`, `.step(n)`, `.runScenario(id)`, `.runSuite()`, and `.report`.
- Fixed-timestep progression uses 120Hz outer updates and four legacy microsteps. Simulated time is independent of render FPS. Rendering drop count and actual physics step duration are visible in HUD.
- Added headless Playwright Chromium test entrypoint. This requires Vite/NPM packages; it deliberately fails on real WebGL/WASM runtime errors or failed numeric gates.
- Added Windows/Unix launch helpers and a Vite relative base for deploying under another site's sub-path.

## Coordinate & ownership contract

- World convention: +X = lateral vehicle right, +Y = up, +Z = vehicle forward.
- Vehicle's COM transforms, rotational velocity, and all rigid collision responses are owned by Rapier, not by Three.js meshes or the legacy planar kinematic integrator.
- Four suspension probes cast into registered road/ramp colliders. Other obstacles are excluded from tire support raycasts to prevent the car from driving *on top of guardrails* as if they were asphalt.
- Each tire's longitudinal and lateral force is applied at a separately rotated contact-patch lever arm. Road grade is included by Rapier gravity; the legacy bridge cancels the legacy planar grade-force contribution at the boundary to prevent double counting.
- Test teleports are only activated by the 3D host UI and reset the original simulator before injecting initial speeds. Original manual drivetrain/stall behavior is unchanged during test simulation.

## Scenario acceptance philosophy

The test engine does not auto-adjust collision parameters until a green result appears. A case is PASS only if: values remain finite, rigid body stays bounded, no velocity explosion, plus specific assertions:

- Frontal and high-speed barriers: barrier contact, positive solver impulse, no crossing beyond barrier, limited contact penetration.
- Side-swipe: rail contact and positive contact impulse, no excessive penetration.
- Static settle: vehicle does not drift/flip, wheels remain on the road.
- Ramp: vertical movement occurs with tire/ground contact and no catastrophic flipping.

Pass thresholds are *engineering heuristics* and should be revised after actual desktop runtime inspection. Failure is allowed and informative; it is not hidden.

## Realism limitations

Raycast suspension is not a four-unsprung-body constraint system. Static trimesh surfaces and a cuboid chassis hull are approximations; continuous collision detection reduces tunneling risk but does not guarantee robust high-energy car crashes. Real sensor data are not used to calibrate collision stiffness, barrier restitution, tire carcass, or structural deformation. No damage/crumple zones, wheel-body collision shapes, accurate off-road terrain dynamics, or asset pipeline exist yet.

The historical root `index.html` remains a Canvas 2D offline driver. The 3D QA host is a separate browser app and not a finished production driving game. Networked multiplayer and smartphone optimization remain deferred.

## Runtime QA blocker (must not be treated as success)

In the current build container `npm install` failed with `EAI_AGAIN` resolving `registry.npmjs.org`; no downloaded Three.js, Vite, or Rapier WASM is available. Therefore actual Vite build, full 3D rendering, contact solve values and browser acceptance cannot be honestly asserted as passed in this environment. The `tests/browser_v187.py` script is included for running these missing checks on a connected desktop.
