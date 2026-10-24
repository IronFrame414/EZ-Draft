# EZD-030 spike: wall openings and sloped ceiling

Draft findings for the go / no-go note `vault/spikes/EZD-030.md`, which the orchestrator writes (vault/plans/EZD-030.md Step 3). Throwaway code: never imported by the app, packages or worker.

## Run

From the repo root:

- `pnpm --filter @ezdraft/spike-ezd-030-wall-openings run spike-typecheck` (`tsc --noEmit -p .`: `src/` without the test and bench files, `lib` ES2023, `types` [], so no DOM and no Node types)
- `pnpm --filter @ezdraft/spike-ezd-030-wall-openings run spike-test` (T1-T13)
- `pnpm --filter @ezdraft/spike-ezd-030-wall-openings run bench`

## What was tried

- `three` 0.186.1 (the pinned version), types `@types/three` 0.186.0 (the types release for three r186).
- `three`'s own `Shape` / `Path` / `ExtrudeGeometry` (`depth` = thickness, `bevelEnabled: false`, `steps: 1`). No own extrusion and no `ShapeUtils` fallback was needed.
- No CSG library of any kind.
- `wall-face.ts` builds the 2D face in the wall-local frame (x along the wall, y up). The top is one straight edge from `(0, topHeightAt(0))` to `(length, topHeightAt(length))`, so the slope costs no extra points.
- **Door at the floor:** an opening with `sill` 0 is cut as a notch in the outer outline (the outline runs along the floor, up the door jamb, across the head and back down), not as a hole, because a hole that touches the outer contour gives a broken triangulation (plan Risks; not tried here). Openings with a sill above 0 (the window) are holes. As a result the mesh has no door sill face and the floor face is the wall length minus the door width (T7, T10).

## Results (W1: 12' wall, 4.5" thick, 4:12 rising from 96", 36 x 80 door, 36 x 60 window at 42" sill)

- T1-T13 pass with no CSG library (spike-test output: 13 passed of 13).
- W1 mesh: 48 triangles, 144 vertices. The output is not indexed (three's `ExtrudeGeometry`), in two groups: the two face caps (24 triangles) and the side walls (24 triangles: 12 outline edges x 2). The side walls include both door jambs, the door head, the window jambs, sill and head, the sloped top, both wall ends and the floor.
- Bench `buildWallMesh(W1)` (Vitest 5.0.5 bench, Node v22.23.3, Apple M6, arm64, 165,202 samples): **mean 0.0061 ms per wall** (min 0.0055, p99 0.0073, max 0.3461). Mean x 3,000 (benchmark project object count, 11 Budgets) = **about 18 ms**, under the 1,000 ms that the plan sets as the flag for EZD-1001a. Measured in Node on the build PC, not on the iPad.

## Shapes extrude-with-holes cannot express

Found or judged; none is built or tested here. These are the cases 11 rule 6 sends to three-bvh-csg, or that need 2D work on the face first.

1. **Anything that changes through the thickness:** splayed or beveled jambs, a niche or recess that does not go all the way through, different opening sizes on the two faces (for example a rough opening on one face and the nominal size on the other), wall layers with different openings. A straight extrusion gives the same outline at z = 0 and z = thickness.
2. **A ceiling that slopes across the wall's thickness.** When the slope direction is not along the wall, the top surface tilts across the thickness (at 4:12 over 4.5" that is 1.5"). The extrusion's top is level across the thickness. Only a wall that runs along the slope direction is exact.
3. **Wall ends that are not square to the face:** mitered corners and T-joins. The extrusion's ends are square; the join shape comes from the plan view, not from the elevation face.
4. **Openings that reach the sloped top, overlap each other or touch a wall end.** These can be expressed only after a 2D boolean on the face (Clipper2) turns them into notches. `wallFace` does not do this; its output for such input is not defined. What should happen when an opening reaches above the sloped top is not decided (plan Risks).
5. **An opening that spans two walls** (corner window): one wall's face cannot hold it.

Expressible but not built here: a top made of more than one ceiling plane (a ridge or a flat-to-sloped break over the wall) is more points on the top edge of the outline; arched or round-top openings use `Path` curves (`curveSegments`).

## Recommended home for each part

- `src/wall-face.ts` → `packages/geometry` (EZD-504 wall-top profile). It has no package imports and runs in Node, Web Workers and the browser.
- `src/wall-mesh.ts` → the lazy 3D scene chunk `app/src/lazy/scene-3d/` (EZD-1001a; 11 rule 7), since it imports `three`.

## Notes for the reviewers

- Vitest 5.0.5 has no top-level `bench` export; `bench` comes from the test context (`test(name, async ({ bench }) => bench(...).run())`). The bench file uses that form.
- The test file is not type-checked: `tsconfig.json` excludes it and there is no `tsconfig.test.json`, the same as `packages/geometry`. `@types/node` is therefore not a dependency.
