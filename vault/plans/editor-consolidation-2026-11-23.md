# EZ Draft editor: consolidation plan (2026-11-23)

Second audit, editor only. Analysis and planning; no code in the repository was changed. Every number below comes
from a command run in this session unless it says **estimate** or **unverified**.

Measured on: `develop` at `2daa0ce6` (source), and the newest production build on disk, lane build
`.claude/worktrees/EZD-607/app/.next` (commit `f83683e9` = develop `06eefc55` + EZD-607 "Load calc engine"; it lacks
EZD-643, one merge behind). Sizes are gzip level 6 per file, the same as the gate's `compressedSize`
(`scripts/perf/budgets.mjs:12-14`).

---

## 1. Summary for Josh

**What this is about.** The editor works, but it has grown by stacking every new feature into a handful of big
files. That causes two problems you feel: the editor page is almost too big to download under its limit, and the
build lanes keep waiting on each other because nearly every new feature edits the same file.

**What gets smaller or simpler**

- **The editor download.** Today it is about **496,000 bytes of a 500,000 limit** (99%). Two technical changes,
  neither visible to a user, should bring it to about **400,000 to 425,000 bytes** (**estimate**; each ticket measures
  its own saving):
  - Remove a "wrapper" library (React Three Fiber) that sits between the editor and its drawing engine. The editor
    uses almost none of it, but it forces the whole Three.js drawing engine into the download. About **60,000 to
    75,000 bytes** saved (estimate).
  - Switch the data-checking library (zod, about **31,000 bytes** today) to its slimmed-down edition. The editor
    checks every drawing object with it, so it cannot simply be left out. About **10,000 to 20,000 bytes** saved
    (estimate).
  - Together that is about **70,000 to 95,000 bytes of headroom** (estimate). Today there is under 4,000.
- **The main editor file** (`ProjectEditor.tsx`, 2,098 lines) drops to roughly **500 lines**. Each tool and mode
  (Cabinets, Countertops, Electrical, Ceiling, Versions, Sheets, 3D, Assistant) moves into its own file that "plugs
  in". New features then **add a file** instead of editing the shared one.
- **The same small pieces written many times** become one each: an id-matching helper written **18 times**, a
  vector helper written **13 times**, 30 near-identical "load this panel later" wrappers, about 28 home-made
  "remember a value and tell listeners" stores, and **7 different length boxes**.

**How much more often the lanes could run in parallel**

- Today all three lanes are busy only about **26%** of the time (first audit, heartbeat since 2026-11-20).
  `ProjectEditor.tsx` is now named **371 times** in the loop's "waiting on held files" lines (was 336 in the first
  audit). Since 2026-11-06, **69 of 230** feature tickets (30%) edited it.
- I replayed every wait since 2026-11-20 against this plan, counting only the files its tickets actually split. With
  the editor split done, in **29 of 82** waiting moments (35%) at least one waiting ticket could have started, and
  **43 of 246** individual waits (17%) would not have happened. Combined with the first audit's fix for
  `docs/architecture.md` and `database.types.ts` (W2), that rises to **54 of 82** moments (66%) and **92 of 246** waits
  (37%). The editor split and W2 need each other: W2 alone frees 1 wait. These are upper bounds: new overlaps could
  appear.
- About **136 editor-screen tickets are still unbuilt**, so the split pays for itself many times over.

**Feature loss: none planned.** Section 2 lists every editor feature, tied to its ticket and tests. Each refactor
ticket must keep all of those tests green unchanged (apart from import paths), and the first ticket adds tests for
the 7 built features that have none today.

**What I need from you (design only).** Four questions in section 8: should every length box, empty-panel
message, panel button and tab strip in the editor look the same? Today they differ slightly from panel to panel.
Nothing changes on screen until you answer. For your information only (no answer needed): dropping React Three Fiber
changes one line of the spec's technology list (`02-product-overview.md:52`). It is a technical choice, so agents make
it.

**Cost.** 22 small tickets (section 9). The ones that reshape `ProjectEditor.tsx` must run one after another, so
other lanes should take non-editor tickets while they run. Order and risk are in section 9.

---

## 2. Feature inventory (the contract)

Every item here must still work after the refactor. "Tests" are the files that cover the item today. The full
ticket → source → test map (168 tickets named in editor code) is in Appendix A.

### 2.1 Views, surfaces and modes

| Feature | Where | Tickets | Tests |
| --- | --- | --- | --- |
| Header tabs Plan, 3D, Sheets (3D and Sheets cover the plan; the plan canvas is never remounted) | `ProjectEditor.tsx:290-292`, `:1195`, `:1648-1657` (backdrop kept on every tab) | EZD-207a, EZD-1001a, EZD-702a | `e2e/plan-canvas.spec.ts:420-424`, `e2e/scene-3d.spec.ts`, `e2e/sheets-screen.spec.ts` |
| 3D scene (lazy, drawn into the plan's one WebGL renderer; sync footer, empty message) | `lazy/scene-3d/`, `plan/render-root.ts:85-112` | EZD-1001a, -1001b, -1005, -1022 | `lazy/scene-3d/*.test.ts` (3), `e2e/scene-3d.spec.ts` |
| Sheets screen (panel, canvas, status) | `lazy/sheets-screen/` | EZD-702a, -702b, -703, -706, -707, -710, -714, -716, -717, -718, -721, -726, -728 | `lazy/sheets-screen/*.test.*` (5), `e2e/sheets-screen.spec.ts`, `e2e/sheet-renderer.spec.ts`, `e2e/sheet-title-block.spec.ts` |
| Floor / Ceiling / Both surface segment (left panel top) | `ceiling/surface.ts:5-55`, `layers/LeftPanel.tsx:13-15` | EZD-502 | `ceiling/*.test.ts`, `e2e/ceiling-rcp.spec.ts` |
| Electrical mode (left panel tabs Circuits / Devices / Panel) | `electrical/`, `ProjectEditor.tsx:1614-1630` | EZD-601…609 | `electrical/*.test.*` (15), 9 e2e specs |
| Cabinets mode (run screen covers plan, library in left panel, box inspector) | `lazy/cabinet-run/`, `cabinets/` | EZD-401…410 | `cabinets/*.test.*` (8), `lazy/cabinet-run/*.test.*` (6), `e2e/cabinet-run.spec.ts` |
| Countertops mode (screen, Pieces / Edges / Material panel, inspector, status) | `lazy/countertops/`, `countertops/` | EZD-412…419 | `countertops/*.test.*` (7), `lazy/countertops/*.test.*` (5), 11 e2e specs name EZD-412 |
| Version open read-only, diff layer (amber changed, red dashed removed), Revert | `versions/` | EZD-121, -122, -139 | `versions/*.test.*` (3), `e2e/versions-panel.spec.ts`, `e2e/sent-versions.spec.ts` |
| Assistant panel, preview layer, Accept / Adjust / Reject | `assistant/`, `lazy/assistant-panel/` | EZD-5603a/b, -5604a/b, -5605 | `assistant/*.test.*` (23), `e2e/assistant-panel.spec.ts`, `-preview`, `-accept`, `-photo` |
| Import review (separate screen inside the editor route) | `import-review/` | EZD-307…314 | `import-review/*.test.*` (8), `e2e/import-review.spec.ts`, `import-finish.spec.ts`, `import-states.spec.ts` |
| Benchmark runner (`?benchmark=run`) | `benchmark/`, `lazy/benchmark-runner/` | EZD-237 | `benchmark/*.test.*` (2), 2 e2e |
| Offline read-only copy and header offline icon | `lib/pwa/project-cache.ts`, `OfflineStatusIcon.tsx` | EZD-1401, -1402 | `OfflineStatusIcon.test.tsx`, `save-state-offline.test.ts`, e2e |

### 2.2 Rail tools (13 top + 2 bottom on the floor plan; 11 ceiling tools; switch zones from the left panel)

Floor rail (`tools/tool-defs.ts:108-180`, `selection/selection-controller.ts:535-567`, checked by
`e2e/plan-canvas.spec.ts:429-440` = 13 top, Assistant + Help bottom):

| Tool | Default key | Ticket | Notes |
| --- | --- | --- | --- |
| Select | V | EZD-208b | always first; the only tool for view-only users |
| Move | M | EZD-212b | typed distance |
| Wall | W | EZD-210a/b | typed length + turn angle |
| Room rectangle | R | EZD-210a/b | typed width + depth |
| Door | D | EZD-211a/b | typed offsets + width |
| Window | N | EZD-211a/b | typed offsets + width |
| Fixtures | F | EZD-234 | lazy fixtures panel |
| Sketch | S | EZD-223 | lazy sketch clean |
| Measure | Shift+L | EZD-231 | |
| Cabinets | C | EZD-404 | opens cabinets mode |
| Countertops | K | EZD-412 | opens countertops mode |
| Electrical | E | EZD-601 | opens electrical mode |
| Ceiling | G | EZD-502 | added to the rail when a surface exists (`DrawingTools.tsx:152`) |
| Assistant (bottom) | — | EZD-5603a | editors only |
| Help (bottom) | ? | EZD-222 | |

Ceiling rail (`ceiling/surface.ts:86-98`): Ceiling type, Beam, Recessed light, Ceiling fan, Acoustical grid, HVAC,
Detector, Low voltage, Access panel, Soffit, Tag (EZD-503, -505, -507, -511, -513, HVAC per EZD-731); Switching zones
from the Lighting section (EZD-510). Rail order is per user (EZD-230, `ProjectEditor.tsx` `onRailReorder`). Rail
states: disabled while loading, paused with the note for Edit model without the lock (EZD-225), select-only while
adjusting an Assistant preview (EZD-5605).

### 2.3 Keyboard shortcuts (`lib/defaults/shortcut-keys.ts` `DEFAULT_KEYS`, company-rebindable, EZD-222, EZD-230)

Wired today: every rail tool key above; `help` ? (`ProjectEditor.tsx:654-662`); `undo` Mod+Z, `redo` Mod+Shift+Z,
`copy` Mod+C, `paste` Mod+V (EZD-217, `edit/edit-controller.ts:244`); the Ceiling view swallows the company's floor
tool keys (`ceiling/surface.ts:140-150`, `useCeilingKeys`). The view keys `tab-plan` 1, `tab-3d` 2, `tab-sheets` 3,
`tab-render` 4 and `look-up` U appear only in that swallow list (grep found no other handler), so they are
**reserved, not wired**. Also in the map for unbuilt tools: `catalog` P, `dimension` L, `text` T, `detail-callout` X,
`revision-cloud` Q, `reference` Shift+R, `markup` Shift+M, `supplier-markup` Shift+S, `check` Shift+C, `save` Mod+S;
`pan` H. Every entry must stay in the map and in Settings → Defaults → Keyboard shortcuts. Tests:
`e2e/keyboard-shortcuts.spec.ts` and 9 more e2e specs naming EZD-222, `help/*.test.*`, `lib/defaults/*.test.ts`.
(Handler-or-not per key is from grep; `pan` H is **unverified**. EZD-1901 pins each with a test.)

### 2.4 Left panel

| Content | When | Ticket | Tests |
| --- | --- | --- | --- |
| Tabs Layers, Rooms, Versions | floor surface, plan view | EZD-218, EZD-122 | `layers/LeftPanel.test.tsx`, `e2e/left-panel.spec.ts` |
| Layers: Phase section with eyes and lock icons | | EZD-214, EZD-218 | `layers/layer-setting.test.ts` |
| Layers: Overlays section (Plumbing row) | | EZD-729 | `layers/*.test.*` |
| Rooms: room rows (select + zoom), room fields, room photos, existing details, floor transitions | | EZD-218, EZD-229 | `layers/RoomFields*`, `lazy/room-fields/*.test.*` |
| Ceiling sections (Room ceiling, Lighting, Fixture schedule) | Ceiling or Both | EZD-503, -508, -510 | `ceiling/*.test.*` |
| Electrical tabs | electrical mode | EZD-601 | `electrical/ElectricalPanel*.test.tsx` |
| Cabinet library (replaces panel) | Cabinets on | EZD-403 | `lazy/cabinet-run/CabinetLibrary*.test.*` |
| Countertop panel (replaces panel) | Countertops on | EZD-416 | `lazy/countertops/*.test.*` |
| Sheets panel (replaces panel) | Sheets view | EZD-702a | `lazy/sheets-screen/*.test.*` |

Precedence today (`ProjectEditor.tsx:1562-1647`): 3D → none; Sheets → sheets panel; Cabinets → library; Countertops
→ countertop panel; otherwise LeftPanel with ceiling / electrical / versions slots. **The registry must keep this
order exactly** (ticket EZD-1913 adds a test that pins it).

### 2.5 Inspector (right) branches, in order (`inspector/InspectorPanel.tsx:252-330`)

Room alone → room note (EZD-218); Pin → PinPanel (EZD-220); Beam set → BeamPanel (EZD-505); ACT grid →
ActGridInspector (EZD-511); Switching zone → SwitchZoneInspector (EZD-510); Device → DevicePanel with height note
(EZD-507, EZD-603); Engineer note → EngineerNoteForm (EZD-215); otherwise wall / opening / bulk (EZD-213a/b/c, gap
resolve) with CeilingFlags (EZD-515). Mode overrides (`ProjectEditor.tsx:1509-1557`): version inspector (EZD-122),
cabinet box inspector (EZD-406), countertop inspector (EZD-414, EZD-419), Assistant panel in the inspector place
(EZD-5603a), empty inspector until the lazy module loads (EZD-214), Inspector More menu (EZD-233).

### 2.6 Header, status bar, banners, menus, dialogs

- **Header:** project name and switcher (EZD-128, EZD-130 settings dialog), save state text (EZD-120c), version text
  that opens Versions (EZD-122), offline icon (EZD-1401), review pill (EZD-127), Share → Send dialog (EZD-111, Copy
  link EZD-1201), upload files (EZD-301), lock presence (EZD-126).
- **Status bar** (`e2e/plan-canvas.spec.ts:441` expects 6 items on a plain plan): Floor (EZD-6001), Scale, Snap,
  Cursor, Zoom (EZD-219), phase View (EZD-214); plus mode items: cabinet View (EZD-404), countertop status (EZD-416),
  electrical status (EZD-601), ceiling legend / view / joists (EZD-508, -514), versions text and diff counts (EZD-122,
  -139), disclaimer.
- **Banners and states:** loading skeleton, failed load with Retry, no access, not found (EZD-120c); offline banner;
  save failed; plan scale failed (EZD-219); phase failed (EZD-214); text atlas failed (EZD-376); conflict banner and
  list (EZD-299, -299b); "Changes not saved"; lock banner / holder prompt / toasts / Stop editing / View only
  (EZD-126); paused-tools note (EZD-225); PDF without scale + Set scale (EZD-304); imported notice; empty-plan hint
  (EZD-221b); canvas failed inline error with Retry (EZD-207a).
- **Menus:** right-click / long-press context menu and Inspector More: Mirror, Align (edges), Group / Ungroup, Save
  as group (dialog), Set status (existing / demo / new) (EZD-233); Delete, Copy, Paste, Duplicate, Undo, Redo (EZD-217);
  tablet edit bar (EZD-208b, EZD-233).
- **Canvas layers:** drawing layer with typed entry bar (EZD-209), handles and distance chips (EZD-212c), selection
  layer, beam spacing pill (EZD-505), ceiling device kind chooser (EZD-507), electrical device toolbar (EZD-602),
  diff layer (EZD-139), Assistant preview layer (EZD-5604b), PDF underlay (EZD-304), mesh underlay (EZD-303), zoom
  stack (EZD-207b), pins (EZD-220).
- **Dev and test hooks** (many e2e specs depend on them; must keep names and shapes): `window.__ezdraftEditor`
  (`objects`, `edit`, `checkpoint`), `__ezdraftPlan` (`handle`, `stats`, `phase`, `underlay`, `drawn`,
  `drawnTexts`), `__ezdraftSelection`, `__ezdraft3d`, plus `__ezdraftWorkerProbe` on the perf-probe dev page (`app/src/app/dev/perf-probe/probe-session.ts`). Installed at
  `ProjectEditor.tsx:940-952` (3D), `:1040-1057` (editor), `:1059-1074` (plan), `:1095-1106` (selection).

### 2.7 Coverage gaps

23 of the 168 tickets named in editor code have no unit or e2e test that names them (Appendix A, rows marked
**none**). 16 of those are **not built yet** (`vault/build/state.json`): the comment points ahead to a coming
ticket (EZD-415, -514, -605, -607, -608, -615, -619, -630, -703, -707, -716, -718, -721, -1005, -1017, -1022), so
there is no feature to lose. One more unbuilt ticket, EZD-717, has a test. The **7 built** ones without a named test
are EZD-014a (device switch), EZD-015b (toast and confirm), EZD-030 (spike), EZD-204a (opening data v4), EZD-206
(snapping), EZD-402 (cabinet object model) and EZD-726 (sheet sets). Ticket EZD-1901 finds the existing test that
covers each of the 7, or adds a characterization test, **before** any of their code moves. Appendix A marks unbuilt
rows.

---

## 3. Bundle: what is in the editor download and why

### 3.1 Measured total

Editor route page chunks (10 files, `entryJSFiles` for `/(editor)/projects/[id]/page`): **335,609** bytes. Root main
files (7, every page): **160,634**. Sum **496,243** bytes against 500,000. (The gate also counts any script loaded
before the page goes idle; I did not run the browser measurement, so the gate's own figure is **unverified** and may
be a little higher.)

### 3.2 What the bytes are (source-map attribution, gzip share per source)

| Part | Bytes | Why it is there |
| --- | --- | --- |
| `three` (three.module.js 92,262 + three.core.js 53,466) | ~145,700 | The **2D plan itself is drawn with WebGL** (`plan/render-root.ts:12`, `plan/scene.ts:26`, `plan/batches.ts:23`). One copy only; the two files are halves of one build, not duplicates. |
| `@react-three/fiber` | ~41,700 | Used only as a thin root around one `WebGLRenderer`: `createRoot`, `configure`, `render(createElement('primitive', …))`, `invalidate` (`plan/render-root.ts:10-140`). No JSX scene anywhere (0 hits for `<mesh` / `createElement` in `plan/scene.ts`, `lazy/scene-3d/scene.ts`). Fiber does `import * as THREE from 'three'` (`fiber/dist/events-*.esm.js:3`), which keeps all of `three.core.js` alive. |
| `zod` | ~31,500 | Core to how the editor reads its model: `parseStoredObject` (`geometry/src/schema/index.ts:314-325`, `DATA_SCHEMAS[type].safeParse`) is called by 9 entry files: `plan/batches.ts`, `plan/hover.ts`, `selection/pick-index.ts`, `derived/model-derived.ts`, `layers/rooms.ts`, `floors/floors.ts`, `edit/edit-changes.ts`, `edit/bearing-rule.ts`, `tools/model-changes.ts`. Also `drawing/build.ts:134-135` (`drawingViewSchema.parse`, `dimensionInputSchema.parse` on every `buildDrawingList`) and `rooms/override.ts:47`. Classic zod ships `to-json-schema.js` and `json-schema-processors.js` (~5,100) the client never uses. |
| `packages/geometry` | ~29,600 | schema 7,048, rooms 4,795, drawing 3,728, fixtures 2,586, openings 2,378, ceiling 1,639, snap 1,425… Mostly needed: the plan draws every object kind from one drawing list (EZD-238). |
| App editor code | ~55,000 | `ProjectEditor.tsx` 8,431, `tools/DrawingTools.tsx` 3,028, `lib/outbox/outbox-sync.ts` 2,624, `plan/controller.ts` 2,172, `layers/LeftPanel.tsx` 2,067, `status/PlanStatus.tsx` 1,986, `typed-entry/TypedEntryLayer.tsx` 1,777, … |
| Root main (all pages) | 160,634 | `next` incl. React DOM ~129,400; `@sentry/*` ~24,200 compressed (the first audit's 69 KB likely came from `perf-results/bundle-report.md`, which reports minified bytes, `scripts/perf/js-contents.mjs:4`); Turbopack runtime ~4,400. |

### 3.3 Correction to the first audit (B1)

The first audit suggested "move the 3D renderer behind `app/src/lazy/` so the plan view doesn't load WebGL". That
will not work: the plan view **is** WebGL. And the gate counts every script fetched before the page goes idle
(`scripts/perf/js-size.mjs:1-35`, `settlePage`), so loading the renderer lazily right away saves nothing. The real
levers are below.

### 3.4 Levers (in order of size)

| # | Change | Saving | Confidence |
| --- | --- | --- | --- |
| L1 | Replace R3F with a ~150-line plain Three.js render root using named imports (keeps one renderer, on-demand frames, `setScene` for 3D, `captureFrame`). | R3F ~41,700 + tree-shaken `three.core.js` (est. 20,000–30,000) = **~60,000–75,000** | estimate; the ticket measures |
| L2 | Write the geometry schemas with `zod/mini` (same zod 4 package, functional API that tree-shakes; drops the JSON-schema code), so server and client share one definition; replace the two per-call `.parse` in `drawing/build.ts:134-135` with typed guards (the inputs are built by the app). Zod cannot leave the entry outright: the plan reads every object through `parseStoredObject`. | **~10,000–20,000** | estimate; chain traced, saving not measured |
| L2b | Not bytes but speed: `plan/batches.ts`, `hover.ts` and `pick-index.ts` re-parse stored objects through zod on redraw. A parse-once cache keyed by the stored value (the store already replaces values on change) would remove repeat parsing. | 0 bytes; draw time | **unverified** (no profile run) |
| L3 | Defer Sentry's browser SDK until after first paint or the first error (root, every route). **Outside the editor**: left to the first audit's tickets; listed so nobody double-counts. | ~24,000 (all routes) | estimate |
| L4 | Collapse 30 `Lazy*` wrapper components and 20 `lazyModule` declarations in `ProjectEditor.tsx:1758-2098` into one `lazyPart(module, 'ExportName')` helper; move `electrical` and `versions/VersionsPanel` (dynamically imported from `app/src/editor/`, `ProjectEditor.tsx:1829-1832`) behind `app/src/lazy/` facades so the B11 contents check protects them. | ~1,000–2,000 and ~300 lines | good |

L1 + L2 ≈ **70,000–95,000** bytes of headroom (estimate) → editor at about 400,000–425,000. The 500,000-byte limit in
`e2e/plan-canvas.spec.ts:443-461` (EZD-207a B8) and EZD-120c B11 stays unchanged.

---

## 4. Redundancy (file:line evidence)

| # | What | Copies | Evidence | Fix |
| --- | --- | --- | --- | --- |
| R1 | Case-insensitive id compare `const lower = (id) => id.toLowerCase()` | 18 | `assistant/preview-shapes.ts:67`, `assistant/apply-reply.ts:104`, `electrical/existing-panel.ts:20`, `electrical/circuit-drawing.ts:41`, `electrical/device-toolbar.ts:88`, `electrical/electrical.ts:19`, `electrical/circuits.ts:17`, `tools/selection-edit.ts:93`, `tools/move-tool.ts:85`, `tools/beam-edits.ts:34`, `tools/drawing-controller.ts:307`, `tools/opening-tool.ts:98`, `inspector/inspector-view.ts:129`, `tools/fixture-geometry.ts:189`, `versions/version-diff.ts:40`, `edit/arrange-changes.ts:47`, `inspector/inspector-edits.ts:90`, `floors/floors.ts:11` | one `idKey` / `sameId` in `editor/model/ids.ts` |
| R2 | `same = (a, b) => a.toLowerCase() === b.toLowerCase()` | 6 | `countertops/edge-profile.ts:24`, `countertops/overhang-tool.ts:20`, `countertops/material.ts:8`, `cabinets/run-inspector.ts:40`, `lazy/countertops/EditOfferedEdges.tsx:28`, `lazy/countertops/EdgeProfileCard.tsx:147` | same `sameId` |
| R3 | `noSubscribe = () => () => {}` | 10 | `ProjectEditor.tsx:297`, `assistant/AssistantPanel.tsx:71`, `tools/DrawingTools.tsx:59`, `layers/LeftPanel.tsx:69`, `inspector/InspectorPanel.tsx:132`, `floors/use-chosen-floor.ts:6`, `lazy/countertops/CountertopsView.tsx:95`, `CountertopsPanel.tsx:69`, `EdgeProfileCard.tsx:47`, `TopSchedule.tsx:219` | one `useStoreValue(store?, select)` hook |
| R4 | Hand-written listener stores (`listeners = new Set`, get / set / subscribe) | 28 + 14 zustand stores | e.g. `electrical/height-notes-shown.ts:1-18`, `ceiling/surface.ts:33-55`, `status/phase-setting.ts:39`, `layers/layer-setting.ts:115`, `status/view-settings.ts:36`, `versions/version-view.ts:77`, `tools/ceiling-device-tool.ts:44`, `tools/switch-zone-tool.ts:40` (full list: 29 files) | one `createValueStore<T>()` for simple values; keep zustand for multi-field stores |
| R5 | Two selection stores of the same shape | 2 | `countertops/selection-store.ts`, `cabinets/cabinet-selection-store.ts` | keep both (different rules) but build on R4; low value, do only with R4 |
| R6 | Length / size input with its own parse, error line and commit | 7 components, 19 files parse lengths | `inspector/InspectorPanel.tsx:412` `LengthField`, `lazy/cabinet-run/BoxInspector.tsx:502` `SizeField`, `lazy/countertops/CountertopPieceInspector.tsx:199` `SideInput`, `lazy/countertops/CountertopsPanel.tsx:461` `SplashField`, `tools/ActGridPanel.tsx:32` `StartField`, `typed-entry` `TypedField`, `tools/BeamSpacingPill.tsx` | one `LengthInput` (behaviour only; look is design question D1) |
| R7 | Inch text `\`${formatInches(n)}"\`` | 6 | `layers/RoomFields.tsx:290`, `lazy/countertops/CountertopPieceInspector.tsx:44`, `CountertopsPanel.tsx:76`, `lazy/cabinet-run/CabinetRunView.tsx:113`, `BoxInspector.tsx:66`, `CabinetLibrary.tsx:56` | `inchText` in `lib/plan` |
| R8 | `STATUSES = ['existing','demo','new']` | 4 | `inspector/inspector-edits.ts:270`, `inspector/InspectorPanel.tsx:553`, `lazy/cabinet-run/BoxInspector.tsx:196`, `lazy/edit-menu/EditMenu.tsx:49` | export once from geometry `schema/common` constants |
| R9 | `CM_PER_IN = 2.54` / `sameIds` | 3 / 3 | `countertops/top-schedule.ts:9`, `lazy/countertops/CountertopPieceInspector.tsx:42`, `CountertopsPanel.tsx:72`; `tools/gap.ts:208`, `tools/drawing-controller.ts:298`, `selection/selection-controller.ts:127` | shared |
| R10 | Vector helpers inside geometry: `dot` 13, `add` 9, `sub` 5, `cross` 4, `dist` 3, `clamp` 2 (+5 in app) | ~40 | `geometry/src/ceiling/beams.ts:29-30`, `ceiling/beam-layout.ts:16-17`, `countertops/seam.ts:13-16`, `countertops/trace.ts:41-42`, `rooms/outlines.ts:17-18`, `cabinets/autofill.ts:40-41`, … ; app: `tools/overlay.ts:87,153`, `tools/selection-edit.ts:103-104`, `layers/floor-transitions.ts:70-72`, `electrical/circuit-drawing.ts:69`, `plan/input.ts:76-77`, `selection/selection-controller.ts:130` | `packages/geometry/src/vec.ts` |
| R11 | 30 `Lazy*` wrappers, one shape (`useLazy` + `mod ? <mod.X {...props}/> : null`) | 30 | `ProjectEditor.tsx:1766-2098` | lever L4 |
| R12 | Six Defaults readers, each a `useSyncExternalStore` over `session.defaults` | 6 | `ProjectEditor.tsx:616` fit tolerance, `:624` keyboard shortcuts, `:670` auto-fill increment, `:677` fan clearance, `:688` ACT min share, `:700` countertop defaults | `useDefault(key)` hook |
| R13 | Inspector panels for ceiling objects live in `tools/` | 4 | `tools/BeamPanel.tsx`, `tools/ActGridPanel.tsx`, `tools/DevicePanel.tsx`, `tools/SwitchZonePanel.tsx` | move to `inspector/kinds/` (EZD-1915) |
| R14 | `kindKey` message-key builders | 5 | `electrical/DeviceToolbar.tsx:45`, `inspector/PinPanel.tsx:26`, `ceiling/ShapeChooser.tsx:17`, `lazy/rcp/DeviceChooser.tsx:25`, `lazy/fixtures-panel/FixturesPanel.tsx:74` | leave (different key families); noted only |
| R15 | Module-level singleton state | 1 | `electrical/height-notes-shown.ts:1-18` keeps "height notes shown" across projects in one tab | make it per session in R4's store. **Behaviour check needed**: confirm with S06 whether the toggle should survive a project switch before changing it (**unverified**) |

Not redundant, checked: the two lazy RCP modules (`ceiling/rcp-module` for the view, `lazy/rcp` for device placement)
are different code; `three.module.js` and `three.core.js` are one library.

---

## 5. Structure: why lanes wait, and how to split

### 5.1 Hot files (since 2026-11-06)

| File | Lines | Feature commits touching it | Times named in waits (all) |
| --- | --- | --- | --- |
| `editor/ProjectEditor.tsx` | 2,098 | 69 of 230 | 371 |
| `packages/geometry/src/index.ts` | 70 | 34 | 87 |
| `editor/tools/drawing-controller.ts` | 1,742 | 23 | 15 |
| `editor/plan/controller.ts` | 821 | 20 | 8 |
| `editor/tools/DrawingTools.tsx` | 644 | 19 | 21 |
| `editor/selection/pick-index.ts` | 428 | 15 | 10 |
| `packages/geometry/src/schema/index.ts` | 375 | 15 | 11 |
| `editor/inspector/InspectorPanel.tsx` | 1,397 | 14 | 22 |
| `editor/tools/model-changes.ts` | 356 | 11 | 19 |
| `editor/ceiling/rcp.ts` | 588 | 9 | 29 |
| `editor/layers/LeftPanel.tsx` (+ .test, .module.css) | 391 | 9 | 21 + 12 + 11 |
| `editor/cabinets/cabinet-view.ts` | 480 | 8 | 26 |

### 5.2 Why each new feature edits `ProjectEditor.tsx`

It does seven jobs at once:
1. builds every controller when the session opens (`:370-520`);
2. holds 20 `useSyncExternalStore` subscriptions and 99 hooks in one component;
3. wires every ceiling tool's click receiver by hand (`:954-1036`);
4. chooses what fills each slot (header `:1181`, canvas `:1379`, inspector `:1509-1557`, left panel `:1562-1647`,
   status bar `:1695`) through nested conditions per mode;
5. declares 20 lazy modules and 30 wrappers (`:1758-2098`);
6. installs the dev hooks (`:940-952`, `:1040-1074`, `:1095-1106`);
7. carries 60 lines of per-ticket header comments (`:1-60`).

### 5.3 Target shape: features plug in

```
app/src/editor/
  ProjectEditor.tsx          ~500 lines: open session, render EditorFrame, map slots from the registry
  session/create-controllers.ts   controller construction + dispose (job 1)
  dev-hooks.ts               job 6
  shared/                    ids.ts, value-store.ts, use-store-value.ts, use-default.ts, lazy-part.tsx
  features/
    types.ts                 EditorFeature = { id, order, active(ctx), leftPanel?, inspector?, overlay?,
                             statusStart?, statusEnd?, header?, rail?, keys?, receivers?, devHook? }
    index.generated.ts       generated list of the files below (see 5.4)
    cabinets.tsx  countertops.tsx  electrical.tsx  ceiling.tsx  versions.tsx
    sheets.tsx  scene-3d.tsx  assistant.tsx  conflicts.tsx  lock.tsx  send.tsx  benchmark.tsx
  inspector/kinds/           one file per object type: beam.tsx, act-grid.tsx, device.tsx, switch-zone.tsx,
                             pin.tsx, engineer-note.tsx, room.tsx; wall / opening / bulk split out of InspectorPanel
  layers/sections/           phase.tsx, overlays.tsx, rooms.tsx (LeftPanel maps them)
  ceiling/draw/              beams.ts, act-grid.ts, zones.ts, shapes.ts, tags.ts, troffers.ts (rcpList maps them)
  ceiling/tools/             one receiver registration per ceiling tool (job 3)
```

A new editor feature then adds `features/<name>.tsx` (and its own folder) and touches no shared file, except the
generated index.

### 5.4 Keep the registry index from becoming the next hot file

The loop holds whatever files a plan lists (`vault/build/footprints.json` per ticket; only `en.ts` and `es.ts` are
merge-at-end `shared_files` in `vault/build/config.json`). If every feature appends a line to one
`features/index.ts`, the lanes wait on that instead. So:

- `features/index.generated.ts`, `inspector/kinds/index.generated.ts`, `layers/sections/index.generated.ts`,
  `ceiling/draw/index.generated.ts` are **generated** by one script from the folder listing (sorted, so two branches
  produce the same file). The script lives under `app/` (not root `scripts/`, which holds loop tooling). A unit test
  fails if the file is stale. Builders run the script; planners never list the index in a footprint.
- Add those generated files to `shared_files` (merge at end, regenerate on conflict). That is a one-line loop config
  change; per the tooling-edit rule, the overseer session applies it as a patch, not a builder.
- `packages/geometry/src/index.ts` (87 waits): add wildcard subpath exports (`"./*": "./src/*/index.ts"` in
  `packages/geometry/package.json`) and a lint rule that new geometry folders are imported as
  `@ezdraft/geometry/<area>` and not added to the root barrel. The root barrel stays for existing imports.
- Nothing in a generated index may import from `app/src/lazy/` statically; a unit test checks it (the B11
  contents rule forbids the `lazy` category in the editor entry, `eslint-rules/boundaries.mjs:58-64`).

### 5.5 Replay of the waits (method)

For each "next tickets wait on held files" line in `vault/build/loop.log` since 2026-11-20 (82 lines, 246
ticket-waits), a ticket counts as freed when every file blocking it is one a ticket in section 9 splits:
`ProjectEditor.tsx`, `InspectorPanel.tsx`, `LeftPanel.tsx` and its `.module.css`, `DrawingTools.tsx`, `rcp.ts`,
`packages/geometry/src/index.ts` (adding `drawing-controller.ts`, EZD-1919, frees no more). Results in section 1.
Files that are hot but **not** split by this plan, and could be later tickets: `selection/pick-index.ts`,
`tools/model-changes.ts`, `plan/controller.ts`, `cabinets/cabinet-view.ts`, `geometry/src/schema/index.ts`,
`LeftPanel.test.tsx`. Counting those too would raise the figures to 42 of 82 moments (editor) and 64 of 82 (with W2). Remaining top co-blockers are outside
the editor: `docs/architecture.md` 108, `database.types.ts` 57, `supabase/migrations/` 38,
`server/assistant/send-list.ts` 25.

---

## 6. Consistency (same job, different ways)

| # | Pattern | How it varies today | Evidence | Changes what the user sees? |
| --- | --- | --- | --- | --- |
| C1 | Length / size boxes | padding 6×8, 7×9, 8×10, 9×10 px; heights 26 (pill) and 38 px; font 13 px vs default | `.input` rules in 24 CSS modules, e.g. `lazy/fixtures-panel/FixturesPanel.module.css`, `editor/electrical/ExistingPanelDialog.module.css`, `editor/tools/BeamSpacingPill.module.css`, `lazy/my-profile/my-profile.module.css` | yes → D1 |
| C2 | Empty-list messages | 24 px padding (inspector) vs 10×14 / 10×0 / 4×8 px at 13–15 px font | `inspector/InspectorPanel.module.css`, `lazy/cabinet-run/CabinetLibrary.module.css`, `CabinetSchedule.module.css`, `lazy/countertops/CountertopsPanel.module.css`, `TopSchedule.module.css`, `lazy/scene-3d/Scene3dOverlay.module.css` | yes → D2 |
| C3 | Panel buttons | padding 4×10, 7×12, 9×12, 9×14 px; one 56 px tall (tablet bar) | `.button` in `edit/InspectorMore.module.css`, `conflicts/ConflictPanel.module.css`, `ceiling/RoomCeiling.module.css`, `tools/ActGridPanel.module.css`, `selection/SelectionLayer.module.css` | yes → D3 |
| C4 | Tabs and segmented controls | built separately in 9 places (`role="tablist"`/`radiogroup`): `layers/LeftPanel.tsx`, `electrical/ElectricalPanel.tsx`, `inspector/InspectorPanel.tsx` ×2, `status/PlanStatus.tsx` ×2, `lazy/cabinet-run/CabinetLibrary.tsx`, `lazy/countertops/CountertopsPanel.tsx`, `lazy/template-picker` | yes, slightly → D4 |
| C5 | Section headers in panels (`.section`, `.head`, `.title`, `.sectionName`, `.lbl`) | 13 modules each style their own | CSS class census over 58 modules (9,151 lines) | small; follows D2–D4 |
| C6 | Lazy loading of panels | `useLazy` in `ProjectEditor.tsx`, separate `*-module.ts` loaders in `tools/sketch-module.ts`, `tools/fixtures-module.ts`, `layers/room-fields-module.ts`, `plan/PdfUnderlay.tsx`, `review/EditorReview.tsx` | grep `lazyModule(() =>` | no → technical (L4) |
| C7 | Selection per mode | main selection controller; cabinet store; countertop store | `selection/selection-controller.ts`, `cabinets/cabinet-selection-store.ts`, `countertops/selection-store.ts` | no → leave as is (different rules per spec) |

There is no shared panel kit today: `app/src/components/` has no `Button`, `TextField`, `Tabs`, `Section` or
`EmptyState` (grep). Ticket EZD-1920 adds one **with each panel's current look kept**, so nothing changes until
Josh answers D1–D4.

---

## 7. Risks and guard rails for every ticket

- Every existing unit and e2e test named for the moved code passes. Tests may change **only their import paths**,
  with the one-line reason in the commit message (CLAUDE.md rule 3). No locked test is touched (no
  `*.golden.test.ts` exists today; `rls.*.test.ts` do not import editor code).
- EZD-207a B8 (≤ 500,000 bytes) and EZD-120c B11 (no `lazy` / `heavy` code in the editor entry) stay green with their
  limits unchanged. Each structural ticket reports the editor size before and after.
- Dev hook names and shapes (2.6) are unchanged.
- The `ProjectEditor.tsx` tickets (EZD-1910 → EZD-1914) each hold that file: run them back to back on one lane while
  the other lanes take non-editor tickets.
- After EZD-1913c, the planner (not a builder) re-validates any open plan that names `ProjectEditor.tsx`, `InspectorPanel.tsx`,
  `LeftPanel.tsx`, `DrawingTools.tsx` or `rcp.ts` (today only parent-id plans EZD-205/207/208/210/211/213/221/5603/5604
  name them, and those are built through their lettered parts, so the real count is near zero; new plans are written
  just ahead of building).

---

## 8. Design questions for Josh (UI only)

Each is about the look only; the behaviour is unified either way. Before asking, the builder checks the board for
each panel; where a board already draws a panel's look, the board wins and that panel is not part of the question.

- **D1. Length and size boxes.** Today the box you type a length into is drawn 5 slightly different ways (padding,
  height, font size; the beam spacing box is a rounded pill). Should every length box in the editor look like the
  wall inspector's box on board S03d? *Recommendation:* yes, except the beam spacing pill, which floats over the
  plan.
- **D2. Empty-panel messages.** "Nothing here yet" text is large and centred in the inspector but small and left
  in the cabinet and countertop lists. One look for all? *Recommendation:* small and left in lists, large and centred
  only where the whole panel is empty.
- **D3. Panel buttons.** Buttons in panels come in 4 sizes. One size for panel buttons (tablet bar excepted)?
  *Recommendation:* yes, the S03 board's size.
- **D4. Tabs and segments.** The Floor / Ceiling / Both switch, left-panel tabs, electrical tabs, countertop tabs and
  cabinet library tabs are each drawn separately. Same look everywhere? *Recommendation:* one look for tabs, one
  for the Floor / Ceiling / Both style switch.

---

## 9. Tickets

IDs EZD-1901…EZD-1921 are unused in `vault/tickets/tickets.json` (checked). Not added there. Shape matches its
entries (`phase` is an integer there; `59` is used here as a placeholder for a new phase, the next free number),
plus `files`, `risk`, `order` and `ac_text` (in the real file AC text lives in `vault/spec/acceptance-criteria.md`).
Every ticket also carries the guard rails of section 7 as AC.

Order and lanes:

1. EZD-1901 (alone, first).
2. In parallel: EZD-1902, EZD-1903, EZD-1904, EZD-1905, EZD-1906a/b/c (none touch `ProjectEditor.tsx`; 1902 and
   1905 both touch `docs/architecture.md`, so run those two apart).
3. One lane, back to back: EZD-1910 → EZD-1911 → EZD-1912 → EZD-1913a → 1913b → 1913c → EZD-1914.
4. In parallel after 3: EZD-1915, EZD-1916, EZD-1917, EZD-1918.
5. EZD-1920 (panel kit, look kept), then the design follow-ups after Josh answers D1–D4.
6. EZD-1919 (drawing controller), last and optional.
7. EZD-1921 (architecture notes by a builder; plan re-validation and the planner lesson by the planner or overseer,
   since builders do not edit `vault/plans` or `vault/lessons`) after step 3 and again at the end.

```json
[
 {
  "id": "EZD-1901",
  "phase": 59,
  "title": "Editor feature contract and characterization tests",
  "depends_raw": "",
  "spec_ref": "Editor plan 2026-11-23 section 2; S03-S07, S13, S20",
  "spec_files": [
   "spec/sections/screens/S03-plan-editor.md"
  ],
  "mockups": [],
  "decisions": [],
  "depends_on": [],
  "acs": [
   "AC-EZD-1901-1",
   "AC-EZD-1901-2",
   "AC-EZD-1901-3"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/contract/<new>.test.ts",
   "app/e2e/editor-contract.spec.ts"
  ],
  "risk": "low",
  "order": 1,
  "ac_text": {
   "AC-EZD-1901-1": "A new unit test lists every rail tool id and default key (section 2.2 and 2.3), every left panel tab, every inspector branch type (2.5), the six plain-plan status items and the dev hook names, and fails if any is missing.",
   "AC-EZD-1901-2": "For each of the 7 built tickets with no named test (EZD-014a, EZD-015b, EZD-030, EZD-204a, EZD-206, EZD-402, EZD-726; section 2.7), the ticket either names the existing test that covers it in a comment of the new contract test, or adds a characterization test that passes on develop as it is. The 16 unbuilt tickets named in comments need nothing.",
   "AC-EZD-1901-3": "No source file outside tests changes; the full gate passes."
  }
 },
 {
  "id": "EZD-1902",
  "phase": 59,
  "title": "Draw the plan with plain Three.js instead of React Three Fiber",
  "depends_raw": "EZD-1901",
  "spec_ref": "02 Stack 2D + 3D; 11 rules 4 and 7; 11 Budgets editor download size",
  "spec_files": [
   "spec/sections/02-product-overview.md",
   "spec/sections/11-non-functional-requirements.md"
  ],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1901"
  ],
  "acs": [
   "AC-EZD-1902-1",
   "AC-EZD-1902-2",
   "AC-EZD-1902-3",
   "AC-EZD-1902-4"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/plan/render-root.ts",
   "app/src/editor/plan/frame-capture.ts",
   "app/package.json",
   "pnpm-lock.yaml",
   "docs/architecture.md",
   "eslint-rules/boundaries.mjs",
   "vault/build/assumptions.md"
  ],
  "risk": "medium",
  "order": 2,
  "ac_text": {
   "AC-EZD-1902-1": "@react-three/fiber is removed from app/package.json and from the Dependencies table; render-root.ts makes one WebGLRenderer per canvas, draws on demand only, and keeps setScene, setCamera, resize, invalidate, stats, captureFrame and unmount with the same behaviour.",
   "AC-EZD-1902-2": "Switching Plan, 3D and Sheets creates no second WebGL context (the existing __ezdraftPlan stats contexts check stays at 1) and all plan-canvas, scene-3d, thumbnail and frame-capture tests pass with only import-path changes.",
   "AC-EZD-1902-3": "The editor route's measured size drops by at least 40,000 bytes against the develop build before the change; the ticket records the before and after numbers.",
   "AC-EZD-1902-4": "The stack line in docs/architecture.md and a decision note recording the change (technical, agent-decided) are updated in the same commit; the spec 02 Stack line is listed in vault/build/assumptions.md for the spec owner to update."
  }
 },
 {
  "id": "EZD-1903",
  "phase": 59,
  "title": "Slimmer zod in the editor: geometry schemas on zod/mini",
  "depends_raw": "EZD-1901",
  "spec_ref": "11 Budgets editor download size; EZD-332 precedent",
  "spec_files": [
   "spec/sections/11-non-functional-requirements.md"
  ],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1901"
  ],
  "acs": [
   "AC-EZD-1903-1",
   "AC-EZD-1903-2",
   "AC-EZD-1903-3"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "packages/geometry/src/schema/*.ts",
   "packages/geometry/src/drawing/build.ts",
   "packages/geometry/src/drawing/types.ts",
   "packages/geometry/src/rooms/override.ts",
   "app/src/server/**/(callers of schema methods, as needed)",
   "docs/architecture.md"
  ],
  "risk": "medium",
  "order": 2,
  "ac_text": {
   "AC-EZD-1903-1": "The geometry schemas are written with zod/mini (same zod 4 dependency, no new package); every schema accepts and rejects exactly what it does today, shown by the existing geometry, model and server schema tests passing with no expected value changed.",
   "AC-EZD-1903-2": "buildDrawingList no longer runs zod on its own app-built inputs on every call (drawing/build.ts:134-135); inputs from outside the app are still validated where they enter.",
   "AC-EZD-1903-3": "The editor route's measured size drops by at least 8,000 bytes and zod's to-json-schema code is no longer in the editor entry; the ticket records the before and after numbers."
  }
 },
 {
  "id": "EZD-1904",
  "phase": 59,
  "title": "Geometry: one vector helper module",
  "depends_raw": "EZD-1901",
  "spec_ref": "Editor plan R10",
  "spec_files": [],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1901"
  ],
  "acs": [
   "AC-EZD-1904-1",
   "AC-EZD-1904-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "packages/geometry/src/vec.ts",
   "packages/geometry/src/ceiling/*.ts",
   "packages/geometry/src/countertops/*.ts",
   "packages/geometry/src/rooms/*.ts",
   "packages/geometry/src/cabinets/*.ts",
   "packages/geometry/src/scene3d/ceiling-mesh.ts"
  ],
  "risk": "low",
  "order": 2,
  "ac_text": {
   "AC-EZD-1904-1": "packages/geometry/src/vec.ts holds add, sub, dot, cross, dist and clamp with unit tests whose expected values are worked by hand; no other geometry file defines its own copy.",
   "AC-EZD-1904-2": "The whole geometry test suite passes with no expected value changed."
  }
 },
 {
  "id": "EZD-1905",
  "phase": 59,
  "title": "Geometry: subpath exports so new modules don't edit the root index",
  "depends_raw": "EZD-1901",
  "spec_ref": "First audit W2; editor plan 5.4",
  "spec_files": [],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1901"
  ],
  "acs": [
   "AC-EZD-1905-1",
   "AC-EZD-1905-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "packages/geometry/package.json",
   "eslint-rules/<new rule>",
   "docs/architecture.md"
  ],
  "risk": "low",
  "order": 2,
  "ac_text": {
   "AC-EZD-1905-1": "@ezdraft/geometry/<area> resolves for every folder under packages/geometry/src in app code, tests, workers and the build; the root index keeps every export it has today.",
   "AC-EZD-1905-2": "A lint rule fails when a new export line is added to packages/geometry/src/index.ts; architecture.md tells planners to import new areas by subpath."
  }
 },
 {
  "id": "EZD-1906a",
  "phase": 59,
  "title": "Editor shared helpers (ids, value store, store hook, inch text) in tools, selection, edit",
  "depends_raw": "EZD-1901",
  "spec_ref": "Editor plan R1-R4, R7-R9",
  "spec_files": [],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1901"
  ],
  "acs": [
   "AC-EZD-1906a-1",
   "AC-EZD-1906a-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/shared/<new>",
   "app/src/editor/tools/*.ts",
   "app/src/editor/selection/*.ts",
   "app/src/editor/edit/*.ts"
  ],
  "risk": "low",
  "order": 2,
  "ac_text": {
   "AC-EZD-1906a-1": "app/src/editor/shared holds idKey/sameId, sameIds, createValueStore, useStoreValue and inchText with unit tests; no file in the ticket's folders defines its own copy.",
   "AC-EZD-1906a-2": "Every test in the touched folders passes with only import-path changes."
  }
 },
 {
  "id": "EZD-1906b",
  "phase": 59,
  "title": "Editor shared helpers in electrical, assistant, inspector, versions, floors",
  "depends_raw": "EZD-1906a",
  "spec_ref": "Editor plan R1-R4, R7-R9",
  "spec_files": [],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1906a"
  ],
  "acs": [
   "AC-EZD-1906b-1",
   "AC-EZD-1906b-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/electrical/*.ts",
   "app/src/editor/assistant/*.ts",
   "app/src/editor/inspector/*.ts",
   "app/src/editor/versions/*.ts",
   "app/src/editor/floors/*.ts"
  ],
  "risk": "low",
  "order": 2,
  "ac_text": {
   "AC-EZD-1906b-1": "No file in the ticket's folders defines its own copy of a helper that app/src/editor/shared (EZD-1906a) provides.",
   "AC-EZD-1906b-2": "Every test in the touched folders passes with only import-path changes."
  }
 },
 {
  "id": "EZD-1906c",
  "phase": 59,
  "title": "Editor shared helpers in countertops, cabinets and their lazy screens; STATUSES and CM_PER_IN constants",
  "depends_raw": "EZD-1906a",
  "spec_ref": "Editor plan R1-R4, R7-R9",
  "spec_files": [],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1906a"
  ],
  "acs": [
   "AC-EZD-1906c-1",
   "AC-EZD-1906c-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/countertops/*.ts",
   "app/src/editor/cabinets/*.ts",
   "app/src/lazy/countertops/*.tsx",
   "app/src/lazy/cabinet-run/*.tsx",
   "app/src/lazy/edit-menu/EditMenu.tsx",
   "packages/geometry/src/schema/common.ts"
  ],
  "risk": "low",
  "order": 2,
  "ac_text": {
   "AC-EZD-1906c-1": "No file in the ticket's folders defines its own copy of a helper that app/src/editor/shared (EZD-1906a) provides, and STATUSES and CM_PER_IN are defined once.",
   "AC-EZD-1906c-2": "Every test in the touched folders passes with only import-path changes."
  }
 },
 {
  "id": "EZD-1910",
  "phase": 59,
  "title": "Editor feature registry, lazy-part helper and Defaults hook",
  "depends_raw": "EZD-1901, EZD-1906a",
  "spec_ref": "Editor plan 5.3, 5.4, L4, R11, R12",
  "spec_files": [
   "spec/sections/11-non-functional-requirements.md"
  ],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1901",
   "EZD-1906a"
  ],
  "acs": [
   "AC-EZD-1910-1",
   "AC-EZD-1910-2",
   "AC-EZD-1910-3",
   "AC-EZD-1910-4"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/ProjectEditor.tsx",
   "app/src/editor/features/types.ts",
   "app/src/editor/features/index.generated.ts",
   "app/src/editor/shared/lazy-part.tsx",
   "app/src/editor/shared/use-default.ts",
   "app/src/lazy/electrical/<new facade>",
   "app/src/lazy/versions/<new facade>",
   "app/tools/gen-registry.mjs"
  ],
  "risk": "medium",
  "order": 3,
  "ac_text": {
   "AC-EZD-1910-1": "The 30 Lazy* wrappers become calls to one lazyPart helper; electrical and versions load through app/src/lazy facades; the inspector still preloads on the first press or key.",
   "AC-EZD-1910-2": "The six Defaults readers use one useDefault hook; a resync still updates every reader at once.",
   "AC-EZD-1910-3": "features/index.generated.ts is produced by a script from the folder listing; a unit test fails when it is stale and when anything it imports reaches app/src/lazy statically.",
   "AC-EZD-1910-4": "EZD-1901's contract test and every editor e2e spec pass unchanged; the editor route's size does not grow."
  }
 },
 {
  "id": "EZD-1911",
  "phase": 59,
  "title": "Move the editor's dev and test hooks to one file",
  "depends_raw": "EZD-1910",
  "spec_ref": "Editor plan 5.2 job 6",
  "spec_files": [],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1910"
  ],
  "acs": [
   "AC-EZD-1911-1"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/ProjectEditor.tsx",
   "app/src/editor/dev-hooks.ts"
  ],
  "risk": "low",
  "order": 4,
  "ac_text": {
   "AC-EZD-1911-1": "__ezdraftEditor, __ezdraftPlan, __ezdraftSelection and __ezdraft3d keep their names, fields and on/off rule (devHooks), installed from dev-hooks.ts; every e2e spec that uses them passes unchanged."
  }
 },
 {
  "id": "EZD-1912",
  "phase": 59,
  "title": "Move controller construction out of ProjectEditor",
  "depends_raw": "EZD-1911",
  "spec_ref": "Editor plan 5.2 job 1",
  "spec_files": [],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1911"
  ],
  "acs": [
   "AC-EZD-1912-1",
   "AC-EZD-1912-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/ProjectEditor.tsx",
   "app/src/editor/session/create-controllers.ts",
   "app/src/editor/session/create-controllers.test.ts"
  ],
  "risk": "medium",
  "order": 5,
  "ac_text": {
   "AC-EZD-1912-1": "create-controllers builds plan, drawing, selection, edit, scale, phase, layers, derived, floors, routed, versions and the Assistant loader in today's order and disposes them in today's reverse order; a new unit test checks both orders.",
   "AC-EZD-1912-2": "Every editor unit and e2e test passes unchanged."
  }
 },
 {
  "id": "EZD-1913a",
  "phase": 59,
  "title": "Cabinets and Countertops modes as registry features",
  "depends_raw": "EZD-1912",
  "spec_ref": "S04 Layout; S04b Layout; editor plan 2.4 precedence",
  "spec_files": [
   "spec/sections/screens/S04-cabinet-run-elevation.md"
  ],
  "mockups": [
   "mockups/S04Cabinets.png",
   "mockups/S04bCountertops.png"
  ],
  "decisions": [],
  "depends_on": [
   "EZD-1912"
  ],
  "acs": [
   "AC-EZD-1913a-1",
   "AC-EZD-1913a-2",
   "AC-EZD-1913a-3"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/ProjectEditor.tsx",
   "app/src/editor/features/cabinets.tsx",
   "app/src/editor/features/countertops.tsx",
   "app/src/editor/features/slots.test.tsx"
  ],
  "risk": "high",
  "order": 6,
  "ac_text": {
   "AC-EZD-1913a-1": "A new test pins today's slot precedence as read from ProjectEditor.tsx: left panel (:1562-1647) 3D none > Sheets > Cabinets > Countertops > LeftPanel; inspector place (:1509-1557, :1681-1687) open Assistant > (3D or Sheets: none) > Version inspector > Cabinet box > Countertop > selection inspector with More; status bar start and end items in today's order.",
   "AC-EZD-1913a-2": "Cabinets and Countertops fill their slots from features/cabinets.tsx and features/countertops.tsx; ProjectEditor names neither.",
   "AC-EZD-1913a-3": "Every cabinet and countertop unit and e2e test (cabinet-run.spec.ts and the countertops-*.spec.ts files) passes unchanged; the precedence test of AC-1 passes."
  }
 },
 {
  "id": "EZD-1913b",
  "phase": 59,
  "title": "Electrical and Ceiling modes as registry features",
  "depends_raw": "EZD-1913a",
  "spec_ref": "S05, S06 Layout; editor plan 2.4",
  "spec_files": [
   "spec/sections/screens/S05-ceiling-plan-rcp.md"
  ],
  "mockups": [
   "mockups/S05Ceiling.png",
   "mockups/S06Electrical.png"
  ],
  "decisions": [],
  "depends_on": [
   "EZD-1913a"
  ],
  "acs": [
   "AC-EZD-1913b-1",
   "AC-EZD-1913b-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/ProjectEditor.tsx",
   "app/src/editor/features/electrical.tsx",
   "app/src/editor/features/ceiling.tsx"
  ],
  "risk": "high",
  "order": 6,
  "ac_text": {
   "AC-EZD-1913b-1": "Electrical and Ceiling (surface segment, RCP view, Lighting, fixture schedule, room ceiling, legend and joists status) fill their slots from their own features/ files; ProjectEditor names none of them; the EZD-1913a precedence test passes unchanged.",
   "AC-EZD-1913b-2": "Every unit test of these modes and the e2e specs electrical.spec.ts, ceiling-rcp.spec.ts, ceiling-devices.spec.ts, ceiling-shapes.spec.ts, act-grid.spec.ts pass unchanged; dev hooks keep their names and shapes."
  }
 },
 {
  "id": "EZD-1913c",
  "phase": 59,
  "title": "Versions, Sheets, 3D, Assistant and editor dialogs as registry features",
  "depends_raw": "EZD-1913b",
  "spec_ref": "S07, S13, S20, S03c, S06 lock; editor plan 2.1, 2.6",
  "spec_files": [
   "spec/sections/screens/S03c-ai-assistant.md"
  ],
  "mockups": [
   "mockups/S07ThreeD.png",
   "mockups/S13Sheets.png",
   "mockups/S03cAIAssistant.png"
  ],
  "decisions": [],
  "depends_on": [
   "EZD-1913b"
  ],
  "acs": [
   "AC-EZD-1913c-1",
   "AC-EZD-1913c-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/ProjectEditor.tsx",
   "app/src/editor/features/versions.tsx",
   "app/src/editor/features/sheets.tsx",
   "app/src/editor/features/scene-3d.tsx",
   "app/src/editor/features/assistant.tsx",
   "app/src/editor/features/conflicts.tsx",
   "app/src/editor/features/lock.tsx",
   "app/src/editor/features/send.tsx",
   "app/src/editor/features/help.tsx"
  ],
  "risk": "high",
  "order": 6,
  "ac_text": {
   "AC-EZD-1913c-1": "Versions (tab, inspector, status, diff layer), Sheets, 3D, Assistant (panel, preview layer, rail button), conflicts, lock UI, Send and Upload dialogs, Help panel fill their slots from their own features/ files; ProjectEditor names none of them; the EZD-1913a precedence test passes unchanged.",
   "AC-EZD-1913c-2": "Every unit test of these modes and the e2e specs versions-panel.spec.ts, sent-versions.spec.ts, sheets-screen.spec.ts, scene-3d.spec.ts, assistant-*.spec.ts, conflict-list.spec.ts, keyboard-shortcuts.spec.ts pass unchanged; dev hooks keep their names and shapes."
  }
 },
 {
  "id": "EZD-1914",
  "phase": 59,
  "title": "Ceiling tools register their own click receivers",
  "depends_raw": "EZD-1913c",
  "spec_ref": "S05 Controls; editor plan 5.2 job 3",
  "spec_files": [
   "spec/sections/screens/S05-ceiling-plan-rcp.md"
  ],
  "mockups": [
   "mockups/S05Ceiling.png"
  ],
  "decisions": [],
  "depends_on": [
   "EZD-1913c"
  ],
  "acs": [
   "AC-EZD-1914-1",
   "AC-EZD-1914-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/ProjectEditor.tsx",
   "app/src/editor/ceiling/tools/<one file per tool>",
   "app/src/editor/ceiling/tools/index.generated.ts"
  ],
  "risk": "medium",
  "order": 7,
  "ac_text": {
   "AC-EZD-1914-1": "Beam, each ceiling device, switching zones, soffit, tag and ACT grid register a receiver in ceiling/tools; a click before the lazy module arrives is still placed once it has.",
   "AC-EZD-1914-2": "Every ceiling unit and e2e test (EZD-502 to EZD-515) passes unchanged; ProjectEditor.tsx is under 600 lines."
  }
 },
 {
  "id": "EZD-1915",
  "phase": 59,
  "title": "Inspector: one file per object type",
  "depends_raw": "EZD-1914",
  "spec_ref": "S03 Inspector; S05; S06; editor plan 2.5",
  "spec_files": [
   "spec/sections/screens/S03-plan-editor.md"
  ],
  "mockups": [
   "mockups/S03dWallSelected.png"
  ],
  "decisions": [],
  "depends_on": [
   "EZD-1914"
  ],
  "acs": [
   "AC-EZD-1915-1",
   "AC-EZD-1915-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/inspector/InspectorPanel.tsx",
   "app/src/editor/inspector/kinds/*",
   "app/src/editor/tools/BeamPanel.tsx",
   "app/src/editor/tools/ActGridPanel.tsx",
   "app/src/editor/tools/DevicePanel.tsx",
   "app/src/editor/tools/SwitchZonePanel.tsx"
  ],
  "risk": "medium",
  "order": 8,
  "ac_text": {
   "AC-EZD-1915-1": "Each inspector branch of section 2.5 is a registered kind in inspector/kinds, chosen in today's order; Wall, Opening and Bulk panels and the shared fields are their own files; InspectorPanel.tsx is under 300 lines.",
   "AC-EZD-1915-2": "Every inspector, beam, ACT grid, switching zone, device, pin and engineer note test passes with only import-path changes."
  }
 },
 {
  "id": "EZD-1916",
  "phase": 59,
  "title": "Left panel: registered sections",
  "depends_raw": "EZD-1914",
  "spec_ref": "S03 Controls left panel; editor plan 2.4",
  "spec_files": [
   "spec/sections/screens/S03-plan-editor.md"
  ],
  "mockups": [
   "mockups/S03Plan.png"
  ],
  "decisions": [],
  "depends_on": [
   "EZD-1914"
  ],
  "acs": [
   "AC-EZD-1916-1",
   "AC-EZD-1916-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/layers/LeftPanel.tsx",
   "app/src/editor/layers/sections/*",
   "app/src/editor/layers/LeftPanel.module.css"
  ],
  "risk": "medium",
  "order": 8,
  "ac_text": {
   "AC-EZD-1916-1": "Phase, Overlays and Rooms are registered sections, in today's order; ceiling, electrical and versions content arrive from their features; LeftPanel.tsx is under 200 lines.",
   "AC-EZD-1916-2": "LeftPanel.test.tsx and left-panel.spec.ts pass with only import-path changes."
  }
 },
 {
  "id": "EZD-1917",
  "phase": 59,
  "title": "RCP drawing: one file per ceiling item kind",
  "depends_raw": "EZD-1914",
  "spec_ref": "S05 Canvas; editor plan 5.3",
  "spec_files": [
   "spec/sections/screens/S05-ceiling-plan-rcp.md"
  ],
  "mockups": [
   "mockups/S05Ceiling.png"
  ],
  "decisions": [],
  "depends_on": [
   "EZD-1914"
  ],
  "acs": [
   "AC-EZD-1917-1",
   "AC-EZD-1917-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/ceiling/rcp.ts",
   "app/src/editor/ceiling/draw/*"
  ],
  "risk": "medium",
  "order": 8,
  "ac_text": {
   "AC-EZD-1917-1": "rcpList draws ridge, beams, ACT grids, troffers, zones, shapes and tags from registered drawers in today's order (rcp.ts:460-512); rcp.ts keeps every export the lazy module offers today.",
   "AC-EZD-1917-2": "rcp.test.ts and every ceiling e2e spec pass unchanged."
  }
 },
 {
  "id": "EZD-1918",
  "phase": 59,
  "title": "Split DrawingTools into rail, layer and per-tool parts",
  "depends_raw": "EZD-1914",
  "spec_ref": "S03 Controls rail; editor plan 5.1",
  "spec_files": [
   "spec/sections/screens/S03-plan-editor.md"
  ],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1914"
  ],
  "acs": [
   "AC-EZD-1918-1",
   "AC-EZD-1918-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/tools/DrawingTools.tsx",
   "app/src/editor/tools/DrawingRail.tsx",
   "app/src/editor/tools/DrawingLayer.tsx",
   "app/src/editor/tools/parts/*"
  ],
  "risk": "medium",
  "order": 8,
  "ac_text": {
   "AC-EZD-1918-1": "DrawingRail and DrawingLayer are their own files; tool-specific overlay parts (fixtures choice, sketch, measure) are registered; the rail's tool order and states (disabled, paused, select-only) are unchanged.",
   "AC-EZD-1918-2": "Every tools test and drawing-tools e2e spec passes with only import-path changes; the editor route's size does not grow."
  }
 },
 {
  "id": "EZD-1919",
  "phase": 59,
  "title": "Split the drawing controller per tool",
  "depends_raw": "EZD-1918",
  "spec_ref": "Editor plan 5.1",
  "spec_files": [],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1918"
  ],
  "acs": [
   "AC-EZD-1919-1",
   "AC-EZD-1919-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/editor/tools/drawing-controller.ts",
   "app/src/editor/tools/controller/*"
  ],
  "risk": "high",
  "order": 10,
  "ac_text": {
   "AC-EZD-1919-1": "The typed tools (wall, room rectangle, door, window, move) share one driver; each tool's state lives in its own file; drawing-controller.ts is under 500 lines.",
   "AC-EZD-1919-2": "All 30 tools test files pass with only import-path changes; the typed-entry, move and gap e2e specs pass unchanged."
  }
 },
 {
  "id": "EZD-1920",
  "phase": 59,
  "title": "Panel kit: LengthInput, Tabs, Section, EmptyState, PanelButton (current looks kept)",
  "depends_raw": "EZD-1915, EZD-1916",
  "spec_ref": "Editor plan 6 C1-C5",
  "spec_files": [],
  "mockups": [
   "mockups/S03dWallSelected.png",
   "mockups/S04Cabinets.png",
   "mockups/S04bCountertops.png"
  ],
  "decisions": [],
  "depends_on": [
   "EZD-1915",
   "EZD-1916"
  ],
  "acs": [
   "AC-EZD-1920-1",
   "AC-EZD-1920-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "app/src/components/panel/*",
   "the 7 length inputs of R6",
   "the 9 tab strips of C4"
  ],
  "risk": "low",
  "order": 9,
  "ac_text": {
   "AC-EZD-1920-1": "One LengthInput (parse, error line, commit on Enter and blur, Escape reverts) replaces the 7 length inputs; one Tabs replaces the 9 tab strips; each keeps its current class, so screenshots at 1600 x 1000 match before and after.",
   "AC-EZD-1920-2": "Every test of the touched panels passes with only import-path changes. Unifying the looks waits for Josh's answers to D1-D4."
  }
 },
 {
  "id": "EZD-1921",
  "phase": 59,
  "title": "Re-validate open editor plans and document the registry for planners",
  "depends_raw": "EZD-1913c",
  "spec_ref": "Editor plan 7",
  "spec_files": [],
  "mockups": [],
  "decisions": [],
  "depends_on": [
   "EZD-1913c"
  ],
  "acs": [
   "AC-EZD-1921-1",
   "AC-EZD-1921-2"
  ],
  "acs_source": "editor-plan-2026-11-23",
  "files": [
   "docs/architecture.md"
  ],
  "risk": "low",
  "order": 7,
  "ac_text": {
   "AC-EZD-1921-1": "architecture.md has an 'Editor features' section: a new mode, tool, inspector kind, left-panel section or ceiling drawer adds a file in its registry folder and never edits ProjectEditor.tsx; planners never list generated index files in a footprint.",
   "AC-EZD-1921-2": "Every unbuilt plan that names ProjectEditor.tsx, InspectorPanel.tsx, LeftPanel.tsx, DrawingTools.tsx or rcp.ts is re-validated against the new layout, and vault/lessons/planner.md gets the registry rule. This part is done by the planner or overseer session, not the builder."
  }
 }
]
```

Loop config (not a builder ticket): after EZD-1910, add the generated index files to `shared_files` in
`vault/build/config.json`. Applied by the overseer session as a patch (tooling-edit rule).

---

## 10. What I did not verify

- The gate's own browser measurement of the editor (I summed per-file gzip of the build's entry files; the gate may
  add idle-loaded scripts).
- The L1 saving on `three.core.js` after tree-shaking (estimate until built).
- Which reserved shortcut keys have no handler, per key (2.3).
- Whether the boards already set the looks in D1–D4 for each panel.
- No tests were run in this session; all test lists come from file names and ticket ids in test files.
- The zod/mini saving (L2) and the parse-on-redraw cost (L2b).
- The published page's rendering was not checked visually (the browser pane needed a sign-in).

---

## Appendix A. Ticket → source → tests (generated from code comments, `develop` 2daa0ce6)

Counts are files that name the ticket id. "Other route" marks tickets whose editor-tree code is used by another
screen (profile, notifications, new-project wizard, field pack); they are listed so nothing is lost, but the
editor refactor does not move them. "Not built yet" marks tickets whose id appears in a code comment that points
ahead (from `vault/build/state.json`).

| Ticket | Title | Source files | Unit tests | E2E specs |
| --- | --- | --- | --- | --- |
| EZD-011a | Shell: header card, header button and card surface | `components/shell/HeaderButton.tsx`, `components/shell/HeaderCard.tsx`, `components/shell/index.ts` | `HeaderButton.icon.test.tsx`, `HeaderButton.test.tsx`, `HeaderCard.test.tsx` +2 | — |
| EZD-011b | Shell: editor header content and labels | `components/shell/EditorHeader.tsx`, `components/shell/Wordmark.tsx`, `components/shell/editor-views.ts`, `components/shell/index.ts` +1 | `EditorHeader.test.tsx`, `header-messages.test.ts`, `shell-css.test.ts` | — |
| EZD-012a | Shell: tool rail and tooltip | `components/shell/ToolRail.tsx`, `components/shell/rail-types.ts` | `ToolRail.test.tsx`, `frame-css.test.ts` | — |
| EZD-012b | Shell: frame, status bar and empty editor | `components/shell/EditorFrame.tsx`, `components/shell/EmptyEditor.tsx`, `components/shell/StatusBar.tsx` | `EmptyEditor.test.tsx`, `frame-css.test.ts` | — |
| EZD-014a | Device layouts: device switch and phone layout | `components/shell/EmptyEditor.tsx` | **none** | **none** |
| EZD-014b | Device layouts: touch targets and icon-only header buttons | `components/shell/HeaderButton.tsx` | `HeaderButton.icon.test.tsx`, `ToolRail.test.tsx` | — |
| EZD-015b | Shared state components: toast and confirm dialog | `editor/lock-ui/LockUi.tsx` | **none** | **none** |
| EZD-020 | Entry points and lazy chunks | `lazy/dev-sample/index.ts` | — | `entries.spec.ts` |
| EZD-030 | Spike: wall openings and sloped ceiling | `lazy/scene-3d/scene.ts` | **none** | **none** |
| EZD-105b | Owner-set password | `editor/assistant/preview-markup.test-helpers.tsx` | `PreviewLayer.test.tsx`, `DiffLayer.test.tsx` | `settings-users-password.spec.ts` |
| EZD-108 | Avatar menu and My profile *(other route)* | `lazy/my-profile/MyProfileDialog.tsx`, `lazy/my-profile/index.ts` | `HeaderButton.icon.test.tsx` | `my-profile.spec.ts` |
| EZD-111 | Send dialog with Copy link | `editor/ProjectEditor.tsx`, `editor/send/SendDialog.tsx`, `lazy/send-dialog/index.ts` | — | `send-dialog.spec.ts` |
| EZD-116 | Defaults framework | `editor/ProjectEditor.tsx`, `editor/editor-session.ts`, `editor/project-defaults.ts` | `project-defaults.test.ts` | `settings-defaults.spec.ts`, `settings-shell.spec.ts` |
| EZD-120b | Patch store, outbox and autosave | `editor/model/model-store.ts`, `editor/model/patches.ts` | `model-store.test.ts`, `pin-outbox.test.ts` | — |
| EZD-120c | Editor route, save state and banners | `components/shell/EditorFrame.tsx`, `editor/ProjectEditor.tsx`, `editor/SaveStatus.tsx`, `editor/assistant/assistant-failure.ts` +23 | `SaveStatus.test.tsx`, `editor-messages.test.ts`, `editor-session.test.ts` +2 | `editor-drawing-lazy.spec.ts`, `editor.spec.ts`, `projects-touch.spec.ts` +1 |
| EZD-120d | Sign-out with queued edits, app-wide drain and the test page | `editor/ProjectEditor.tsx`, `editor/edit/test-utils/fixtures.ts` | — | `device-storage.spec.ts`, `plan-canvas.spec.ts`, `plan-zoom-hover-text.spec.ts` +2 |
| EZD-121 | Sent versions and numbering | `editor/ProjectEditor.tsx`, `editor/send/SendDialog.tsx`, `editor/version-label.ts`, `editor/version-sent.ts` | `editor-messages.test.ts`, `version-label.test.ts` | `review-pill.spec.ts`, `sent-versions.spec.ts` |
| EZD-122 | Versions panel | `editor/ProjectEditor.tsx`, `editor/layers/LeftPanel.tsx`, `editor/version-label.ts`, `editor/versions/VersionsPanel.tsx` +3 | `LeftPanel.test.tsx`, `VersionsPanel.test.tsx` | `left-panel.spec.ts`, `versions-panel.spec.ts` |
| EZD-125 | Edit lock service | `editor/editor-session.ts`, `editor/import-review/review-lock.ts`, `editor/lock-ui/lock-ui-store.ts`, `editor/lock-ui/use-lock-ui.ts` +3 | `editor-session.test.ts`, `LockUi.test.tsx`, `leave.test.ts` +1 | `editor.spec.ts`, `traffic-fetch-site.spec.ts` |
| EZD-126 | Edit lock UI | `components/shell/EditorHeader.tsx`, `editor/ProjectEditor.tsx`, `editor/electrical/ElectricalStatus.tsx`, `editor/import-review/review-lock.ts` +8 | `EditorHeader.test.tsx`, `LockUi.test.tsx`, `lock-messages.test.ts` +3 | `edit-lock.spec.ts`, `project-switcher.spec.ts` |
| EZD-127 | Review pill | `components/shell/ReviewList.tsx`, `components/shell/ReviewPill.tsx`, `editor/ProjectEditor.tsx`, `editor/review/EditorReview.tsx` +2 | `ReviewList.test.tsx`, `ReviewPill.test.tsx`, `review-api.test.ts` | `editor.spec.ts`, `review-pill.spec.ts` |
| EZD-128 | Project switcher | `components/shell/ReviewList.tsx`, `editor/ProjectEditor.tsx`, `editor/lock-ui/LockUi.tsx`, `editor/lock-ui/use-lock-ui.ts` +2 | `ProjectSwitcher.test.tsx`, `switcher-store.test.ts` | `project-switcher.spec.ts`, `review-pill.spec.ts` |
| EZD-130 | Project settings dialog | `editor/ProjectEditor.tsx`, `editor/switcher/ProjectSwitcher.tsx` | `ProjectSwitcher.settings.test.tsx` | `project-settings.spec.ts`, `project-switcher.spec.ts` |
| EZD-132 | File storage | `editor/inspector/EngineerNoteForm.tsx`, `editor/inspector/pin-photo.ts` | `EngineerNoteForm.test.tsx`, `pin-photo.test.ts` | `storage.spec.ts` |
| EZD-139 | Visual diff of an old version | `editor/ProjectEditor.tsx`, `editor/versions/DiffLayer.tsx`, `editor/versions/VersionsPanel.tsx`, `editor/versions/version-diff.ts` +1 | `DiffLayer.test.tsx`, `VersionsPanel.test.tsx`, `version-diff.test.ts` | `versions-panel.spec.ts` |
| EZD-140 | Notification settings per user *(other route)* | `lazy/my-profile/MyProfileDialog.tsx`, `lazy/my-profile/NotificationSettingsTab.tsx` | `notification-settings-tab.test.tsx` | `notification-settings.spec.ts` |
| EZD-204 | (not in tickets.json) | `editor/plan/batches.ts`, `editor/tools/model-changes.ts` | `batches.test.ts`, `model-changes.test.ts` | — |
| EZD-204a | Opening data v4 | `editor/inspector/test-utils/fixtures.ts` | **none** | **none** |
| EZD-204b | Offsets, hosting and the Not on a wall flag | `editor/plan/batches.ts`, `editor/tools/model-changes.ts`, `editor/tools/test-utils/fixtures.ts` | `batches.test.ts`, `model-changes.test.ts` | `editor-states.spec.ts` |
| EZD-206 | Snapping | `editor/plan/hover.ts`, `editor/selection/pick-index.ts` | **none** | **none** |
| EZD-207 | (not in tickets.json) | `editor/plan/hover.ts` | `ZoomStack.test.tsx`, `batches.test.ts`, `color.test.ts` +6 | `drawing-tools.spec.ts`, `perf-benchmark-pan.spec.ts`, `plan-canvas.spec.ts` +1 |
| EZD-207a | Plan canvas: renderer, drawing, grid, pan and zoom | `components/shell/EditorFrame.tsx`, `editor/ProjectEditor.tsx`, `editor/plan/PlanCanvas.tsx`, `editor/plan/batches.ts` +6 | `batches.test.ts`, `color.test.ts`, `controller.test.ts` +3 | `plan-canvas.spec.ts` |
| EZD-207b | Plan canvas: zoom stack, hover and text | `editor/plan/ZoomStack.tsx`, `editor/plan/controller.ts`, `editor/plan/glyph-atlas-canvas.ts`, `editor/plan/glyph-atlas.ts` +3 | `HeaderButton.icon.test.tsx`, `ZoomStack.test.tsx`, `controller.test.ts` +5 | `plan-text-failed.spec.ts`, `plan-text-fallback-font.spec.ts`, `plan-zoom-hover-text.spec.ts` |
| EZD-208a | Selection logic and drawing | `editor/plan/controller.ts`, `editor/plan/hover.ts`, `editor/plan/scene.ts`, `editor/selection/pick-index.ts` +2 | `controller.test.ts`, `hover.test.ts`, `scene.test.ts` +4 | — |
| EZD-208b | Selection on the plan, rail and tablet | `editor/ProjectEditor.tsx`, `editor/selection/EditBar.tsx`, `editor/selection/SelectionLayer.tsx`, `editor/selection/selection-controller.ts` +1 | `selection-controller.escape.test.ts` | `selection.spec.ts` |
| EZD-209 | Typed dimension bar | `editor/typed-entry/TypedEntryLayer.tsx`, `editor/typed-entry/typed-entry.ts` | `TypedEntryLayer.test.tsx`, `typed-entry.test.ts` | `typed-bar.spec.ts` |
| EZD-210 | (not in tickets.json) | `editor/typed-entry/TypedEntryLayer.tsx` | `drawing-controller.test.ts`, `gap.test.ts`, `model-changes.test.ts` +3 | `drawing-tools.spec.ts` |
| EZD-210a | Wall and Room rectangle tool logic | `editor/inspector/test-utils/fixtures.ts`, `editor/tools/chain-sides.ts`, `editor/tools/gap.ts`, `editor/tools/model-changes.ts` +5 | `HeaderButton.icon.test.tsx`, `gap.test.ts`, `model-changes.test.ts` +4 | — |
| EZD-210b | Drawing tools on the plan | `editor/ProjectEditor.tsx`, `editor/tools/DrawingTools.tsx`, `editor/tools/GapBoxes.tsx`, `editor/tools/drawing-controller.ts` +1 | `HeaderButton.icon.test.tsx`, `ToolRail.test.tsx`, `GapBoxes.test.tsx` +3 | `drawing-tools.spec.ts`, `editor-drawing-lazy.spec.ts` |
| EZD-211a | Door and window geometry and tool logic | `editor/tools/opening-tool.ts`, `editor/tools/tool-defs.ts` | `opening-tool.test.ts`, `tool-defs.test.ts` | — |
| EZD-211b | Door and window tools on the plan | `editor/plan/controller.ts`, `editor/plan/input.ts`, `editor/tools/DrawingTools.tsx`, `editor/tools/drawing-controller.ts` +2 | `input.test.ts`, `opening-controller.test.ts`, `overlay.test.ts` | `door-window-tools.spec.ts` |
| EZD-212b | Move tool and dragging | `editor/selection/selection-controller.ts`, `editor/tools/DrawingTools.tsx`, `editor/tools/drawing-controller.ts`, `editor/tools/gap.ts` +5 | `HeaderButton.icon.test.tsx`, `selection-controller.test.ts`, `drawing-controller.test.ts` +4 | `move.spec.ts` |
| EZD-212c | Handles, distance chips and tablet chip buttons | `editor/ProjectEditor.tsx`, `editor/selection/selection-controller.ts`, `editor/tools/DrawingTools.tsx`, `editor/tools/drawing-controller.ts` +4 | `HeaderButton.icon.test.tsx`, `drawing-controller.test.ts`, `opening-controller.test.ts` +3 | `chips.spec.ts` |
| EZD-213a | Inspector edits and view rules | `editor/inspector/inspector-edits.ts`, `editor/inspector/inspector-view.ts`, `editor/inspector/test-utils/fixtures.ts` | `InspectorPanel.test.tsx`, `inspector-edits.test.ts`, `inspector-rooms.test.tsx` +2 | — |
| EZD-213b | Inspector panel: wall, door, window and bulk edit | `editor/ProjectEditor.tsx`, `editor/inspector/InspectorEmpty.tsx`, `editor/inspector/InspectorPanel.tsx`, `editor/inspector/inspector-input.ts` +1 | `InspectorPanel.test.tsx`, `inspector-input.test.ts`, `selection-controller.test.ts` | `inspector.spec.ts` |
| EZD-213c | Resolve the gap in the inspector | `editor/inspector/InspectorPanel.tsx`, `editor/inspector/ResolveGap.tsx`, `editor/tools/GapBoxes.tsx`, `editor/tools/drawing-controller.ts` +1 | `InspectorPanel.test.tsx`, `ResolveGap.test.tsx`, `GapBoxes.test.tsx` +2 | `resolve-gap.spec.ts` |
| EZD-214 | Status and phase switch | `editor/ProjectEditor.tsx`, `editor/assistant/apply-reply.ts`, `editor/assistant/assistant-session.ts`, `editor/edit/arrange-changes.ts` +23 | `apply-reply.status.test.ts`, `inspector-status.test.tsx`, `phase-filter.test.ts` +3 | `inspector.spec.ts`, `phase-view.spec.ts`, `plan-canvas.spec.ts` |
| EZD-215 | Bearing wall rule | `editor/assistant/apply-reply.ts`, `editor/edit/arrange-changes.ts`, `editor/edit/bearing-rule.ts`, `editor/inspector/EngineerNoteForm.tsx` +9 | `apply-reply.status.test.ts`, `arrange-changes.test.ts`, `bearing-rule.test.ts` +4 | `bearing-wall.spec.ts` |
| EZD-217 | Undo, redo and clipboard | `editor/ProjectEditor.tsx`, `editor/assistant/accept.ts`, `editor/edit/edit-changes.ts`, `editor/edit/edit-controller.ts` +4 | `HeaderButton.icon.test.tsx`, `accept.saved-edit.test.ts`, `edit-changes.test.ts` +3 | `edit-commands.spec.ts`, `selection.spec.ts` |
| EZD-218 | Left panel: Layers and Rooms | `editor/ProjectEditor.tsx`, `editor/inspector/InspectorPanel.tsx`, `editor/inspector/inspector-view.ts`, `editor/layers/LeftPanel.tsx` +7 | `inspector-input.test.ts`, `inspector-rooms.test.tsx`, `LeftPanel.test.tsx` +5 | `drawing-tools.spec.ts`, `editor.spec.ts`, `left-panel.spec.ts` +1 |
| EZD-219 | Status bar popovers | `editor/ProjectEditor.tsx`, `editor/plan/controller.ts`, `editor/plan/input.ts`, `editor/plan/view.ts` +3 | `controller.test.ts`, `view.test.ts`, `plan-status.test.tsx` +2 | `status-bar.spec.ts` |
| EZD-220 | Existing-condition pins | `editor/edit/edit-changes.ts`, `editor/inspector/InspectorPanel.tsx`, `editor/inspector/PinPanel.tsx`, `editor/inspector/pin-photo.ts` +9 | `PinPanel.test.tsx`, `pin-photo.test.ts`, `room-photos.test.tsx` +4 | `fixtures-tool.spec.ts`, `pins.spec.ts` |
| EZD-221b | Wizard step 2, template picker and empty hint | `editor/EmptyPlanHint.tsx`, `editor/ProjectEditor.tsx`, `lazy/template-picker/TemplatePicker.tsx`, `lazy/template-picker/index.ts` +1 | `HeaderButton.icon.test.tsx`, `EmptyPlanHint.test.tsx`, `template-draft.test.ts` | `new-project-templates.spec.ts` |
| EZD-222 | Keyboard shortcuts and Help | `editor/ProjectEditor.tsx`, `editor/ceiling/CeilingParts.tsx`, `editor/ceiling/surface.ts`, `editor/edit/edit-controller.ts` +12 | `surface.test.ts`, `help.test.tsx`, `drawing-shell.test.ts` | `door-window-tools.spec.ts`, `drawing-tools.spec.ts`, `editor.spec.ts` +7 |
| EZD-223 | Sketch tool | `editor/ProjectEditor.tsx`, `editor/plan/input.ts`, `editor/tools/DrawingTools.tsx`, `editor/tools/drawing-controller.ts` +5 | `HeaderButton.icon.test.tsx`, `input.palm.test.ts`, `sketch-tool.test.ts` | — |
| EZD-224 | Plan thumbnail: storage, routes and project card | `editor/lock/leave.ts` | `controller.test.ts`, `frame-capture.test.ts`, `checkpoint.test.ts` +1 | `plan-thumbnail-capture.spec.ts`, `project-thumbnail.spec.ts` |
| EZD-224b | Plan thumbnail: checkpoint capture and encode | `editor/ProjectEditor.tsx`, `editor/plan/controller.ts`, `editor/plan/frame-capture.ts`, `editor/plan/render-root.ts` +2 | `controller.test.ts`, `frame-capture.test.ts`, `checkpoint.test.ts` +1 | `plan-thumbnail-capture.spec.ts` |
| EZD-225 | Editor states | `components/shell/ToolRail.tsx`, `editor/ProjectEditor.tsx`, `editor/lock-ui/LockUi.tsx`, `editor/selection/selection-controller.ts` +3 | `ToolRail.test.tsx`, `selection-controller.test.ts`, `drawing-pause.test.ts` | `editor-states.spec.ts`, `versions-panel.spec.ts` |
| EZD-226 | Custom tile shower objects | `editor/edit/edit-changes.ts`, `editor/selection/pick-index.ts`, `editor/tools/fixture-geometry.ts`, `editor/tools/fixture-tool.ts` +2 | `tile-shower-tool.test.ts`, `FixturesPanel.test.tsx`, `FixturesPanel.tile-shower.test.tsx` | `fixtures-tool.spec.ts`, `tile-shower.spec.ts` |
| EZD-227 | Grab-bar blocking | `editor/ProjectEditor.tsx`, `editor/edit/edit-changes.ts`, `editor/layers/RoomFields.tsx`, `editor/selection/pick-index.ts` +7 | `blocking-tool.test.ts`, `FixturesPanel.blocking.test.tsx`, `FixturesPanel.test.tsx` | `fixtures-tool.spec.ts` |
| EZD-229 | Existing-condition details | `editor/ceiling/ceiling-shapes.ts`, `editor/layers/LeftPanel.tsx`, `editor/layers/RoomFields.tsx`, `editor/layers/floor-transitions.ts` +8 | `ceiling-shapes.test.ts`, `floor-transitions.test.ts`, `mechanical-layer.test.tsx` +6 | `existing-details.spec.ts`, `fixtures-tool.spec.ts` |
| EZD-230 | Default key map and full rail | `components/shell/ToolRail.tsx`, `components/shell/rail-types.ts`, `editor/ProjectEditor.tsx`, `editor/ceiling/surface.ts` +1 | `ToolRail.test.tsx`, `help.test.tsx`, `drawing-controller.test.ts` +1 | `keyboard-shortcuts.spec.ts` |
| EZD-231 | Measure tool (plan) | `editor/selection/selection-controller.ts`, `editor/tools/DrawingTools.tsx`, `editor/tools/drawing-controller.ts`, `editor/tools/measure-tool.ts` +3 | `measure-tool.test.ts` | `measure.spec.ts` |
| EZD-233 | Context menu, mirror, align, groups | `editor/ProjectEditor.tsx`, `editor/assistant/assistant-session.ts`, `editor/edit/InspectorMore.tsx`, `editor/edit/arrange-changes.ts` +18 | `arrange-changes.test.ts`, `edit-controller.run.test.ts`, `inspector-status.test.tsx` +3 | `edit-commands.spec.ts`, `edit-menu.spec.ts`, `fixtures-tool.spec.ts` |
| EZD-234 | Fixtures tool and utility points | `editor/ProjectEditor.tsx`, `editor/edit/edit-changes.ts`, `editor/layers/RoomFields.tsx`, `editor/selection/pick-index.ts` +11 | `plumbing-layer.test.tsx`, `fixture-geometry.test.ts`, `fixtures-tool.test.ts` +1 | `fixtures-tool.spec.ts` |
| EZD-235 | Derived values | `editor/derived/model-derived.ts`, `editor/derived/test-utils/two-room.ts`, `editor/plan/batches.ts`, `editor/plan/controller.ts` | `model-derived.test.ts`, `batches.test.ts`, `controller.test.ts` +1 | — |
| EZD-235b | Worker pool and the worker check | `editor/workers/worker-pool.ts` | `worker-pool.test.ts` | — |
| EZD-237 | Benchmark page | `editor/ProjectEditor.tsx`, `editor/benchmark/BenchmarkRunner.tsx`, `editor/benchmark/benchmark-script.ts`, `lazy/benchmark-runner/index.ts` | `BenchmarkRunner.test.tsx`, `benchmark-script.test.ts` | `benchmark-run.spec.ts`, `scene-3d.spec.ts` |
| EZD-238 | Drawing list | `editor/plan/batches.ts`, `lazy/sheets/renderer.ts` | — | `sheet-renderer.spec.ts` |
| EZD-294 | Object numbers | `editor/assistant/accept.ts`, `editor/editor-session.ts`, `editor/inspector/test-utils/fixtures.ts`, `editor/model/model-store.ts` +3 | `accept.test.ts`, `editor-session.test.ts`, `model-store.test.ts` +3 | — |
| EZD-299 | Conflict list: banner, list (board S03b), Show and "make a conflict" | `editor/ProjectEditor.tsx`, `editor/conflicts/ConflictBanner.tsx`, `editor/conflicts/ConflictPanel.tsx`, `editor/conflicts/use-conflicts.ts` +1 | `HeaderButton.icon.test.tsx`, `ConflictBanner.test.tsx`, `ConflictPanel.test.tsx` +3 | `conflict-list.spec.ts` |
| EZD-299b | Conflict list: refused changes leave the outbox; Keep mine, Keep theirs, Remove | `editor/editor-session.ts`, `editor/model/model-store.ts` | `editor-session.test.ts`, `model-store.test.ts` | — |
| EZD-301 | Upload step | `editor/ProjectEditor.tsx`, `lazy/edit-menu/UploadFilesDialog.tsx`, `lazy/edit-menu/index.ts` | — | `new-project-templates.spec.ts`, `project-scope.spec.ts`, `scope-tick-boxes.spec.ts` +1 |
| EZD-303 | Polycam GLB mesh | `editor/ProjectEditor.tsx`, `editor/ceiling/room-ceiling.ts`, `editor/ceiling/scan.ts`, `editor/import-review/ReviewCanvas.tsx` +3 | `mesh-underlay.test.ts` | `import-review.spec.ts` |
| EZD-304 | PDF underlay and scale | `editor/ProjectEditor.tsx`, `editor/import-review/ImportReview.tsx`, `editor/plan/PdfUnderlay.tsx`, `editor/plan/controller.ts` +6 | `underlay.test.ts`, `ScaleCalibrationDialog.test.tsx` | `editor.spec.ts`, `pdf-scale.spec.ts` |
| EZD-306 | DXF conversion choice | `lazy/edit-menu/UploadFilesDialog.tsx` | `ScaleCalibrationDialog.test.tsx` | `import-review.spec.ts` |
| EZD-307 | Import review screen | `editor/import-review/ImportReview.tsx`, `editor/import-review/ReviewCanvas.tsx`, `editor/import-review/mesh-source.ts`, `lazy/edit-menu/UploadFilesDialog.tsx` +4 | `ImportReview.states.test.tsx`, `ImportReview.test.tsx`, `mesh-source.test.ts` +1 | `import-review.spec.ts`, `import-states.spec.ts`, `upload-step.spec.ts` |
| EZD-308 | Review modes | `editor/import-review/ImportReview.tsx`, `editor/import-review/ReviewCanvas.tsx` | `ImportReview.test.tsx` | `import-review.spec.ts` |
| EZD-309 | Fix and delete | `editor/import-review/ImportReview.tsx`, `editor/import-review/ReviewCanvas.tsx`, `editor/import-review/review-saver.ts` | `ImportReview.finish.test.tsx`, `ImportReview.test.tsx`, `review-saver.test.ts` | `import-review.spec.ts` |
| EZD-310 | Typed vs scan conflicts | `editor/import-review/ImportReview.tsx`, `editor/import-review/ReviewCanvas.tsx`, `editor/import-review/TypedConflicts.tsx` | `ImportReview.conflicts.test.tsx` | `import-review.spec.ts` |
| EZD-311 | Resolve the gap | `editor/import-review/ImportReview.tsx`, `editor/import-review/ReviewCanvas.tsx`, `editor/inspector/ResolveGap.tsx` | `resolve-gap.test.tsx` | `import-review.spec.ts` |
| EZD-312 | Ceiling slope in review | `editor/import-review/CeilingSlope.tsx`, `editor/import-review/ImportReview.tsx`, `editor/import-review/ReviewCanvas.tsx`, `editor/import-review/mesh-source.ts` | — | `import-review.spec.ts` |
| EZD-313 | Finish and cancel | `editor/import-review/ImportReview.tsx`, `editor/import-review/review-saver.ts`, `editor/plan/ImportedNotice.tsx`, `editor/plan/imported.ts` | `ImportReview.finish.test.tsx` | `import-finish.spec.ts`, `import-review.spec.ts` |
| EZD-314 | Import states | `editor/import-review/ImportReview.tsx`, `editor/import-review/review-lock.ts` | `ImportReview.states.test.tsx` | `import-states.spec.ts` |
| EZD-332 | Fix: the notification bell keeps zod out of the browser and loads its list on first open *(other route)* | `lazy/notification-panel/index.ts` | — | `notifications-bell-lazy.spec.ts` |
| EZD-373 | Fix: the plan draws no text on CI, so 9 browser tests fail only on CI | `editor/plan/glyph-atlas-canvas.ts` | `glyph-atlas-canvas.test.ts` | `benchmark-plan-fallback-font.spec.ts`, `plan-text-fallback-font.spec.ts` |
| EZD-376 | Fix: the plan tells the user when it cannot draw its text | `editor/ProjectEditor.tsx`, `editor/plan/PlanTextFailedBanner.tsx`, `editor/plan/controller.ts` | `PlanTextFailedBanner.test.tsx`, `controller.test.ts` | `plan-text-failed.spec.ts` |
| EZD-401 | Catalog items (minimal) | `editor/cabinets/cabinet-view.ts`, `editor/tools/DevicePanel.tsx` | — | `cabinet-run.spec.ts`, `catalog-picker.spec.ts` |
| EZD-402 | Cabinet object model | `editor/cabinets/run-inspector.ts` | **none** | **none** |
| EZD-403 | Cabinet library panel | `editor/ProjectEditor.tsx`, `editor/cabinets/cabinet-library.ts`, `editor/cabinets/cabinet-selection-store.ts`, `editor/cabinets/cabinet-view.ts` +3 | `cabinet-library.test.ts`, `cabinet-view.test.ts`, `CabinetLibrary.test.tsx` | `cabinet-run.spec.ts` |
| EZD-404 | Plan strip and elevation | `editor/ProjectEditor.tsx`, `editor/cabinets/cabinet-view.ts`, `editor/cabinets/test-utils/board-run.ts`, `editor/selection/selection-controller.ts` +6 | `cabinet-view.test.ts`, `cabinets-tool.test.ts`, `selection-controller.test.ts` +3 | `cabinet-run.spec.ts`, `editor-states.spec.ts` |
| EZD-405 | Box editing on canvas | `editor/ProjectEditor.tsx`, `editor/cabinets/cabinet-selection.ts`, `editor/cabinets/cabinet-view.ts`, `lazy/cabinet-run/CabinetRunView.tsx` | `cabinet-edit.test.ts`, `CabinetRunEdit.test.tsx` | `cabinet-run.spec.ts` |
| EZD-406 | Box inspector | `editor/ProjectEditor.tsx`, `editor/cabinets/box-inspector.ts`, `editor/cabinets/cabinet-selection-store.ts`, `editor/cabinets/cabinet-selection.ts` +3 | `box-inspector.test.ts`, `BoxInspector.test.tsx` | `cabinet-run.spec.ts`, `run-inspector.spec.ts` |
| EZD-407 | Fit chip | `editor/ProjectEditor.tsx`, `editor/cabinets/cabinet-view.ts`, `editor/cabinets/test-utils/board-run.ts`, `lazy/cabinet-run/CabinetLibrary.tsx` +1 | `cabinet-view.test.ts`, `CabinetRunView.test.tsx` | `cabinet-run.spec.ts` |
| EZD-408 | Auto-fill run | `editor/ProjectEditor.tsx`, `editor/cabinets/cabinet-library.ts`, `editor/cabinets/cabinet-view.ts`, `editor/cabinets/test-utils/board-run.ts` +1 | `cabinet-autofill.test.ts`, `CabinetRunView.test.tsx` | `cabinet-run.spec.ts` |
| EZD-409 | Cabinet schedule | `editor/cabinets/cabinet-schedule.ts`, `lazy/cabinet-run/BoxInspector.tsx`, `lazy/cabinet-run/CabinetSchedule.tsx`, `lazy/cabinet-run/RunInspector.tsx` +1 | `cabinet-schedule.test.ts`, `CabinetSchedule.test.tsx` | `cabinet-run.spec.ts` |
| EZD-410 | Cabinet flags and states | `editor/cabinets/cabinet-view.ts`, `editor/cabinets/test-utils/board-run.ts`, `lazy/cabinet-run/CabinetRunView.tsx` | `cabinet-view.test.ts`, `CabinetRunView.test.tsx` | `cabinet-run.spec.ts` |
| EZD-412 | Trace and Draw outline | `editor/ProjectEditor.tsx`, `editor/countertops/outline-tool.ts`, `editor/countertops/test-fixture.ts`, `editor/countertops/trace-tool.ts` +7 | `cabinets-tool.test.ts`, `cutout-tool.test.ts`, `outline-tool.test.ts` +9 | `countertops-overhangs.spec.ts`, `countertops-seam-cutout.spec.ts`, `countertops-trace.spec.ts` +8 |
| EZD-413 | Seams and cutouts | `editor/countertops/cutout-tool.ts`, `editor/countertops/seam-tool.ts`, `editor/countertops/test-fixture.ts`, `lazy/countertops/CountertopsView.tsx` | `cutout-tool.test.ts`, `seam-tool.test.ts`, `CountertopsPanel.test.tsx` | `countertops-seam-cutout.spec.ts` |
| EZD-414 | Edges and overhangs | `editor/ProjectEditor.tsx`, `editor/countertops/overhang-tool.ts`, `editor/countertops/test-fixture.ts`, `lazy/countertops/CountertopPieceInspector.tsx` +2 | `overhang-tool.test.ts`, `CountertopPieceInspector.test.tsx` | `countertops-overhangs.spec.ts` |
| EZD-415 | Seating support check **(not built yet)** | `lazy/countertops/CountertopPieceInspector.tsx` | **none** | **none** |
| EZD-416 | Left panel and status bar | `editor/ProjectEditor.tsx`, `editor/countertops/material.ts`, `editor/countertops/selection-store.ts`, `editor/countertops/test-fixture.ts` +5 | `CountertopsPanel.test.tsx` | `countertops-trace.spec.ts` |
| EZD-417 | Edge profiles | `editor/countertops/edge-profile.ts`, `editor/countertops/top-schedule.ts`, `lazy/countertops/CountertopPieceInspector.tsx`, `lazy/countertops/CountertopsView.tsx` +3 | `edge-profile.test.ts`, `EdgeProfileCard.test.tsx`, `EditOfferedEdges.test.tsx` | `countertops-edge-profile.spec.ts` |
| EZD-418 | Top schedule | `editor/ProjectEditor.tsx`, `editor/countertops/test-fixture.ts`, `editor/countertops/top-schedule.ts`, `lazy/countertops/TopSchedule.tsx` +1 | `top-schedule.test.ts`, `TopSchedule.test.tsx` | `countertops-top-schedule.spec.ts` |
| EZD-419 | Plan inspector: run selection | `editor/cabinets/cabinet-schedule.ts`, `editor/cabinets/run-inspector.ts`, `editor/cabinets/test-utils/island-run.ts`, `lazy/cabinet-run/BoxInspector.tsx` +2 | `run-inspector.test.ts`, `RunInspector.test.tsx` | `run-inspector.spec.ts` |
| EZD-423 | Fix: the editor route is at its 500 KB download limit; move code out of the editor entry so tickets have room | `editor/ProjectEditor.tsx`, `editor/tools/drawing-controller.ts`, `editor/tools/drawing-shell.ts`, `editor/tools/entry-tool.ts` +3 | `drawing-shell.test.ts` | `editor-drawing-lazy.spec.ts`, `move.spec.ts` |
| EZD-501 | Ceiling data per room | `editor/ceiling/room-ceiling.ts` | `rcp.test.ts`, `room-ceiling.test.ts` | — |
| EZD-502 | RCP view and ceiling rail | `editor/ProjectEditor.tsx`, `editor/ceiling/CeilingParts.tsx`, `editor/ceiling/CeilingShown.tsx`, `editor/ceiling/rcp-module.ts` +5 | `HeaderButton.icon.test.tsx`, `rcp.test.ts`, `surface.test.ts` | `ceiling-rcp.spec.ts` |
| EZD-503 | Ceiling type editor | `editor/ProjectEditor.tsx`, `editor/ceiling/RoomCeiling.tsx`, `editor/ceiling/rcp.ts`, `editor/ceiling/room-ceiling.ts` +3 | `RoomCeiling.test.tsx`, `room-ceiling.test.ts` | `ceiling-rcp.spec.ts` |
| EZD-504 | Walls cut under slopes | `lazy/scene-3d/scene.ts` | `scene-3d.slope.test.ts` | — |
| EZD-505 | Beams | `editor/ProjectEditor.tsx`, `editor/ceiling/rcp.ts`, `editor/inspector/InspectorPanel.tsx`, `editor/selection/pick-index.ts` +9 | `rcp.test.ts`, `beam.test.tsx` | `ceiling-devices.spec.ts`, `ceiling-rcp.spec.ts`, `fixture-schedule.spec.ts` |
| EZD-506 | Section A-A preview | `editor/inspector/BeamSection.tsx`, `editor/tools/BeamPanel.tsx` | `beam-section.test.tsx` | `ceiling-rcp.spec.ts` |
| EZD-507 | Ceiling devices | `editor/ProjectEditor.tsx`, `editor/ceiling/ShapeChooser.tsx`, `editor/ceiling/fixture-schedule.ts`, `editor/ceiling/rcp.ts` +10 | `fixture-schedule.test.tsx`, `DevicePanel.test.tsx`, `ceiling-devices.test.ts` | `ceiling-devices.spec.ts` |
| EZD-508 | Fixture schedule panel | `editor/ProjectEditor.tsx`, `editor/ceiling/CeilingParts.tsx`, `editor/ceiling/CeilingShown.tsx`, `editor/ceiling/FixtureSchedule.tsx` +3 | `fixture-schedule.test.tsx` | `fixture-schedule.spec.ts` |
| EZD-510 | Switching zones | `editor/ProjectEditor.tsx`, `editor/ceiling/rcp.ts`, `editor/ceiling/surface.ts`, `editor/inspector/InspectorPanel.tsx` +11 | `switch-zone.test.tsx` | `switching-zones.spec.ts` |
| EZD-511 | ACT grid | `editor/ProjectEditor.tsx`, `editor/ceiling/CeilingParts.tsx`, `editor/ceiling/CeilingShown.tsx`, `editor/ceiling/ceiling-shapes.ts` +8 | `ceiling-shapes.test.ts`, `act-grid.test.tsx` | `act-grid.spec.ts` |
| EZD-513 | Soffits, trays, coffers, crown, tags | `editor/ProjectEditor.tsx`, `editor/cabinets/cabinet-selection.ts`, `editor/cabinets/cabinet-view.ts`, `editor/ceiling/ShapeChooser.tsx` +9 | `ceiling-shapes.test.ts` | `ceiling-shapes.spec.ts` |
| EZD-514 | Framing known and keep-clear **(not built yet)** | `editor/ceiling/CeilingParts.tsx`, `editor/ceiling/CeilingShown.tsx` | **none** | **none** |
| EZD-515 | Fan clearance and hosted flags | `editor/ProjectEditor.tsx`, `editor/ceiling/rcp.ts`, `editor/ceiling/surface.ts`, `editor/inspector/InspectorPanel.tsx` +2 | `rcp.test.ts`, `DevicePanel.test.tsx`, `ceiling-devices.test.ts` | `ceiling-devices.spec.ts` |
| EZD-601 | Electrical mode and left panel | `editor/ProjectEditor.tsx`, `editor/electrical/ElectricalPanel.tsx`, `editor/electrical/ElectricalStatus.tsx`, `editor/electrical/electrical.ts` +7 | `cabinets-tool.test.ts`, `ElectricalPanel.test.tsx`, `electrical-mode.test.ts` +6 | `door-window-tools.spec.ts`, `drawing-tools.spec.ts`, `editor-states.spec.ts` +6 |
| EZD-602 | Device toolbar | `editor/ProjectEditor.tsx`, `editor/electrical/DeviceMenu.tsx`, `editor/electrical/DeviceToolbar.tsx`, `editor/electrical/DeviceTools.tsx` +11 | `DeviceToolbar.test.tsx`, `device-toolbar.test.ts`, `toolbar-wire.test.ts` | `electrical.spec.ts` |
| EZD-603 | Device height notes | `editor/electrical/ElectricalPanel.tsx`, `editor/electrical/height-note.ts`, `editor/electrical/height-notes-shown.ts`, `editor/inspector/InspectorPanel.tsx` +3 | `ElectricalPanel.test.tsx`, `height-note.test.tsx`, `height-notes.test.ts` | `electrical.spec.ts` |
| EZD-604 | Circuits | `editor/ProjectEditor.tsx`, `editor/electrical/DeviceToolbar.tsx`, `editor/electrical/DeviceTools.tsx`, `editor/electrical/ElectricalPanel.tsx` +10 | `DeviceToolbar.test.tsx`, `ElectricalPanel.test.tsx`, `PanelSchedule.test.tsx` +4 | `electrical.spec.ts` |
| EZD-605 | Switch legs **(not built yet)** | `editor/electrical/ElectricalPanel.tsx` | **none** | **none** |
| EZD-606 | Panel and existing panel dialog | `editor/ProjectEditor.tsx`, `editor/electrical/ElectricalPanel.tsx`, `editor/electrical/ExistingPanelDialog.tsx`, `editor/electrical/existing-panel.ts` +2 | `existing-panel-button.test.tsx`, `existing-panel.test.ts`, `panel-read-client.test.ts` | `electrical.spec.ts` |
| EZD-607 | Load calc engine **(not built yet)** | `editor/electrical/ElectricalStatus.tsx`, `editor/electrical/existing-panel.ts` | **none** | **none** |
| EZD-608 | Load calc inspector **(not built yet)** | `editor/electrical/ElectricalPanel.tsx` | **none** | **none** |
| EZD-609 | Panel schedule | `editor/electrical/ElectricalPanel.tsx`, `editor/electrical/PanelSchedule.tsx`, `editor/electrical/panel-schedule.ts` | `PanelSchedule.test.tsx`, `panel-schedule.test.ts` | `electrical.spec.ts` |
| EZD-613 | Code edition settings | `editor/electrical/ElectricalStatus.tsx`, `editor/selection/selection-controller.ts` | `selection-controller.escape.test.ts` | `settings-code-edition.spec.ts`, `settings-shell.spec.ts`, `sheet-title-block.spec.ts` |
| EZD-615 | Load calc: optional method and cases **(not built yet)** | `editor/electrical/existing-panel.ts` | **none** | **none** |
| EZD-619 | Work-area plan on the cover sheet **(not built yet)** | `lazy/sheets-screen/cover-sheet.ts` | **none** | **none** |
| EZD-630 | Code rules: NEC Art. 100-230 (1 of 4) **(not built yet)** | `editor/electrical/circuits.ts`, `editor/electrical/existing-panel.ts` | **none** | **none** |
| EZD-702a | Sheets screen | `editor/ProjectEditor.tsx`, `lazy/sheets-screen/SheetsCanvas.tsx`, `lazy/sheets-screen/SheetsPanel.tsx`, `lazy/sheets-screen/SheetsPart.tsx` +4 | `sheets-screen.test.tsx` | `editor.spec.ts`, `plan-canvas.spec.ts`, `sheets-screen.spec.ts` |
| EZD-702b | Sheet renderer | `editor/ProjectEditor.tsx`, `lazy/sheets-screen/SheetsCanvas.tsx`, `lazy/sheets-screen/SymbolKey.tsx`, `lazy/sheets-screen/sheets-screen-store.ts` +2 | `sheet-render.test.tsx` | `sheet-renderer.spec.ts` |
| EZD-703 | Viewports and scales **(not built yet)** | `lazy/sheets-screen/SheetsStatus.tsx`, `lazy/sheets-screen/sheet-key.ts` | **none** | **none** |
| EZD-706 | Symbol key | `lazy/sheets-screen/SheetsCanvas.tsx`, `lazy/sheets-screen/SymbolKey.tsx`, `lazy/sheets-screen/sheet-key.ts`, `lazy/sheets-screen/sheets-screen-store.ts` | `symbol-key.test.tsx` | `libraries.spec.ts` |
| EZD-707 | Elevations sheet **(not built yet)** | `editor/cabinets/cabinet-schedule.ts`, `lazy/cabinet-run/CabinetSchedule.tsx` | **none** | **none** |
| EZD-710 | Title block on sheets | `lazy/sheets-screen/SheetsCanvas.tsx`, `lazy/sheets-screen/sheets-screen-store.ts` | `title-block.test.tsx` | `sheet-title-block.spec.ts` |
| EZD-711 | Property appraiser import | `lazy/sheets-screen/SheetsPanel.tsx`, `lazy/sheets-screen/sheets-screen-store.ts` | — | `property-appraiser-import.spec.ts`, `sheet-title-block.spec.ts` |
| EZD-714 | Notes library | `lazy/sheets-screen/cover-sheet.ts`, `lazy/sheets-screen/sheets-screen-store.ts` | `cover-sheet.test.tsx` | `libraries.spec.ts`, `sheet-presets.spec.ts` |
| EZD-716 | Issue checklist **(not built yet)** | `lazy/sheets-screen/sheet-labels.ts` | **none** | **none** |
| EZD-717 | Issue Rev 0 and Rev N **(not built yet)** | `editor/version-label.ts`, `lazy/sheets-screen/sheet-labels.ts` | `version-label.test.ts` | — |
| EZD-718 | Revision clouds and log **(not built yet)** | `lazy/sheets-screen/sheet-labels.ts` | **none** | **none** |
| EZD-721 | Export menu **(not built yet)** | `editor/cabinets/cabinet-schedule.ts` | **none** | **none** |
| EZD-726 | Sheet sets | `lazy/sheets-screen/sheets-screen-store.ts` | **none** | **none** |
| EZD-728 | Cover sheet A0.0 | `lazy/sheets-screen/CoverSheet.tsx`, `lazy/sheets-screen/SheetsCanvas.tsx`, `lazy/sheets-screen/cover-sheet.ts`, `lazy/sheets-screen/sheets-screen-store.ts` | `cover-sheet.test.tsx` | — |
| EZD-729 | Plumbing locations | `editor/layers/LeftPanel.tsx`, `editor/layers/RoomFields.tsx`, `editor/layers/layer-setting.ts`, `editor/layers/room-fields-module.ts` +3 | `LeftPanel.test.tsx`, `plumbing-layer.test.tsx` | `plumbing-locations.spec.ts` |
| EZD-731 | Mechanical layout | `editor/layers/layer-setting.ts`, `editor/tools/fixture-tool.ts`, `lazy/fixtures-panel/FixturesPanel.tsx`, `lazy/room-fields/details-drawing.ts` | `mechanical-layer.test.tsx`, `mechanical-tool.test.ts`, `FixturesPanel.test.tsx` | `fixtures-tool.spec.ts`, `mechanical-layout.spec.ts` |
| EZD-733 | Tile layout | `editor/cabinets/cabinet-view.ts`, `editor/layers/RoomFields.tsx`, `editor/layers/rooms.ts`, `lazy/cabinet-run/CabinetRunView.tsx` | `cabinet-view.test.ts`, `rooms.test.ts`, `CabinetRunView.test.tsx` | `tile-layout.spec.ts` |
| EZD-915 | Supplier vector PDF import | `editor/import-review/ImportReview.tsx`, `editor/import-review/ReviewCanvas.tsx` | `ImportReview.cabinets.test.tsx` | — |
| EZD-1001a | 3D scene core | `editor/ProjectEditor.tsx`, `editor/plan/controller.ts`, `editor/plan/render-root.ts`, `lazy/scene-3d/Scene3dOverlay.tsx` +2 | `scene-3d.test.ts` | `editor.spec.ts`, `plan-canvas.spec.ts`, `scene-3d.spec.ts` |
| EZD-1001b | 3D ceilings and beams | `lazy/scene-3d/scene.ts` | `scene-3d.ceiling.test.ts`, `scene-3d.test.ts` | `scene-3d.spec.ts` |
| EZD-1005 | 3D layers **(not built yet)** | `lazy/scene-3d/scene.ts` | **none** | **none** |
| EZD-1017 | Inspector 3D preview **(not built yet)** | `lazy/cabinet-run/RunInspector.tsx` | **none** | **none** |
| EZD-1022 | Stacked floors in 3D **(not built yet)** | `lazy/scene-3d/scene.ts` | **none** | **none** |
| EZD-1201 | Share links | `editor/send/SendDialog.tsx`, `editor/send/ShareLinks.tsx` | `ShareLinks.test.tsx` | `send-dialog.spec.ts`, `share-links.spec.ts` |
| EZD-1401 | Service worker cache | `editor/OfflineStatusIcon.tsx`, `editor/ProjectEditor.tsx`, `editor/review/EditorReview.tsx`, `editor/tools/act-grid-tool.ts` +6 | `OfflineStatusIcon.test.tsx` | `project-offline.spec.ts` |
| EZD-1402 | Offline change queue | `editor/SaveStatus.tsx`, `editor/save-state.ts` | `editor-messages.test.ts`, `save-state-offline.test.ts` | `money-pages.spec.ts`, `offline-queue.spec.ts` |
| EZD-1404 | Field pack shell | `editor/OfflineStatusIcon.tsx` | — | `field-pack.spec.ts`, `field-pack.ts`, `money-pages.spec.ts` +1 |
| EZD-5601 | AI key storage and My profile *(other route)* | `lazy/my-profile/AiKeySection.tsx`, `lazy/my-profile/MyProfileDialog.tsx` | `ai-key-section.test.tsx` | `ai-key.spec.ts`, `assistant-panel.spec.ts` |
| EZD-5603 | (not in tickets.json) | `editor/assistant/AssistantPanel.tsx`, `editor/assistant/PreviewActions.tsx` | `ToolRail.test.tsx`, `AssistantPanel.test.tsx`, `AssistantPhoto.test.tsx` +9 | `assistant-panel.spec.ts`, `assistant-photo.spec.ts`, `assistant-preview.spec.ts` |
| EZD-5603a | Assistant panel, picker, states and cost line | `editor/ProjectEditor.tsx`, `editor/assistant/AssistantPanel.tsx`, `editor/assistant/ModelPicker.tsx`, `editor/assistant/assistant-client.ts` +5 | `HeaderButton.icon.test.tsx`, `ToolRail.test.tsx`, `AssistantPanel.preview.test.tsx` +5 | `assistant-panel.spec.ts`, `assistant-preview.spec.ts` |
| EZD-5603b | Assistant photo: control, browser shrink, server strip | `editor/assistant/AssistantPanel.tsx`, `editor/assistant/AssistantPhoto.tsx`, `editor/assistant/assistant-client.ts`, `editor/assistant/assistant-session.ts` +2 | `AssistantPhoto.test.tsx`, `assistant-client.photo.test.ts`, `assistant-session.photo.test.ts` +3 | `assistant-photo.spec.ts` |
| EZD-5604 | (not in tickets.json) | `editor/assistant/AssistantPanel.tsx`, `editor/assistant/PreviewActions.tsx`, `editor/assistant/apply-reply.ts`, `editor/assistant/assistant-session.ts` | `AssistantPanel.preview.test.tsx`, `PreviewActions.test.tsx`, `PreviewLayer.test.tsx` +4 | `assistant-preview.spec.ts` |
| EZD-5604a | Assistant change format, apply and check | `editor/assistant/apply-reply.ts` | `apply-reply.status.test.ts`, `apply-reply.test.ts` | — |
| EZD-5604b | Assistant preview on the canvas and in the panel | `editor/ProjectEditor.tsx`, `editor/assistant/AssistantPanel.tsx`, `editor/assistant/PreviewActions.tsx`, `editor/assistant/PreviewLayer.tsx` +10 | `AssistantPanel.preview.test.tsx`, `PreviewActions.test.tsx`, `PreviewLayer.test.tsx` +5 | `assistant-accept.spec.ts`, `assistant-preview.spec.ts` |
| EZD-5605 | Assistant Accept, Adjust, Reject and events | `components/shell/ToolRail.tsx`, `editor/ProjectEditor.tsx`, `editor/assistant/AssistantPanel.tsx`, `editor/assistant/PreviewActions.tsx` +8 | `ToolRail.only.test.tsx`, `PreviewActions.adjust.test.tsx`, `PreviewActions.test.tsx` +6 | `assistant-accept.spec.ts`, `assistant-preview.spec.ts` |
| EZD-6001 | Floor switcher and floor tools | `editor/EmptyPlanHint.tsx`, `editor/ProjectEditor.tsx`, `editor/assistant/preview-shapes.ts`, `editor/ceiling/FixtureSchedule.tsx` +12 | `EmptyPlanHint.floors.test.tsx`, `FloorSwitcher.test.tsx`, `floors.test.ts` +3 | `floors.spec.ts` |
