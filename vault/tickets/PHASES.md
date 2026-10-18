# Phases

PROCESS.md section 2a. Josh approves this file before Phase 1's Stage 0; after that only Josh changes it. New requests go to `BACKLOG.md`.

Status of this file: **draft for Josh's approval.** Phase 0 is written out below. The spec's phases 1 to 17 (368 tickets) were layers of 10 to 40 tickets, not vertical slices of 4 to 10, so on Oct 18, 2026 they were re-cut into 53 slices (second section), keeping every ticket ID and every dependency. Josh approves Phase 0 and the re-cut separately. Once he approves the re-cut, `node vault/tools/apply_recut.mjs` renumbers the ledger (`STATUS.md` Phase column and `tickets.json` `phase`) to the slice numbers; the per-spec-phase ticket files under `phases/` stay as the source of each ticket's text. Until then nothing after Phase 0 is scheduled and `next_ticket.mjs` works on the spec phases.

## Phase 0 · Setup

- **Goal:** a deployed, empty, multi-tenant app with sign-in and the Studio shell components, ready for features.
- **User-visible result:** Josh can open ezdraft.ezcontractorbinder.com on the desktop and the iPad, sign in, and see the empty editor shell.
- **Spec files:** Product overview (Stack, Named tools), Data model (Architecture rules), App shell and global UI, Non-functional requirements (Performance, Security, Operations), Decisions (R26 R1 to R34). ACs: AC-EZD-000-1 to AC-EZD-031-n (generated from Done-when; see migration step 4).
- **Tickets:** every EZD-0xx row in `STATUS.md` (37 as of Oct 14, 2026, all `ready`). Build order: `tickets.json` `build_order`.
- **Depends on:** nothing.
- **Out of scope until later:** every drawing tool, every table beyond users, tenants, projects and the health row; any screen beyond sign-in and the empty shell; cloud Supabase production, Sentry, backups (EZD-023b "Before launch" checklist).
- **Risks and spikes:** EZD-027 plan canvas on the iPad, EZD-028 PDF from a drawing list, EZD-029 DXF parser, EZD-030 wall openings, EZD-031 render trial. Each ends in a note under `vault/spikes/` with `Verdict: go` or `no-go`. Phase 2 cannot start until EZD-000 is `done` and all five have a verdict.
- **Exception to rule 1:** Phase 0 is a setup layer, not a slice. Josh accepted it as planned under process v1 (SIGNOFF.md). It is the only phase allowed this exception.
- **Josh's test script (punch list at the gate):**
  1. Open the PR "Phase 0: Setup" and its preview link. Expected: the preview loads over HTTPS.
  2. Sign in with the tenant 1 owner account on the desktop. Expected: the empty editor shell with the Studio header, rail and status bar; no drawing tools.
  3. Repeat on the iPad in landscape. Expected: the same shell at iPad size; no horizontal scroll.
  4. Sign in as the second-tenant test user. Expected: no tenant 1 projects or users are visible anywhere.
  5. In the PR checks, open the gate run. Expected: lint, type check, unit tests, browser tests and the performance check (EZD-017) all pass.
  6. After merging, open ezdraft.ezcontractorbinder.com. Expected: production serves the merged build.

## Slices 1 to 53 · proposed re-cut of spec phases 1 to 17 (draft for Josh's approval)

Drafted Oct 18, 2026 under PROCESS.md section 2a. Validator: `vault/tools/apply_recut.mjs --check` (every ticket placed once; every dependency in the same or an earlier slice). Slice data: `vault/tickets/recut.json`. Placements the drafter was unsure about are listed under Placement notes; Josh can move any ticket before approving.

### Summary

- Slices: 53
- Tickets placed: 368 of 368 (every phase 1 to 17 ticket exactly once; checked by the validator below)
- Slice size: min 4, median 7, max 10 tickets
- Slices with more than 10 tickets: none
- Slices at 10 tickets: 14 (Cabinet runs). Slice 14 (Cabinet runs) could not be cut smaller without leaving a run that cannot be edited, fit-checked or auto-filled; its ten tickets form one chain from the catalog picker to the schedule.
- Slices under 4 tickets: none

Ordering rule used: dependency first, then value. The projects list (slice 2), a drawable plan (slice 4) and the edit lock (slice 8) come first; imports, cabinets, ceilings, electrical and sheets follow in the spec order; 3D, renders and the client link come before the architect reference and supplier tools; the EZ Binder connection is late because its field check waits on the EZ Binder side; the 22 code rule packs, translations, catalog, takeoff and hardening are the long tail.

Placement notes: EZD-127 (Review pill) moves to slice 16 (first user: the RCP). EZD-134 (App-shell cache) moves to slice 40 (first user: offline). EZD-228 (Bath clearance check) moves to slice 20 (first visible in the Check list). EZD-114/115/119 (EZ Binder connect, sync, job picker) move to slice 35 with the inbound API. EZD-1120 (local worker real runner) sits in slice 52 because it waits on Josh's GPU test. EZD-221 (blank templates) moves up to slice 4.

### Original spec phase → slices

| Spec phase | Tickets | Slices |
| --- | --- | --- |
| Phase 1 · Foundation | 37 | 1, 2, 3, 6, 7, 8, 9, 11, 16, 35, 40 |
| Phase 2 · Geometry core + plan editor | 38 | 3, 4, 5, 6, 8, 10, 11, 20 |
| Phase 3 · Imports | 15 | 12, 13 |
| Phase 4 · Cabinets + countertops | 19 | 14, 15 |
| Phase 5 · Ceilings / RCP | 16 | 16, 17 |
| Phase 6 · Electrical + code check | 40 | 18, 19, 20, 43, 44, 45, 46 |
| Phase 7 · Sheets, issue, submittal profiles, revisions, property appraiser import | 31 | 21, 22, 23, 24 |
| Phase 8 · Detail editor | 17 | 25, 26 |
| Phase 9 · Reference DXF + supplier imports + rendering markup | 25 | 37, 38, 39 |
| Phase 10 · 3D + design options | 18 | 27, 28, 29 |
| Phase 11 · Render pipeline + allowance + local GPU worker | 22 | 30, 31, 32, 52 |
| Phase 12 · Client link | 15 | 33, 34 |
| Phase 13 · Change orders + EZ Binder webhooks and inbound API | 13 | 35, 36 |
| Phase 14 · Field pack + offline + field measurements review | 22 | 40, 41, 42 |
| Phase 15 · Translations | 10 | 47, 48 |
| Phase 16 · Catalog + takeoff | 19 | 49, 50, 51 |
| Phase 17 · Hardening | 11 | 52, 53 |

### Slice list

1. Company settings and customers (from phase 1) — 6 tickets
2. Projects list and new project (from phase 1) — 5 tickets
3. Model store and editor route (from phase 1, 2) — 5 tickets
4. Plan canvas and first walls (from phase 2) — 8 tickets
5. Openings, selection, move, inspector, undo (from phase 2) — 7 tickets
6. Phase switch, layers, dimensions, thumbnails, benchmark page (from phase 1, 2) — 8 tickets
7. Users, roles, project scope, event log (from phase 1) — 6 tickets
8. Defaults, edit lock, project settings (from phase 1, 2) — 6 tickets
9. Versions, sends and the project card menu (from phase 1) — 5 tickets
10. Fixtures, existing conditions, showers, bearing walls (from phase 2) — 6 tickets
11. Editing tools, groups, libraries, shortcuts (from phase 1, 2) — 7 tickets
12. Polycam scan import (from phase 3) — 9 tickets
13. PDF and DXF imports, import states, laser input (from phase 3) — 6 tickets
14. Cabinet runs (from phase 4) — 10 tickets
15. Countertops (from phase 4) — 9 tickets
16. Ceilings and the RCP (from phase 1, 5) — 8 tickets
17. Beams, lights, ACT and ceiling checks (from phase 5) — 9 tickets
18. Electrical devices and circuits (from phase 6) — 8 tickets
19. Load calculation (from phase 6) — 4 tickets
20. Code check engine and first rule sets (from phase 2, 6) — 7 tickets
21. Sheet set and sheet viewer (from phase 7) — 8 tickets
22. Elevations, RCP and electrical sheets, title block (from phase 7) — 7 tickets
23. PDF export, issue checklist and Rev 0 (from phase 7) — 9 tickets
24. Revisions, client send and export options (from phase 7) — 7 tickets
25. Detail editor (from phase 8) — 9 tickets
26. Details on sheets, cut from model, library, export (from phase 8) — 8 tickets
27. 3D scene, navigation and saved views (from phase 10) — 8 tickets
28. 3D walk, finishes, measure and the rail (from phase 10) — 5 tickets
29. Design options, phone 3D viewer, 3D exports (from phase 10) — 5 tickets
30. Render setup and generate (from phase 11) — 8 tickets
31. Render review and approval (from phase 11) — 7 tickets
32. Render workers, extra adapters, path tracer and R1.0 (from phase 11) — 6 tickets
33. Client approval page (from phase 12) — 9 tickets
34. Client renders, comments and option choice (from phase 12) — 6 tickets
35. EZ Binder connection, inbound API and webhooks (from phase 1, 13) — 8 tickets
36. Change orders and inbound reads (from phase 13) — 8 tickets
37. Architect DXF reference (from phase 9) — 8 tickets
38. Reference markup, revisions and diff (from phase 9) — 9 tickets
39. Supplier files and rendering markup (from phase 9) — 8 tickets
40. Offline editing and the app-shell cache (from phase 1, 14) — 5 tickets
41. Field pack on the phone (from phase 14) — 9 tickets
42. Field measure and office review (from phase 14) — 9 tickets
43. Code rules: Florida Residential, Existing Building, construction chapters (from phase 6) — 5 tickets
44. Code rules: Energy, Mechanical, Fuel gas, Plumbing (from phase 6) — 7 tickets
45. Code rules: NEC articles 100 to 230 and 240 (1 of 2) (from phase 6) — 5 tickets
46. Code rules: NEC 240 to 410 (2 of 2) and 422 to 820 (from phase 6) — 5 tickets
47. Translation queue (from phase 15) — 6 tickets
48. Translations: approve in bulk, propagate, Spanish display (from phase 15) — 4 tickets
49. Catalog drawer and add product (from phase 16) — 8 tickets
50. Catalog detail, price snapshots and settings (from phase 16) — 4 tickets
51. Takeoff (from phase 16) — 7 tickets
52. Hardening: security, backups, terms, event log, rule verification (from phase 11, 17) — 6 tickets
53. Hardening: performance, accessibility, screen states (from phase 17) — 6 tickets

### Slices

### Slice 1 · Company settings and customers (from spec phase 1)

- **Goal:** Prove the stack end to end: sign in, open Settings, save the company record and a customer.
- **User-visible result:** Settings opens with its left nav; Company shows name, logo, license and contact and saves; the Customers list adds, edits, archives and searches customers; a Crew user is sent back to Projects with the no-access message.
- **Spec files:** `spec/sections/10-permissions-and-settings.md`, `spec/sections/screens/S15-settings-users-permissions.md`, `spec/decisions.md`, `spec/sections/03-data-model.md`, `spec/sections/11-non-functional-requirements.md`, `spec/sections/screens/S15a-settings-company.md`
- **Tickets (6, build order):**
  - EZD-101 Permission and role tables
  - EZD-102 Permission enforcement — after EZD-101
  - EZD-103 Settings shell — after EZD-102
  - EZD-132 File storage
  - EZD-112 Company settings: identity — after EZD-103, EZD-132
  - EZD-113 Customers — after EZD-112
- **Depends on slices:** none (Phase 0 only)
- **Out of scope until later:** Users table, invites and custom roles (slice 7); Defaults page (slice 8); EZ Binder connect and sync (slice 35); every editor screen.
- **Risks and spikes:** EZD-102 fixes the permission pattern (server check on every write, can() in the UI, hidden not disabled) that every later ticket follows; get it reviewed before slice 2. EZD-132 fixes the Storage path layout and signed-link lifetime. Josh needs to supply the Supabase and storage keys or the slice runs on the local stack only.
- **Josh's test script:**
  1. Sign in as the owner and open Settings from the gear. Expected: Settings opens with the left nav (Company, Users + permissions, Title block, Sheet presets, Defaults, Catalog, Render models, Code edition, Libraries, Translations) and no Billing item.
  2. Open Company, enter the company name and license, upload a PNG logo under 5 MB, Save. Expected: Save succeeds; the company name shows in the header after reload.
  3. Upload a 6 MB logo. Expected: Refused with a size message.
  4. Open Customers, add two customers, then add a third with the same email as the first. Expected: Two rows appear; the duplicate email is refused.
  5. Search customers by part of a name. Expected: The list filters as typed.
  6. Sign in as a Crew-preset test user and type the Settings URL. Expected: Redirected to Projects with “You don't have access to company settings.”

### Slice 2 · Projects list and new project (from spec phase 1)

- **Goal:** Josh creates a project and finds it again on the Projects page.
- **User-visible result:** Projects page with status tabs, sort, search, cards and the five states; New project wizard (Standalone, Start from a file placeholder, From an EZ Binder job placeholder) creates a project; notification bell; avatar menu with My profile.
- **Spec files:** `spec/sections/screens/S15-settings-users-permissions.md`, `spec/sections/screens/S01-projects.md`, `spec/sections/04-app-shell-and-global-ui.md`, `spec/sections/06-workflows.md`
- **Tickets (5, build order):**
  - EZD-108 Avatar menu and My profile — needs EZD-103 (s1)
  - EZD-110 Notifications
  - EZD-117a Projects page: query and cards — after EZD-110; needs EZD-102 (s1)
  - EZD-117b Projects page: header, search and states — after EZD-117a
  - EZD-118 New project wizard — after EZD-117a, EZD-117b; needs EZD-113 (s1)
- **Depends on slices:** 1
- **Out of scope until later:** Editor route (slice 3); project card menu, archive and delete (slice 9); EZ Binder job picker (slice 35); Start from a file upload (slice 12); thumbnails (slice 6); review pill (slice 16).
- **Risks and spikes:** EZD-117a sets the two-request page budget with 200 seeded projects and must load no editor code; verify the bundle split before closing. EZD-118's code edition and submittal profile selects store null until slices 20 and 23.
- **Josh's test script:**
  1. Open Projects with the 200-project seed. Expected: Cards show within budget; each status tab shows a count; the network panel shows two data requests.
  2. Type part of a project name in search and switch a status tab. Expected: Search and tab combine; a miss shows “No projects match”.
  3. New project → Standalone, leave the default name, pick a customer, Create. Expected: The project is created with the “<Type> remodel” name and opens.
  4. Return to Projects. Expected: The new project card shows with its status pill and version label.
  5. Open the avatar menu → My profile and change the language. Expected: The change persists after reload.
  6. Trigger the test notification. Expected: The bell shows the amber dot without a refresh; clicking the item opens its target and marks it read.

### Slice 3 · Model store and editor route (from spec phase 1, 2)

- **Goal:** A project opens into the editor route and its model saves through the patch store, outbox and save function.
- **User-visible result:** Opening a project card loads the editor shell in one query with the header save state (Saving…, Saved just now, Saved N min ago) and the save error banner with Retry; the object schema, save function, checkpoints and drawing list are in place for slice 4.
- **Spec files:** `spec/sections/03-data-model.md`, `spec/decisions.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/sections/02-product-overview.md`
- **Tickets (5, build order):**
  - EZD-133 Access and money-field harness — needs EZD-102 (s1)
  - EZD-120a Model tables, save function and checkpoints — after EZD-133
  - EZD-120b Model store, outbox and editor route — after EZD-120a; needs EZD-117a (s2), EZD-117b (s2)
  - EZD-202 Model document schema — after EZD-120a, EZD-120b
  - EZD-238 Drawing list — after EZD-202
- **Depends on slices:** 1, 2
- **Out of scope until later:** Any drawing tool (slice 4); edit lock (slice 8); versions panel (slice 9); offline editing (slice 40).
- **Risks and spikes:** EZD-120a/120b fix Architecture rules 6, 7 and 9 (save only changed rows, lock_epoch, outbox); EZD-202 fixes schema_version and the 1/64" tolerance; EZD-238 fixes the drawing-list contract that the canvas, sheets and PDF all consume. These four are the hardest to change later; review them against Data model · Architecture rules before slice 4. EZD-133's lint rule (no table query in browser code) and the RLS CI test apply to every later ticket.
- **Josh's test script:**
  1. Click a project card. Expected: The editor route opens with the Phase 0 shell and “Saved” in the header; one project query in the network panel.
  2. With the test hook, apply 50 edits in one minute. Expected: Only the changed model_object rows are written; no model_version row appears.
  3. Turn the network off, apply edits, turn it back on. Expected: Edits wait in the outbox and drain on reconnect; nothing is lost.
  4. Force a failed save with the test hook. Expected: The error banner shows with Retry; the edits stay.
  5. Sign in as a user without See company costs and request each route built so far. Expected: No cost field in any response.

### Slice 4 · Plan canvas and first walls (from spec phase 2)

- **Goal:** Draw a closed room by typing lengths on the plan canvas and have it saved.
- **User-visible result:** Plan tab with grid, pan, zoom, Fit and hover; Wall and Room rectangle tools with the typed dimension bar; rooms detected with area; blank templates (galley, L-kitchen, 5x8 bath, primary bath) in the new project wizard; the benchmark project generator.
- **Spec files:** `spec/sections/01-how-to-use-this-spec.md`, `spec/sections/04-app-shell-and-global-ui.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/screens/S02-import-review.md`, `spec/sections/11-non-functional-requirements.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/sections/02-product-overview.md`, `spec/sections/screens/S01-projects.md`
- **Tickets (8, build order):**
  - EZD-201 Length parse and format
  - EZD-203 Walls core — needs EZD-202 (s3)
  - EZD-205 Rooms and closure — after EZD-203
  - EZD-236 Benchmark project generator — needs EZD-202 (s3), EZD-120a (s3), EZD-120b (s3)
  - EZD-207 Plan canvas — after EZD-236; needs EZD-202 (s3), EZD-238 (s3)
  - EZD-209 Typed dimension bar — after EZD-201, EZD-207
  - EZD-210 Wall and Room rectangle tools — after EZD-205, EZD-209
  - EZD-221 Blank templates — after EZD-210; needs EZD-118 (s2)
- **Depends on slices:** 2, 3
- **Out of scope until later:** Doors and windows, selection, move and inspector (slice 5); dimensions and layers (slice 6); snapping popover (slice 6); benchmark page (slice 6).
- **Risks and spikes:** EZD-207 is the performance core: drawn on demand, no React render per pointer event, one persistent renderer. Run the EZD-017 check on the benchmark project before closing the slice; this is the first field check on the iPad. The spike EZD-027 (plan canvas on the iPad) must have a go note.
- **Josh's test script:**
  1. New project → Standalone → L-kitchen template. Expected: The plan opens with the template walls.
  2. Press R, click a start point, type 12'6" Tab 10' Enter. Expected: A 12'6" × 10' room closes with no gap and shows its area.
  3. Press W, draw a single wall chain and close on the start point. Expected: The chain closes and the room is detected.
  4. Type 150" and 12.5' in the length box. Expected: Both read 12'6" after commit; a bad entry lists the accepted formats.
  5. Pan with space-drag and zoom toward the cursor, then Fit. Expected: The view follows the cursor and Fit frames the plan.
  6. Reload the project. Expected: The walls and room are still there.

### Slice 5 · Openings, selection, move, inspector, undo (from spec phase 2)

- **Goal:** Place doors and windows, select and move objects with typed distances, edit them in the inspector, and undo.
- **User-visible result:** Door and Window tools with hover preview and typed offset; snapping with markers; click, cycle, Shift-click and box select; Move tool, resize handles and live distance chips; inspector fields with bulk edit; undo, redo, copy, paste, duplicate, delete.
- **Spec files:** `spec/sections/03-data-model.md`, `spec/sections/04-app-shell-and-global-ui.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`
- **Tickets (7, build order):**
  - EZD-204 Openings core — needs EZD-203 (s4)
  - EZD-206 Snapping — needs EZD-203 (s4)
  - EZD-208 Selection — needs EZD-207 (s4)
  - EZD-211 Door and window tools — after EZD-204; needs EZD-209 (s4)
  - EZD-212 Move, handles, distance chips — after EZD-208
  - EZD-213 Inspector fields — after EZD-208
  - EZD-217 Undo, redo and clipboard — after EZD-208
- **Depends on slices:** 4
- **Out of scope until later:** Status and phase switch, layers (slice 6); fixtures (slice 10); context menu, mirror, align, groups (slice 11).
- **Risks and spikes:** EZD-206's spatial index also serves picking (EZD-208) and later reference snaps; the Selection acceptance test is only partly runnable until cabinets and outlets exist.
- **Josh's test script:**
  1. Press D, hover a wall, type an offset of 36" from the corner. Expected: The door sits 36" from that corner; Space flips the swing.
  2. Place a window the same way. Expected: The window sits at its typed offset with the sill height in the inspector.
  3. Move the host wall away from a door with the Move tool. Expected: The door shows the red “Not on a wall” flag.
  4. Click a wall, then click again at the same spot. Expected: The selection cycles outward; moving the mouse resets the cycle.
  5. Select two walls and change the thickness in the inspector. Expected: Both change; a field with different values reads “Mixed”.
  6. Click a distance chip, type 24", Enter. Expected: The object sits exactly 24" from the neighbor.
  7. Delete a wall, Ctrl+Z, Ctrl+Y. Expected: The wall returns, then goes again; a pasted wall gets a new id.

### Slice 6 · Phase switch, layers, dimensions, thumbnails, benchmark page (from spec phase 1, 2)

- **Goal:** Work in Existing and Proposed views with auto dimensions, the Layers and Rooms panel, project thumbnails and the benchmark page.
- **User-visible result:** Existing/Proposed toggle and Set status; Layers and Rooms tabs; Dimension and Text tools with auto overall and room dimensions; Scale and Snap popovers and typed zoom; project cards show a plan thumbnail; Settings → System status with Run benchmark.
- **Spec files:** `spec/sections/11-non-functional-requirements.md`, `spec/decisions.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/sections/01-how-to-use-this-spec.md`, `spec/sections/screens/S01-projects.md`
- **Tickets (8, build order):**
  - EZD-135 System status page — needs EZD-103 (s1)
  - EZD-219 Status bar popovers — needs EZD-206 (s5)
  - EZD-214 Status and phase switch — needs EZD-213 (s5)
  - EZD-218 Left panel: Layers and Rooms — after EZD-214; needs EZD-132 (s1)
  - EZD-224 Plan thumbnail — needs EZD-207 (s4)
  - EZD-235 Derived values and workers — needs EZD-205 (s4), EZD-207 (s4)
  - EZD-216 Dimensions and text — after EZD-235; needs EZD-207 (s4)
  - EZD-237 Benchmark page — after EZD-135; needs EZD-207 (s4), EZD-236 (s4)
- **Depends on slices:** 1, 4, 5
- **Out of scope until later:** Versions tab in the left panel (slice 9); Tasks and Takeoff tabs (slices 41, 51); revision clouds (slice 11).
- **Risks and spikes:** EZD-235 fixes the derived-value and worker pattern that takeoff, load calc, sheets and DXF parsing reuse; the recompute-count test is the guard. EZD-224 must capture from the already drawn canvas (no second render). EZD-237 is the field check Josh repeats at every slice on the iPad.
- **Josh's test script:**
  1. Draw a wall in Proposed, switch to Existing. Expected: The wall is New and hidden in the Existing view.
  2. Open Layers, lock the Rooms layer, click a room. Expected: The room cannot be selected.
  3. Open Rooms, set a room type to Bath, reload. Expected: Bath persists; clicking the row zooms to the room.
  4. Move a wall. Expected: The auto overall and room dimensions update.
  5. Change the snap increment in the Snap popover and drag a wall. Expected: The wall snaps at the new increment.
  6. Stop editing (checkpoint) and return to Projects. Expected: The card shows the plan thumbnail (under 40 KB).
  7. Settings → System status → Run benchmark. Expected: A benchmark_run row is written with frame times, memory, device and app version; the history list shows it.

### Slice 7 · Users, roles, project scope, event log (from spec phase 1)

- **Goal:** Josh invites his team, sets their permissions and project scope, and every permission change is logged.
- **User-visible result:** Users table with search; Invite user by magic link with Copy link; user inspector with 28 switches, role select, language, Reset to role, Deactivate, Remove; custom roles; Project access (All or Listed projects); event_log rows for permission changes.
- **Spec files:** `spec/sections/screens/S15-settings-users-permissions.md`, `spec/decisions.md`, `spec/sections/03-data-model.md`, `spec/sections/11-non-functional-requirements.md`, `spec/sections/10-permissions-and-settings.md`, `spec/sections/screens/S01-projects.md`
- **Tickets (6, build order):**
  - EZD-104 Users table — needs EZD-103 (s1)
  - EZD-105 Invite user — after EZD-104
  - EZD-106 User inspector — after EZD-104
  - EZD-107 Custom roles — after EZD-106
  - EZD-109 Event log — after EZD-106
  - EZD-129 User project scope — after EZD-106
- **Depends on slices:** 1
- **Out of scope until later:** Customer and user sync from EZ Binder (slice 35); Spanish UI for crew (slice 48); the System status page is in slice 6.
- **Risks and spikes:** EZD-105's 7-day app invite token must survive an email scanner opening the link. EZD-129 scoping affects the Projects query, the field pack and the API; its zero-rows test must stay in the suite.
- **Josh's test script:**
  1. Settings → Users → Invite user with a valid new email, Foreman role, Spanish. Expected: A pending row appears with Resend, Copy link and Cancel; the stub transport records the email.
  2. Open the copied link in another browser and accept. Expected: The row turns active.
  3. Open the user, untick one switch, Save. Expected: The role pill reads “Modified”; n / 28 drops by one; an event_log row has actor and IP.
  4. Save as new role from that user and assign it to another user. Expected: The new role appears on the Roles cards and on the second user.
  5. Try to remove Manage users and settings from the only user who holds it. Expected: Refused.
  6. Set the Foreman to Listed projects with one project and sign in as them. Expected: Projects shows only that project; the API returns zero rows for any other project.

### Slice 8 · Defaults, edit lock, project settings (from spec phase 1, 2)

- **Goal:** Two people can open the same project safely: one holds the edit lock, the other sees view only and can request it.
- **User-visible result:** Settings → Defaults driven by the typed registry; edit lock service and banner (amber with holder, Request edit, holder countdown, green Available toast, Stop editing, View only, presence avatars); editor loading, view-only and locked states; project switcher in the header; Project settings dialog.
- **Spec files:** `spec/decisions.md`, `spec/sections/screens/S15d-settings-defaults.md`, `spec/sections/04-app-shell-and-global-ui.md`, `spec/sections/screens/S01-projects.md`, `spec/sections/screens/S15c-settings-sheet-presets-submittal-profiles.md`, `spec/sections/screens/S15g-settings-code-edition.md`, `spec/sections/screens/S06-electrical-edit-lock.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/screens/S03-plan-editor.md`
- **Tickets (6, build order):**
  - EZD-116 Defaults framework — needs EZD-103 (s1)
  - EZD-128 Project switcher — needs EZD-117a (s2), EZD-117b (s2)
  - EZD-130 Project settings dialog — after EZD-116, EZD-128; needs EZD-118 (s2)
  - EZD-125 Edit lock service — after EZD-116; needs EZD-120a (s3), EZD-120b (s3), EZD-109 (s7), EZD-110 (s2)
  - EZD-126 Edit lock UI — after EZD-125
  - EZD-225 Editor states — after EZD-126; needs EZD-204 (s5)
- **Depends on slices:** 1, 2, 3, 5, 7
- **Out of scope until later:** Offline editing and conflict list (slice 40); Keyboard shortcuts page rows (slice 11); code data fields in Project settings (slice 20).
- **Risks and spikes:** EZD-125 is the Edit lock acceptance test with two browser sessions; the 5-minute auto release reads from Defaults so tests can shorten it. lock_epoch must be the only thing that decides whether a save is accepted.
- **Josh's test script:**
  1. Settings → Defaults. Expected: Every registry row shows; an empty one reads “Not set”.
  2. Open the project in browser A (Owner) and browser B (Designer). Expected: A holds the lock; B sees the amber banner with A's name and since time.
  3. In B press Request edit. Expected: B shows “Requested”; A sees the prompt with the countdown (Release, Keep editing).
  4. Let the countdown run out (Defaults set to 1 minute for the test). Expected: A's work is saved, the lock releases, B sees the green “Available to edit” toast; Start editing gives B the lock.
  5. Sign in as a user without Edit model and open the project. Expected: No tools and no Request edit.
  6. Header project name → switch to another recent project; then Project settings → change the waste factor. Expected: The other project opens; the changed value applies only to this project.

### Slice 9 · Versions, sends and the project card menu (from spec phase 1)

- **Goal:** Every send freezes a numbered version that can be reopened, named, reverted and cleaned up.
- **User-visible result:** Shared Send dialog with Copy link; Version N numbering and header version label; Versions panel (Sent, Named snapshots, Working) with read-only open, Name snapshot and Revert; daily cleanup job and sheet; project card menu (Rename, Set status, Archive, Unarchive, Delete before any send).
- **Spec files:** `spec/decisions.md`, `spec/sections/03-data-model.md`, `spec/sections/13-decisions-and-remaining-items.md`, `spec/sections/screens/X-revisions-version-history-not-in-mockup.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/sections/06-workflows.md`, `spec/sections/screens/S01-projects.md`
- **Tickets (5, build order):**
  - EZD-111 Send dialog with Copy link — needs EZD-110 (s2), EZD-120a (s3), EZD-120b (s3)
  - EZD-121 Sent versions and numbering — after EZD-111; needs EZD-120a (s3), EZD-120b (s3)
  - EZD-122 Versions panel — after EZD-121
  - EZD-123 Version cleanup — after EZD-122; needs EZD-110 (s2), EZD-116 (s8)
  - EZD-124 Project card menu — after EZD-121; needs EZD-117a (s2), EZD-117b (s2)
- **Depends on slices:** 2, 3, 8
- **Out of scope until later:** Sheets and permit revisions Rev N (slice 23); client page the link opens (slice 33); change orders (slice 36).
- **Risks and spikes:** EZD-121 frozen rows must reject writes at the database; EZD-123's cleanup deletes data after the grace period, so its job needs the dry-run path tested first.
- **Josh's test script:**
  1. Open the Send dialog from a project, add a recipient, Send. Expected: The stub transport records the email; Copy link opens the same item; the header reads “Working copy · Version 1 sent”.
  2. Edit a wall and send again. Expected: Version 2 is created; Version 1 is unchanged.
  3. Open Version 1 from the Versions panel. Expected: It opens read-only with the “Version 1” label.
  4. Name snapshot on the working copy, then Revert to Version 1. Expected: A new working version appears; sent versions stay.
  5. Run the cleanup job with the Defaults age set to 0 days. Expected: The cleanup sheet lists unsent working versions with Keep and Name; a notification with Copy link arrives.
  6. Projects → card menu on a project with a sent version. Expected: Delete is absent; Archive removes it from every tab and Show archived brings it back.

### Slice 10 · Fixtures, existing conditions, showers, bearing walls (from spec phase 2)

- **Goal:** Record what exists in a bath or kitchen: fixtures, appliances, utility points, condition pins and a custom tile shower.
- **User-visible result:** Fixtures tool with generic plumbing fixtures, appliances and utility points; existing-condition pins with photos; floor levels, transitions, attic access, soffits, registers and detectors as existing objects; bearing wall rule with engineer note; custom tile shower object; grab-bar blocking.
- **Spec files:** `spec/sections/06-workflows.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/sections/03-data-model.md`
- **Tickets (6, build order):**
  - EZD-215 Bearing wall rule — needs EZD-213 (s5), EZD-132 (s1)
  - EZD-220 Existing-condition pins — needs EZD-213 (s5), EZD-132 (s1)
  - EZD-229 Existing-condition details — after EZD-220
  - EZD-234 Fixtures tool and utility points — needs EZD-213 (s5)
  - EZD-226 Custom tile shower objects — after EZD-234
  - EZD-227 Grab-bar blocking — after EZD-234
- **Depends on slices:** 1, 5
- **Out of scope until later:** Saved groups and the Fixtures panel's Saved section (slice 11); catalog-linked fixtures (slice 49); shower elevation, 3D and takeoff (slices 22, 27, 51); bath clearance warnings in Check (slice 20).
- **Risks and spikes:** EZD-226's shower object has four later consumers; its field list must be complete now.
- **Josh's test script:**
  1. Press F and place a sink, a range and a refrigerator; add a gas and a drain utility point. Expected: Each places with its attributes; moving the range lists the utilities that must move.
  2. In Existing view add a moisture pin with a photo; switch to Proposed. Expected: The pin persists and shows only in Existing.
  3. Set a 3/4" floor-level step on a room. Expected: A transition draws on the plan and shows in the room inspector.
  4. Mark a wall bearing and press Delete. Expected: Blocked with “Engineer required”; after attaching a note with name and approval it deletes and the event log has a row.
  5. In a 5x8 bath draw a shower with curb, niche and linear drain; reload. Expected: It draws in plan and survives reload.
  6. Place grab-bar blocking on a bath wall and move the wall. Expected: The blocking follows the hosted-item rules.

### Slice 11 · Editing tools, groups, libraries, shortcuts (from spec phase 1, 2)

- **Goal:** Round out the plan editor: context menu, mirror, align, saved groups, sketch, measure, revision clouds and a rebindable key map with the full rail.
- **User-visible result:** Right-click and long-press menu with Mirror, Align, Group, Save as group, Set status; Settings → Libraries shell with Saved groups and abbreviations; Sketch tool with stroke clean-up and iPad input mode; Measure tool on every tab; manual revision cloud; Defaults → Keyboard shortcuts; full rail with default keys.
- **Spec files:** `spec/sections/screens/S15h-settings-libraries.md`, `spec/decisions.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/sections/screens/S15d-settings-defaults.md`, `spec/sections/04-app-shell-and-global-ui.md`, `spec/sections/02-product-overview.md`, `spec/sections/screens/S06-electrical-edit-lock.md`
- **Tickets (7, build order):**
  - EZD-131 Libraries shell — needs EZD-103 (s1)
  - EZD-222 Keyboard shortcuts and Help — needs EZD-116 (s8)
  - EZD-230 Default key map and full rail — after EZD-222
  - EZD-223 Sketch tool — needs EZD-207 (s4), EZD-108 (s2)
  - EZD-231 Measure tool (plan) — needs EZD-206 (s5), EZD-207 (s4)
  - EZD-233 Context menu, mirror, align, groups — after EZD-131; needs EZD-217 (s5), EZD-234 (s10)
  - EZD-232 Manual revision cloud (plan) — needs EZD-216 (s6)
- **Depends on slices:** 1, 2, 4, 5, 6, 8, 10
- **Out of scope until later:** Notes, Details, Hatches, Parts, Field task templates tabs of Libraries (slices 23, 25, 41); 3D Measure (slice 28); catalog rail button (slice 49).
- **Risks and spikes:** EZD-230 registers every tool in the key map even where the feature is not built; the collision check per view must not refuse keys reserved by later tabs.
- **Josh's test script:**
  1. Right-click a door → Mirror. Expected: The hand swaps.
  2. Select a sink and a cabinet-sized rectangle of walls → Save as group; place it from the Fixtures panel's Saved section. Expected: It places again; Settings → Libraries → Saved groups lists it.
  3. Press Shift+L, click two wall ends. Expected: The distance reads in the length format; the model is unchanged; a view-only user can do it.
  4. Sketch a rough rectangle with the pen. Expected: It becomes a rectangle; holding keeps the raw stroke; in Pencil-only mode a finger does not draw.
  5. Draw a revision cloud (Q) and reload. Expected: The cloud persists.
  6. Defaults → Keyboard shortcuts: rebind Wall to Shift+W, then try to give R to two Plan commands. Expected: The tooltip shows the new key; the second assignment is refused.

### Slice 12 · Polycam scan import (from spec phase 3)

- **Goal:** Bring a Polycam scan into the model through Import review, with typed values overriding the scan.
- **User-visible result:** Upload step in the wizard and on a project; Polycam DXF detection as a background job; GLB mesh toggle; Import review screen with three modes, Fix and Delete, conflict list, Resolve the gap, Finish and Cancel.
- **Spec files:** `spec/sections/screens/S01-projects.md`, `spec/sections/08-import-and-export.md`, `spec/sections/screens/S02-import-review.md`, `spec/decisions.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/06-workflows.md`, `spec/sections/07-hooks-events-and-integrations.md`
- **Tickets (9, build order):**
  - EZD-301 Upload step — needs EZD-118 (s2), EZD-132 (s1)
  - EZD-302 Polycam DXF detection — after EZD-301; needs EZD-202 (s3)
  - EZD-303 Polycam GLB mesh — after EZD-301
  - EZD-307 Import review screen — after EZD-302, EZD-303
  - EZD-308 Review modes — after EZD-307; needs EZD-116 (s8)
  - EZD-309 Fix and delete — after EZD-307
  - EZD-310 Typed vs scan conflicts — after EZD-309; needs EZD-201 (s4)
  - EZD-311 Resolve the gap — after EZD-310; needs EZD-205 (s4)
  - EZD-313 Finish and cancel — after EZD-308, EZD-310, EZD-311
- **Depends on slices:** 1, 2, 3, 4, 8
- **Out of scope until later:** PDF and DXF imports, import states, laser input (slice 13); converting architect layers (slice 38); field measure items (slice 42).
- **Risks and spikes:** Detection is built against a synthetic file until Josh supplies a real Polycam export (Needs from Josh); real layer names may differ. The DXF parser spike EZD-029 must have a go note.
- **Josh's test script:**
  1. New project → Start from a file → drop the fixture Polycam DXF and GLB. Expected: The type tags auto-fill; a DWG is refused with the save-as-DXF prompt.
  2. Wait for detection. Expected: Review opens with the summary line and Accepted counts; the unjoined wall is amber dashed.
  3. Toggle Show 3D mesh. Expected: The mesh shows over the plan.
  4. Accept N in Accept + fix mode. Expected: Only items above the Defaults cutoff are accepted.
  5. Fix a wall by dragging its endpoint, then type a length beyond the tolerance. Expected: The conflict list names every conflict it creates.
  6. Resolve the gap by picking the absorbing wall; Finish import. Expected: Finish is blocked until the gap resolves; after Finish the Plan opens with the counts notice and only accepted items, status Existing.
  7. Start another import and Cancel. Expected: The model is unchanged; the files are kept.

### Slice 13 · PDF and DXF imports, import states, laser input (from spec phase 3)

- **Goal:** Import a PDF plan (vector or scanned) or any DXF, with every import state covered and a keyboard-mode laser filling length fields.
- **User-visible result:** PDF underlay with two-point scale calibration; vector PDF wall detection; scanned PDF trace-only prompt; DXF conversion choice with layer map; ceiling slope fixes in review; import states (detecting, error, locked, read-only, Importing card); laser keyboard input verified in three places.
- **Spec files:** `spec/sections/screens/S01-projects.md`, `spec/sections/06-workflows.md`, `spec/sections/screens/S02-import-review.md`, `spec/decisions.md`, `spec/sections/08-import-and-export.md`, `spec/sections/02-product-overview.md`
- **Tickets (6, build order):**
  - EZD-304 PDF underlay and scale — needs EZD-301 (s12)
  - EZD-305 Vector PDF wall detection — after EZD-304
  - EZD-306 DXF conversion choice — needs EZD-301 (s12), EZD-302 (s12)
  - EZD-312 Ceiling slope in review — needs EZD-309 (s12), EZD-303 (s12)
  - EZD-314 Import states — needs EZD-313 (s12), EZD-126 (s8)
  - EZD-315 Laser keyboard input — needs EZD-209 (s4), EZD-310 (s12)
- **Depends on slices:** 4, 8, 12
- **Out of scope until later:** Architect DXF as a full-fidelity reference (slice 37); supplier PDF import (slice 39).
- **Risks and spikes:** Built against synthetic PDFs until Josh supplies a vector plan, a scanned plan and a supplier PDF. The real laser is a field check (iPad + keyboard-mode laser).
- **Josh's test script:**
  1. Upload the fixture vector PDF, calibrate two points with a typed distance. Expected: A known length measures correctly; wall items appear in review.
  2. Upload the fixture scanned PDF. Expected: “Nothing detected. Trace over the underlay” with a button to the Plan editor.
  3. Upload a non-Polycam DXF, map its wall and door layers, choose two layers. Expected: Only items from those layers reach review; the original stays as reference.
  4. Fix a slope item by pitch, by heights, and by the mesh value. Expected: All three save.
  5. Force a failed detection with the test hook. Expected: The error names the file with Retry; the project card reads “Importing” while a job runs.
  6. Send a simulated keyboard-wedge entry into the review inspector, the dimension bar and the plan inspector. Expected: Each fills and commits; the status bar shows the input mode.

### Slice 14 · Cabinet runs (from spec phase 4)

- **Goal:** Build a cabinet run from real boxes, see its elevation, auto-fill a wall and export the schedule.
- **User-visible result:** Minimal catalog picker with the generic line; cabinet object model; plan strip and elevation; library panel with drag to insert; box editing on canvas; box inspector with Swap; fit chip; Auto-fill run; cabinet schedule with CSV; stranded-cabinet flag and empty-wall prompt.
- **Spec files:** `spec/sections/03-data-model.md`, `spec/sections/screens/S09-catalog-add-product.md`, `spec/sections/screens/S04-cabinet-run-elevation.md`, `spec/decisions.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/06-workflows.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/08-import-and-export.md`
- **Tickets (10, build order):**
  - EZD-401 Catalog items (minimal)
  - EZD-402 Cabinet object model — needs EZD-202 (s3)
  - EZD-404 Plan strip and elevation — after EZD-402; needs EZD-207 (s4)
  - EZD-403 Cabinet library panel — after EZD-402, EZD-401, EZD-404
  - EZD-405 Box editing on canvas — after EZD-404
  - EZD-406 Box inspector — after EZD-405
  - EZD-407 Fit chip — after EZD-404; needs EZD-116 (s8)
  - EZD-408 Auto-fill run — after EZD-407; needs EZD-234 (s10)
  - EZD-409 Cabinet schedule — after EZD-406
  - EZD-410 Cabinet flags and states — after EZD-402; needs EZD-204 (s5)
- **Depends on slices:** 3, 4, 5, 8, 10
- **Out of scope until later:** Countertops (slice 15); elevation sheet A4.0 (slice 22); 3D cabinets (slice 27); full catalog (slice 49); run inspector on Plan (slice 15).
- **Risks and spikes:** Ten tickets, at the limit; the slice could not split without leaving a run that cannot be edited or filled. A real vendor line is a Josh item; the generic seed line is used. The field check (reproduce a past kitchen order) needs that order from Josh.
- **Josh's test script:**
  1. Select a 117 1/2" wall and press Auto-fill run; confirm the preview. Expected: Boxes in 3" widths plus fillers; the fit chip is green with the total vs wall.
  2. Drag a B24 row from the library into the run. Expected: It inserts at the drop position; the elevation updates and the chain widths sum to the run total.
  3. Drag a B15's side edge one step. Expected: It relabels B18.
  4. Open the box inspector → Swap box. Expected: A compatible box takes the same position; Cost is absent for a user without See company costs.
  5. Open the cabinet schedule and export CSV. Expected: Counts match the plan; one CSV row per code.
  6. Move the wall away from the run. Expected: The stranded cabinet flags red; an empty wall reads “Drag boxes or Auto-fill run”.

### Slice 15 · Countertops (from spec phase 4)

- **Goal:** Trace or draw countertops with seams, cutouts, overhangs, seating support, edge profiles and a top schedule.
- **User-visible result:** Countertops tool bar (Trace cabinets, Draw outline); seams and cutouts; edge overhang chips and presets; seating support notice with bracket count; Pieces/Edges/Material panel and exposed LF; edge profile offers with rate per LF; top schedule CSV; Plan inspector run selection with selection tiles.
- **Spec files:** `spec/sections/03-data-model.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/screens/S04b-countertops.md`, `spec/sections/06-workflows.md`, `spec/sections/screens/S15d-settings-defaults.md`, `spec/decisions.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/08-import-and-export.md`, `spec/sections/screens/S03-plan-editor.md`
- **Tickets (9, build order):**
  - EZD-411 Countertop object model — needs EZD-202 (s3)
  - EZD-412 Trace and Draw outline — after EZD-411; needs EZD-404 (s14), EZD-116 (s8)
  - EZD-413 Seams and cutouts — after EZD-412
  - EZD-414 Edges and overhangs — after EZD-412; needs EZD-116 (s8)
  - EZD-415 Seating support check — after EZD-414
  - EZD-416 Left panel and status bar — after EZD-412
  - EZD-417 Edge profiles — after EZD-414
  - EZD-418 Top schedule — after EZD-416
  - EZD-419 Plan inspector: run selection — needs EZD-406 (s14), EZD-409 (s14)
- **Depends on slices:** 3, 8, 14
- **Out of scope until later:** Client edge choice page (slice 33); the countertop support detail (slice 26); edge profile library in Settings (slice 50); client set sheets (slice 24).
- **Risks and spikes:** EZD-417 creates selection_offer, which the client link (slice 33) reuses; EZD-415 stores a support requirement the detail link (slice 26) reads.
- **Josh's test script:**
  1. Countertops (K) → Trace cabinets over two runs. Expected: Pieces A and B appear with default overhangs.
  2. Draw a seam across A; add a 30" × 16" sink cutout. Expected: A splits into two relabeled pieces; the cutout draws at that size.
  3. Click an edge, apply the Seating preset. Expected: The side reads 12" and “seating”.
  4. Set the support limit to 10" in Defaults; make a 76 1/2" seating side. Expected: The notice shows 4 brackets and 3 seats.
  5. Offer two edge profiles with rates. Expected: The offered total equals rate × exposed LF; the status pill reads open.
  6. Open the top schedule and export. Expected: Rows match the pieces; the CSV downloads.
  7. Select the island run on Plan. Expected: The inspector shows the run total and the Countertop and Cabinet finish tiles.

### Slice 16 · Ceilings and the RCP (from spec phase 1, 5)

- **Goal:** Edit each room's ceiling and the devices on it in a reflected ceiling plan.
- **User-visible result:** Ceiling tool with Floor/Ceiling/Both views and the ceiling rail; Change ceiling (type, heights, pitch, Read heights from scan); walls cut under slopes; ceiling devices; fixture schedule panel; soffits, trays, coffers, crown and height tags; the review pill in the header and on the card.
- **Spec files:** `spec/sections/04-app-shell-and-global-ui.md`, `spec/sections/screens/S05-ceiling-plan-rcp.md`, `spec/sections/03-data-model.md`, `spec/decisions.md`, `spec/sections/09-calculations-and-rules.md`
- **Tickets (8, build order):**
  - EZD-127 Review pill — needs EZD-117a (s2), EZD-117b (s2)
  - EZD-501 Ceiling data per room — needs EZD-202 (s3)
  - EZD-502 RCP view and ceiling rail — after EZD-501, EZD-127; needs EZD-207 (s4)
  - EZD-503 Ceiling type editor — after EZD-501; needs EZD-303 (s12)
  - EZD-504 Walls cut under slopes — after EZD-503
  - EZD-507 Ceiling devices — after EZD-501
  - EZD-508 Fixture schedule panel — after EZD-507
  - EZD-513 Soffits, trays, coffers, crown, tags — after EZD-501
- **Depends on slices:** 2, 3, 4, 12
- **Out of scope until later:** Beams, auto-layout, zones, ACT, HVAC, framing and fan clearance (slice 17); A6.0 sheet (slice 22); 3D ceilings (slice 27).
- **Risks and spikes:** EZD-507 lights and detectors are the same objects the electrical plan uses; the object id must be shared, not copied.
- **Josh's test script:**
  1. Open a room, press the Ceiling tool, choose Both. Expected: The RCP draws over the greyed floor plan with the ceiling rail.
  2. Change ceiling → vaulted, set ridge height and pitch. Expected: The room stores both; the height tag reads from the ceiling data.
  3. On a project with a GLB press Read heights from scan. Expected: The slope fills from the mesh.
  4. Place three recessed lights and a smoke detector. Expected: The fixture schedule shows one row per tag with counts; clicking a row selects all of that tag.
  5. Draw a soffit and a tray with edge dimensions; reload. Expected: Both persist with their dimensions.
  6. Register a test review item. Expected: “1 to review” shows on the pill and on the project card; it hides at 0.

### Slice 17 · Beams, lights, ACT and ceiling checks (from spec phase 5)

- **Goal:** Finish the RCP: beams with a section preview, auto-laid cans, switching zones, ACT grid, HVAC, framing warnings and fan clearance.
- **User-visible result:** Beam tool with Section A-A preview; Auto-layout cans by count, spacing or foot-candles; switching zones; ACT grid with balancing; diffusers that snap to tiles; Framing known with keep-clear warnings; fan clearance; beam finish picker and More menu.
- **Spec files:** `spec/sections/screens/S05-ceiling-plan-rcp.md`, `spec/decisions.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/screens/S01-projects.md`
- **Tickets (9, build order):**
  - EZD-505 Beams — needs EZD-501 (s16)
  - EZD-506 Section A-A preview — after EZD-505
  - EZD-509 Auto-layout cans — needs EZD-507 (s16), EZD-116 (s8)
  - EZD-510 Switching zones — needs EZD-507 (s16)
  - EZD-511 ACT grid — needs EZD-501 (s16), EZD-116 (s8)
  - EZD-512 HVAC objects — after EZD-511
  - EZD-514 Framing known and keep-clear — needs EZD-507 (s16)
  - EZD-515 Fan clearance and hosted flags — after EZD-505; needs EZD-507 (s16), EZD-116 (s8)
  - EZD-516 Beam finish, More menu, canvas — after EZD-505; needs EZD-401 (s14)
- **Depends on slices:** 8, 14, 16
- **Out of scope until later:** Switch legs synced from electrical (slice 18); Make options A/B/C (slice 29); fan and keep-clear warnings in the Check list (slice 20).
- **Risks and spikes:** EZD-509's formula values (CU, LLF, target fc) are Defaults; EZD-511's half-tile rule is the first half of the RCP acceptance test.
- **Josh's test script:**
  1. Place a beam set, level, with Height AFF above the ridge. Expected: A warning shows; the Section A-A preview updates with the height.
  2. Auto-layout cans by light level: 320 sf, 30 fc, 800 lm, CU 0.6, LLF 0.8. Expected: The preview shows 25 cans; nothing is placed until confirmed.
  3. Draw a dimmer switching zone. Expected: It draws dashed with the dimmer mark and saves.
  4. Add a 2x2 ACT area and place a diffuser in it. Expected: Edge tiles are at least half a tile; the diffuser snaps into a tile.
  5. Enter joist lines and place a can on one. Expected: The keep-clear warning shows; with Unknown there is none.
  6. Place a fan closer than the Defaults clearance to a wall. Expected: It warns.
  7. Pick a beam finish from the catalog picker; use More → Duplicate. Expected: The finish stores on the set; the duplicate appears.

### Slice 18 · Electrical devices and circuits (from spec phase 6)

- **Goal:** Place electrical devices, circuit them to a panel, and read the panel schedule and voltage drop.
- **User-visible result:** Electrical mode with Circuits/Devices/Panel tabs; device toolbar; height notes; circuits with home runs and tags; switch legs synced with RCP zones; existing panel dialog with AI-read label; panel schedule; selected circuit block with voltage drop warning.
- **Spec files:** `spec/sections/screens/S06-electrical-edit-lock.md`, `spec/decisions.md`, `spec/sections/03-data-model.md`, `spec/sections/screens/S05-ceiling-plan-rcp.md`, `spec/sections/06-workflows.md`
- **Tickets (8, build order):**
  - EZD-601 Electrical mode and left panel — needs EZD-207 (s4), EZD-202 (s3)
  - EZD-602 Device toolbar — after EZD-601; needs EZD-507 (s16)
  - EZD-603 Device height notes — after EZD-602; needs EZD-116 (s8)
  - EZD-604 Circuits — after EZD-602
  - EZD-605 Switch legs — after EZD-604; needs EZD-510 (s17)
  - EZD-606 Panel and existing panel dialog — after EZD-604
  - EZD-609 Panel schedule — after EZD-604
  - EZD-610 Selected circuit and voltage drop — after EZD-604; needs EZD-116 (s8)
- **Depends on slices:** 3, 4, 8, 16, 17
- **Out of scope until later:** Load calc (slice 19); code check (slice 20); E1.0 and E2.0 sheets (slice 22); 3D devices (slice 27).
- **Risks and spikes:** EZD-606 runs on the stub AI provider; Josh's real panel photos are a field check. EZD-610 voltage drop values follow the formula in Calculations.
- **Josh's test script:**
  1. Press E; place a GFCI receptacle, a 3-way switch, a light and a data jack. Expected: Each places with its attributes; the Devices tab groups them by room.
  2. New circuit, click the receptacle and the light. Expected: Both show the tag and a home run; the footer counts circuits, spaces and VA.
  3. Draw a switch leg from the switch to the light; then edit the matching zone on the RCP. Expected: Both stay in sync.
  4. Existing panel → upload the label photo (stub AI). Expected: Brand, rating and spaces show unconfirmed; the calc ignores them until Confirm.
  5. Open the Panel tab. Expected: The schedule rows match the circuits; open spaces are flagged.
  6. Select a 20 A circuit on 12 AWG at 58 ft with a 3% threshold. Expected: 3.1% voltage drop with a warning.
  7. Toggle a height note on the microwave receptacle. Expected: “MW +66"” shows for that device only.

### Slice 19 · Load calculation (from spec phase 6)

- **Goal:** Run the NEC 220 residential load calc, standard and optional methods, from the drawn house.
- **User-visible result:** Load calc inspector with line rows, overrides, service bar and the “200A OK” pill; appliance rating defaults in Settings → Catalog; optional method toggle and the five cases.
- **Spec files:** `spec/sections/09-calculations-and-rules.md`, `spec/decisions.md`, `spec/sections/screens/S06-electrical-edit-lock.md`, `spec/sections/screens/S09-catalog-add-product.md`, `spec/sections/screens/S15e-settings-catalog.md`
- **Tickets (4, build order):**
  - EZD-607 Load calc engine — needs EZD-604 (s18)
  - EZD-608 Load calc inspector — after EZD-607; needs EZD-116 (s8)
  - EZD-614 Appliance rating defaults — after EZD-607; needs EZD-401 (s14), EZD-103 (s1)
  - EZD-615 Load calc: optional method and cases — after EZD-607, EZD-608; needs EZD-606 (s18)
- **Depends on slices:** 1, 8, 14, 18
- **Out of scope until later:** E2.0 sheet placement (slice 22); the stored electrical_calc at issue (slice 23).
- **Risks and spikes:** The worked example must reproduce line by line (35,868 VA, 149.5 A). Josh's hand calc for a real house is the field check.
- **Josh's test script:**
  1. Open the mockup 06 fixture house and the load calc. Expected: Lines match the worked example: 35,868 VA and 149.5 A.
  2. Override one appliance rating. Expected: The line is marked overridden and the total changes.
  3. Add load until the Defaults threshold, then past 100%. Expected: The service bar turns amber, then red.
  4. Settings → Catalog → Appliance rating defaults: change the range default; remove the range's rating. Expected: The calc uses the default.
  5. Toggle Optional method on the existing-dwelling fixture; pick each case. Expected: The total changes; each case returns its expected amps and pass or fail.

### Slice 20 · Code check engine and first rule sets (from spec phase 2, 6)

- **Goal:** Run a code check from any editor tab and get warnings with code sections for Florida Residential chapter 3 and bath clearances.
- **User-visible result:** Settings → Code edition; the rule registry and code_rule table from the catalog file; Check on every rail with grouped results (Warnings, Needs a value, Checklist), Go to, accept with a note; code data fields in the wizard, Project settings and inspector; Florida Residential R3-001 to R3-078; bath clearance warnings.
- **Spec files:** `spec/sections/09-calculations-and-rules.md`, `spec/sections/screens/S15d-settings-defaults.md`, `spec/sections/screens/S15g-settings-code-edition.md`, `spec/decisions.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/sections/screens/S06-electrical-edit-lock.md`, `spec/code-rules.json`, `spec/code-check-rules.md`
- **Tickets (7, build order):**
  - EZD-228 Bath clearance check — needs EZD-226 (s10), EZD-116 (s8)
  - EZD-613 Code edition settings — needs EZD-116 (s8)
  - EZD-611a Code check engine and rule registry — after EZD-613; needs EZD-604 (s18), EZD-218 (s6)
  - EZD-612 Check button and results — after EZD-611a
  - EZD-620 Code data fields — after EZD-611a; needs EZD-130 (s8), EZD-213 (s5)
  - EZD-611b Code rules: Florida Residential Ch. 3 (1 of 4) — after EZD-611a, EZD-620; needs EZD-501 (s16), EZD-234 (s10)
  - EZD-611c Code rules: Florida Residential Ch. 3 (2 of 4) — after EZD-611a, EZD-620; needs EZD-501 (s16), EZD-234 (s10)
- **Depends on slices:** 5, 6, 8, 10, 16, 18
- **Out of scope until later:** The remaining rule sets (slices 43 to 46); issue checklist gating (slice 23); rule verification list (slice 52).
- **Risks and spikes:** EZD-611a decides how 1,248 rules register and how editions pick sections; the CI test that the catalog file and table match guards it. Warnings carry the not-yet-verified tag until Josh verifies rules (EZD-1710).
- **Josh's test script:**
  1. Settings → Code edition: set the default; create a project; change the default again. Expected: The project keeps its edition.
  2. Project settings → enter county Palm Beach, year built, work area over 50% of the building. Expected: Climate zone 1, no HVHZ flag, alteration Level 3.
  3. Draw a bedroom with no escape opening and a toilet 12" from a side wall; press Check on the Plan tab. Expected: Both warnings list with their code section and a link to the section; the bath warning comes from Defaults → Baths.
  4. Press Check on the RCP tab and Go to on a result. Expected: The canvas zooms to the object.
  5. Leave a Needs data value empty. Expected: The rule lists under Needs a value naming the value.
  6. Accept a warning with a note. Expected: It leaves the open count and the note is stored.

### Slice 21 · Sheet set and sheet viewer (from spec phase 7)

- **Goal:** See the auto-built permit and client sets with plans at scale, a symbol key and sheet annotations.
- **User-visible result:** Ten default sheets in a permit set and a client set; Sheets screen with set selector, list, strip, zoom and draft watermark; sheet renderer in a worker; viewports at 1/4" with Existing, Demo and Proposed views; print rules with scale bar and check dimension; symbol key of used symbols; keynote, text, callout and cloud tools.
- **Spec files:** `spec/sections/screens/S13-sheets-key-issue.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/03-data-model.md`, `spec/sections/11-non-functional-requirements.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/decisions.md`, `spec/sections/screens/S15h-settings-libraries.md`
- **Tickets (8, build order):**
  - EZD-701 Sheet model and default set — needs EZD-202 (s3)
  - EZD-726 Sheet sets — after EZD-701
  - EZD-702a Sheets screen — after EZD-701, EZD-726
  - EZD-702b Sheet renderer — after EZD-702a; needs EZD-235 (s6), EZD-238 (s3)
  - EZD-703 Viewports and scales — after EZD-702a, EZD-702b; needs EZD-214 (s6)
  - EZD-704 Sheet annotation tools — after EZD-702a, EZD-702b
  - EZD-705 Print rules — after EZD-703
  - EZD-706 Symbol key — after EZD-702a, EZD-702b
- **Depends on slices:** 3, 6
- **Out of scope until later:** Elevations, RCP, electrical sheets and title block (slice 22); PDF, issue and revisions (slices 23, 24); details on A5.0 (slice 26).
- **Risks and spikes:** EZD-702b must be a lazy chunk absent from the Plan bundle and must not render on Plan edits. EZD-705's check dimension is the print-accuracy guard Josh measures on paper.
- **Josh's test script:**
  1. Open the Sheets tab on a project with a plan. Expected: The list shows A0.0 to R1.0 grouped; the strip shows thumbnails; the draft watermark shows.
  2. Open A1.0, A2.0 and A3.0. Expected: Existing only, demo only, proposed; grab-bar blocking prints on the plans.
  3. Edit a wall on Plan, return to Sheets. Expected: Only the sheets that show the wall rebuild their thumbnail.
  4. Delete the last outlet; open the symbol key. Expected: Its symbol leaves the key.
  5. Place a keynote and a text note on A3.0; reload. Expected: Both persist.
  6. Zoom to the check dimension. Expected: Its drawn length equals its labeled length × the viewport scale.

### Slice 22 · Elevations, RCP and electrical sheets, title block (from spec phase 7)

- **Goal:** Fill the set: interior elevations, A6.0, E1.0, E2.0 and a complete title block with owner and parcel from the property appraiser.
- **User-visible result:** A4.0 elevations for every wall with cabinets, fixtures or a shower, plus Add elevation; A6.0 with the fixture schedule; E1.0 with circuits; E2.0 with the panel schedule and load calc lines; Settings → Title block with preview; title block on every sheet; PAO link import with confirmed fields and the lead flag.
- **Spec files:** `spec/sections/screens/S15b-settings-title-block.md`, `spec/decisions.md`, `spec/sections/screens/S13-sheets-key-issue.md`, `spec/sections/screens/S01-projects.md`, `spec/sections/06-workflows.md`, `spec/sections/03-data-model.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/screens/S04-cabinet-run-elevation.md`, `spec/sections/screens/S05-ceiling-plan-rcp.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/screens/S06-electrical-edit-lock.md`
- **Tickets (7, build order):**
  - EZD-709 Title block settings — needs EZD-112 (s1), EZD-701 (s21)
  - EZD-710 Title block on sheets — after EZD-709; needs EZD-130 (s8)
  - EZD-711 Property appraiser import — after EZD-710; needs EZD-118 (s2)
  - EZD-707 Elevations sheet — needs EZD-703 (s21), EZD-404 (s14)
  - EZD-708a A6.0 RCP sheet — needs EZD-703 (s21), EZD-508 (s16)
  - EZD-708b E1.0 electrical plan — after EZD-708a; needs EZD-703 (s21), EZD-604 (s18)
  - EZD-708c E2.0 panel schedule and load calc — after EZD-708b; needs EZD-609 (s18), EZD-607 (s19)
- **Depends on slices:** 1, 2, 8, 14, 16, 18, 19, 21
- **Out of scope until later:** Cover sheet A0.0 and required notes (slice 23); R1.0 finish schedule and renders (slice 32).
- **Risks and spikes:** EZD-711 reads a recorded PAO page and the stub AI in tests; the live site may change. EZD-708b closes the second half of the RCP acceptance test.
- **Josh's test script:**
  1. Open A4.0 on the fixture kitchen. Expected: One elevation per run; a window under a sloped ceiling draws the cut wall top; Add elevation adds a wall with no cabinets.
  2. Open A6.0. Expected: Each fixture tag lists lumens, color temperature and count.
  3. Open E1.0. Expected: A light placed on the RCP appears with the same circuit tag; the EC note is on the sheet.
  4. Press Add to E2.0, then change a circuit and Update E2.0. Expected: Every panel schedule row and load calc line shows and refreshes.
  5. Settings → Title block: toggle the company block, leave the license empty. Expected: The preview updates at 24x36 and 11x17; the missing license is listed.
  6. Paste a PAO link in Sheets, confirm the fields (year built 1975). Expected: The title block fills; the lead flag is set.

### Slice 23 · PDF export, issue checklist and Rev 0 (from spec phase 7)

- **Goal:** Issue a permit set as a PDF that follows the department's submittal profile.
- **User-visible result:** Settings → Sheet presets (submittal profiles) with department rules; Notes library; cover sheet A0.0 with index and notes; PDF export job with bookmarks and file naming; header Export menu; issue checklist with gates and warnings; Issue Rev 0 and Rev N; Sheets states (progress, blocked, offline).
- **Spec files:** `spec/sections/03-data-model.md`, `spec/sections/screens/S15c-settings-sheet-presets-submittal-profiles.md`, `spec/sections/08-import-and-export.md`, `spec/decisions.md`, `spec/sections/screens/S15h-settings-libraries.md`, `spec/sections/screens/S13-sheets-key-issue.md`, `spec/sections/06-workflows.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/04-app-shell-and-global-ui.md`
- **Tickets (9, build order):**
  - EZD-712 Submittal profiles — needs EZD-116 (s8)
  - EZD-713 Department profile settings — after EZD-712
  - EZD-714 Notes library — after EZD-712
  - EZD-716 Issue checklist — needs EZD-612 (s20), EZD-710 (s22)
  - EZD-715 PDF export job — after EZD-713; needs EZD-705 (s21), EZD-238 (s3)
  - EZD-717 Issue Rev 0 and Rev N — after EZD-715, EZD-716; needs EZD-121 (s9)
  - EZD-721 Export menu — after EZD-715
  - EZD-722 Sheets states — after EZD-717
  - EZD-728 Cover sheet A0.0 — after EZD-714; needs EZD-706 (s21)
- **Depends on slices:** 3, 8, 9, 20, 21, 22
- **Out of scope until later:** Revision clouds and log, send to client, one-page downloads, department export tests (slice 24); detail PDF (slice 26); change orders (slice 36).
- **Risks and spikes:** EZD-715 writes PDF straight from the drawing list per spike EZD-028; PDFKit stays out of the browser bundle. A set accepted by a building department is the field check.
- **Josh's test script:**
  1. Settings → Sheet presets: duplicate the default, set Boca Raton, per-sheet split, naming tokens. Expected: The new profile saves; the project picks it in Project settings.
  2. Settings → Libraries → Notes: add a required note to the profile. Expected: A0.0 shows it with the sheet index and scope of work.
  3. Open the issue checklist on a project with an orphan “Not on a wall” flag. Expected: Issue is blocked with the reason.
  4. Clear the flag and press Issue Rev 0. Expected: The check runs, a 24x36 PDF with one bookmark per sheet downloads with the address + description name; the version freezes; status reads Permit submitted.
  5. Edit a wall after issue. Expected: Edits go to a working copy; the sent set stays.
  6. Go offline and open Sheets. Expected: Issue is disabled with “Needs connection”; a user without the permission sees no Issue button.

### Slice 24 · Revisions, client send and export options (from spec phase 7)

- **Goal:** Issue numbered revisions with automatic clouds, send the client set, and pass each department's export rules.
- **User-visible result:** Revision clouds on changed objects with delta tags and a log on every sheet; Send set to client with Version N or Rev N; client-only countertop sheets; one PDF per sheet download; dismissible dimension warning; accepted warnings in the issue log; profile enforcement at issue with six department tests.
- **Spec files:** `spec/sections/screens/S13-sheets-key-issue.md`, `spec/decisions.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/screens/S01-projects.md`, `spec/sections/08-import-and-export.md`, `spec/sections/screens/S15c-settings-sheet-presets-submittal-profiles.md`
- **Tickets (7, build order):**
  - EZD-724 Dismissible dimension warning — needs EZD-716 (s23)
  - EZD-718 Revision clouds and log — needs EZD-717 (s23)
  - EZD-719 Send set to client — needs EZD-717 (s23), EZD-111 (s9)
  - EZD-720 Client set content — needs EZD-701 (s21), EZD-418 (s15), EZD-726 (s21)
  - EZD-723 Download one page at a time — needs EZD-715 (s23), EZD-713 (s23)
  - EZD-725 Accepted warnings in the issue log — needs EZD-717 (s23), EZD-612 (s20)
  - EZD-727 Submittal profile enforcement at issue — needs EZD-712 (s23), EZD-713 (s23), EZD-715 (s23)
- **Depends on slices:** 9, 15, 20, 21, 23
- **Out of scope until later:** Client page the send opens (slice 33); change order from a revision (slice 36).
- **Risks and spikes:** EZD-718 keeps changed ids as a set while editing, never a full diff; the Revisions acceptance test is the guard. Department rows are unverified until the first job in each place.
- **Josh's test script:**
  1. Issue Rev 0, send it to the client, move one wall, issue again. Expected: Rev 1 with a cloud around exactly the moved wall and a revision log row on every sheet.
  2. Send the set to the client before any permit issue. Expected: Labeled Version 1; status Client review.
  3. Switch to the Client set. Expected: Countertop plan, edge detail and top schedule appear; the Permit set never has them.
  4. Export one PDF per sheet. Expected: Ten named PDFs at 24x36, each with the version in the name.
  5. Dismiss the “All dimensions typed” warning and issue. Expected: It stays hidden for the set and is gone after issue; a warning accepted with a note prints in the issue log.
  6. Export under the Boca and Broward profiles. Expected: Boca: one flattened PDF per sheet named by sheet number; Broward warns on a 1/8" viewport.

### Slice 25 · Detail editor (from spec phase 8)

- **Goal:** Draw a custom 2D detail with line roles, hatches, parts, keynotes, dimensions and steps.
- **User-visible result:** Detail mode with its rail, tabs and inspector; New detail dialog (Blank, Parts); Line, Polyline, Rectangle, Circle, Arc with typed lengths; line roles and the standard hatch set; Text, Keynote, Leader, Dimension, Break; scale and NTS; steps and layers; Settings → Libraries Details, Hatches and Parts tabs; parts list.
- **Spec files:** `spec/sections/screens/S10-detail-editor.md`, `spec/sections/03-data-model.md`, `spec/sections/09-calculations-and-rules.md`, `spec/decisions.md`, `spec/sections/screens/S15h-settings-libraries.md`
- **Tickets (9, build order):**
  - EZD-801 Detail data and editor shell — needs EZD-202 (s3)
  - EZD-802 New detail dialog — after EZD-801
  - EZD-803 Drawing tools — after EZD-801; needs EZD-201 (s4)
  - EZD-804 Line roles and hatches — after EZD-803
  - EZD-805 Annotation tools — after EZD-803
  - EZD-807 Scale and NTS — after EZD-805; needs EZD-116 (s8)
  - EZD-808 Steps and layers — after EZD-801
  - EZD-817 Detail libraries in Settings — after EZD-801; needs EZD-131 (s11)
  - EZD-806 Parts — after EZD-801, EZD-817
- **Depends on slices:** 3, 4, 8, 11
- **Out of scope until later:** Place on sheet, cut from model, underlay, extrude, library copy, PDF, pen (slice 26).
- **Risks and spikes:** EZD-801 stores company details as a table and job details as model objects; the split must be right before slice 26 copies between them.
- **Josh's test script:**
  1. Libraries → + New detail → Blank, title, 1 1/2" scale. Expected: The detail opens in Detail mode.
  2. Draw a rectangle by typed lengths; set Hidden role on one line; hatch the region with plywood. Expected: Exact size; the line prints dashed; the region fills.
  3. Add a keynote and a leader to a line, then move the line. Expected: The leader follows.
  4. Add a part from the library; check Settings → Libraries → Parts. Expected: The part lists with qty; a part added in Settings appears in Add part.
  5. Switch to NTS with a typed-override dimension. Expected: The dimension underlines; the NTS stamp shows.
  6. Add two steps and toggle them as layers. Expected: Steps show beside the detail in preview and toggle on the canvas.

### Slice 26 · Details on sheets, cut from model, library, export (from spec phase 8)

- **Goal:** Put a detail on A5.0 with a callout, cut one from the model, trace one from a photo, extrude a profile and export it.
- **User-visible result:** Legibility warnings with fix links; print preview and Place on sheet with the “3 / A5.0” callout; section line and Detail callout tool on plans; photo or PDF underlay start; Extrude to 3D with an orbit viewer; library copy and Save to company library; countertop support detail link; detail PDF export; freehand pen.
- **Spec files:** `spec/sections/screens/S10-detail-editor.md`, `spec/decisions.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/sections/08-import-and-export.md`, `spec/sections/screens/S04b-countertops.md`, `spec/sections/screens/S15h-settings-libraries.md`
- **Tickets (8, build order):**
  - EZD-809 Legibility warnings — needs EZD-805 (s25)
  - EZD-810 Place on sheet — after EZD-809; needs EZD-702a (s21), EZD-702b (s21)
  - EZD-811 Cut from model and callouts — needs EZD-802 (s25), EZD-207 (s4)
  - EZD-812 Underlay start — needs EZD-802 (s25), EZD-304 (s13)
  - EZD-813 Extrude to 3D — needs EZD-803 (s25)
  - EZD-815 Detail PDF export — after EZD-810; needs EZD-721 (s23)
  - EZD-816 Freehand pen — needs EZD-803 (s25), EZD-223 (s11)
  - EZD-814 Detail library and countertop link — needs EZD-801 (s25), EZD-415 (s15), EZD-817 (s25)
- **Depends on slices:** 4, 11, 13, 15, 21, 23, 25
- **Out of scope until later:** Section from reference linework (slice 38); extruded piece in the field pack (slice 41).
- **Risks and spikes:** EZD-811's cut geometry (one closed region per wall layer, openings left out) depends on wall layers from EZD-203 being complete.
- **Josh's test script:**
  1. Leave a leader pointing at nothing. Expected: The warning shows; Snap to blocking fixes it.
  2. Print preview the floating-shelf detail at 24x36 and phone size, Place on A5.0. Expected: A5.0 shows the detail with the “3 / A5.0” callout and title bubble.
  3. Draw a section line across a wall on the plan. Expected: A new detail opens with one closed region per wall layer.
  4. New detail → Underlay with a photo. Expected: The photo shows under the canvas for tracing.
  5. Select a closed 10" × 1 3/4" profile, Extrude 48". Expected: The orbit viewer shows the piece; an open profile leaves the button disabled.
  6. Copy a library detail into the job and edit it; open the countertop support notice → Open detail. Expected: The library copy is unchanged; the brackets are added to the linked detail.
  7. Export → Detail PDF at 11x17. Expected: The page is 1224 × 792 pt with the check dimension true; the entry is absent without Export.

### Slice 27 · 3D scene, navigation and saved views (from spec phase 10)

- **Goal:** See the live 3D model of the plan with orbit, section, layers and saved views.
- **User-visible result:** 3D tab drawn from the working model with walls, openings, ceilings, beams, cabinets, tops, fixtures, showers, devices and catalog finishes; orbit, pan, zoom, view cube, Home, Fit; section plane and Shaded/Lines/X-ray; layer rows with opacity and scan mesh; saved views with thumbnails; iPad memory guard and states.
- **Spec files:** `spec/sections/screens/S07-3d-view.md`, `spec/sections/02-product-overview.md`, `spec/decisions.md`, `spec/sections/03-data-model.md`, `spec/sections/11-non-functional-requirements.md`
- **Tickets (8, build order):**
  - EZD-1001a 3D scene core — needs EZD-207 (s4), EZD-235 (s6)
  - EZD-1001b 3D ceilings and beams — after EZD-1001a; needs EZD-504 (s16), EZD-505 (s17)
  - EZD-1001c 3D cabinets, fixtures, devices and finishes — after EZD-1001b; needs EZD-402 (s14), EZD-414 (s15), EZD-234 (s10), EZD-226 (s10), EZD-602 (s18), EZD-401 (s14)
  - EZD-1002 Navigation — after EZD-1001a, EZD-1001b, EZD-1001c
  - EZD-1004 Section and display modes — after EZD-1002
  - EZD-1005 3D layers — after EZD-1001a, EZD-1001b, EZD-1001c; needs EZD-303 (s12)
  - EZD-1006 Saved views — after EZD-1002
  - EZD-1015 iPad memory guard and states — after EZD-1001a, EZD-1001b, EZD-1001c
- **Depends on slices:** 4, 6, 10, 12, 14, 15, 16, 17, 18
- **Out of scope until later:** Walk, finishes, measure and the rail (slice 28); design options, phone viewer and GLB export (slice 29); renders (slice 30).
- **Risks and spikes:** EZD-1001a follows spike EZD-030 for openings; CSG only in a worker. First open on the benchmark project must meet the budget; a real kitchen on the iPad without memory errors is the field check.
- **Josh's test script:**
  1. Open the 3D tab on the fixture kitchen. Expected: The model shows with cabinets, tops, fixtures and devices; the footer reads “Model synced with plan”.
  2. Move a wall on Plan and return to 3D. Expected: The change shows without a save; only that wall's meshes rebuilt (test counter).
  3. Click the TOP face of the view cube, then click it again. Expected: Top view, then free orbit returns.
  4. Add a section plane and press Flip. Expected: The kept side reverses; Lines and X-ray modes switch.
  5. Set the Ceiling layer to 50%. Expected: The ceiling is translucent; beams stay opaque.
  6. Save a view, orbit away, click the saved view. Expected: The camera returns to the same position; the thumbnail is 320 px.
  7. Fire the low-memory test hook. Expected: The warning shows and the lighter mode switches on.

### Slice 28 · 3D walk, finishes, measure and the rail (from spec phase 10)

- **Goal:** Walk through the model, apply finishes, measure in 3D, use the rail and see a 3D preview in the plan inspector.
- **User-visible result:** Walk mode at eye height with keys and iPad joystick; Look up; click to select with canvas tag; Apply finish from the catalog; rail tools that switch to Plan; Check in 3D; Measure in 3D; Plan inspector 3D preview with Open 3D.
- **Spec files:** `spec/sections/screens/S07-3d-view.md`, `spec/decisions.md`, `spec/sections/screens/S01-projects.md`, `spec/sections/screens/S03-plan-editor.md`
- **Tickets (5, build order):**
  - EZD-1003 Walk and Look up — needs EZD-1002 (s27), EZD-116 (s8)
  - EZD-1007 Select and apply finish — needs EZD-1001a (s27), EZD-1001b (s27), EZD-1001c (s27), EZD-401 (s14), EZD-505 (s17)
  - EZD-1008 Rail on the 3D tab — needs EZD-1002 (s27), EZD-612 (s20)
  - EZD-1012 Measure in 3D — needs EZD-1002 (s27)
  - EZD-1017 Inspector 3D preview — needs EZD-1001a (s27), EZD-1001b (s27), EZD-1001c (s27)
- **Depends on slices:** 8, 14, 17, 20, 27
- **Out of scope until later:** Phone 3D viewer and exports (slice 29); Render A/B/C (slice 32).
- **Risks and spikes:** EZD-1017 must use the shared renderer and draw no frames while idle.
- **Josh's test script:**
  1. Press Walk, hold W. Expected: The camera moves along its heading at the Defaults eye height; the joystick does the same on the iPad.
  2. Click a wall → Apply finish → pick a catalog finish. Expected: The wall shows the texture; a beam shows its bottom-of-beam AFF tag.
  3. Press Wall on the 3D rail. Expected: Plan opens with the Wall tool active.
  4. Press Check in 3D. Expected: The results list shows.
  5. Measure a 12'6" wall in 3D. Expected: It reads 12'6".
  6. Select a cabinet on Plan and change its width. Expected: The inspector preview redraws once; Open 3D opens 3D focused on it.

### Slice 29 · Design options, phone 3D viewer, 3D exports (from spec phase 10)

- **Goal:** Compare ceiling options A/B/C with internal costs, view 3D on a phone, and export GLB and USDZ.
- **User-visible result:** Design option groups with model deltas and cost lines; options inspector with cards and cost detail; Make options A/B/C from the RCP; phone 3D viewer with saved views; GLB and USDZ export.
- **Spec files:** `spec/sections/03-data-model.md`, `spec/sections/screens/S07-3d-view.md`, `spec/sections/screens/S05-ceiling-plan-rcp.md`, `spec/decisions.md`, `spec/sections/08-import-and-export.md`
- **Tickets (5, build order):**
  - EZD-1009 Design options data — needs EZD-202 (s3)
  - EZD-1010 Options inspector — after EZD-1009; needs EZD-1001a (s27), EZD-1001b (s27), EZD-1001c (s27)
  - EZD-1011 Make options from the RCP — after EZD-1010; needs EZD-505 (s17)
  - EZD-1013 Phone 3D viewer — needs EZD-1012 (s28)
  - EZD-1014 GLB and USDZ export — needs EZD-1001a (s27), EZD-1001b (s27), EZD-1001c (s27), EZD-721 (s23)
- **Depends on slices:** 3, 17, 23, 27, 28
- **Out of scope until later:** Sending options to the client (slice 34); render A/B/C (slice 32); option costs in takeoff (slice 51).
- **Risks and spikes:** EZD-1009 applies option patches in memory only; a patch whose base object was deleted is flagged and skipped. USDZ in AR Quick Look on an iPhone is a field check.
- **Josh's test script:**
  1. On the RCP inspector press Make options A/B/C. Expected: Three options open in 3D; A is the current ceiling.
  2. Edit B's beams and add cost lines. Expected: B shows in the viewport; the cost delta shows only with See company costs; the saved working copy is unchanged.
  3. Duplicate option C. Expected: Refused (maximum three).
  4. Open the project on a phone-size window. Expected: Full-screen viewport, view cube, Measure, saved views in the bottom sheet, no inspector.
  5. Export → GLB and USDZ. Expected: The GLB passes validation and loads in the model-viewer test page; the USDZ is a valid archive.

### Slice 30 · Render setup and generate (from spec phase 11)

- **Goal:** Set up an AI render from a saved angle or a site photo, pick a style and tier, and queue it.
- **User-visible result:** Settings → Render models with tiers, allowance and worker controls; render records and jobs; the stub and Gemini adapters; Render tab step 1 (angle, site photo, HEIC), split preview and optional alignment, step 2 (style, direction, mask), tiers and Generate; renders list with progress and notifications.
- **Spec files:** `spec/sections/03-data-model.md`, `spec/sections/screens/S08-render-setup.md`, `spec/decisions.md`, `spec/sections/screens/S15f-settings-render-models.md`, `spec/sections/02-product-overview.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`
- **Tickets (8, build order):**
  - EZD-1101 Render records and jobs — needs EZD-1006 (s27)
  - EZD-1102 Render models settings — needs EZD-116 (s8)
  - EZD-1103 Provider adapters — after EZD-1101, EZD-1102
  - EZD-1106 Step 1: angle — after EZD-1101; needs EZD-1006 (s27)
  - EZD-1107 Preview and optional alignment — after EZD-1106
  - EZD-1108 Step 2: style and direction — after EZD-1107; needs EZD-401 (s14)
  - EZD-1109 Tiers and Generate — after EZD-1108, EZD-1103
  - EZD-1110 Renders list and notifications — after EZD-1109; needs EZD-110 (s2), EZD-127 (s16)
- **Depends on slices:** 2, 8, 14, 16, 27
- **Out of scope until later:** Render view, comments, approval, allowance refill (slice 31); local worker, path tracer, R1.0 (slice 32); client gallery (slice 34).
- **Risks and spikes:** Tests use the stub provider only; a live key is a Josh item. The render trial spike EZD-031 informs the adapter. EZD-1103 must record the model id in the conventions file.
- **Josh's test script:**
  1. Settings → Render models: set a model for each tier and the allowance. Expected: Save is refused until each tier has a model; dollar figures hide without See company costs.
  2. Open the Render tab with no saved view. Expected: “Save a view in 3D or add a site photo”; steps 2 and 3 are locked.
  3. Pick a saved view, then drop a HEIC site photo. Expected: Steps unlock; the photo shows as Before in Chrome.
  4. Drag the 4 photo corners to align. Expected: The corners store on the render inputs.
  5. Choose Golden, Tap surface + a catalog finish, pick Standard, Generate. Expected: The estimate shows; one render queues with all four directions' data; the style tiles make no network request.
  6. Wait for the stub job. Expected: The row shows progress then finished; an in-app notification and (for Photoreal) an email arrive.

### Slice 31 · Render review and approval (from spec phase 11)

- **Goal:** Review a render, comment, fix and regenerate, approve it in two steps, download it, and watch the allowance.
- **User-visible result:** Render view with Render/Before/Split/Model modes and filmstrip; comment pins; Mark area to fix, Fix, Regenerate, Rerun, Compare; Approve/Reject and Mark client-ready/Hide; Download with the burned-in label; allowance tracking with auto refill; model-changed detection with Keep, Mark outdated, Hide.
- **Spec files:** `spec/sections/screens/S08b-photoreal-render-view.md`, `spec/decisions.md`, `spec/sections/screens/S08-render-setup.md`, `spec/sections/07-hooks-events-and-integrations.md`, `spec/sections/08-import-and-export.md`, `spec/sections/03-data-model.md`
- **Tickets (7, build order):**
  - EZD-1111 Render view — needs EZD-1110 (s30)
  - EZD-1112 Comment pins — after EZD-1111
  - EZD-1113 Fix and regenerate — after EZD-1111
  - EZD-1114 Two-step approval — after EZD-1111
  - EZD-1115 Model changed detection — after EZD-1114; needs EZD-1001a (s27), EZD-1001b (s27), EZD-1001c (s27), EZD-1109 (s30), EZD-127 (s16)
  - EZD-1116 Download — after EZD-1111
  - EZD-1117 Render allowance — needs EZD-1102 (s30), EZD-110 (s2)
- **Depends on slices:** 2, 16, 27, 30
- **Out of scope until later:** Client gallery (slice 34); Send image (slice 34).
- **Risks and spikes:** EZD-1115's comparison runs in a background job, never in the save request; the 50-render save test guards it.
- **Josh's test script:**
  1. Open a finished render. Expected: The 1600 px preview loads first; Before and Split are disabled on a render with no site photo.
  2. As a view-only user add a comment pin. Expected: It saves and lists.
  3. Mark an area and press Fix marked area. Expected: Disabled until a mask exists; then a new render with previous_render_id.
  4. Approve, then Mark client-ready. Expected: Only the client-ready render is returned by the client-visible query.
  5. Download. Expected: The PNG carries “For illustration; drawings govern”.
  6. Spend past the allowance with the stub tier cost. Expected: The allowance refills, the owner is notified, Generate stays enabled.
  7. Edit an object inside the camera view and save. Expected: The render gets the model-changed badge and review item; editing outside the view leaves it unchanged.

### Slice 32 · Render workers, extra adapters, path tracer and R1.0 (from spec phase 11)

- **Goal:** Route render jobs to the local GPU worker when it is alive, add a second cloud adapter, render free on the desktop, and put client-ready renders on R1.0.
- **User-visible result:** Worker protocol with one-time token, heartbeat and claim; the worker command-line program with a stub runner; OpenAI adapter; browser path tracer link; Render A/B/C from the 3D inspector and the iPad Fast render button; R1.0 finish schedule and renders feeding the issue warning.
- **Spec files:** `spec/decisions.md`, `spec/sections/02-product-overview.md`, `spec/sections/screens/S15f-settings-render-models.md`, `spec/sections/07-hooks-events-and-integrations.md`, `spec/sections/screens/S07-3d-view.md`, `spec/sections/screens/S13-sheets-key-issue.md`, `spec/sections/09-calculations-and-rules.md`
- **Tickets (6, build order):**
  - EZD-1104a Local worker protocol — needs EZD-1103 (s30), EZD-116 (s8)
  - EZD-1104b Local worker program — after EZD-1104a
  - EZD-1105 Browser path tracer — needs EZD-1001a (s27), EZD-1001b (s27), EZD-1001c (s27), EZD-1109 (s30)
  - EZD-1118 Render A/B/C from 3D — needs EZD-1109 (s30), EZD-1010 (s29)
  - EZD-1119 R1.0 finish schedule + renders — needs EZD-1114 (s31), EZD-716 (s23), EZD-401 (s14)
  - EZD-1121 Second provider adapter — needs EZD-1103 (s30)
- **Depends on slices:** 8, 14, 23, 27, 29, 30, 31
- **Out of scope until later:** The real worker runner (slice 52, waits on Josh's GPU test).
- **Risks and spikes:** The cloud API stays primary until the GPU test passes (R26 R18). The path tracer code must be absent from every bundle until the link is pressed.
- **Josh's test script:**
  1. Settings → Render models → Connect worker, start the stub worker with the token. Expected: The worker status shows alive; a queued job is claimed by the worker and not sent to the cloud adapter.
  2. Stop the worker (Defaults timeout shortened). Expected: The next job runs on the cloud stub; an abandoned claim is requeued.
  3. Select the OpenAI adapter for the Fast tier (stub). Expected: The job sends its model id with the guide image and stores the image.
  4. On the desktop press Render on this device (free), then Cancel. Expected: The canvas draws samples; no provider request; a Photoreal render at cost 0 is saved; Cancel stops it.
  5. On the 3D inspector press Render A/B/C. Expected: Three renders queue, one per option.
  6. Mark one render client-ready and open R1.0. Expected: It appears with the label; an unapproved render does not and raises the issue warning.

### Slice 33 · Client approval page (from spec phase 12)

- **Goal:** The homeowner opens a link on a phone, reviews the plans and selections, chooses an edge, verifies, signs and approves.
- **User-visible result:** Share links with expiry and renew; Send to client composer; phone client page with Design and Plans tabs; selection rows and choice pages; edge choice page; verify email and signature pad; Approve that locks the version; selections PDF.
- **Spec files:** `spec/sections/screens/S18-client-approval-phone.md`, `spec/sections/03-data-model.md`, `spec/sections/11-non-functional-requirements.md`, `spec/sections/07-hooks-events-and-integrations.md`, `spec/decisions.md`, `spec/sections/screens/S18b-client-edge-choice-phone.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/06-workflows.md`, `spec/sections/08-import-and-export.md`
- **Tickets (9, build order):**
  - EZD-1201 Share links — needs EZD-111 (s9), EZD-116 (s8)
  - EZD-1202 Client page shell — after EZD-1201
  - EZD-1208 Selection offers and choice pages — after EZD-1202; needs EZD-417 (s15)
  - EZD-1209 Edge choice — after EZD-1208; needs EZD-417 (s15)
  - EZD-1210 Verify and sign — after EZD-1208; needs EZD-113 (s1)
  - EZD-1211 Approve — after EZD-1210
  - EZD-1212 Selections PDF — after EZD-1211
  - EZD-1215 Send to client composer — after EZD-1201, EZD-1208; needs EZD-401 (s14)
  - EZD-1205 Plans tab — after EZD-1202, EZD-1215; needs EZD-702a (s21), EZD-702b (s21)
- **Depends on slices:** 1, 8, 9, 14, 15, 21
- **Out of scope until later:** Render gallery, client comments, option choice, Send image (slice 34); allowance summary page in the PDF (slice 50).
- **Risks and spikes:** The page must carry no editor or 3D code and no money tables (Architecture rule 11); the download-size budget is in the gate. A real client approving from a phone is the field check.
- **Josh's test script:**
  1. Share panel → Send to client: tick two sheets and three selection groups, order them, Send. Expected: The email and Copy link both open the page; Version N freezes.
  2. Open the link on a phone-size window. Expected: Company and project names, “Design approval”, the version label; the Plans tab shows the two sheets as images with pinch zoom; no cost data anywhere.
  3. Open Selections → the edge choice page, choose Half bullnose. Expected: The S04b status and top schedule update while another user holds the lock.
  4. Enter a wrong email, then the right one; sign and print the name. Expected: The pad stays locked until verified; Approve enables with a choice made.
  5. Approve. Expected: Name, date and IP are logged; the version locks; the page shows read-only approved.
  6. Download selections PDF; set the link's expiry to the past; Renew. Expected: The PDF has no prices; the expired page shows, then the link works again for 30 days.

### Slice 34 · Client renders, comments and option choice (from spec phase 12)

- **Goal:** The homeowner sees client-ready renders, comments on them, compares options A/B/C and picks one.
- **User-visible result:** Render gallery with before/after slider; client comment pins with replies that show in the render view; Send image; Send options to client; option cards with Compare; non-chosen options archived on signing.
- **Spec files:** `spec/sections/screens/S18-client-approval-phone.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/screens/S08b-photoreal-render-view.md`, `spec/sections/screens/S07-3d-view.md`, `spec/decisions.md`, `spec/sections/03-data-model.md`
- **Tickets (6, build order):**
  - EZD-1203 Render gallery — needs EZD-1202 (s33), EZD-1114 (s31)
  - EZD-1204 Client comments — after EZD-1203; needs EZD-1112 (s31)
  - EZD-1206 Send options to client — needs EZD-1010 (s29), EZD-1201 (s33), EZD-121 (s9)
  - EZD-1213 Send image — needs EZD-1114 (s31), EZD-111 (s9)
  - EZD-1214 Archive options on signing — needs EZD-1009 (s29), EZD-1211 (s33)
  - EZD-1207 Option choice — after EZD-1206; needs EZD-1215 (s33)
- **Depends on slices:** 9, 29, 31, 33
- **Out of scope until later:** Change order from the approved revision (slice 36).
- **Risks and spikes:** A hidden or outdated render must never reach the gallery; the client-visible query from slice 31 is the only source.
- **Josh's test script:**
  1. Approve a render without marking it client-ready; open the client page. Expected: It does not appear.
  2. Mark it client-ready; open the page. Expected: It shows with the before/after slider.
  3. Drop a comment pin as the client. Expected: The contractor is notified; the pin shows in the render view in the client color with the client's name.
  4. On the 3D inspector press Send options to client. Expected: The package lists three options with layout snapshots and no cost fields.
  5. On the phone choose option B and Compare. Expected: B's render shows; side by side on the same angle.
  6. Sign and approve. Expected: A and C become archived; B becomes approved; choosing without signing leaves all three Sent.

### Slice 35 · EZ Binder connection, inbound API and webhooks (from spec phase 1, 13)

- **Goal:** Connect EZ Draft to EZ Binder (stub): shared sign-on, customer and user sync, projects from jobs in both directions, signed outbound events.
- **User-visible result:** Settings → Company: Connect/Disconnect with status; Back to EZ Binder control; EZ Binder job picker in the wizard; Sync now; inbound API authentication, create project from job and the 60-second sign-on code; signed, retried, logged webhook delivery with the event payload table.
- **Spec files:** `spec/sections/02-product-overview.md`, `spec/sections/07-hooks-events-and-integrations.md`, `spec/sections/screens/S15a-settings-company.md`, `spec/decisions.md`, `spec/sections/screens/S01-projects.md`, `spec/sections/06-workflows.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/sections/11-non-functional-requirements.md`
- **Tickets (8, build order):**
  - EZD-114 EZ Binder connection and shared sign-on — needs EZD-112 (s1)
  - EZD-115 Customer and user sync — after EZD-114; needs EZD-113 (s1)
  - EZD-119 EZ Binder job picker — after EZD-114; needs EZD-118 (s2)
  - EZD-1301 Webhook delivery — after EZD-114; needs EZD-109 (s7), EZD-116 (s8)
  - EZD-1302 Outbound event payloads — after EZD-1301
  - EZD-1303 Inbound API authentication — after EZD-114
  - EZD-1304 Inbound: create project from job — after EZD-1303, EZD-119
  - EZD-1305 Inbound: open with shared sign-on — after EZD-1303
- **Depends on slices:** 1, 2, 7, 8
- **Out of scope until later:** Inbound approved-data reads and CO approval (slice 36); field pack opened from EZ Binder (slice 41).
- **Risks and spikes:** Runs against the EZD-019 stub until EZ Binder's side is built (Needs from Josh); the field check waits. This slice was moved late because its value depends on that side.
- **Josh's test script:**
  1. Settings → Company → Connect with the stub address and secret. Expected: Status connected with last sync; the “EZ Contractor Binder” link shows on Projects.
  2. Edit a customer on the stub side, press Sync now. Expected: It appears in EZ Draft; the reverse also syncs; a conflict is logged latest-wins.
  3. New project → From an EZ Binder job, search a stub job. Expected: Client, address and job number prefill; the project carries the job number.
  4. Call the inbound create-project route with and without the bearer key. Expected: Without: refused; with: a project with the job number.
  5. Open a sign-on URL from the stub, then reuse the code. Expected: First use opens the project signed in; the second use is refused; Back returns to the job.
  6. Make the stub receiver fail once and emit a test event. Expected: The delivery retries with backoff; every attempt has an event log row; the body is HMAC-signed with an idempotency key.

### Slice 36 · Change orders and inbound reads (from spec phase 13)

- **Goal:** Turn a revision into a change order with before/after images, scope, lines and schedule impact, send it to EZ Binder, and lock the revision when EZ Binder marks it approved.
- **User-visible result:** Draft change order at issue or from a sent revision; before and after plans with approval; AI-drafted scope text; line items and schedule impact; Save draft and Send to EZ Binder; inbound read of approved data; inbound mark CO approved; event registry audit.
- **Spec files:** `spec/sections/07-hooks-events-and-integrations.md`, `spec/sections/screens/S14-change-order-hand-off.md`, `spec/sections/screens/S13-sheets-key-issue.md`, `spec/decisions.md`
- **Tickets (8, build order):**
  - EZD-1306 Inbound: read approved data — needs EZD-1303 (s35), EZD-1211 (s33), EZD-717 (s23), EZD-1114 (s31)
  - EZD-1308 CO draft data and entry points — needs EZD-717 (s23), EZD-122 (s9)
  - EZD-1307 Inbound: mark CO approved — after EZD-1308; needs EZD-1303 (s35)
  - EZD-1309 Before and after images — after EZD-1308; needs EZD-1114 (s31)
  - EZD-1310 Scope text — after EZD-1308
  - EZD-1311 Line items and schedule impact — after EZD-1308
  - EZD-1312 Save draft and Send to EZ Binder — after EZD-1309, EZD-1311; needs EZD-1302 (s35)
  - EZD-1314 Canonical event registry — needs EZD-1301 (s35)
- **Depends on slices:** 9, 23, 31, 33, 35
- **Out of scope until later:** Nothing from this feature; a client signing a real CO in EZ Binder is the field check.
- **Risks and spikes:** Nothing may reach EZ Binder before Send. EZD-1314's audit may surface event names emitted under old names in earlier slices; renames are in its scope.
- **Josh's test script:**
  1. Issue Rev 1 with Draft change order ticked. Expected: The CO dialog opens with the “Changed since Rev 0” chip.
  2. Review the Before and After images; Approve images. Expected: Send stays disabled until both are approved; removed items show red dashed on After.
  3. Read the AI scope text (stub), edit it. Expected: The edit saves; the note says the client sees it in EZ Binder.
  4. Add two lines with cost deltas and 3 schedule days. Expected: Total equals the sum; cost columns hide without the permission; completion dates before and after show.
  5. Save draft, then Send to EZ Binder. Expected: Nothing reached the stub before Send; after Send the stub holds images, scope, lines, schedule and rev no.
  6. From the stub call mark CO approved; call read approved data. Expected: The revision locks; the read returns the latest approved version's files.

### Slice 37 · Architect DXF reference (from spec phase 9)

- **Goal:** Open an architect's DXF under the model at full fidelity, align it, and snap to it.
- **User-visible result:** Reference conversion job to binary buffers with a snap index; reference drawing in Plan loaded by layer in a worker; Layers/Markup/Files panel with eye, recolor, isolate and opacity; reference locked under the model with snap, measure and dimension; two-point alignment; paper-space layouts; Arch rev letters; DXF export of model and sheets.
- **Spec files:** `spec/sections/screens/S11-architect-dxf-reference-markup.md`, `spec/sections/08-import-and-export.md`, `spec/sections/screens/S03-plan-editor.md`, `spec/decisions.md`, `spec/sections/03-data-model.md`
- **Tickets (8, build order):**
  - EZD-901a Reference conversion job — needs EZD-306 (s13)
  - EZD-901b Reference drawing in Plan — after EZD-901a; needs EZD-207 (s4), EZD-235 (s6)
  - EZD-902 Reference under the model — after EZD-901a, EZD-901b
  - EZD-904 Reference layers panel — after EZD-901a, EZD-901b
  - EZD-903 Alignment — after EZD-902, EZD-904
  - EZD-905 Paper-space layouts — after EZD-901a, EZD-901b
  - EZD-913 DXF export — after EZD-901a, EZD-901b; needs EZD-721 (s23)
  - EZD-921 Architect revision labels — after EZD-904
- **Depends on slices:** 4, 6, 13, 23
- **Out of scope until later:** Markup, versions and diff (slice 38); supplier files (slice 39); DXF size limits (slice 53).
- **Risks and spikes:** Josh's 2–3 real architect DXFs are needed for the field check; the benchmark uses a generated 150,000-entity DXF. Pan and zoom over it must stay inside the frame budget on the iPad.
- **Josh's test script:**
  1. Upload the fixture architect DXF as a reference. Expected: “Loading layers n of m” shows while the Plan stays interactive; every layer's entity count matches the parser's.
  2. Hide a layer and recolor another; Isolate; Show all. Expected: The canvas follows; the file is unchanged.
  3. Draw a dimension from a reference line endpoint. Expected: It snaps to the reference.
  4. Two-point align the reference to the model. Expected: The reference corner sits on the model corner; the Aligned readout shows.
  5. Switch the layout selector to a paper-space layout. Expected: Its entities show with the right count.
  6. Export → DXF. Expected: The re-parsed file holds the model's walls and the sheet linework.

### Slice 38 · Reference markup, revisions and diff (from spec phase 9)

- **Goal:** Mark up the architect's drawing, receive a new revision, see exactly what changed, keep or accept it, and send the markup back.
- **User-visible result:** Markup tools (Pick, Cloud, Comment, Arrow, Text, Dimension) with the lock rules; Upload new version with the New rev badge; diff job and diff view with affects-you-first list; Keep or Accept; Convert layers to Import review; section or callout from reference linework; export markup as PDF overlay or DXF layer; reference states.
- **Spec files:** `spec/sections/screens/S11-architect-dxf-reference-markup.md`, `spec/sections/03-data-model.md`, `spec/decisions.md`, `spec/sections/08-import-and-export.md`, `spec/sections/screens/S01-projects.md`
- **Tickets (9, build order):**
  - EZD-906 Convert layers — needs EZD-904 (s37), EZD-307 (s12), EZD-306 (s13)
  - EZD-907 Markup layer — needs EZD-902 (s37), EZD-904 (s37)
  - EZD-912 Section or callout from reference — needs EZD-902 (s37), EZD-811 (s26)
  - EZD-911 Export markup — after EZD-907; needs EZD-913 (s37), EZD-715 (s23)
  - EZD-908 Reference versions — needs EZD-904 (s37), EZD-921 (s37)
  - EZD-909a Reference diff job — after EZD-908, EZD-907; needs EZD-116 (s8)
  - EZD-909b Reference diff view — after EZD-909a
  - EZD-910 Keep or accept a revision — after EZD-909a, EZD-909b
  - EZD-922a Reference states (screen 11) — after EZD-911
- **Depends on slices:** 8, 12, 13, 23, 26, 37
- **Out of scope until later:** Supplier renderings and order reports (slice 39).
- **Risks and spikes:** EZD-909a matches by DXF handle when present, else by geometry within the Defaults tolerance; the fixture pair runs both ways.
- **Josh's test script:**
  1. Add a comment pin while another user holds the lock; then try a cloud. Expected: The comment saves; the cloud is refused without the lock and saves with it.
  2. Upload the revised fixture DXF as rev C. Expected: “New rev” badge and a review item; “Accept Arch rev C” wording.
  3. Open the diff view. Expected: The moved wall, added and removed entities and the changed dim are listed; the moved wall is tagged on the canvas; affected markup sorts first.
  4. Press Keep Arch rev B, then Accept Arch rev C. Expected: Model objects are unchanged and affected items stay flagged.
  5. Convert the wall layer. Expected: Walls arrive in Import review; the reference still shows.
  6. Start a section on reference linework. Expected: A detail opens.
  7. Export markup as DXF and as PDF. Expected: The DXF holds only layer Z-MARKUP-WP; the PDF has the reference in gray and markup in red.

### Slice 39 · Supplier files and rendering markup (from spec phase 9)

- **Goal:** Tie a kitchen supplier's rendering and 2020 order report to the plan's cabinet boxes and resolve every mismatch.
- **User-visible result:** Supplier files panel with prompts for DWG and 2020 files; supplier vector PDF import; order report import to order_line; Tag and Link tools; AI Read codes with Confirm; comparison table with Update plan to match or Keep plan, flag to supplier; suggested finishes; supplier markup states.
- **Spec files:** `spec/sections/screens/S12-supplier-rendering-markup.md`, `spec/decisions.md`, `spec/sections/screens/S02-import-review.md`
- **Tickets (8, build order):**
  - EZD-914 Supplier files panel — needs EZD-301 (s12)
  - EZD-915 Supplier vector PDF import — after EZD-914; needs EZD-305 (s13)
  - EZD-916 2020 order report import — after EZD-914; needs EZD-307 (s12)
  - EZD-917 Tag and link tools — after EZD-914; needs EZD-404 (s14), EZD-907 (s38)
  - EZD-918 Read codes — after EZD-917, EZD-916
  - EZD-919 Compare and resolve mismatches — after EZD-917; needs EZD-407 (s14), EZD-111 (s9)
  - EZD-920 Suggested finishes — after EZD-917; needs EZD-401 (s14)
  - EZD-922b Supplier markup states (screen 12) — after EZD-919
- **Depends on slices:** 9, 12, 13, 14, 38
- **Out of scope until later:** Nothing; the real supplier sample (DXF + order report) is a Josh item for re-checking.
- **Risks and spikes:** Built against synthetic supplier PDF and report fixtures; the real 2020 export may differ in label format.
- **Josh's test script:**
  1. Upload a proprietary 2020 file. Expected: The prompt asks for DXF, 3D export and order report.
  2. Upload the fixture supplier PDF. Expected: Cabinet boxes with sizes from W3030 and B24 labels appear in Import review.
  3. Upload the fixture order report (PDF, then CSV). Expected: Lines appear in review for confirmation; confirmed lines store in order_line.
  4. Press Read codes on the rendering. Expected: Suggested tags are dashed; none becomes a tag without Confirm.
  5. Link a tag to a plan box; make the box width differ from the order line. Expected: Both highlight; a mismatch callout shows on the plan.
  6. Press Update plan to match on one, Keep plan, flag to supplier on another. Expected: The box swaps and the fit chip refreshes; the stub email goes to the supplier contact and the flag is logged on the tag.
  7. Go offline. Expected: Read codes and Flag are disabled with “Needs connection”.

### Slice 40 · Offline editing and the app-shell cache (from spec phase 1, 14)

- **Goal:** The lock holder keeps working with no connection and reconnects without losing anything, with conflicts listed instead of overwritten.
- **User-visible result:** Service worker cache of the app shell, the open project, sheet images and render copies; persistent storage request and device cache budget; unsynced-changes warnings; typed offline action queue with count and size; conflict notification and list with Keep mine / Keep theirs; stale actions flagged against an older revision; version reload prompt.
- **Spec files:** `spec/sections/03-data-model.md`, `spec/sections/11-non-functional-requirements.md`, `spec/sections/screens/S17-field-pack-phone.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`, `spec/decisions.md`, `spec/sections/screens/S06-electrical-edit-lock.md`
- **Tickets (5, build order):**
  - EZD-134 App-shell cache and device storage — needs EZD-120a (s3), EZD-120b (s3)
  - EZD-1401 Service worker cache — after EZD-134
  - EZD-1402 Offline change queue — after EZD-1401; needs EZD-120a (s3), EZD-120b (s3)
  - EZD-1403 Offline editing and conflicts — after EZD-1402; needs EZD-125 (s8)
  - EZD-1412 Stale actions on reconnect — after EZD-1402; needs EZD-717 (s23)
- **Depends on slices:** 3, 8, 23
- **Out of scope until later:** Field pack caching and offline tasks (slice 41).
- **Risks and spikes:** EZD-1403 implements Architecture rule 9 conflicts; the forced auto-release scenario is the acceptance test. Browser storage can be evicted; the persistent-storage answer shows in Settings.
- **Josh's test script:**
  1. Open a project, go offline, reload. Expected: The app shell and the project open from the cache; the header icon reads cached.
  2. Draw three walls offline. Expected: The queued count shows in the header subtitle and the Projects page warning.
  3. Reconnect. Expected: The outbox drains and one checkpoint follows; the warning clears.
  4. Force an auto release while offline, have another user edit the same wall, reconnect. Expected: A lock.conflict notification names the project and wall; the conflict list shows; Keep theirs leaves the server value, Keep mine writes the queued value; the list clears.
  5. Queue an action against Rev 1, issue Rev 2 elsewhere, reconnect. Expected: The action is flagged with Resend against Rev 2 or Discard.
  6. Deploy a newer app version with items still queued. Expected: The reload prompt appears only after the outbox is empty.

### Slice 41 · Field pack on the phone (from spec phase 14)

- **Goal:** A crew member opens the issued field pack on a phone, works room by room offline, checks tasks, measures and sends photos.
- **User-visible result:** Field pack shell with room chips and tabs; Plan tab with dimensioned room plans, elevations, finishes and layers; 3D tab; Measure tab with tolerance notice; Send measurement and Flag conflict; field task templates in Libraries with AI drafts; Field tasks screen with Publish; Tasks tab with offline check-off; Photo tab with pins; Issue field pack with crew notification.
- **Spec files:** `spec/sections/screens/S17-field-pack-phone.md`, `spec/decisions.md`, `spec/sections/03-data-model.md`, `spec/sections/02-product-overview.md`, `spec/sections/screens/S15h-settings-libraries.md`, `spec/sections/screens/X-field-tasks-not-in-mockup.md`, `spec/sections/07-hooks-events-and-integrations.md`
- **Tickets (9, build order):**
  - EZD-1404 Field pack shell — needs EZD-1401 (s40), EZD-1305 (s35)
  - EZD-1405 Plan and 3D tabs — after EZD-1404; needs EZD-1013 (s29)
  - EZD-1406 Measure tab — after EZD-1405; needs EZD-315 (s13)
  - EZD-1407 Send measurement and Flag conflict — after EZD-1406; needs EZD-1402 (s40)
  - EZD-1408 Field task templates and publishing — needs EZD-131 (s11)
  - EZD-1409 Tasks tab — after EZD-1408, EZD-1404; needs EZD-1402 (s40)
  - EZD-1410 Photo tab and pins — after EZD-1405, EZD-1407; needs EZD-1402 (s40)
  - EZD-1420 Field tasks screen — after EZD-1408, EZD-1409
  - EZD-1421 Issue field pack — after EZD-1420, EZD-1404; needs EZD-129 (s7)
- **Depends on slices:** 7, 11, 13, 29, 35, 40
- **Out of scope until later:** Field pack PDF, office review of measurements and conflicts, phone field measure (slice 42); Spanish field pack (slice 48).
- **Risks and spikes:** The pack must meet its download-size budget. A crew using it on a live job for a week is the field check; iPhone and iPad are Josh items.
- **Josh's test script:**
  1. Settings → Libraries → Field task templates: reorder the Kitchen phases; run the draft job (stub AI). Expected: Unpublished field_task rows per phase appear on the Plan's Tasks tab, hidden from crew.
  2. Publish the tasks, then Issue field pack. Expected: An assigned Crew user gets “New field pack issued” with Copy link; an unassigned user gets nothing.
  3. Open the pack from the stub EZ Binder on a phone-size window; go offline. Expected: Already signed in; the pack opens from the cache.
  4. Plan tab: tap a detail bubble; toggle the Electrical layer. Expected: The detail opens read-only; the layer hides.
  5. Measure tab: tap A and B on two corners with a delta past tolerance. Expected: The readout turns amber with the notice.
  6. Send measurement, then Flag conflict to office, both offline; reconnect. Expected: Both arrive; the office is notified of the conflict; the model is unchanged.
  7. Check a task and pin a photo offline; reconnect. Expected: The task syncs with user and time; the pin syncs with its photo.

### Slice 42 · Field measure and office review (from spec phase 14)

- **Goal:** A Foreman measures a room on the phone and the office approves field measurements before they change the model.
- **User-visible result:** Field pack PDF per language cached for offline; office Field measurements review with Approve (updates the model, lists conflicts) and Reject with note; field conflicts list in the review pill; phone Field measure with shapes, lettered walls, keypad, closure check, offline save and send; sent rooms into Import review; wizard input source Field measure (phone).
- **Spec files:** `spec/sections/screens/X-field-measurements-review-not-in-mockup.md`, `spec/decisions.md`, `spec/sections/04-app-shell-and-global-ui.md`, `spec/sections/screens/S17-field-pack-phone.md`, `spec/sections/screens/S17b-field-measure-phone.md`, `spec/sections/07-hooks-events-and-integrations.md`, `spec/sections/screens/S02-import-review.md`, `spec/sections/08-import-and-export.md`, `spec/sections/screens/S01-projects.md`, `spec/sections/06-workflows.md`
- **Tickets (9, build order):**
  - EZD-1413 Field measurements review — needs EZD-1407 (s41), EZD-310 (s12), EZD-127 (s16), EZD-125 (s8)
  - EZD-1414 Field conflicts list — needs EZD-1407 (s41), EZD-127 (s16)
  - EZD-1415 Field measure: shapes and walls — needs EZD-1401 (s40)
  - EZD-1416 Field measure: keypad and closure — after EZD-1415
  - EZD-1417 Field measure: offline save and send — after EZD-1416; needs EZD-1402 (s40), EZD-110 (s2)
  - EZD-1418 Field measure into Import review — after EZD-1417; needs EZD-307 (s12)
  - EZD-1419 Field measure entry points and states — after EZD-1415; needs EZD-1404 (s41), EZD-118 (s2), EZD-1305 (s35), EZD-1406 (s41)
  - EZD-1411 Field pack PDF — needs EZD-1405 (s41), EZD-1421 (s41), EZD-715 (s23)
  - EZD-1422 Field measure as wizard input — after EZD-1419; needs EZD-118 (s2)
- **Depends on slices:** 2, 8, 12, 16, 23, 35, 40, 41
- **Out of scope until later:** Nothing; the real keyboard-mode laser and iPhone are field checks.
- **Risks and spikes:** EZD-1413 approval needs the lock and runs the conflict list from slice 12's rules; the stale warning must fire when the revision moved.
- **Josh's test script:**
  1. In the pack press Save PDF with the network off. Expected: The per-room PDF opens from the cache.
  2. Office: open Field measurements review with a pending row outside tolerance; Approve. Expected: The model updates and any conflicts list; Reject with a note notifies the Foreman.
  3. Open the review pill → Field conflicts. Expected: The flagged conflict opens at its pinned location.
  4. Phone: Field measure → L shape, type 5 of 6 walls with the keypad. Expected: The 6th fills; a 1" error reads Off by 1" in amber; 250' asks to confirm.
  5. Send to office while offline, reconnect. Expected: The office is notified once; the room is read-only on the phone.
  6. Office: open Import review. Expected: The L room becomes six existing walls and a room on the plan.
  7. New project → input source Field measure (phone), pick the Foreman. Expected: The Foreman is emailed the link; the project opens on Import review after a send.

### Slice 43 · Code rules: Florida Residential, Existing Building, construction chapters (from spec phase 6)

- **Goal:** Register the rest of the Florida Residential chapter 3 rules, the Existing Building rules and the Florida construction chapter rules.
- **User-visible result:** Check lists warnings, needs-a-value rows and checklist reminders for R3-079 to R3-150, EB-001 to EB-060 and RC-001 to RC-108 on the fixture house.
- **Spec files:** `spec/sections/09-calculations-and-rules.md`, `spec/decisions.md`, `spec/code-rules.json`, `spec/code-check-rules.md`
- **Tickets (5, build order):**
  - EZD-616 Code rules: Florida Residential Ch. 3 (3 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-501 (s16), EZD-234 (s10)
  - EZD-617 Code rules: Florida Residential Ch. 3 (4 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-501 (s16), EZD-234 (s10)
  - EZD-618 Code rules: Existing Building — needs EZD-611a (s20), EZD-620 (s20)
  - EZD-621 Code rules: Florida construction chapters (1 of 2) — needs EZD-611a (s20), EZD-620 (s20), EZD-501 (s16)
  - EZD-622 Code rules: Florida construction chapters (2 of 2) — needs EZD-611a (s20), EZD-620 (s20), EZD-501 (s16)
- **Depends on slices:** 10, 16, 20
- **Out of scope until later:** Energy, mechanical, gas, plumbing and NEC rules (slices 44 to 46); rule verification (slice 52).
- **Risks and spikes:** Each pack is tested against the catalog's check text; none is verified against code text until Josh does EZD-1710. Long tail, so late.
- **Josh's test script:**
  1. Run Check on the fixture house. Expected: Rules from each range appear in Warnings, Needs a value and Checklist; each shows code, section, link and the not-yet-verified tag.
  2. Remove a value a Needs data rule asks for. Expected: The rule moves to Needs a value naming it.
  3. Add an object that triggers an EB reminder. Expected: The reminder appears; removing the object removes it.
  4. Run the registry test. Expected: No catalog id in these ranges is unregistered.

### Slice 44 · Code rules: Energy, Mechanical, Fuel gas, Plumbing (from spec phase 6)

- **Goal:** Register the Energy Conservation, Mechanical, Fuel gas and Plumbing rules.
- **User-visible result:** Check lists warnings and reminders for EN-001 to EN-065, M-001 to M-108, G-001 to G-094 and P-001 to P-174, including the tile shower and fixture rules.
- **Spec files:** `spec/sections/09-calculations-and-rules.md`, `spec/decisions.md`, `spec/code-rules.json`, `spec/code-check-rules.md`
- **Tickets (7, build order):**
  - EZD-623 Code rules: Energy Conservation — needs EZD-611a (s20), EZD-620 (s20), EZD-507 (s16)
  - EZD-624 Code rules: Mechanical (1 of 2) — needs EZD-611a (s20), EZD-620 (s20), EZD-234 (s10)
  - EZD-625 Code rules: Mechanical (2 of 2) — needs EZD-611a (s20), EZD-620 (s20), EZD-234 (s10)
  - EZD-626 Code rules: Fuel gas — needs EZD-611a (s20), EZD-620 (s20), EZD-234 (s10)
  - EZD-627 Code rules: Plumbing (1 of 3) — needs EZD-611a (s20), EZD-620 (s20), EZD-234 (s10), EZD-226 (s10)
  - EZD-628 Code rules: Plumbing (2 of 3) — needs EZD-611a (s20), EZD-620 (s20), EZD-234 (s10), EZD-226 (s10)
  - EZD-629 Code rules: Plumbing (3 of 3) — needs EZD-611a (s20), EZD-620 (s20), EZD-234 (s10), EZD-226 (s10)
- **Depends on slices:** 10, 16, 20
- **Out of scope until later:** NEC rules (slices 45, 46).
- **Risks and spikes:** Seven packs with the same shape; the risk is test fixture volume, not design.
- **Josh's test script:**
  1. Run Check on a bath with a tile shower and a gas range. Expected: Plumbing and fuel gas rules list for them with sections.
  2. Run Check on a room with an exhaust fan with no cfm entered. Expected: A Mechanical rule lists under Needs a value naming cfm.
  3. Enter the cfm. Expected: The rule passes or warns per the catalog test.
  4. Run the registry test. Expected: No catalog id in these ranges is unregistered.

### Slice 45 · Code rules: NEC articles 100 to 230 and 240 (1 of 2) (from spec phase 6)

- **Goal:** Register the NEC rules for articles 100 to 230 and the first article 240 to 410 pack.
- **User-visible result:** Check lists NE2-001 to NE2-161 and NE3-001 to NE3-056 on the fixture house, including the missing GFCI warning from the electrical gate.
- **Spec files:** `spec/sections/09-calculations-and-rules.md`, `spec/decisions.md`, `spec/code-rules.json`, `spec/code-check-rules.md`
- **Tickets (5, build order):**
  - EZD-630 Code rules: NEC Art. 100-230 (1 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-411 (s15)
  - EZD-631 Code rules: NEC Art. 100-230 (2 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-411 (s15)
  - EZD-632 Code rules: NEC Art. 100-230 (3 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-411 (s15)
  - EZD-633 Code rules: NEC Art. 100-230 (4 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-411 (s15)
  - EZD-634 Code rules: NEC Art. 240-410 (1 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-610 (s18)
- **Depends on slices:** 15, 18, 20
- **Out of scope until later:** The rest of NEC 240 to 410 and 422 to 820 (slice 46).
- **Risks and spikes:** These packs read circuits (slice 18), countertops (slice 15) and voltage drop (slice 18); fixtures must carry all three.
- **Josh's test script:**
  1. Run Check on the fixture house with a kitchen receptacle that lacks GFCI. Expected: The missing GFCI warning lists with its NEC section.
  2. Fix the receptacle. Expected: The warning clears.
  3. Run Check with a countertop receptacle spacing beyond the rule. Expected: The spacing rule lists.
  4. Run the registry test. Expected: No catalog id in these ranges is unregistered.

### Slice 46 · Code rules: NEC 240 to 410 (2 of 2) and 422 to 820 (from spec phase 6)

- **Goal:** Register the remaining NEC rules.
- **User-visible result:** Check lists NE3-057 to NE3-198 and NE4-007 to NE4-137; every rule in the catalog file is now registered, closing the electrical gate's registry test.
- **Spec files:** `spec/sections/09-calculations-and-rules.md`, `spec/decisions.md`, `spec/code-rules.json`, `spec/code-check-rules.md`
- **Tickets (5, build order):**
  - EZD-635 Code rules: NEC Art. 240-410 (2 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-610 (s18)
  - EZD-636 Code rules: NEC Art. 240-410 (3 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-610 (s18)
  - EZD-637 Code rules: NEC Art. 240-410 (4 of 4) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-610 (s18)
  - EZD-638 Code rules: NEC Art. 422-820 (1 of 2) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-234 (s10)
  - EZD-639 Code rules: NEC Art. 422-820 (2 of 2) — needs EZD-611a (s20), EZD-620 (s20), EZD-604 (s18), EZD-234 (s10)
- **Depends on slices:** 10, 18, 20
- **Out of scope until later:** Rule verification list in Settings (slice 52).
- **Risks and spikes:** None beyond fixture volume.
- **Josh's test script:**
  1. Run Check on the fixture house. Expected: Rules from each range appear with sections and the not-yet-verified tag.
  2. Run the full registry test. Expected: Every id in ezdraft-code-rules.json has a registered rule.
  3. Open the issue checklist after Check. Expected: “Code check reviewed” reflects the full set.

### Slice 47 · Translation queue (from spec phase 15)

- **Goal:** Spanish drafts for notes, keynotes and field tasks arrive in one review queue with glossary warnings.
- **User-visible result:** Translation and glossary tables; AI drafting with reviewer notification; Settings → Translations table with status, type and project filters; review card with Approve, Edit, Reject and keyboard moves; draft warnings; glossary dialog.
- **Spec files:** `spec/sections/03-data-model.md`, `spec/sections/screens/S16-translation-review.md`, `spec/sections/06-workflows.md`, `spec/sections/02-product-overview.md`, `spec/decisions.md`
- **Tickets (6, build order):**
  - EZD-1501 Translation store
  - EZD-1502 AI drafting — after EZD-1501; needs EZD-110 (s2)
  - EZD-1504 Review table — after EZD-1501; needs EZD-103 (s1)
  - EZD-1505 Review card actions — after EZD-1504
  - EZD-1506 Draft warnings — after EZD-1504
  - EZD-1507 Glossary — after EZD-1504
- **Depends on slices:** 1, 2
- **Out of scope until later:** Bulk approve, propagation, hold setting, Spanish display (slice 48).
- **Risks and spikes:** Drafting runs on the stub AI in tests. Field-pack text for Spanish users is not shown until slice 48.
- **Josh's test script:**
  1. Add a field task and a sheet note. Expected: Each creates an Unreviewed phrase and a reviewer notification.
  2. Settings → Translations. Expected: Counts per status and type chip; the same phrase from two jobs is one row.
  3. Approve one row with A; Edit another and Save; Reject a third and type Spanish. Expected: Each ends Approved; empty text is refused.
  4. Make a draft that drops 34 1/2". Expected: “Numbers differ” shows.
  5. Add a glossary term marked keep in English and draft a phrase using it. Expected: The term stays English; “Not in glossary” offers Add to glossary.

### Slice 48 · Translations: approve in bulk, propagate, Spanish display (from spec phase 15)

- **Goal:** Approved Spanish reaches every unsent use, Spanish users see Spanish everywhere on the phone, and issue can be held until review.
- **User-visible result:** Approve all with no warnings; propagation to unsent uses only; Hold issue and Reviewer settings; Spanish task, note, keynote and crew phone screens for Spanish users.
- **Spec files:** `spec/decisions.md`, `spec/sections/screens/S15-settings-users-permissions.md`, `spec/sections/screens/S16-translation-review.md`
- **Tickets (4, build order):**
  - EZD-1503 Spanish display — needs EZD-1501 (s47), EZD-1404 (s41)
  - EZD-1508 Bulk approve — needs EZD-1506 (s47)
  - EZD-1509 Propagation — needs EZD-1505 (s47)
  - EZD-1510 Translation settings — needs EZD-1504 (s47), EZD-716 (s23)
- **Depends on slices:** 23, 41, 47
- **Out of scope until later:** Spanish office editor and client link (not in v1).
- **Risks and spikes:** Propagation must never touch a sent or issued set; a Spanish-speaking crew member reading the whole pack is the field check.
- **Josh's test script:**
  1. Approve all with no warnings. Expected: Rows with warnings stay Unreviewed.
  2. Edit an approved phrase used in the field pack and in an issued set. Expected: The field pack updates; the issued set does not; an event_log row is written.
  3. Turn on Hold issue with an Unreviewed phrase in the set. Expected: Set issue is blocked; the field pack is not.
  4. Sign in as a Spanish user and open the field pack. Expected: No English task, note or button label; an Unreviewed draft shows rather than English.

### Slice 49 · Catalog drawer and add product (from spec phase 16)

- **Goal:** Fill the product catalog from a link, pasted text or a screenshot with confirmed fields, and place products on the plan.
- **User-visible result:** Catalog (P) on the Plan, 3D and Render rails; drawer with categories, collections, search and cards; drag to place; Add product by URL, pasted text or screenshot with confidence dots and confirmation; Save to company library; Add and place; catalog states.
- **Spec files:** `spec/sections/screens/S09-catalog-add-product.md`, `spec/decisions.md`, `spec/sections/04-app-shell-and-global-ui.md`
- **Tickets (8, build order):**
  - EZD-1601 Catalog drawer — needs EZD-401 (s14)
  - EZD-1602 Place from catalog — after EZD-1601; needs EZD-234 (s10)
  - EZD-1603 Add product: link — after EZD-1601
  - EZD-1604 Add product: paste text and screenshot — after EZD-1603
  - EZD-1605 Field confirmation — after EZD-1603
  - EZD-1606 Save and place — after EZD-1605
  - EZD-1610 Catalog states — after EZD-1601
  - EZD-1616 Catalog on the standard rail — after EZD-1601; needs EZD-230 (s11)
- **Depends on slices:** 10, 11, 14
- **Out of scope until later:** Item detail, price snapshots, catalog settings, markup (slice 50); takeoff (slice 51).
- **Risks and spikes:** EZD-1603's fetch must refuse private and local addresses; tests use a recorded page and the stub AI. Adding ten real products is the field check.
- **Josh's test script:**
  1. Press P on the 3D tab. Expected: The drawer opens; search filters within the active category.
  2. Drag a sink card onto the plan. Expected: It snaps to the sink base and links the fixture.
  3. Add product → paste the fixture product URL. Expected: Fields fill with confidence dots; Add stays disabled until each amber and red field is confirmed.
  4. Use a blocked page → paste text; then a screenshot. Expected: Both fill fields from the stub.
  5. Save with Save to company library off. Expected: The item shows only in this project.
  6. Go offline. Expected: Add product and Refresh are disabled with “Needs connection”; cost and sell fields hide without their permissions.

### Slice 50 · Catalog detail, price snapshots and settings (from spec phase 16)

- **Goal:** Manage catalog items, refresh prices against a snapshot, and set categories, suppliers, markup and edge profiles.
- **User-visible result:** Item detail with Standard spec star and snapshot indicator; Refresh prices with accept or reject per change; Settings → Catalog with categories, allowance categories, suppliers, markup per category and the edge profile library; allowance summary page in the selections PDF.
- **Spec files:** `spec/sections/screens/S09-catalog-add-product.md`, `spec/sections/03-data-model.md`, `spec/sections/screens/S15e-settings-catalog.md`
- **Tickets (4, build order):**
  - EZD-1607 Item detail — needs EZD-1606 (s49)
  - EZD-1608 Price snapshots and refresh — after EZD-1607
  - EZD-1609 Catalog settings — needs EZD-103 (s1), EZD-1212 (s33)
  - EZD-1617 Catalog settings: markup per category and edge library — after EZD-1609; needs EZD-1601 (s49)
- **Depends on slices:** 1, 33, 49
- **Out of scope until later:** Nothing from this feature.
- **Risks and spikes:** Price refresh re-reads the source URL through the job; recorded fixture in tests.
- **Josh's test script:**
  1. Star an item. Expected: It lists under Standard spec.
  2. Place an item, change its price at the source fixture, Refresh prices. Expected: The change lists; the snapshot changes only after Accept.
  3. Settings → Catalog: add a custom category, use it, try to remove it. Expected: Refused while in use.
  4. Set Tile markup to 20%. Expected: Sell changes only for tile items.
  5. Rename an edge profile. Expected: S04b shows the new name; the selections PDF offers the allowance summary page.

### Slice 51 · Takeoff (from spec phase 16)

- **Goal:** Get material quantities by room and trade with waste factors, and export them.
- **User-visible result:** Takeoff functions in a worker for finishes, cabinets, tops, fixtures, electrical, ACT and option costs; takeoff row stored at send; waste factors and pattern adjustment; Takeoff tab in the Plan panel with source highlighting; tile layout preview on elevations and 3D; takeoff CSV.
- **Spec files:** `spec/sections/09-calculations-and-rules.md`, `spec/sections/screens/X-takeoff-not-in-mockup.md`, `spec/sections/screens/S15d-settings-defaults.md`, `spec/decisions.md`, `spec/sections/08-import-and-export.md`, `spec/sections/12-build-phases-and-acceptance-tests.md`
- **Tickets (7, build order):**
  - EZD-1611a Takeoff framework and room finishes — needs EZD-235 (s6), EZD-226 (s10), EZD-116 (s8)
  - EZD-1611b Takeoff: cabinets, tops, fixtures and electrical — after EZD-1611a; needs EZD-418 (s15), EZD-604 (s18)
  - EZD-1611c Takeoff: ACT, option costs and snapshot — after EZD-1611b; needs EZD-511 (s17), EZD-1010 (s29), EZD-121 (s9)
  - EZD-1612 Waste factors — after EZD-1611a, EZD-1611b, EZD-1611c; needs EZD-116 (s8)
  - EZD-1613 Takeoff screen — after EZD-1611a, EZD-1611b, EZD-1611c
  - EZD-1614 Tile layout preview — after EZD-1612; needs EZD-1001a (s27), EZD-1001b (s27), EZD-1001c (s27)
  - EZD-1615 Takeoff CSV — after EZD-1613
- **Depends on slices:** 6, 8, 9, 10, 15, 17, 18, 27, 29
- **Out of scope until later:** Nothing; a hand count for one kitchen is a Josh item for the field check.
- **Risks and spikes:** Engines are tested only against the committed fixture until Josh supplies a hand count.
- **Josh's test script:**
  1. Open the Takeoff tab on the fixture kitchen, group by Trade. Expected: Lines match the expected-quantity JSON; clicking a line highlights its objects.
  2. Switch tile to herringbone. Expected: The tile quantity rises by the Defaults percentage.
  3. Change the tile start point. Expected: The cuts move on the elevation and in 3D.
  4. Send the version. Expected: Exactly one takeoff row is stored and takeoff.updated fires; a working save stores none.
  5. Export the CSV as a user without See company costs. Expected: No cost columns.

### Slice 52 · Hardening: security, backups, terms, event log, rule verification (from spec phase 11, 17)

- **Goal:** Prove the data is safe and recoverable, publish the terms, and give Josh the tool to verify code rules.
- **User-visible result:** Restore script in CI and off-site copy confirmed; automated security suite; event log coverage test; /terms page linked from sign-in; Settings → Code edition rule list with Mark verified and a printable table; the local worker's real runner (when Josh's GPU test is done).
- **Spec files:** `spec/decisions.md`, `spec/sections/11-non-functional-requirements.md`, `spec/sections/09-calculations-and-rules.md`, `spec/sections/screens/S15g-settings-code-edition.md`
- **Tickets (6, build order):**
  - EZD-1120 Local worker: real runner — needs EZD-1104b (s32)
  - EZD-1704 Backups
  - EZD-1705 Security review — needs EZD-1302 (s35), EZD-1211 (s33)
  - EZD-1706 Event log coverage — needs EZD-109 (s7)
  - EZD-1707 Terms of service
  - EZD-1710 Code rule list and verification — needs EZD-611a (s20), EZD-611b (s20), EZD-611c (s20), EZD-613 (s20), EZD-620 (s20)
- **Depends on slices:** 7, 20, 32, 33, 35
- **Out of scope until later:** Nothing.
- **Risks and spikes:** EZD-1120 waits on Josh's GPU test and model choice; if it is still open the slice ships without it and the cloud API stays primary. The terms text is a placeholder until Josh or the attorney supplies it.
- **Josh's test script:**
  1. Run the restore script against a fresh dump. Expected: It passes; the off-site copy date shows on System status.
  2. Run the security suite. Expected: Every table has RLS; cross-tenant reads return zero; client and field responses carry no cost or sell price without the permissions; an unsigned webhook and an unauthenticated inbound call are refused.
  3. Perform an approval, an issue, a lock change, a permission change and a delete. Expected: Each has an event_log row with actor, action, object, time and IP.
  4. Open /terms from the sign-in page. Expected: The non-certification statement renders.
  5. Settings → Code edition: filter Unverified, Mark verified on one rule, run Check. Expected: The rule's warning loses the not-yet-verified tag; the printable table lists every rule.
  6. Start the real worker runner on the GPU machine (if chosen). Expected: A photoreal render runs locally; with the worker off it runs on the cloud API.

### Slice 53 · Hardening: performance, accessibility, screen states (from spec phase 17)

- **Goal:** Every performance budget holds on the benchmark in CI and on the iPad, every icon button is named, and every screen state in the spec passes.
- **User-visible result:** Budget failures fixed; DXF size limits from Defaults; accessibility pass with 44 px targets; table-driven state tests for Projects, Settings, every editor tab, phone and client screens.
- **Spec files:** `spec/sections/11-non-functional-requirements.md`, `spec/decisions.md`, `spec/sections/05-screen-by-screen-spec.md`
- **Tickets (6, build order):**
  - EZD-1701 Performance targets — needs EZD-1001a (s27), EZD-1001b (s27), EZD-1001c (s27), EZD-901a (s37), EZD-901b (s37)
  - EZD-1702 DXF size limits — after EZD-1701
  - EZD-1708 Accessibility pass — needs EZD-222 (s11)
  - EZD-1709a Screen states: Projects and Settings
  - EZD-1709b Screen states: editor tabs — after EZD-1709a; needs EZD-1613 (s51)
  - EZD-1709c Screen states: phone and client screens — after EZD-1709b
- **Depends on slices:** 11, 27, 37, 51
- **Out of scope until later:** Nothing; this is the last slice.
- **Risks and spikes:** EZD-1701 may surface regressions from any earlier slice; budget fixes land as new tickets if they do not fit.
- **Josh's test script:**
  1. Run the EZD-017 check in CI on the benchmark project. Expected: Every budget in Non-functional · Performance passes.
  2. Run the benchmark page on the iPad with a real architect DXF. Expected: 60 fps desktop, 30 fps iPad; cold open within 2.5 s, cached within 1 s.
  3. Upload a DXF over the Defaults limit. Expected: Refused with the limit shown.
  4. Run axe-core on every editor tab, Settings page and phone screen. Expected: No unnamed button; targets are 44 px on the iPad.
  5. Run the state tables for all screens. Expected: Every row passes.

### Validation

Validator: `/home/claude/recut/validate.py` (run as `python3 -I /home/claude/recut/validate.py /home/claude/recut/recut.json`). Checks: every phase 1 to 17 ticket placed exactly once, no phase 0 ticket placed, every dependency in the same or an earlier slice (and listed earlier inside its slice), slice numbering, from_phases, size distribution. Output:

```
slices: 53   tickets placed: 368 (expected 368)
size min/median/max: 4/7/10
slices over 10: none   slices under 4: none

 1. Company settings and customers (phase 1) [6]: EZD-101, EZD-102, EZD-103, EZD-132, EZD-112, EZD-113
 2. Projects list and new project (phase 1) [5]: EZD-108, EZD-110, EZD-117a, EZD-117b, EZD-118
 3. Model store and editor route (phase 1,2) [5]: EZD-133, EZD-120a, EZD-120b, EZD-202, EZD-238
 4. Plan canvas and first walls (phase 2) [8]: EZD-201, EZD-203, EZD-205, EZD-236, EZD-207, EZD-209, EZD-210, EZD-221
 5. Openings, selection, move, inspector, undo (phase 2) [7]: EZD-204, EZD-206, EZD-208, EZD-211, EZD-212, EZD-213, EZD-217
 6. Phase switch, layers, dimensions, thumbnails, benchmark page (phase 1,2) [8]: EZD-135, EZD-219, EZD-214, EZD-218, EZD-224, EZD-235, EZD-216, EZD-237
 7. Users, roles, project scope, event log (phase 1) [6]: EZD-104, EZD-105, EZD-106, EZD-107, EZD-109, EZD-129
 8. Defaults, edit lock, project settings (phase 1,2) [6]: EZD-116, EZD-128, EZD-130, EZD-125, EZD-126, EZD-225
 9. Versions, sends and the project card menu (phase 1) [5]: EZD-111, EZD-121, EZD-122, EZD-123, EZD-124
10. Fixtures, existing conditions, showers, bearing walls (phase 2) [6]: EZD-215, EZD-220, EZD-229, EZD-234, EZD-226, EZD-227
11. Editing tools, groups, libraries, shortcuts (phase 1,2) [7]: EZD-131, EZD-222, EZD-230, EZD-223, EZD-231, EZD-233, EZD-232
12. Polycam scan import (phase 3) [9]: EZD-301, EZD-302, EZD-303, EZD-307, EZD-308, EZD-309, EZD-310, EZD-311, EZD-313
13. PDF and DXF imports, import states, laser input (phase 3) [6]: EZD-304, EZD-305, EZD-306, EZD-312, EZD-314, EZD-315
14. Cabinet runs (phase 4) [10]: EZD-401, EZD-402, EZD-404, EZD-403, EZD-405, EZD-406, EZD-407, EZD-408, EZD-409, EZD-410
15. Countertops (phase 4) [9]: EZD-411, EZD-412, EZD-413, EZD-414, EZD-415, EZD-416, EZD-417, EZD-418, EZD-419
16. Ceilings and the RCP (phase 1,5) [8]: EZD-127, EZD-501, EZD-502, EZD-503, EZD-504, EZD-507, EZD-508, EZD-513
17. Beams, lights, ACT and ceiling checks (phase 5) [9]: EZD-505, EZD-506, EZD-509, EZD-510, EZD-511, EZD-512, EZD-514, EZD-515, EZD-516
18. Electrical devices and circuits (phase 6) [8]: EZD-601, EZD-602, EZD-603, EZD-604, EZD-605, EZD-606, EZD-609, EZD-610
19. Load calculation (phase 6) [4]: EZD-607, EZD-608, EZD-614, EZD-615
20. Code check engine and first rule sets (phase 2,6) [7]: EZD-228, EZD-613, EZD-611a, EZD-612, EZD-620, EZD-611b, EZD-611c
21. Sheet set and sheet viewer (phase 7) [8]: EZD-701, EZD-726, EZD-702a, EZD-702b, EZD-703, EZD-704, EZD-705, EZD-706
22. Elevations, RCP and electrical sheets, title block (phase 7) [7]: EZD-709, EZD-710, EZD-711, EZD-707, EZD-708a, EZD-708b, EZD-708c
23. PDF export, issue checklist and Rev 0 (phase 7) [9]: EZD-712, EZD-713, EZD-714, EZD-716, EZD-715, EZD-717, EZD-721, EZD-722, EZD-728
24. Revisions, client send and export options (phase 7) [7]: EZD-724, EZD-718, EZD-719, EZD-720, EZD-723, EZD-725, EZD-727
25. Detail editor (phase 8) [9]: EZD-801, EZD-802, EZD-803, EZD-804, EZD-805, EZD-807, EZD-808, EZD-817, EZD-806
26. Details on sheets, cut from model, library, export (phase 8) [8]: EZD-809, EZD-810, EZD-811, EZD-812, EZD-813, EZD-815, EZD-816, EZD-814
27. 3D scene, navigation and saved views (phase 10) [8]: EZD-1001a, EZD-1001b, EZD-1001c, EZD-1002, EZD-1004, EZD-1005, EZD-1006, EZD-1015
28. 3D walk, finishes, measure and the rail (phase 10) [5]: EZD-1003, EZD-1007, EZD-1008, EZD-1012, EZD-1017
29. Design options, phone 3D viewer, 3D exports (phase 10) [5]: EZD-1009, EZD-1010, EZD-1011, EZD-1013, EZD-1014
30. Render setup and generate (phase 11) [8]: EZD-1101, EZD-1102, EZD-1103, EZD-1106, EZD-1107, EZD-1108, EZD-1109, EZD-1110
31. Render review and approval (phase 11) [7]: EZD-1111, EZD-1112, EZD-1113, EZD-1114, EZD-1115, EZD-1116, EZD-1117
32. Render workers, extra adapters, path tracer and R1.0 (phase 11) [6]: EZD-1104a, EZD-1104b, EZD-1105, EZD-1118, EZD-1119, EZD-1121
33. Client approval page (phase 12) [9]: EZD-1201, EZD-1202, EZD-1208, EZD-1209, EZD-1210, EZD-1211, EZD-1212, EZD-1215, EZD-1205
34. Client renders, comments and option choice (phase 12) [6]: EZD-1203, EZD-1204, EZD-1206, EZD-1213, EZD-1214, EZD-1207
35. EZ Binder connection, inbound API and webhooks (phase 1,13) [8]: EZD-114, EZD-115, EZD-119, EZD-1301, EZD-1302, EZD-1303, EZD-1304, EZD-1305
36. Change orders and inbound reads (phase 13) [8]: EZD-1306, EZD-1308, EZD-1307, EZD-1309, EZD-1310, EZD-1311, EZD-1312, EZD-1314
37. Architect DXF reference (phase 9) [8]: EZD-901a, EZD-901b, EZD-902, EZD-904, EZD-903, EZD-905, EZD-913, EZD-921
38. Reference markup, revisions and diff (phase 9) [9]: EZD-906, EZD-907, EZD-912, EZD-911, EZD-908, EZD-909a, EZD-909b, EZD-910, EZD-922a
39. Supplier files and rendering markup (phase 9) [8]: EZD-914, EZD-915, EZD-916, EZD-917, EZD-918, EZD-919, EZD-920, EZD-922b
40. Offline editing and the app-shell cache (phase 1,14) [5]: EZD-134, EZD-1401, EZD-1402, EZD-1403, EZD-1412
41. Field pack on the phone (phase 14) [9]: EZD-1404, EZD-1405, EZD-1406, EZD-1407, EZD-1408, EZD-1409, EZD-1410, EZD-1420, EZD-1421
42. Field measure and office review (phase 14) [9]: EZD-1413, EZD-1414, EZD-1415, EZD-1416, EZD-1417, EZD-1418, EZD-1419, EZD-1411, EZD-1422
43. Code rules: Florida Residential, Existing Building, construction chapters (phase 6) [5]: EZD-616, EZD-617, EZD-618, EZD-621, EZD-622
44. Code rules: Energy, Mechanical, Fuel gas, Plumbing (phase 6) [7]: EZD-623, EZD-624, EZD-625, EZD-626, EZD-627, EZD-628, EZD-629
45. Code rules: NEC articles 100 to 230 and 240 (1 of 2) (phase 6) [5]: EZD-630, EZD-631, EZD-632, EZD-633, EZD-634
46. Code rules: NEC 240 to 410 (2 of 2) and 422 to 820 (phase 6) [5]: EZD-635, EZD-636, EZD-637, EZD-638, EZD-639
47. Translation queue (phase 15) [6]: EZD-1501, EZD-1502, EZD-1504, EZD-1505, EZD-1506, EZD-1507
48. Translations: approve in bulk, propagate, Spanish display (phase 15) [4]: EZD-1503, EZD-1508, EZD-1509, EZD-1510
49. Catalog drawer and add product (phase 16) [8]: EZD-1601, EZD-1602, EZD-1603, EZD-1604, EZD-1605, EZD-1606, EZD-1610, EZD-1616
50. Catalog detail, price snapshots and settings (phase 16) [4]: EZD-1607, EZD-1608, EZD-1609, EZD-1617
51. Takeoff (phase 16) [7]: EZD-1611a, EZD-1611b, EZD-1611c, EZD-1612, EZD-1613, EZD-1614, EZD-1615
52. Hardening: security, backups, terms, event log, rule verification (phase 11,17) [6]: EZD-1120, EZD-1704, EZD-1705, EZD-1706, EZD-1707, EZD-1710
53. Hardening: performance, accessibility, screen states (phase 17) [6]: EZD-1701, EZD-1702, EZD-1708, EZD-1709a, EZD-1709b, EZD-1709c

OK: every ticket placed once, every dependency in the same or an earlier slice, within-slice order valid.
```
