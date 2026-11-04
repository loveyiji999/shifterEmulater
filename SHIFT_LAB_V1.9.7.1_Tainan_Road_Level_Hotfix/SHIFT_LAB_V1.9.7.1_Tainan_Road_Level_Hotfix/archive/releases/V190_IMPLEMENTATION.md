# SHIFT LAB v1.9.0 implementation — procedural roads v2

Release date: 2026-10-22. Parent release: v1.8.9.3.

## Scope

v1.9.0 implements the first approved part of v1.9: seeded road generator v2, geometric quality gates, backward-compatible road import, and smoke/regression tests. Terrain, road asset density, long-running 3D streaming performance and new physics tuning are deferred to later versions.

## Architecture

- `desktop3d/public/road-generator-v2.js`: dependency-free classic script exposing `globalThis.SHIFT_ROAD_V2`. Reusable in the 2D physics iframe and a Node VM, so no parallel/proxy road geometry is introduced.
- `desktop3d/public/physics.html`: retains original v1 seeded algorithm literally. `generateRoad({generator:2,...})` chooses v2, while v1 still uses its archived code. `extendRoad` dispatches to v2 when requested. Both generators fill the **same** `route.points` and `route.segments` contract, so original `roadPointAt`, wheel contact, 3D RoadWorld meshes and Rapier collision sampling remain aligned.
- `desktop3d/src/procedural-map.mjs`: understands `shiftlab.road.v1`/generator 1 and `shiftlab.road.v2`/generator 2 documents. An absent `generator` in an old saved raw map means v1. V2 is the default **only for a new installation without a saved map**.
- `desktop3d/src/main.mjs` and `desktop3d/index.html`: one settings selector for road generator version; map preview/quality metrics; saved map retains generator selection; test suite uses the untouched deterministic v1 reference road.

## Generator v2 design

A random walk with naive trial-and-reject can dead-end after multiple U-turns. V2 plans collision-free *topological feature corridors* instead:

1. A straight feature advances into an unused area.
2. A normal bend consists of a left/right transition paired with an opposite bend to restore the forward heading.
3. A full hairpin feature includes a straight approach, ~157–178 degree turn, laterally separated return lane, opposite U-turn and forward exit. True U-turn curvature is preserved; adjacent traffic lanes cannot collapse into a single path.
4. Grades are chosen independently per section according to the original controls. Slope and heading profiles use smooth entry/exit easing.
5. Each accepted section is sampled every <=4.5m and checked in a 40m spatial hash. A 34m sample separation is enforced for road portions separated by at least 75m of arc length. This is a **planar separation**, not a grade-separated bridge model. Because road render/soil triangles span +/-14m from centerline, the sample clearance includes margin for interpolation between samples. Guardrails remain nearer the centerline.
6. Every `extendRoad` completes an independent audit: no non-finite values, strictly increasing arc length, grade bound, curvature bound <=0.024rad/m, and no sampled nonlocal centerline overlap. Rejected geometry fails closed, not silently inserted.

The constraint deliberately optimizes reliability over random heading freedom. V2 tends to advance through successive road corridors rather than drawing arbitrarily interconnecting city streets. It is a winding-road simulator, not a junction/network builder. The probability controls influence feature choice; their effective frequency per individual *road segment* differs from v1 due to paired features.

## Backward compatibility

- V1 path-integrator, map seed hash, and random number generator are unchanged (v1 route sample positions were compared with archived source in Chromium).
- V1 JSON with missing `config.generator` is accepted as v1; v2 JSON is explicit.
- The `shiftlab.v189.procedural-map` key is retained to recover user settings without migrating routes.
- No mechanical gearbox, PRND, tire, suspension, chassis-bridge, camera, scene renderer, or testing-scenario algorithms were rewritten in this release.

## Known limitations

- No road junctions, bridges, tunnel-overpasses, or matching terrain mesh yet.
- The 34m quality rule checks discretely sampled centerlines in the horizontal plane; it is not a complete road-engineering or vehicle-clearance certification.
- The generator is seed deterministic; its output is specific to v2 algorithm and should not be assumed to remain unchanged if the algorithm version is incremented.
- The physical shell in Chromium and Node simulation pass; actual Three.js WebGL/Rapier WASM runtime has not been verified in this execution environment because npm dependencies are unavailable. Run `archive/legacy/browser-tests/browser_v190.py` after installing dependencies on a suitable computer.
