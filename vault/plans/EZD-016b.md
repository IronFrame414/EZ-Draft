# EZD-016b · Fixtures

Phase: 0 · Planned by: planner · Date: 2026-10-11 · Status: planned (Q-0065 answered-josh (b), 2026-10-12, applied; Q-0066 answered-agent; Q-0002 deferred, does not block). Revised 2026-10-12: the `.gitignore` / T12 branch for Q-0065 (c) is removed

## Ticket (copied from the phase file)
Scope: Fixtures folder with a README saying which files are real and which are generated: Polycam DXF + GLB, vector PDF, scanned PDF, supplier PDF, architect DXF and its revised version, order report, photos; a script that writes synthetic fixtures (a layered DXF and a vector PDF of a 12' × 10' room with one door and one window, a GLB of the same room with a sloped ceiling of known heights, and a one-page scanned image-only PDF) with expected-result JSON.
Done when: The synthetic fixture script runs in CI and its expected JSON matches.
Depends on: EZD-016a (`tickets.json` `depends_on: ["EZD-016a"]`). Also, not in the ticket row:
- **EZD-016a is an ordering dependency only.** This ticket uses none of its code (no Playwright, no seed). It adds a `### Fixtures (EZD-016b)` subsection next to EZD-016a's `### Browser tests (EZD-016a)` under `## Tests` in `docs/architecture.md` (vault/plans/EZD-016a.md Step 8). The split from EZD-016 keeps this order.
- **EZD-000** (transitive: EZD-016a → EZD-002 → EZD-001 → EZD-000). Used directly:
  - the Dependencies rows for `dxf-parser`, `pdfjs-dist` and `three`, and check C1 (vault/plans/EZD-000.md Step 2 Dependencies, Step 3 C1);
  - the `## Folder layout`, `## Tests` and `## Machine checks` sections;
  - the root `test` glob `scripts/**/*.test.mjs` (Step 1);
  - the conventions check never reads `**/fixtures/**` (Step 3), so fixture data is not scanned.
- **EZD-001** (transitive). Used directly: the root `test` script with `--test-concurrency=2` (Q-0019); the rule that root `node:test` files run in full on every gate run and are not filtered by test scope (vault/plans/EZD-001.md Step 6.1, Q-0006); root devDependencies at exact versions; `.npmrc` `save-exact=true`.
- **Not dependencies, but later tickets that read this ticket's files.** None of them has to list EZD-016b, because phases run in order:
  - EZD-029: reads the synthetic DXF.
  - EZD-302: reads the synthetic DXF, and writes the unjoined variant itself with this ticket's exported `room`, `planDrawing` and `writeDxf`, picking the gap against its own scoring and the Defaults tolerance (Q-0066 answered-agent (b), code-reviewer at plan review; R24 #30). It adds its manifest and README rows in the same commit (T7).
  - EZD-303: "heights and slope read from the fixture GLB match its expected JSON". Its row lists only EZD-301, not EZD-016.
  - EZD-304 and EZD-305: read the vector PDF and the scanned PDF. Their rows list only EZD-301 and EZD-304, not EZD-016.
  - EZD-901a, EZD-915 and EZD-916 add their own generated stand-ins. They must add manifest and README rows (test T7).
  - EZD-1702: an oversize fixture.
  - EZD-017, EZD-019, EZD-021 and EZD-1709a depend on "EZD-016", which includes this part (R26 R33), but use only the harness.
- **For the orchestrator (Level 2, not questions):**
  - `vault/tickets/needs-from-josh.md` has no row for **photos**, which this ticket's row lists as a fixture.
  - needs-from-josh.md asks for "2–3 architect DXFs" but does not ask for a **revised version of one of them**, which this row and 08 ("Revised architect DXF") need.
  - Add both rows to needs-from-josh.md. Their privacy handling is Q-0065 (b): Josh removes names, addresses and photo location data before they are committed.
- Earlier plans this plan extends and does not replace:
  - vault/plans/EZD-000.md: Dependencies table, Folder layout, Tests, Machine checks.
  - vault/plans/EZD-001.md: root `test` script, Step 6 test scope.
  - vault/plans/EZD-016a.md: the `## Tests` subsection pattern, and its harness-ticket split between test-author and builder.
  - vault/plans/EZD-028.md and vault/plans/EZD-030.md: room geometry, scale and wall, opening and ceiling values; see Fixture values below.

Spec ref: Build phases and acceptance tests; Import and export · Imports (`spec_files`: `12-build-phases-and-acceptance-tests.md`, `08-import-and-export.md`).

## Sources read
- Spec:
  - `08-import-and-export.md`. Imports table: Polycam layered DXF "Walls, openings, rooms detected by layer", "About 0.5" tolerance"; Polycam GLB "ceiling heights can be read from it", "Reference only"; vector PDF "wall lines auto-detected"; scanned PDF "Underlay for tracing / Trace only"; supplier vector PDF; Supplier 2020 order report "Format to confirm with a real sample"; architect DXF; revised architect DXF; site photos "JPG / HEIC". Intro: "Originals are always stored unchanged". Exports: 11×17 for client and field copies.
  - `12-build-phases-and-acceptance-tests.md` (Import row: "Low-confidence items highlighted; nothing enters the model before accept").
  - `02-product-overview.md` (Stack: PDF in "pdf.js", DXF in/out "dxf-parser … confirmed or replaced by EZD-029", 2D + 3D "Three.js"; Named tools).
  - `03-data-model.md`:
    - Architecture rule 5: decimal inches, 1/64 in tolerance.
    - `source_file` kinds: polycam_dxf, polycam_glb, pdf, supplier_pdf, dxf, image, order_report, photo, panel_photo.
    - Objects inside model_json: walls (thickness, height, top edge cut to ceiling); openings (size, swing, sill height); rooms ("ceiling heights by point or pitch").
  - `04-app-shell-and-global-ui.md` (Measurement entry: stores to 1/16").
  - `09-calculations-and-rules.md`: Sheet set rules (plans at 1/4" = 1'-0", as used by EZD-028); B-01 Ceiling height (7'0" habitable; under a slope at least half the floor at 7'0" and none under 5'0").
  - `11-non-functional-requirements.md` (Performance rules 3, 5; "DXF size limits are set after testing real architect files").
  - `screens/S01-projects.md`: file type tags; "PDF: scale calibration … two points, type the real distance"; "PDF: detect type".
  - `screens/S02-import-review.md`: "Ceiling slope items … heights at points (low/high wall), pitch, or the value read from the mesh"; Show 3D mesh.
  - `screens/S05-ceiling-plan-rcp.md` (pitch written `n/12`).
- Decisions:
  - R26 R16 (unread DXF entity types are counted, never dropped), R26 R25 (non-Polycam DXF layer map), R26 R33 (a base ID means every lettered part).
  - Build answers (Josh): "Still pending from Josh as of 2026-10-11 … Supplier 2020 sample, architect DXFs"; Q-0006 (phase tests plus smoke per ticket; full suite at the phase gate); Q-0019 (16 GB PC, low parallelism).
  - Open, referenced, not re-asked: Q-0021 and Q-0022 (CI runs only on the phase PR). Q-0001 to Q-0056 read; none decides anything below.
- Process: `vault/PROCESS.md` (Special tickets: harness tickets, "the test-author builds the harness code itself (… fixtures …); the builder does any non-test part"), `vault/KNOWN-LIMITS.md` (item 5: sample data is not a decision), `vault/tickets/README.md` (rules 4 and 8: "Use the placeholder fixture if one is named"; Needs from Josh table), `vault/tickets/needs-from-josh.md`, `CLAUDE.md` (rules 6, 8–12).
- Repo files:
  - `.claude/hooks/guard-paths.mjs`: any path with a `fixtures/` segment, or under `__tests__/`, is a test path. The test-author may write it and the builder may not.
  - `.gitattributes`: `* text=auto eol=lf`, `*.pdf binary`.
  - `.github/workflows/ci.yml`: Node 22, runs `node scripts/gate.mjs .`.
  - `scripts/gate.mjs`.
  - The GitHub repository `IronFrame414/EZ-Draft` is **public** (`gh repo view --json visibility`, Oct 11), which was the reason for Q-0065. Josh's answer (b): real fixtures are committed only after he removes names, addresses and photo location data, and the README says so; the repository stays public for now (free tooling) and will be made private after the app is built (decisions.md · Build answers (Josh), Q-0065).
- Mockup: none (`tickets.json` `mockups: []`). No screen is built.

## Approach

This is a harness ticket (PROCESS.md Special tickets):
- The **test-author** writes the generator, the generated fixture files, the expected-result JSON, the manifest, the README and the tests. All of these sit under `fixtures/` or `scripts/fixtures/`, which guard-paths.mjs treats as test paths.
- The **builder** writes the non-test part: root `package.json`, `pnpm-lock.yaml`, `.gitattributes` and `docs/architecture.md`.
- Choices that no source makes are marked *fixture choice* or *planner's choice*. They are technical choices (CLAUDE.md rule 4). They describe test data only and are not product values (KNOWN-LIMITS item 5).

### Step 1: Where things live (planner's choice)
- `fixtures/` at the repo root holds the data. Fixtures are shared by `app/`, `packages/geometry` and `spikes/` (EZD-029 reads the DXF by path), so they cannot live inside one package.
  - `fixtures/README.md`
  - `fixtures/manifest.json`
  - `fixtures/synthetic/`: the 4 generated files and their 4 `*.expected.json` files.
  - `fixtures/real/<id>/`: Josh's files, once supplied and only after he has removed names, addresses and photo location data (Q-0065 (b)). No such folder is created now.
- `scripts/fixtures/` holds the generator, which is plain Node ESM `.mjs` with JSDoc types, like EZD-028. Its tests are in `scripts/fixtures/__tests__/` (`node:test`). EZD-000's root glob `scripts/**/*.test.mjs` already runs them in every gate run and in CI, unfiltered (EZD-001 Step 6.1). That is what the Done-when needs: "runs in CI".
- **The generator has no package dependencies.** It uses only `node:` built-ins (`fs`, `path`, `zlib`, `crypto`). It writes the DXF (text), both PDFs and the GLB itself. Reasons:
  1. A fixture must not be made by the code that will later read or write the same format. The app's PDF writer (PDFKit, 02 Named tools) and DXF writer (EZD-029) are code under test.
  2. Hand-written bytes are fully deterministic, so the committed files can be compared byte for byte.
  3. The test-author can run the generator before the builder adds any package.
  - This also keeps `pdfkit` out of the fixture code, so EZD-000 check C6 does not apply.
- **The files are read back with the libraries the app will use**, so each fixture is proven readable by the app's own stack:
  - DXF with `dxf-parser` (02 Stack, provisional until EZD-029);
  - PDFs with `pdfjs-dist` (02 Stack PDF in);
  - GLB with `three`'s `GLTFLoader` (02 Stack 2D + 3D; S02 Show 3D mesh).
  - These three are already in EZD-000's Dependencies table. The builder installs them as root devDependencies (Step 7).
- **Expected-result JSON is literal data**, written by the test-author from the tables in this plan. The generator does not emit it. A test that compares a generator's output with JSON made by the same generator would always pass. The ticket's "script that writes synthetic fixtures … with expected-result JSON" is met by committing each fixture with its expected JSON next to it.

### Step 2: The synthetic room (`scripts/fixtures/room.mjs`, one definition used by every writer)
- Model units are decimal inches (03 rule 5).
- Plan axes: x east, y north. The origin is the south-west interior corner.
- Each value below has a source or a stated derivation (see Fixture values).

| Item | Value |
| --- | --- |
| Interior | 144 × 120 (12'-0" × 10'-0"), x 0–144, y 0–120 |
| Wall thickness | 4.5 on all 4 walls; walls extend outward from the interior faces |
| Door | South wall (y = 0), x 12–48 (offset 12, width 36), height 80, hinge at (12, 0), swings 90° into the room; leaf drawn open (12,0)→(12,36) |
| Window | South wall, x 84–120 (offset 84, width 36), sill 42, head 102 |
| Ceiling (GLB only) | Height h(x) = 96 + x·4/12: 96 at the west wall, 144 at the east wall, rising east at 4:12, level along y |

### Step 3: The plan drawing (`scripts/fixtures/plan-drawing.mjs`)
`planDrawing(room)` returns 2D primitives by layer, in model inches. The DXF, the vector PDF and the raster are all drawn from this list, so the three show the same plan:
- **WALLS: 16 lines.** Double-line walls with breaks at both openings, and jamb lines at each break.
  - South interior face (y 0): (0,0)–(12,0), (48,0)–(84,0), (120,0)–(144,0).
  - South exterior face (y −4.5): (−4.5,−4.5)–(12,−4.5), (48,−4.5)–(84,−4.5), (120,−4.5)–(148.5,−4.5).
  - Jambs: x = 12, 48, 84, 120, each from y −4.5 to 0.
  - North: (0,120)–(144,120) and (−4.5,124.5)–(148.5,124.5).
  - West: (0,0)–(0,120) and (−4.5,−4.5)–(−4.5,124.5).
  - East: (144,0)–(144,120) and (148.5,−4.5)–(148.5,124.5).
- **DOORS: 1 line and 1 arc.** The leaf (12,0)–(12,36) and the swing arc, centre (12,0), radius 36, from 0° to 90° counter-clockwise, i.e. from (48,0) to (12,36).
- **WINDOWS: 3 lines.** (84,0)–(120,0), (84,−2.25)–(120,−2.25) and (84,−4.5)–(120,−4.5): the interior face, the glass at mid-thickness and the exterior face.
- **ROOMS: 1 closed polygon.** (0,0), (144,0), (144,120), (0,120).

### Step 4: Writers (all in `scripts/fixtures/`, Node built-ins only)
1. **`write-dxf.mjs` → `room-12x10.dxf`.** ASCII DXF R12, written with LF line endings and no BLOCKS section.
   - HEADER: `$ACADVER` = `AC1009` and `$INSUNITS` = 1 (inches).
   - TABLES: LTYPE `CONTINUOUS`, plus a LAYER table with `0`, `WALLS`, `DOORS`, `WINDOWS` and `ROOMS`, each with colour 7 and linetype CONTINUOUS.
   - ENTITIES: LINE, ARC, and a POLYLINE with flag 70 = 1 (closed), followed by 4 VERTEX entities and a SEQEND.
   - All z values are 0. Numbers use JavaScript's shortest decimal form.
2. **`write-pdf.mjs`.** A minimal PDF 1.4 object writer shared by both PDFs:
   - header `%PDF-1.4` followed by a binary comment line;
   - Catalog, Pages and one Page with MediaBox `[0 0 1224 792]`;
   - a content stream, plus an image XObject on the scanned page;
   - a classic xref table whose byte offsets are exact, and a trailer with `/Size` and `/Root`;
   - no `/Info`, no `/ID` and no encryption.
3. **`room-12x10-vector.pdf`** (vector page):
   - The content stream is uncompressed.
   - Mapping: paper X = 504 + 1.5·x, paper Y = 300 + 1.5·y (PDF user space, y up). Scale 1/4" = 1'-0".
   - Line widths: 1.5 pt for walls; 0.5 pt for the door, the swing and the window.
   - Each straight line is drawn as `m … l … S`.
   - The swing is one cubic Bézier `c`, with control distance 54 × 0.5522847 = 29.8234 pt: from (576,300) via (576,329.8234) and (551.8234,354) to (522,354).
   - There is no text and no image.
4. **`raster.mjs` + `room-12x10-scanned.pdf`** (scanned page):
   - `rasterizePlan(room)` draws the same paper layout at 150 px per inch. That gives a 2550 × 1650 px, 8-bit greyscale buffer: white 255, black 0.
   - Pixel mapping: column = X·150/72; row from the top = (792 − Y)·150/72.
   - Walls are drawn 3 px wide. The door, the swing and the window are drawn 1 px wide; the arc is sampled densely enough to leave no gaps.
   - There is no noise and no skew, so the file is deterministic.
   - The page holds one image XObject (`/Width 2550 /Height 1650 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, data `zlib.deflateSync` of the buffer). It is drawn by `q 1224 0 0 792 0 0 cm /Im1 Do Q`, and there are no other operators.
5. **`write-glb.mjs` → `room-12x10-sloped.glb`.** glTF 2.0 binary (GLB) with a 12-byte header and a JSON chunk, then a BIN chunk, each padded to 4 bytes.
   - `asset.version` `"2.0"`, `asset.generator` `"EZ Draft fixtures EZD-016b"`.
   - 1 scene, 1 node and 1 mesh (`room`) with 1 triangle primitive (mode 4).
   - Attributes `POSITION` and `NORMAL` are float32 VEC3; POSITION has `min` and `max`. Indices are uint16.
   - Units are metres and +Y is up (Khronos glTF 2.0 specification, "Coordinate system and units"). Plan (x, y, height h) in inches maps to glTF (0.0254·x, 0.0254·h, −0.0254·y), a proper rotation (determinant +1).
   - The mesh has interior surfaces only, like a scan seen from inside, and no textures:
     - floor;
     - the sloped ceiling;
     - west, east and north walls, 1 quad each;
     - the south wall as 6 quads around the 2 holes: x 0–12; x 12–48 above the door (80 → top); x 48–84; x 84–120 below the window (0–42); x 84–120 above the window (102 → top); x 120–144.
   - In total that is 11 quads: 44 vertices (no vertex shared between quads) and 22 triangles.
   - Normals point into the room, and triangles wind counter-clockwise seen from inside (glTF front face).
   - The opening side faces through the wall are not modelled. This is a fixture choice: an interior scan surface only.
6. **`generate-synthetic.mjs`** (the CLI): `node scripts/fixtures/generate-synthetic.mjs [--out <dir>]`.
   - The default output folder is `fixtures/synthetic`.
   - It writes exactly the 4 files above and prints one JSON line per file: name, bytes and sha256.
   - Exit 0 on success, 1 on any error. It never writes `*.expected.json`.
   - Exports `room`, `planDrawing` and each writer, so a later ticket can write a variant without copying code. Q-0066 (answered-agent (b)): EZD-302 writes "the synthetic fixture with one unjoined wall" (its Done when) this way; this ticket writes no unjoined variant and names no gap.
7. The test-author runs the CLI once and commits its output in `fixtures/synthetic/`.

### Step 5: Expected-result JSON (`fixtures/synthetic/<file>.expected.json`, test-author, literal values from this plan)
Every file has `fixture` (the file name), `generatedBy` (`scripts/fixtures/generate-synthetic.mjs`), `sources` (a short list of citations) and the tolerances. The values are in the Tests table (T2–T5) and in Fixture values. All of them derive from Step 2 and are listed so the calc-auditor can check each one.

### Step 6: Manifest and README (`fixtures/manifest.json`, `fixtures/README.md`, test-author)
`manifest.json` is an array. Each entry has: `id`, `origin` (`generated` | `real`), `kind` (03 `source_file` kind), `status` (`present` | `not yet supplied`), `path` (a file for generated entries; a folder `fixtures/real/<id>/` for real ones), `expected` (generated entries), `neededBy` (from needs-from-josh.md), `withoutIt` (from needs-from-josh.md), `standIn` (the later ticket that commits a generated stand-in, if any) and `source`.

| id | origin | kind | status | needed by / note | source |
| --- | --- | --- | --- | --- | --- |
| `synthetic-room-dxf` | generated | polycam_dxf | present | EZD-029, EZD-302 | this ticket |
| `synthetic-room-vector-pdf` | generated | pdf | present | EZD-304, EZD-305 | this ticket |
| `synthetic-room-glb` | generated | polycam_glb | present | EZD-303 | this ticket |
| `synthetic-room-scanned-pdf` | generated | pdf | present | EZD-305 | this ticket |
| `polycam-dxf` | real | polycam_dxf | not yet supplied | EZD-302 (needs-from-josh: EZD-016, 302, 303); without it "Detection is built against a synthetic file and may miss real layer names" | needs-from-josh.md |
| `polycam-glb` | real | polycam_glb | not yet supplied | EZD-303 | needs-from-josh.md |
| `vector-pdf` | real | pdf | not yet supplied | EZD-304, EZD-305; "Built against synthetic files" | needs-from-josh.md |
| `scanned-pdf` | real | pdf | not yet supplied | EZD-304, EZD-305 | needs-from-josh.md |
| `supplier-pdf` | real | supplier_pdf | not yet supplied | EZD-915; stand-in committed by EZD-915 | needs-from-josh.md; phase-09 EZD-915 row |
| `architect-dxf` | real | dxf | not yet supplied — **still pending from Josh** | EZD-029, EZD-901, EZD-1702; "The benchmark uses a generated DXF"; stand-in by EZD-901a | decisions.md · Build answers (Josh), "Still pending" |
| `architect-dxf-revised` | real | dxf | not yet supplied — **still pending from Josh** | Reference diff (08 Revised architect DXF); stand-in by EZD-901a | same; ticket row |
| `supplier-2020-dxf` | real | dxf | not yet supplied — **still pending from Josh** | EZD-916, EZD-918 | same; needs-from-josh "Supplier 2020 sample (DXF + order report)" |
| `order-report` | real | order_report | not yet supplied — **still pending from Josh** | EZD-916, EZD-918; stand-in committed by EZD-916 | same |
| `photos` | real | photo | not yet supplied | No ticket row names it yet; 08 Site photos "JPG / HEIC" | ticket row (missing from needs-from-josh.md, see Depends on) |

`README.md` contains:
1. one table row per manifest entry, with the same id, origin and status words;
2. the synthetic room in words, with every value and its source (Fixture values);
3. how to regenerate (`pnpm fixtures:generate`), and that generated files are never edited by hand;
4. the rule that real files are stored unchanged once Josh has prepared them (08 "Originals are always stored unchanged"; the only change made is Josh's removal in item 5);
5. how a real file is added (Q-0065 answered-josh (b)):
   - a real file is committed only after Josh has removed names, addresses and photo location data from it. The README states this rule in so many words (Q-0065 (b): "the README says so");
   - the file goes in `fixtures/real/<id>/` in the commit that flips the manifest entry to `present`, and the same commit updates the README row, which says what Josh removed from that file;
   - the repository is public for now and will be made private after the app is built (Q-0065), so the rule applies to every real file committed before then.
   - No `.gitignore` line is added for `fixtures/real/`, and no real file exists yet, so this ticket commits none.

### Step 7: Wiring and docs (builder, same commit)
- **Root `package.json`:**
  - devDependencies `dxf-parser`, `pdfjs-dist` and `three`, each at exactly its EZD-000 Dependencies version (C1);
  - script `"fixtures:generate": "node scripts/fixtures/generate-synthetic.mjs"`.
- `pnpm-lock.yaml` regenerated.
- **`.gitattributes`:** append `*.glb binary` and `*.dxf text eol=lf`.
  - These are explicit, because the test compares bytes. The existing `* text=auto eol=lf` would already keep the DXF LF.
  - Also `*.heic binary` and `*.jpg binary`, for the photos still to come.
- **`docs/architecture.md`**, existing `##` headings only (EZD-000 T5):
  - `## Tests` → `### Fixtures (EZD-016b)`:
    - the folder layout;
    - `fixtures/manifest.json` and the README rule;
    - generated files are rebuilt with `pnpm fixtures:generate` and never hand-edited;
    - expected JSON is hand-written from the plan;
    - readers are `dxf-parser`, `pdfjs-dist` and `three`'s GLTFLoader;
    - a later ticket that adds a fixture adds a manifest entry and a README row in the same commit (T7 enforces it);
    - variants are written with the exported writers.
  - `## Folder layout`: `fixtures/` and `scripts/fixtures/`.
  - `## Dependencies`: add `root` to the `Used in` cell of `dxf-parser`, `pdfjs-dist` and `three`. Version and Added by are unchanged.
  - `## Machine checks`: row "synthetic fixtures match their expected JSON; manifest matches README and files (EZD-016b, `scripts/fixtures/__tests__/`)".
- **If `three`'s GLTFLoader cannot run in Node 22** (T5 setup fails for a reason other than the fixture):
  - the test-author switches T5 to a container parse per the glTF 2.0 binary layout (header, JSON chunk, BIN chunk, accessors);
  - the builder does not add `three` at root;
  - both are recorded in the docs subsection.
  - This is the one allowed fallback.

### Fixture values (every number, with its source or derivation)
| Value | Source / derivation |
| --- | --- |
| 144 × 120 in interior | Ticket row "12' × 10' room" (12 × 12, 10 × 12). Interior faces, as EZD-028 Step 1 (room (0,0)–(144,120)) and EZD-030 (W1 is "the 12' wall of the synthetic 12' × 10' room") |
| Door x 12–48 on the south wall, 36 wide, hinge (12,0), leaf to (12,36), 90° swing | EZD-028 Step 1 (door leaf and arc) and EZD-030 W1 (door offset 12, width 36). Kept identical so the three tickets describe one room. Fixture choice; no spec source gives door sizes |
| Door height 80; window x 84–120, sill 42, head 102 | EZD-030 W1 (door height 80; window offset 84, width 36, height 60, sill 42). Fixture choice from that plan, chosen there so the window head is above the 96" low ceiling |
| Ceiling 96 → 144 along x, 4:12 | EZD-030 W1 `ceiling { heightAtStart: 96, rise: 4, run: 12 }` on the same 12' wall. 4:12 is the slope in rows EZD-030 and EZD-504; S05 writes pitch as n/12. Every point is ≥ 7'0", so the room passes 09 B-01 and code-check tests that use it trip no ceiling warning by accident |
| Wall thickness 4.5 | EZD-030 W1 `thickness 4.5`. Fixture choice |
| Window glass line at −2.25 | Mid-thickness: 4.5 / 2 |
| Layer names `WALLS`, `DOORS`, `WINDOWS`, `ROOMS` (+ `0`) | Fixture choice: the words of 08 "Walls, openings, rooms detected by layer" and 03. Polycam's real names are unknown, which needs-from-josh.md accepts ("may miss real layer names"). The README marks them invented |
| DXF R12 (`AC1009`), `$INSUNITS` 1, colour 7, `CONTINUOUS` | Fixture choice. R12 is the smallest complete DXF and dxf-parser reads it. Inches are the model unit (03 rule 5). Colour 7 and CONTINUOUS are DXF defaults with no meaning here |
| Scale 1/4" = 1'-0" (1/48), 1.5 pt per model inch | 09 Sheet set rules (plans at 1/4"), as in EZD-028. 72 / 48 = 1.5 |
| Page 1224 × 792 pt (11×17 landscape) | 08 Exports "11×17 for client and field copies", a size Josh's plans may come in. 17 × 72 = 1224, 11 × 72 = 792. Fixture choice of that size over 24×36, to keep the files small |
| Paper origin (504, 300) | 504 = (1224 − 216) / 2, which centres the 216-pt interior across the page. 300 is a fixture choice near the vertical centre (306), and a multiple of 12 so that every interior corner lands on a whole pixel at 150 px/in (pt × 150/72 is whole when pt is a multiple of 12) |
| Line widths 1.5 / 0.5 pt | EZD-028 Step 1 placeholder widths (walls 1.5, door 0.5), stated there as not a decision |
| 150 px per inch; 2550 × 1650 px; 3 px and 1 px strokes | Fixture choice: a common scan resolution that keeps the committed file small (17 × 150, 11 × 150). Strokes: 1.5 pt × 150/72 = 3.125 → 3; 0.5 pt × 150/72 = 1.04 → 1 |
| 0.0254 m per in; glTF in metres with +Y up | International inch (exact). Khronos glTF 2.0 specification, coordinate system and units |
| Bézier constant 0.5522847 | 4/3 · tan(90°/4) for a quarter circle in one cubic. Radial error is about 0.027% of r = 0.015 pt, below the tolerance |
| Tolerances: 1/64 in (0.015625); paper 0.0234375 pt; 0.000396875 m; area 0.5 sq in; raster ±1 px | 03 rule 5 (1/64 in). Paper: 1/64 × 1.5 (same as EZD-028). Metres: 1/64 × 0.0254. Area: EZD-030 Tests (0.5 sq in). Raster: some positions fall on half pixels (door hinge column 1087.5) |

## Files
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `scripts/fixtures/room.mjs`, `plan-drawing.mjs` | New | test-author | Steps 2–3 |
| `scripts/fixtures/write-dxf.mjs`, `write-pdf.mjs`, `raster.mjs`, `write-glb.mjs` | New | test-author | Step 4 |
| `scripts/fixtures/generate-synthetic.mjs` | New | test-author | Step 4.6 (the script in the Done when) |
| `scripts/fixtures/__tests__/synthetic.test.mjs` | New | test-author | T1–T6, T9 |
| `scripts/fixtures/__tests__/manifest.test.mjs` | New | test-author | T7 |
| `scripts/fixtures/__tests__/wiring.test.mjs` | New | test-author | T8 |
| `fixtures/synthetic/room-12x10.dxf`, `room-12x10-vector.pdf`, `room-12x10-scanned.pdf`, `room-12x10-sloped.glb` | New (generated, committed) | test-author (runs the CLI) | The fixtures |
| `fixtures/synthetic/*.expected.json` (4) | New | test-author | Step 5 |
| `fixtures/manifest.json`, `fixtures/README.md` | New | test-author | Step 6 |
| `package.json` (root), `pnpm-lock.yaml` | Change | builder | Step 7 |
| `.gitattributes` | Change (append) | builder | Step 7 |
| `docs/architecture.md` | Change | builder | Step 7 |
| `.gitignore`, `scripts/gate.mjs`, `.github/workflows/ci.yml`, `app/**`, `packages/**`, `supabase/**`, `spikes/**`, `vault/**`, `CLAUDE.md` | Not touched | — | No change is needed. Gate and CI already run root `node:test` |

## Data
None. There are no tables, columns, migrations, RLS policies, Storage paths, `schema_version` changes or money fields. Fixture files are repository test data and never reach Storage in this ticket.

## Tests (written by test-author before any code)
- All tests are `node:test` (EZD-000 Tests: repo scripts), run by the root `test` glob, so they are unfiltered and run in every gate and in CI.
- Each file has a top-level `describe('EZD-016b …')`. The Done-when test is titled `EZD-016b done when: the synthetic fixture script runs and its expected JSON matches`.
- Generated output goes to `fs.mkdtemp(os.tmpdir())`, which is removed in `finally`.
- Each check is made twice: against the freshly generated file and against the committed one.
- Tests compare numbers, names and counts, not wording.
- Expected values are read from the committed `*.expected.json`. The table below gives the values that file must hold, and the calc-auditor checks the JSON against it.

| Test | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- |
| T1 Script runs, files are current (**Done when**) | unit | `node scripts/fixtures/generate-synthetic.mjs --out <tmp>` | Exit 0. Exactly 4 files: `room-12x10.dxf`, `room-12x10-vector.pdf`, `room-12x10-scanned.pdf`, `room-12x10-sloped.glb`. No `*.expected.json` is written. sha256 of the DXF, the vector PDF and the GLB equals the committed files'. For the scanned PDF, the inflated image stream equals the committed one's, and the bytes outside that stream are equal (zlib output may differ between Node 22 on CI and Node 24 on the PC). Then T2–T5 run on the tmp files | Ticket Done when; Step 4.6; `.gitattributes` LF |
| T2 DXF matches expected JSON (**Done when**) | unit | Tmp and committed DXF parsed by `dxf-parser` | `header.$ACADVER` = `AC1009`; `$INSUNITS` = 1. Layers exactly {`0`, `WALLS`, `DOORS`, `WINDOWS`, `ROOMS`}. 22 entities: WALLS 16 LINE; DOORS 1 LINE + 1 ARC; WINDOWS 3 LINE; ROOMS 1 POLYLINE, closed, 4 vertices. The LINE sets equal the Step 3 lists (unordered, either direction, ±1/64 in). ARC: centre (12,0), radius 36, angles 0 and 90. Polygon (0,0),(144,0),(144,120),(0,120). Shoelace area 17,280 sq in = 120 sq ft (±0.5). Perimeter 528. Total WALLS line length 966 (±16/64). Extents min (−4.5,−4.5), max (148.5,124.5). Semantic block: walls S, E, N, W with interior lengths 144, 120, 144, 120 and thickness 4.5; door S, offset 12, width 36, hinge (12,0), swing 90° in; window S, offset 84, width 36 | Steps 2–3; 966 = south 72 + 81 + jambs 18 + north 297 + west 249 + east 249; 528 = 2 × (144 + 120); 17,280 = 144 × 120 |
| T3 Vector PDF matches expected JSON (**Done when**) | unit | `pdfjs-dist` (legacy build): `getDocument`, page 1, `getTextContent`, `getOperatorList`; raw bytes | 1 page; `view` = [0,0,1224,792]. 0 text items. 0 image paint operators. Stroked straight segments after the CTM: exactly 20, equal as a set to the Step 3 lines mapped by X = 504 + 1.5x, Y = 300 + 1.5y (±0.0234375 pt). Examples: south interior (504,300)–(522,300), (576,300)–(630,300), (684,300)–(720,300); exterior y 293.25 from 497.25 to 726.75 in 3 pieces; jambs at X 522, 576, 630, 684 from 293.25 to 300; north 480 and 486.75; west 504 and 497.25; east 720 and 726.75; leaf (522,300)–(522,354); window Y 300, 296.625, 293.25 from 630 to 684. Line width 1.5 on the 16 wall segments, 0.5 on the other 4 and on the curve. Exactly 1 curve, from (576,300) to (522,354); both ends 54 pt (±tol) from (522,300). Calibration: (504,300)–(720,300) is 216 pt = 144 in at 1.5 pt/in; (504,300)–(504,480) is 180 pt = 120 in. Structure: every xref offset points at `<n> 0 obj`; no `/Encrypt` | Steps 3–4; 09 1/4" scale; 08 11×17; S01 "two points, type the real distance" (EZD-304 Done when "measures a known length correctly"); 54 = 36 × 1.5 |
| T4 Scanned PDF matches expected JSON (**Done when**) | unit | pdfjs as T3; raw bytes; `rasterizePlan(room)` | 1 page; `view` [0,0,1224,792]; 0 text items. Operator list: exactly 1 image paint operator and no path-construct, stroke or fill operator; the image transform is [1224,0,0,792,0,0]. Raw dictionary: `/Width 2550`, `/Height 1650`, `/ColorSpace /DeviceGray`, `/BitsPerComponent 8`; exactly 1 `/Subtype /Image`. The inflated stream equals `rasterizePlan(room)` (length 4,207,500 = 2550 × 1650). Probes (±1 px): interior corners (1050,1025), (1500,1025), (1500,650), (1050,650) are 0. The west face midpoint (1050, 837) is 0. Room centre (1275, 837): every pixel within 3 px is 255. Door gap on the interior face (1144, 1025): every pixel within 1 px is 255. Pixel (0,0) is 255 | Step 4.4. Column = X × 25/12 and row = (792 − Y) × 25/12: 504→1050, 720→1500, Y 480→650, Y 300→1025. Door gap: x = 30 → X 549 → 1143.75. EZD-305 Done when: "the fixture scanned PDF returns zero items" |
| T5 GLB matches expected JSON (**Done when**) | unit | Raw bytes; `GLTFLoader.parse` from `three` (or the Step 7 fallback) | Header magic `glTF`, version 2, length = file size; chunk 0 JSON and chunk 1 BIN, each length a multiple of 4; `asset.version` `2.0`. Loads with no error. 1 mesh, 1 primitive, mode 4. Attributes exactly POSITION and NORMAL. 44 vertices; 66 indices = 22 triangles. POSITION `min` [0, 0, −3.048] and `max` [3.6576, 3.6576, 0] (±0.000396875 m). Triangles grouped by surface, area in sq in (÷ 0.0254²), each ±0.5: floor 17,280; ceiling 18,214.7193; west 11,520; east 17,280; north 17,280; south 12,240; total 93,814.7193. Each triangle's geometric normal (counter-clockwise) agrees with its NORMAL attribute (dot ≥ 0.999) and points into the room. Ceiling: every ceiling vertex has h = 96 + x/3 (±1/64 in). Corner heights SW 96, NW 96, SE 144, NE 144 in. Low wall W, 96; high wall E, 144. Pitch (144 − 96) / 144 × 12 = 4 (±0.001) per 12; slope 18.4349° (±0.0001). Height at room centre (72, 60) is 120. South-wall holes: a 5 × 5 grid inset 1/64 in inside door (x 12–48, h 0–80) and window (x 84–120, h 42–102) is covered by no south-wall triangle. Points 1/64 in outside each opening edge, except the door's floor edge, are covered | Step 2; Step 4.5. 18,214.7193 = 120 × √(144² + 48²) = 120 × 151.78933. Walls: 120 × 96, 120 × 144, 144 × (96 + 144)/2, 17,280 − 2,880 − 2,160 (as EZD-030 T2). atan(1/3) = 18.43495°. 3.6576 = 144 × 0.0254; 3.048 = 120 × 0.0254. S02 "heights at points (low/high wall), pitch, or the value read from the mesh"; EZD-303 Done when |
| T6 Expected JSON files are complete | unit | The 4 `*.expected.json` | Each parses, has `fixture` equal to its fixture's file name, `generatedBy`, `sources` and tolerances, and holds every value T2–T5 read (no test value is hard-coded only in the test) | Step 5 |
| T7 Manifest, README and files agree | unit | `fixtures/manifest.json`, `fixtures/README.md`, a walk of `fixtures/` | The 14 ids of Step 6 are all present, each with that origin, kind and status value; ids are unique. More entries are allowed: later tickets add rows (for example EZD-302's unjoined variant, Q-0066 (b); EZD-901a, EZD-915, EZD-916, EZD-1702), so no total count is asserted (phase 0 plan review, finding 32). For every entry, whatever ticket added it: every `present` path exists and has its `expected` file (generated entries); no `real` folder of a `not yet supplied` entry holds a tracked file. Every walked file is `README.md`, `manifest.json`, an `*.expected.json`, or a manifest path. README has exactly one table row per manifest id with the same origin and status, and no row without a manifest id. The `architect-dxf`, `architect-dxf-revised`, `supplier-2020-dxf` and `order-report` rows say "still pending" and cite decisions.md · Build answers (Josh). README states the real-file rule of Step 6 item 5: it contains `names`, `addresses` and `photo location data` and cites `Q-0065` | Ticket Scope "README saying which files are real and which are generated"; decisions.md "Still pending from Josh as of 2026-10-11 … Supplier 2020 sample, architect DXFs"; needs-from-josh.md; Q-0065 (b) ("the README says so"); Q-0066 (b); finding 32 |
| T8 Wiring | unit | Repo files | Root `devDependencies` `dxf-parser`, `pdfjs-dist` and `three` equal their Dependencies rows' Version, and each row's `Used in` contains `root` (`three` is left out under the Step 7 fallback). Root script `fixtures:generate` = `node scripts/fixtures/generate-synthetic.mjs`. `.gitattributes` has `*.glb binary` and `*.dxf text eol=lf`. `docs/architecture.md` has `### Fixtures (EZD-016b)` under `## Tests`, naming `fixtures/manifest.json`, `fixtures/synthetic/` and `fixtures:generate`; `## Folder layout` names `fixtures/` and `scripts/fixtures/`. `node scripts/conventions/check.mjs .` exits 0 | Step 7; EZD-000 C1, T5; CLAUDE.md rule 11 |
| T9 Generator stays independent | unit | Source text of `scripts/fixtures/*.mjs` (not `__tests__`) | The only imports are `node:` built-ins and relative files under `scripts/fixtures/`. No `pdfkit`, `dxf-parser`, `pdfjs-dist`, `three`, `app/` or `packages/` | Step 1 (fixture independent of code under test) |
| T10 Gate (orchestrator) | gate | `node scripts/gate.mjs .claude/worktrees/EZD-016b` | Exit 0, with T1–T9 in the `test` step output | CLAUDE.md rule 9; Q-0006 |
| T11 In CI (orchestrator) | CI | The Phase 0 PR's `gate` check | `test` passes on Ubuntu with Node 22, including T1's scanned-PDF content comparison | Ticket Done when "runs in CI"; ci.yml; Q-0021, Q-0022 (CI runs on the phase PR only) |

## Reviewers needed
code-reviewer always · calc-auditor **yes** (scale, paper and pixel mapping, inch-to-metre conversion, areas, slope and pitch, Bézier constant, all expected JSON values) · ui-verifier no (no screen) · security-reviewer no (no tables, auth, money, share links or API; the privacy of real client files in the public repo is Josh's decision, answered Q-0065 (b), and this ticket commits no real file)

## Risks
- **Invented encoding.** Layer names, R12, double-line walls, the paper layout and the GLB orientation are fixture choices. Polycam and real PDFs will differ, and needs-from-josh.md already accepts that for detection. EZD-302, EZD-303 and EZD-305 planners must not read these choices as a spec of the real formats. The README says so.
- **`$INSUNITS` in an R12 file.** dxf-parser reads any header variable, but a strict R12 reader may ignore it. If EZD-029 finds a reader that rejects it, the variable is removed in a ticket that also updates the expected JSON.
- **Reader setup in Node.** Each is confirmed by the test-author against the installed packages, not from memory:
  - pdfjs-dist needs its legacy Node build and worker setting;
  - three's GLTFLoader in Node (Step 7 fallback);
  - dxf-parser's names for closed polylines and arc angles.
- **zlib output differs between Node versions**, so the scanned PDF is compared by content. The other 3 files are compared by bytes.
- **Hand-written PDFs.** pdfjs is lenient. T3 checks the xref offsets so that a stricter viewer (Acrobat, Bluebeam) can also open the files. Josh can open them as a spot check.
- **Root install weight.** `three` and `pdfjs-dist` at the root add install time to every gate run. Both packages are already planned for the workspace.
- **dxf-parser is provisional** until EZD-029 (02 Stack). If EZD-029 picks another parser, that ticket switches T2's reader in the same commit. The fixture does not change.
- **Public repository (Q-0065 (b)).** Real fixtures are copies of client homes, plans with names and addresses, and photos that may carry GPS data. They are committed only after Josh removes names, addresses and photo location data. No test can check a PDF or DXF for names, so the rule rests on Josh's removal and on the review of the commit that adds a real file (the orchestrator checks that the README row says what was removed). The repository is made private after the app is built (Q-0065).
- **Later fixture tickets** (EZD-302 under Q-0066 (b), EZD-901a, EZD-915, EZD-916, EZD-1702) must add manifest and README rows, or T7 fails. That is intended. T7 asserts the 14 ids of this ticket, not a total, so those rows need no edit to T7 (finding 32).

## Open questions
None.

Answered and applied: Q-0065 (answered-josh (b), 2026-10-12): real fixtures are committed only after Josh removes names, addresses and photo location data; the README says so; the repository will be made private after the app is built (Steps 1, 6 item 5; T7; Risks). The `.gitignore` line and T12 of the (c) branch are removed.

Referenced, not re-asked: Q-0002 (deferred; does not block); Q-0066 (answered-agent (b), code-reviewer at plan review; Josh can override): EZD-302 writes the unjoined variant using this ticket's exported `room`, `planDrawing` and `writeDxf`, and picks the gap against its scoring and the Defaults tolerance (R24 #30); applied in Depends on and Step 4.6; Q-0006 and Q-0019 (root `node:test` runs unfiltered with concurrency 2); Q-0021 and Q-0022 (CI runs only on the phase PR, so T11 is proven at the Phase 0 PR); decisions.md · Build answers (Josh), "Still pending" (architect DXFs and the Supplier 2020 sample, marked not yet supplied).
