# Fixtures

Test files shared by the app, the geometry package and the spikes (EZD-016b, `vault/plans/EZD-016b.md`). Every file here is listed in `manifest.json`, and every manifest entry has one row in the table below. A ticket that adds a fixture adds its manifest entry and its row here in the same commit; `scripts/fixtures/__tests__/manifest.test.mjs` (T7) fails otherwise.

- **generated**: written by `scripts/fixtures/generate-synthetic.mjs`. Never edit these files by hand.
- **real**: a copy of a real file from Josh, stored in `fixtures/real/<id>/`.

## Files

| id | origin | kind | status | path | needed by | source |
| --- | --- | --- | --- | --- | --- | --- |
| `synthetic-room-dxf` | generated | polycam_dxf | present | `fixtures/synthetic/room-12x10.dxf` | EZD-029, EZD-302 | this ticket (EZD-016b) |
| `synthetic-room-vector-pdf` | generated | pdf | present | `fixtures/synthetic/room-12x10-vector.pdf` | EZD-304, EZD-305 | this ticket (EZD-016b) |
| `synthetic-room-glb` | generated | polycam_glb | present | `fixtures/synthetic/room-12x10-sloped.glb` | EZD-303 | this ticket (EZD-016b) |
| `synthetic-room-scanned-pdf` | generated | pdf | present | `fixtures/synthetic/room-12x10-scanned.pdf` | EZD-305 | this ticket (EZD-016b) |
| `polycam-dxf` | real | polycam_dxf | not yet supplied | `fixtures/real/polycam-dxf/` | EZD-016, EZD-302, EZD-303; without it: detection is built against a synthetic file and may miss real layer names | needs-from-josh.md |
| `polycam-glb` | real | polycam_glb | not yet supplied | `fixtures/real/polycam-glb/` | EZD-016, EZD-302, EZD-303 | needs-from-josh.md |
| `vector-pdf` | real | pdf | not yet supplied | `fixtures/real/vector-pdf/` | EZD-304, EZD-305; without it: built against synthetic files | needs-from-josh.md |
| `scanned-pdf` | real | pdf | not yet supplied | `fixtures/real/scanned-pdf/` | EZD-304, EZD-305 | needs-from-josh.md |
| `supplier-pdf` | real | supplier_pdf | not yet supplied | `fixtures/real/supplier-pdf/` | EZD-915; stand-in committed by EZD-915 | needs-from-josh.md; phase-09 EZD-915 row |
| `architect-dxf` | real | dxf | not yet supplied, still pending from Josh | `fixtures/real/architect-dxf/` | EZD-029, EZD-901, EZD-1702; without it: the benchmark uses a generated DXF; stand-in by EZD-901a | decisions.md · Build answers (Josh), "Still pending" |
| `architect-dxf-revised` | real | dxf | not yet supplied, still pending from Josh | `fixtures/real/architect-dxf-revised/` | Reference diff (08 Revised architect DXF); stand-in by EZD-901a | decisions.md · Build answers (Josh), "Still pending"; ticket row |
| `supplier-2020-dxf` | real | dxf | not yet supplied, still pending from Josh | `fixtures/real/supplier-2020-dxf/` | EZD-916, EZD-918 | decisions.md · Build answers (Josh), "Still pending"; needs-from-josh.md "Supplier 2020 sample (DXF + order report)" |
| `order-report` | real | order_report | not yet supplied, still pending from Josh | `fixtures/real/order-report/` | EZD-916, EZD-918; stand-in committed by EZD-916 | decisions.md · Build answers (Josh), "Still pending"; needs-from-josh.md |
| `photos` | real | photo | not yet supplied | `fixtures/real/photos/` | No ticket row names it yet; 08 Site photos "JPG / HEIC" | ticket row; needs-from-josh.md |

## The synthetic room

One room, used by all four generated files (`scripts/fixtures/room.mjs`). These values are test data, not product values (KNOWN-LIMITS item 5). Model units are decimal inches (03 rule 5). Plan axes: x east, y north; the origin is the south-west interior corner.

- **Interior 144 × 120 in (12'-0" × 10'-0")**: the ticket row's "12' × 10' room"; the same room as EZD-028 Step 1 and EZD-030 W1.
- **Walls 4.5 in thick** on all four sides, outward from the interior faces (EZD-030 W1; fixture choice).
- **Door** in the south wall, x 12 to 48 (offset 12, width 36), height 80, hinge at (12, 0), swinging 90° into the room; the leaf is drawn open from (12, 0) to (12, 36) (EZD-028 Step 1, EZD-030 W1; fixture choice, no spec source gives door sizes).
- **Window** in the south wall, x 84 to 120 (offset 84, width 36), sill 42, head 102 (EZD-030 W1; fixture choice).
- **Ceiling (GLB only)**: 96 in at the west wall rising east at 4:12 to 144 in at the east wall, level north to south (EZD-030 W1; S05 writes pitch as n/12). Every point is at least 7'0", so the room passes 09 B-01.
- **Drawing layers** `WALLS`, `DOORS`, `WINDOWS`, `ROOMS` (plus `0`): **invented** names from the words of 08 ("Walls, openings, rooms detected by layer"). Real Polycam layer names are unknown.
- **DXF**: R12 (`AC1009`), `$INSUNITS` 1 (inches), colour 7, linetype `CONTINUOUS`.
- **PDFs**: one 11×17 landscape page, 1224 × 792 pt (08 Exports 11×17), plan at 1/4" = 1'-0" (09 Sheet set rules), so 1.5 pt per model inch; the interior south-west corner is at (504, 300) pt. Walls 1.5 pt, door, swing and window 0.5 pt (EZD-028 placeholder widths). The swing is one cubic curve with the quarter-circle constant 0.5522847.
- **Scanned PDF**: the same page drawn at 150 px per inch (2550 × 1650 px, 8-bit grey), walls 3 px, the rest 1 px, no text, no noise, no skew.
- **GLB**: glTF 2.0 binary in metres with +Y up (Khronos glTF 2.0, coordinate system and units; 0.0254 m per inch), interior surfaces only (floor, sloped ceiling, four walls with the door and window holes), no textures.
- **Tolerances**: 1/64 in (03 rule 5); 1/64 in × 1.5 on paper; 1/64 in × 0.0254 in metres; 0.5 sq in for areas (EZD-030 Tests); ±1 px on the scan.

The encoding (layer names, R12, double-line walls, the page layout, the GLB orientation) is a fixture choice. Real Polycam files and real PDFs will differ; later tickets must not read these choices as a description of the real formats.

Each generated file has a hand-written `<file>.expected.json` next to it, with the values taken from the plan, never from the generator's output.

## Regenerating

Run `pnpm fixtures:generate` (the same as `node scripts/fixtures/generate-synthetic.mjs`). It rewrites the four generated files in `fixtures/synthetic/` and never writes the `*.expected.json` files. Generated files are never edited by hand. A variant (for example EZD-302's room with one unjoined wall, Q-0066) is written with the exported `room`, `planDrawing` and writers, and gets its own manifest entry and row here.

## Real files

Real files are stored unchanged once Josh has prepared them (08: "Originals are always stored unchanged"). The only change ever made to a real file is the removal described below.

How a real file is added (Q-0065):

1. A real file is committed only after Josh has removed names, addresses and photo location data from it.
2. The file goes in `fixtures/real/<id>/` in the commit that changes its manifest entry to `present`. The same commit updates its row in the table above, which says what Josh removed from that file.
3. The repository is public for now and will be made private after the app is built (Q-0065), so this rule applies to every real file committed before then.

No real file has been committed yet.
