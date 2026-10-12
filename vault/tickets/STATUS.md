# Ticket status ledger

Status values: `todo`, `planned`, `questions`, `ready`, `in-progress`, `review`, `done`, `blocked`.
Only the orchestrator edits this file (enforced by hook). It records each stage's result: planner → `planned`/`questions`; Stage 2 → `ready`; build → `in-progress`, `review`; reviewers' verdict → `done` (with commit) or back to `in-progress`; three failed reviews or a question for Josh → `blocked`.
A ticket starts only when every ticket in its `depends_on` (in `tickets.json`, base IDs already expanded) is `done`. The Depends on column here is the original text, for reading only. Pick tickets with `node vault/tools/next_ticket.mjs`; validate with `--check` (done needs a commit hash, blocked needs a note, statuses must be known, STATUS.md and tickets.json must list the same tickets).

| Phase | Ticket | Title | Tickets |
| --- | --- | --- | --- |
| 0 | Phase 0 · Setup | [phase-00.md](phases/phase-00.md) | 36 |
| 1 | Phase 1 · Foundation | [phase-01.md](phases/phase-01.md) | 37 |
| 2 | Phase 2 · Geometry core + plan editor | [phase-02.md](phases/phase-02.md) | 38 |
| 3 | Phase 3 · Imports | [phase-03.md](phases/phase-03.md) | 15 |
| 4 | Phase 4 · Cabinets + countertops | [phase-04.md](phases/phase-04.md) | 19 |
| 5 | Phase 5 · Ceilings / RCP | [phase-05.md](phases/phase-05.md) | 16 |
| 6 | Phase 6 · Electrical + code check | [phase-06.md](phases/phase-06.md) | 40 |
| 7 | Phase 7 · Sheets, issue, submittal profiles, revisions, property appraiser import | [phase-07.md](phases/phase-07.md) | 31 |
| 8 | Phase 8 · Detail editor | [phase-08.md](phases/phase-08.md) | 17 |
| 9 | Phase 9 · Reference DXF + supplier imports + rendering markup | [phase-09.md](phases/phase-09.md) | 25 |
| 10 | Phase 10 · 3D + design options | [phase-10.md](phases/phase-10.md) | 18 |
| 11 | Phase 11 · Render pipeline + allowance + local GPU worker | [phase-11.md](phases/phase-11.md) | 22 |
| 12 | Phase 12 · Client link | [phase-12.md](phases/phase-12.md) | 15 |
| 13 | Phase 13 · Change orders + EZ Binder webhooks and inbound API | [phase-13.md](phases/phase-13.md) | 13 |
| 14 | Phase 14 · Field pack + offline + field measurements review | [phase-14.md](phases/phase-14.md) | 22 |
| 15 | Phase 15 · Translations | [phase-15.md](phases/phase-15.md) | 10 |
| 16 | Phase 16 · Catalog + takeoff | [phase-16.md](phases/phase-16.md) | 19 |
| 17 | Phase 17 · Hardening | [phase-17.md](phases/phase-17.md) | 11 |

| Ticket | Phase | Title | Status | Depends on | Commit | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EZD-001 | 0 | Repo and tooling | questions | EZD-000 |  |  |  |
| EZD-002 | 0 | CI | questions | EZD-001 |  |  |  |
| EZD-003 | 0 | Hosting and subdomain | questions | EZD-002 |  |  |  |
| EZD-004 | 0 | Supabase project | questions | EZD-001 |  |  |  |
| EZD-005 | 0 | Tenant, user, membership tables | questions | EZD-004 |  |  |  |
| EZD-006 | 0 | Row-level security | questions | EZD-005 |  |  |  |
| EZD-007 | 0 | Magic-link sign-in | questions | EZD-005, EZD-026a, EZD-010, EZD-006 |  |  |  |
| EZD-008 | 0 | Email provider | questions | EZD-004 |  |  |  |
| EZD-009 | 0 | Background job queue | questions | EZD-004, EZD-018, EZD-007, EZD-016a |  |  |  |
| EZD-010 | 0 | Design tokens | questions | EZD-001 |  |  |  |
| EZD-011 | 0 | Shell: header card | planned | EZD-010, EZD-026a, EZD-016a |  |  |  |
| EZD-012 | 0 | Shell: rail, panels, status bar | questions | EZD-010, EZD-026a, EZD-016a, EZD-011 |  |  |  |
| EZD-013 | 0 | PWA install | questions | EZD-012, EZD-016a, EZD-024 |  |  |  |
| EZD-014 | 0 | Device layouts | questions | EZD-012, EZD-026a, EZD-011, EZD-016a |  |  |  |
| EZD-015 | 0 | Shared state components | questions | EZD-010, EZD-026a, EZD-016a, EZD-014, EZD-011 |  |  |  |
| EZD-016a | 0 | Test harness | questions | EZD-007, EZD-002, EZD-006 |  |  |  |
| EZD-016b | 0 | Fixtures | questions | EZD-016a |  |  |  |
| EZD-017 | 0 | Performance budgets and benchmark | questions | EZD-016, EZD-012 |  |  |  |
| EZD-018 | 0 | Realtime channels | questions | EZD-006, EZD-007, EZD-016a |  |  |  |
| EZD-019 | 0 | EZ Binder contract and stub | questions | EZD-016, EZD-022 |  |  |  |
| EZD-020 | 0 | Entry points and lazy chunks | questions | EZD-017, EZD-014, EZD-015 |  |  |  |
| EZD-021 | 0 | AI client and stubs | questions | EZD-009, EZD-016 |  |  |  |
| EZD-022 | 0 | Event registry | planned | EZD-001 |  |  |  |
| EZD-000 | 0 | Architecture conventions | questions | — |  |  |  |
| EZD-023a | 0 | Release safety: migration check | planned | EZD-002, EZD-004 |  |  | Split from EZD-023 (Q-0042) |
| EZD-023b | 0 | Environments, promote and rollback | questions | EZD-023a, EZD-004, EZD-008 |  |  | Split from EZD-023 (Q-0042) |
| EZD-024 | 0 | Error reporting | questions | EZD-008, EZD-009, EZD-026a, EZD-016a, EZD-022 |  |  |  |
| EZD-025 | 0 | Off-site backups and restore script | questions | EZD-004, EZD-009, EZD-023b, EZD-005, EZD-006 |  |  |  |
| EZD-026a | 0 | Message helper: helper, catalogs, lint | questions | EZD-001, EZD-010 |  |  | Split from EZD-026 (Q-0028) |
| EZD-026b | 0 | Message helper: language from the user record | questions | EZD-026a, EZD-005, EZD-006, EZD-007, EZD-016a |  |  | Split from EZD-026 (Q-0028) |
| EZD-027 | 0 | Spike: plan canvas on the iPad | questions | EZD-012, EZD-016a |  |  |  |
| EZD-028 | 0 | Spike: PDF from a drawing list | questions | EZD-001, EZD-010 |  |  |  |
| EZD-029 | 0 | Spike: DXF parser | questions | EZD-016, EZD-000 |  |  |  |
| EZD-030 | 0 | Spike: wall openings and sloped ceiling | planned | EZD-001 |  |  |  |
| EZD-031 | 0 | Spike: render trial | questions | EZD-021 |  |  |  |
| EZD-032 | 0 | Phase 0 build-gate test | todo | EZD-007, EZD-011, EZD-012, EZD-014, EZD-016a, EZD-017 |  |  | Added at plan review (Q-0085) |
| EZD-101 | 1 | Permission and role tables | todo | EZD-005 |  |  |  |
| EZD-102 | 1 | Permission enforcement | todo | EZD-101, EZD-006 |  |  |  |
| EZD-103 | 1 | Settings shell | todo | EZD-102, EZD-012 |  |  |  |
| EZD-104 | 1 | Users table | todo | EZD-103 |  |  |  |
| EZD-105 | 1 | Invite user | todo | EZD-104, EZD-008 |  |  |  |
| EZD-106 | 1 | User inspector | todo | EZD-104 |  |  |  |
| EZD-107 | 1 | Custom roles | todo | EZD-106 |  |  |  |
| EZD-108 | 1 | Avatar menu and My profile | todo | EZD-103 |  |  |  |
| EZD-109 | 1 | Event log | todo | EZD-005, EZD-106 |  |  |  |
| EZD-110 | 1 | Notifications | todo | EZD-008, EZD-018 |  |  |  |
| EZD-111 | 1 | Send dialog with Copy link | todo | EZD-110, EZD-120 |  |  |  |
| EZD-112 | 1 | Company settings: identity | todo | EZD-103, EZD-132 |  |  |  |
| EZD-113 | 1 | Customers | todo | EZD-112 |  |  |  |
| EZD-114 | 1 | EZ Binder connection and shared sign-on | todo | EZD-112, EZD-007, EZD-019 |  |  |  |
| EZD-115 | 1 | Customer and user sync | todo | EZD-113, EZD-114 |  |  |  |
| EZD-116 | 1 | Defaults framework | todo | EZD-103 |  |  |  |
| EZD-117a | 1 | Projects page: query and cards | todo | EZD-102, EZD-110 |  |  |  |
| EZD-117b | 1 | Projects page: header, search and states | todo | EZD-117a, EZD-015 |  |  |  |
| EZD-118 | 1 | New project wizard | todo | EZD-117, EZD-113 |  |  |  |
| EZD-119 | 1 | EZ Binder job picker | todo | EZD-118, EZD-114 |  |  |  |
| EZD-120a | 1 | Model tables, save function and checkpoints | todo | EZD-005, EZD-133 |  |  |  |
| EZD-120b | 1 | Model store, outbox and editor route | todo | EZD-120a, EZD-012, EZD-117 |  |  |  |
| EZD-121 | 1 | Sent versions and numbering | todo | EZD-120, EZD-111 |  |  |  |
| EZD-122 | 1 | Versions panel | todo | EZD-121 |  |  |  |
| EZD-123 | 1 | Version cleanup | todo | EZD-122, EZD-110, EZD-116 |  |  |  |
| EZD-124 | 1 | Project card menu | todo | EZD-117, EZD-121 |  |  |  |
| EZD-125 | 1 | Edit lock service | todo | EZD-120, EZD-109, EZD-110, EZD-116, EZD-018 |  |  |  |
| EZD-126 | 1 | Edit lock UI | todo | EZD-125, EZD-011 |  |  |  |
| EZD-127 | 1 | Review pill | todo | EZD-117 |  |  |  |
| EZD-128 | 1 | Project switcher | todo | EZD-117 |  |  |  |
| EZD-129 | 1 | User project scope | todo | EZD-106, EZD-006 |  |  |  |
| EZD-130 | 1 | Project settings dialog | todo | EZD-118, EZD-116, EZD-128 |  |  |  |
| EZD-131 | 1 | Libraries shell | todo | EZD-103 |  |  |  |
| EZD-132 | 1 | File storage | todo | EZD-006 |  |  |  |
| EZD-133 | 1 | Access and money-field harness | todo | EZD-102, EZD-006 |  |  |  |
| EZD-134 | 1 | App-shell cache and device storage | todo | EZD-013, EZD-120 |  |  |  |
| EZD-135 | 1 | System status page | todo | EZD-103, EZD-024, EZD-025 |  |  |  |
| EZD-201 | 2 | Length parse and format | todo | EZD-001 |  |  |  |
| EZD-202 | 2 | Model document schema | todo | EZD-120 |  |  |  |
| EZD-203 | 2 | Walls core | todo | EZD-202 |  |  |  |
| EZD-204 | 2 | Openings core | todo | EZD-203 |  |  |  |
| EZD-205 | 2 | Rooms and closure | todo | EZD-203 |  |  |  |
| EZD-206 | 2 | Snapping | todo | EZD-203 |  |  |  |
| EZD-207 | 2 | Plan canvas | todo | EZD-012, EZD-202, EZD-017, EZD-020, EZD-236, EZD-238 |  |  |  |
| EZD-208 | 2 | Selection | todo | EZD-207 |  |  |  |
| EZD-209 | 2 | Typed dimension bar | todo | EZD-201, EZD-207 |  |  |  |
| EZD-210 | 2 | Wall and Room rectangle tools | todo | EZD-205, EZD-209 |  |  |  |
| EZD-211 | 2 | Door and window tools | todo | EZD-204, EZD-209 |  |  |  |
| EZD-212 | 2 | Move, handles, distance chips | todo | EZD-208 |  |  |  |
| EZD-213 | 2 | Inspector fields | todo | EZD-208 |  |  |  |
| EZD-214 | 2 | Status and phase switch | todo | EZD-213 |  |  |  |
| EZD-215 | 2 | Bearing wall rule | todo | EZD-213, EZD-132 |  |  |  |
| EZD-216 | 2 | Dimensions and text | todo | EZD-207, EZD-235 |  |  |  |
| EZD-217 | 2 | Undo, redo and clipboard | todo | EZD-208 |  |  |  |
| EZD-218 | 2 | Left panel: Layers and Rooms | todo | EZD-214, EZD-132 |  |  |  |
| EZD-219 | 2 | Status bar popovers | todo | EZD-206 |  |  |  |
| EZD-220 | 2 | Existing-condition pins | todo | EZD-213, EZD-132 |  |  |  |
| EZD-221 | 2 | Blank templates | todo | EZD-210, EZD-118 |  |  |  |
| EZD-222 | 2 | Keyboard shortcuts and Help | todo | EZD-116, EZD-012 |  |  |  |
| EZD-223 | 2 | Sketch tool | todo | EZD-207, EZD-108 |  |  |  |
| EZD-224 | 2 | Plan thumbnail | todo | EZD-207 |  |  |  |
| EZD-225 | 2 | Editor states | todo | EZD-126, EZD-204 |  |  |  |
| EZD-226 | 2 | Custom tile shower objects | todo | EZD-234 |  |  |  |
| EZD-227 | 2 | Grab-bar blocking | todo | EZD-234 |  |  |  |
| EZD-228 | 2 | Bath clearance check | todo | EZD-226, EZD-116 |  |  |  |
| EZD-229 | 2 | Existing-condition details | todo | EZD-220 |  |  |  |
| EZD-230 | 2 | Default key map and full rail | todo | EZD-222 |  |  |  |
| EZD-231 | 2 | Measure tool (plan) | todo | EZD-206, EZD-207 |  |  |  |
| EZD-232 | 2 | Manual revision cloud (plan) | todo | EZD-216 |  |  |  |
| EZD-233 | 2 | Context menu, mirror, align, groups | todo | EZD-217, EZD-131, EZD-234 |  |  |  |
| EZD-234 | 2 | Fixtures tool and utility points | todo | EZD-213 |  |  |  |
| EZD-235 | 2 | Derived values and workers | todo | EZD-205, EZD-207 |  |  |  |
| EZD-236 | 2 | Benchmark project generator | todo | EZD-202, EZD-017, EZD-120 |  |  |  |
| EZD-237 | 2 | Benchmark page | todo | EZD-207, EZD-236, EZD-135 |  |  |  |
| EZD-238 | 2 | Drawing list | todo | EZD-202 |  |  |  |
| EZD-301 | 3 | Upload step | todo | EZD-118, EZD-009, EZD-132 |  |  |  |
| EZD-302 | 3 | Polycam DXF detection | todo | EZD-301, EZD-202, EZD-016, EZD-029 |  |  |  |
| EZD-303 | 3 | Polycam GLB mesh | todo | EZD-301 |  |  |  |
| EZD-304 | 3 | PDF underlay and scale | todo | EZD-301 |  |  |  |
| EZD-305 | 3 | Vector PDF wall detection | todo | EZD-304 |  |  |  |
| EZD-306 | 3 | DXF conversion choice | todo | EZD-301, EZD-302 |  |  |  |
| EZD-307 | 3 | Import review screen | todo | EZD-302, EZD-303, EZD-012 |  |  |  |
| EZD-308 | 3 | Review modes | todo | EZD-307, EZD-116 |  |  |  |
| EZD-309 | 3 | Fix and delete | todo | EZD-307 |  |  |  |
| EZD-310 | 3 | Typed vs scan conflicts | todo | EZD-309, EZD-201 |  |  |  |
| EZD-311 | 3 | Resolve the gap | todo | EZD-310, EZD-205 |  |  |  |
| EZD-312 | 3 | Ceiling slope in review | todo | EZD-309, EZD-303 |  |  |  |
| EZD-313 | 3 | Finish and cancel | todo | EZD-308, EZD-310, EZD-311 |  |  |  |
| EZD-314 | 3 | Import states | todo | EZD-313, EZD-126 |  |  |  |
| EZD-315 | 3 | Laser keyboard input | todo | EZD-209, EZD-310 |  |  |  |
| EZD-401 | 4 | Catalog items (minimal) | todo | EZD-006 |  |  |  |
| EZD-402 | 4 | Cabinet object model | todo | EZD-202 |  |  |  |
| EZD-403 | 4 | Cabinet library panel | todo | EZD-402, EZD-401, EZD-404 |  |  |  |
| EZD-404 | 4 | Plan strip and elevation | todo | EZD-402, EZD-207 |  |  |  |
| EZD-405 | 4 | Box editing on canvas | todo | EZD-404 |  |  |  |
| EZD-406 | 4 | Box inspector | todo | EZD-405 |  |  |  |
| EZD-407 | 4 | Fit chip | todo | EZD-404, EZD-116 |  |  |  |
| EZD-408 | 4 | Auto-fill run | todo | EZD-407, EZD-234 |  |  |  |
| EZD-409 | 4 | Cabinet schedule | todo | EZD-406 |  |  |  |
| EZD-410 | 4 | Cabinet flags and states | todo | EZD-402, EZD-204 |  |  |  |
| EZD-411 | 4 | Countertop object model | todo | EZD-202 |  |  |  |
| EZD-412 | 4 | Trace and Draw outline | todo | EZD-411, EZD-404, EZD-116 |  |  |  |
| EZD-413 | 4 | Seams and cutouts | todo | EZD-412 |  |  |  |
| EZD-414 | 4 | Edges and overhangs | todo | EZD-412, EZD-116 |  |  |  |
| EZD-415 | 4 | Seating support check | todo | EZD-414 |  |  |  |
| EZD-416 | 4 | Left panel and status bar | todo | EZD-412 |  |  |  |
| EZD-417 | 4 | Edge profiles | todo | EZD-414 |  |  |  |
| EZD-418 | 4 | Top schedule | todo | EZD-416 |  |  |  |
| EZD-419 | 4 | Plan inspector: run selection | todo | EZD-406, EZD-409 |  |  |  |
| EZD-501 | 5 | Ceiling data per room | todo | EZD-202 |  |  |  |
| EZD-502 | 5 | RCP view and ceiling rail | todo | EZD-207, EZD-501, EZD-127 |  |  |  |
| EZD-503 | 5 | Ceiling type editor | todo | EZD-501, EZD-303 |  |  |  |
| EZD-504 | 5 | Walls cut under slopes | todo | EZD-503 |  |  |  |
| EZD-505 | 5 | Beams | todo | EZD-501 |  |  |  |
| EZD-506 | 5 | Section A-A preview | todo | EZD-505 |  |  |  |
| EZD-507 | 5 | Ceiling devices | todo | EZD-501 |  |  |  |
| EZD-508 | 5 | Fixture schedule panel | todo | EZD-507 |  |  |  |
| EZD-509 | 5 | Auto-layout cans | todo | EZD-507, EZD-116 |  |  |  |
| EZD-510 | 5 | Switching zones | todo | EZD-507 |  |  |  |
| EZD-511 | 5 | ACT grid | todo | EZD-501, EZD-116 |  |  |  |
| EZD-512 | 5 | HVAC objects | todo | EZD-511 |  |  |  |
| EZD-513 | 5 | Soffits, trays, coffers, crown, tags | todo | EZD-501 |  |  |  |
| EZD-514 | 5 | Framing known and keep-clear | todo | EZD-507 |  |  |  |
| EZD-515 | 5 | Fan clearance and hosted flags | todo | EZD-507, EZD-505, EZD-116 |  |  |  |
| EZD-516 | 5 | Beam finish, More menu, canvas | todo | EZD-505, EZD-401 |  |  |  |
| EZD-601 | 6 | Electrical mode and left panel | todo | EZD-207, EZD-202 |  |  |  |
| EZD-602 | 6 | Device toolbar | todo | EZD-601, EZD-507 |  |  |  |
| EZD-603 | 6 | Device height notes | todo | EZD-602, EZD-116 |  |  |  |
| EZD-604 | 6 | Circuits | todo | EZD-602 |  |  |  |
| EZD-605 | 6 | Switch legs | todo | EZD-604, EZD-510 |  |  |  |
| EZD-606 | 6 | Panel and existing panel dialog | todo | EZD-604, EZD-021 |  |  |  |
| EZD-607 | 6 | Load calc engine | todo | EZD-604 |  |  |  |
| EZD-608 | 6 | Load calc inspector | todo | EZD-607, EZD-116 |  |  |  |
| EZD-609 | 6 | Panel schedule | todo | EZD-604 |  |  |  |
| EZD-610 | 6 | Selected circuit and voltage drop | todo | EZD-604, EZD-116 |  |  |  |
| EZD-611a | 6 | Code check engine and rule registry | todo | EZD-604, EZD-218, EZD-613 |  |  |  |
| EZD-611b | 6 | Code rules: Florida Residential Ch. 3 (1 of 4) | todo | EZD-611a, EZD-620, EZD-501, EZD-234 |  |  |  |
| EZD-611c | 6 | Code rules: Florida Residential Ch. 3 (2 of 4) | todo | EZD-611a, EZD-620, EZD-501, EZD-234 |  |  |  |
| EZD-612 | 6 | Check button and results | todo | EZD-611a |  |  |  |
| EZD-613 | 6 | Code edition settings | todo | EZD-116 |  |  |  |
| EZD-614 | 6 | Appliance rating defaults | todo | EZD-607, EZD-401, EZD-103 |  |  |  |
| EZD-615 | 6 | Load calc: optional method and cases | todo | EZD-607, EZD-606, EZD-608 |  |  |  |
| EZD-616 | 6 | Code rules: Florida Residential Ch. 3 (3 of 4) | todo | EZD-611a, EZD-620, EZD-501, EZD-234 |  |  |  |
| EZD-617 | 6 | Code rules: Florida Residential Ch. 3 (4 of 4) | todo | EZD-611a, EZD-620, EZD-501, EZD-234 |  |  |  |
| EZD-618 | 6 | Code rules: Existing Building | todo | EZD-611a, EZD-620 |  |  |  |
| EZD-620 | 6 | Code data fields | todo | EZD-611a, EZD-130, EZD-213 |  |  |  |
| EZD-621 | 6 | Code rules: Florida construction chapters (1 of 2) | todo | EZD-611a, EZD-620, EZD-501 |  |  |  |
| EZD-622 | 6 | Code rules: Florida construction chapters (2 of 2) | todo | EZD-611a, EZD-620, EZD-501 |  |  |  |
| EZD-623 | 6 | Code rules: Energy Conservation | todo | EZD-611a, EZD-620, EZD-507 |  |  |  |
| EZD-624 | 6 | Code rules: Mechanical (1 of 2) | todo | EZD-611a, EZD-620, EZD-234 |  |  |  |
| EZD-625 | 6 | Code rules: Mechanical (2 of 2) | todo | EZD-611a, EZD-620, EZD-234 |  |  |  |
| EZD-626 | 6 | Code rules: Fuel gas | todo | EZD-611a, EZD-620, EZD-234 |  |  |  |
| EZD-627 | 6 | Code rules: Plumbing (1 of 3) | todo | EZD-611a, EZD-620, EZD-234, EZD-226 |  |  |  |
| EZD-628 | 6 | Code rules: Plumbing (2 of 3) | todo | EZD-611a, EZD-620, EZD-234, EZD-226 |  |  |  |
| EZD-629 | 6 | Code rules: Plumbing (3 of 3) | todo | EZD-611a, EZD-620, EZD-234, EZD-226 |  |  |  |
| EZD-630 | 6 | Code rules: NEC Art. 100-230 (1 of 4) | todo | EZD-611a, EZD-620, EZD-604, EZD-411 |  |  |  |
| EZD-631 | 6 | Code rules: NEC Art. 100-230 (2 of 4) | todo | EZD-611a, EZD-620, EZD-604, EZD-411 |  |  |  |
| EZD-632 | 6 | Code rules: NEC Art. 100-230 (3 of 4) | todo | EZD-611a, EZD-620, EZD-604, EZD-411 |  |  |  |
| EZD-633 | 6 | Code rules: NEC Art. 100-230 (4 of 4) | todo | EZD-611a, EZD-620, EZD-604, EZD-411 |  |  |  |
| EZD-634 | 6 | Code rules: NEC Art. 240-410 (1 of 4) | todo | EZD-611a, EZD-620, EZD-604, EZD-610 |  |  |  |
| EZD-635 | 6 | Code rules: NEC Art. 240-410 (2 of 4) | todo | EZD-611a, EZD-620, EZD-604, EZD-610 |  |  |  |
| EZD-636 | 6 | Code rules: NEC Art. 240-410 (3 of 4) | todo | EZD-611a, EZD-620, EZD-604, EZD-610 |  |  |  |
| EZD-637 | 6 | Code rules: NEC Art. 240-410 (4 of 4) | todo | EZD-611a, EZD-620, EZD-604, EZD-610 |  |  |  |
| EZD-638 | 6 | Code rules: NEC Art. 422-820 (1 of 2) | todo | EZD-611a, EZD-620, EZD-604, EZD-234 |  |  |  |
| EZD-639 | 6 | Code rules: NEC Art. 422-820 (2 of 2) | todo | EZD-611a, EZD-620, EZD-604, EZD-234 |  |  |  |
| EZD-701 | 7 | Sheet model and default set | todo | EZD-202 |  |  |  |
| EZD-702a | 7 | Sheets screen | todo | EZD-701, EZD-726 |  |  |  |
| EZD-702b | 7 | Sheet renderer | todo | EZD-702a, EZD-235, EZD-238 |  |  |  |
| EZD-703 | 7 | Viewports and scales | todo | EZD-702, EZD-214 |  |  |  |
| EZD-704 | 7 | Sheet annotation tools | todo | EZD-702 |  |  |  |
| EZD-705 | 7 | Print rules | todo | EZD-703 |  |  |  |
| EZD-706 | 7 | Symbol key | todo | EZD-702 |  |  |  |
| EZD-707 | 7 | Elevations sheet | todo | EZD-703, EZD-404 |  |  |  |
| EZD-708a | 7 | A6.0 RCP sheet | todo | EZD-703, EZD-508 |  |  |  |
| EZD-708b | 7 | E1.0 electrical plan | todo | EZD-703, EZD-604, EZD-708a |  |  |  |
| EZD-708c | 7 | E2.0 panel schedule and load calc | todo | EZD-708b, EZD-609, EZD-607 |  |  |  |
| EZD-709 | 7 | Title block settings | todo | EZD-112, EZD-701 |  |  |  |
| EZD-710 | 7 | Title block on sheets | todo | EZD-709, EZD-130 |  |  |  |
| EZD-711 | 7 | Property appraiser import | todo | EZD-710, EZD-009, EZD-021, EZD-118 |  |  |  |
| EZD-712 | 7 | Submittal profiles | todo | EZD-116 |  |  |  |
| EZD-713 | 7 | Department profile settings | todo | EZD-712 |  |  |  |
| EZD-714 | 7 | Notes library | todo | EZD-712 |  |  |  |
| EZD-715 | 7 | PDF export job | todo | EZD-705, EZD-713, EZD-238, EZD-028 |  |  |  |
| EZD-716 | 7 | Issue checklist | todo | EZD-612, EZD-710 |  |  |  |
| EZD-717 | 7 | Issue Rev 0 and Rev N | todo | EZD-715, EZD-716, EZD-121 |  |  |  |
| EZD-718 | 7 | Revision clouds and log | todo | EZD-717 |  |  |  |
| EZD-719 | 7 | Send set to client | todo | EZD-717, EZD-111 |  |  |  |
| EZD-720 | 7 | Client set content | todo | EZD-701, EZD-418, EZD-726 |  |  |  |
| EZD-721 | 7 | Export menu | todo | EZD-715 |  |  |  |
| EZD-722 | 7 | Sheets states | todo | EZD-717 |  |  |  |
| EZD-723 | 7 | Download one page at a time | todo | EZD-715, EZD-713 |  |  |  |
| EZD-724 | 7 | Dismissible dimension warning | todo | EZD-716 |  |  |  |
| EZD-725 | 7 | Accepted warnings in the issue log | todo | EZD-717, EZD-612 |  |  |  |
| EZD-726 | 7 | Sheet sets | todo | EZD-701 |  |  |  |
| EZD-727 | 7 | Submittal profile enforcement at issue | todo | EZD-712, EZD-713, EZD-715 |  |  |  |
| EZD-728 | 7 | Cover sheet A0.0 | todo | EZD-706, EZD-714 |  |  |  |
| EZD-801 | 8 | Detail data and editor shell | todo | EZD-202, EZD-012 |  |  |  |
| EZD-802 | 8 | New detail dialog | todo | EZD-801 |  |  |  |
| EZD-803 | 8 | Drawing tools | todo | EZD-801, EZD-201 |  |  |  |
| EZD-804 | 8 | Line roles and hatches | todo | EZD-803 |  |  |  |
| EZD-805 | 8 | Annotation tools | todo | EZD-803 |  |  |  |
| EZD-806 | 8 | Parts | todo | EZD-801, EZD-817 |  |  |  |
| EZD-807 | 8 | Scale and NTS | todo | EZD-805, EZD-116 |  |  |  |
| EZD-808 | 8 | Steps and layers | todo | EZD-801 |  |  |  |
| EZD-809 | 8 | Legibility warnings | todo | EZD-805 |  |  |  |
| EZD-810 | 8 | Place on sheet | todo | EZD-809, EZD-702 |  |  |  |
| EZD-811 | 8 | Cut from model and callouts | todo | EZD-802, EZD-207 |  |  |  |
| EZD-812 | 8 | Underlay start | todo | EZD-802, EZD-304 |  |  |  |
| EZD-813 | 8 | Extrude to 3D | todo | EZD-803 |  |  |  |
| EZD-814 | 8 | Detail library and countertop link | todo | EZD-801, EZD-415, EZD-817 |  |  |  |
| EZD-815 | 8 | Detail PDF export | todo | EZD-810, EZD-721 |  |  |  |
| EZD-816 | 8 | Freehand pen | todo | EZD-803, EZD-223 |  |  |  |
| EZD-817 | 8 | Detail libraries in Settings | todo | EZD-801, EZD-131 |  |  |  |
| EZD-901a | 9 | Reference conversion job | todo | EZD-306, EZD-009, EZD-016, EZD-029 |  |  |  |
| EZD-901b | 9 | Reference drawing in Plan | todo | EZD-901a, EZD-207, EZD-235, EZD-017 |  |  |  |
| EZD-902 | 9 | Reference under the model | todo | EZD-901 |  |  |  |
| EZD-903 | 9 | Alignment | todo | EZD-902, EZD-904 |  |  |  |
| EZD-904 | 9 | Reference layers panel | todo | EZD-901 |  |  |  |
| EZD-905 | 9 | Paper-space layouts | todo | EZD-901 |  |  |  |
| EZD-906 | 9 | Convert layers | todo | EZD-904, EZD-307, EZD-306 |  |  |  |
| EZD-907 | 9 | Markup layer | todo | EZD-902, EZD-904 |  |  |  |
| EZD-908 | 9 | Reference versions | todo | EZD-904, EZD-921 |  |  |  |
| EZD-909a | 9 | Reference diff job | todo | EZD-908, EZD-907, EZD-116 |  |  |  |
| EZD-909b | 9 | Reference diff view | todo | EZD-909a |  |  |  |
| EZD-910 | 9 | Keep or accept a revision | todo | EZD-909 |  |  |  |
| EZD-911 | 9 | Export markup | todo | EZD-907, EZD-913, EZD-715 |  |  |  |
| EZD-912 | 9 | Section or callout from reference | todo | EZD-902, EZD-811 |  |  |  |
| EZD-913 | 9 | DXF export | todo | EZD-901, EZD-721 |  |  |  |
| EZD-914 | 9 | Supplier files panel | todo | EZD-301 |  |  |  |
| EZD-915 | 9 | Supplier vector PDF import | todo | EZD-914, EZD-305 |  |  |  |
| EZD-916 | 9 | 2020 order report import | todo | EZD-914, EZD-307, EZD-021 |  |  |  |
| EZD-917 | 9 | Tag and link tools | todo | EZD-914, EZD-404, EZD-907 |  |  |  |
| EZD-918 | 9 | Read codes | todo | EZD-917, EZD-916, EZD-021 |  |  |  |
| EZD-919 | 9 | Compare and resolve mismatches | todo | EZD-917, EZD-407, EZD-111 |  |  |  |
| EZD-920 | 9 | Suggested finishes | todo | EZD-917, EZD-401, EZD-021 |  |  |  |
| EZD-921 | 9 | Architect revision labels | todo | EZD-904 |  |  |  |
| EZD-922a | 9 | Reference states (screen 11) | todo | EZD-911 |  |  |  |
| EZD-922b | 9 | Supplier markup states (screen 12) | todo | EZD-919 |  |  |  |
| EZD-1001a | 10 | 3D scene core | todo | EZD-207, EZD-020, EZD-235, EZD-030 |  |  |  |
| EZD-1001b | 10 | 3D ceilings and beams | todo | EZD-1001a, EZD-504, EZD-505 |  |  |  |
| EZD-1001c | 10 | 3D cabinets, fixtures, devices and finishes | todo | EZD-1001b, EZD-402, EZD-414, EZD-234, EZD-226, EZD-602, EZD-401 |  |  |  |
| EZD-1002 | 10 | Navigation | todo | EZD-1001 |  |  |  |
| EZD-1003 | 10 | Walk and Look up | todo | EZD-1002, EZD-116 |  |  |  |
| EZD-1004 | 10 | Section and display modes | todo | EZD-1002 |  |  |  |
| EZD-1005 | 10 | 3D layers | todo | EZD-1001, EZD-303 |  |  |  |
| EZD-1006 | 10 | Saved views | todo | EZD-1002 |  |  |  |
| EZD-1007 | 10 | Select and apply finish | todo | EZD-1001, EZD-401, EZD-505 |  |  |  |
| EZD-1008 | 10 | Rail on the 3D tab | todo | EZD-1002, EZD-612 |  |  |  |
| EZD-1009 | 10 | Design options data | todo | EZD-202 |  |  |  |
| EZD-1010 | 10 | Options inspector | todo | EZD-1009, EZD-1001 |  |  |  |
| EZD-1011 | 10 | Make options from the RCP | todo | EZD-1010, EZD-505 |  |  |  |
| EZD-1012 | 10 | Measure in 3D | todo | EZD-1002 |  |  |  |
| EZD-1013 | 10 | Phone 3D viewer | todo | EZD-1012, EZD-014 |  |  |  |
| EZD-1014 | 10 | GLB and USDZ export | todo | EZD-1001, EZD-721 |  |  |  |
| EZD-1015 | 10 | iPad memory guard and states | todo | EZD-1001 |  |  |  |
| EZD-1017 | 10 | Inspector 3D preview | todo | EZD-1001 |  |  |  |
| EZD-1101 | 11 | Render records and jobs | todo | EZD-009, EZD-1006 |  |  |  |
| EZD-1102 | 11 | Render models settings | todo | EZD-116 |  |  |  |
| EZD-1103 | 11 | Provider adapters | todo | EZD-1101, EZD-1102, EZD-021 |  |  |  |
| EZD-1104a | 11 | Local worker protocol | todo | EZD-1103, EZD-116 |  |  |  |
| EZD-1104b | 11 | Local worker program | todo | EZD-1104a |  |  |  |
| EZD-1105 | 11 | Browser path tracer | todo | EZD-1001, EZD-1109 |  |  |  |
| EZD-1106 | 11 | Step 1: angle | todo | EZD-1006, EZD-1101 |  |  |  |
| EZD-1107 | 11 | Preview and optional alignment | todo | EZD-1106 |  |  |  |
| EZD-1108 | 11 | Step 2: style and direction | todo | EZD-1107, EZD-401 |  |  |  |
| EZD-1109 | 11 | Tiers and Generate | todo | EZD-1108, EZD-1103 |  |  |  |
| EZD-1110 | 11 | Renders list and notifications | todo | EZD-1109, EZD-110, EZD-127 |  |  |  |
| EZD-1111 | 11 | Render view | todo | EZD-1110 |  |  |  |
| EZD-1112 | 11 | Comment pins | todo | EZD-1111 |  |  |  |
| EZD-1113 | 11 | Fix and regenerate | todo | EZD-1111 |  |  |  |
| EZD-1114 | 11 | Two-step approval | todo | EZD-1111 |  |  |  |
| EZD-1115 | 11 | Model changed detection | todo | EZD-1114, EZD-1001, EZD-1109, EZD-127 |  |  |  |
| EZD-1116 | 11 | Download | todo | EZD-1111 |  |  |  |
| EZD-1117 | 11 | Render allowance | todo | EZD-1102, EZD-110 |  |  |  |
| EZD-1118 | 11 | Render A/B/C from 3D | todo | EZD-1109, EZD-1010 |  |  |  |
| EZD-1119 | 11 | R1.0 finish schedule + renders | todo | EZD-1114, EZD-716, EZD-401 |  |  |  |
| EZD-1120 | 11 | Local worker: real runner | todo | EZD-1104b |  |  |  |
| EZD-1121 | 11 | Second provider adapter | todo | EZD-1103 |  |  |  |
| EZD-1201 | 12 | Share links | todo | EZD-111, EZD-116 |  |  |  |
| EZD-1202 | 12 | Client page shell | todo | EZD-1201, EZD-020 |  |  |  |
| EZD-1203 | 12 | Render gallery | todo | EZD-1202, EZD-1114 |  |  |  |
| EZD-1204 | 12 | Client comments | todo | EZD-1203, EZD-1112 |  |  |  |
| EZD-1205 | 12 | Plans tab | todo | EZD-1202, EZD-702, EZD-1215 |  |  |  |
| EZD-1206 | 12 | Send options to client | todo | EZD-1010, EZD-1201, EZD-121 |  |  |  |
| EZD-1207 | 12 | Option choice | todo | EZD-1206, EZD-1215 |  |  |  |
| EZD-1208 | 12 | Selection offers and choice pages | todo | EZD-1202, EZD-417 |  |  |  |
| EZD-1209 | 12 | Edge choice | todo | EZD-1208, EZD-417 |  |  |  |
| EZD-1210 | 12 | Verify and sign | todo | EZD-1208, EZD-113 |  |  |  |
| EZD-1211 | 12 | Approve | todo | EZD-1210 |  |  |  |
| EZD-1212 | 12 | Selections PDF | todo | EZD-1211 |  |  |  |
| EZD-1213 | 12 | Send image | todo | EZD-1114, EZD-111 |  |  |  |
| EZD-1214 | 12 | Archive options on signing | todo | EZD-1009, EZD-1211 |  |  |  |
| EZD-1215 | 12 | Send to client composer | todo | EZD-1201, EZD-1208, EZD-401 |  |  |  |
| EZD-1301 | 13 | Webhook delivery | todo | EZD-114, EZD-109, EZD-116, EZD-022, EZD-009, EZD-019 |  |  |  |
| EZD-1302 | 13 | Outbound event payloads | todo | EZD-1301 |  |  |  |
| EZD-1303 | 13 | Inbound API authentication | todo | EZD-114, EZD-019 |  |  |  |
| EZD-1304 | 13 | Inbound: create project from job | todo | EZD-1303, EZD-119 |  |  |  |
| EZD-1305 | 13 | Inbound: open with shared sign-on | todo | EZD-1303 |  |  |  |
| EZD-1306 | 13 | Inbound: read approved data | todo | EZD-1303, EZD-1211, EZD-717, EZD-1114 |  |  |  |
| EZD-1307 | 13 | Inbound: mark CO approved | todo | EZD-1303, EZD-1308 |  |  |  |
| EZD-1308 | 13 | CO draft data and entry points | todo | EZD-717, EZD-122 |  |  |  |
| EZD-1309 | 13 | Before and after images | todo | EZD-1308, EZD-1114 |  |  |  |
| EZD-1310 | 13 | Scope text | todo | EZD-1308, EZD-009, EZD-021 |  |  |  |
| EZD-1311 | 13 | Line items and schedule impact | todo | EZD-1308 |  |  |  |
| EZD-1312 | 13 | Save draft and Send to EZ Binder | todo | EZD-1309, EZD-1311, EZD-1302 |  |  |  |
| EZD-1314 | 13 | Canonical event registry | todo | EZD-1301, EZD-022 |  |  |  |
| EZD-1401 | 14 | Service worker cache | todo | EZD-134 |  |  |  |
| EZD-1402 | 14 | Offline change queue | todo | EZD-1401, EZD-120 |  |  |  |
| EZD-1403 | 14 | Offline editing and conflicts | todo | EZD-1402, EZD-125 |  |  |  |
| EZD-1404 | 14 | Field pack shell | todo | EZD-1401, EZD-1305 |  |  |  |
| EZD-1405 | 14 | Plan and 3D tabs | todo | EZD-1404, EZD-1013 |  |  |  |
| EZD-1406 | 14 | Measure tab | todo | EZD-1405, EZD-315 |  |  |  |
| EZD-1407 | 14 | Send measurement and Flag conflict | todo | EZD-1406, EZD-1402 |  |  |  |
| EZD-1408 | 14 | Field task templates and publishing | todo | EZD-131, EZD-021 |  |  |  |
| EZD-1409 | 14 | Tasks tab | todo | EZD-1408, EZD-1402, EZD-1404 |  |  |  |
| EZD-1410 | 14 | Photo tab and pins | todo | EZD-1405, EZD-1402, EZD-1407 |  |  |  |
| EZD-1411 | 14 | Field pack PDF | todo | EZD-1405, EZD-1421, EZD-715 |  |  |  |
| EZD-1412 | 14 | Stale actions on reconnect | todo | EZD-1402, EZD-717 |  |  |  |
| EZD-1413 | 14 | Field measurements review | todo | EZD-1407, EZD-310, EZD-127, EZD-125 |  |  |  |
| EZD-1414 | 14 | Field conflicts list | todo | EZD-1407, EZD-127 |  |  |  |
| EZD-1415 | 14 | Field measure: shapes and walls | todo | EZD-1401 |  |  |  |
| EZD-1416 | 14 | Field measure: keypad and closure | todo | EZD-1415 |  |  |  |
| EZD-1417 | 14 | Field measure: offline save and send | todo | EZD-1416, EZD-1402, EZD-110 |  |  |  |
| EZD-1418 | 14 | Field measure into Import review | todo | EZD-1417, EZD-307 |  |  |  |
| EZD-1419 | 14 | Field measure entry points and states | todo | EZD-1415, EZD-1404, EZD-118, EZD-1305, EZD-1406 |  |  |  |
| EZD-1420 | 14 | Field tasks screen | todo | EZD-1408, EZD-1409 |  |  |  |
| EZD-1421 | 14 | Issue field pack | todo | EZD-1420, EZD-129, EZD-1404 |  |  |  |
| EZD-1422 | 14 | Field measure as wizard input | todo | EZD-118, EZD-1419 |  |  |  |
| EZD-1501 | 15 | Translation store | todo | EZD-006 |  |  |  |
| EZD-1502 | 15 | AI drafting | todo | EZD-1501, EZD-009, EZD-021, EZD-110 |  |  |  |
| EZD-1503 | 15 | Spanish display | todo | EZD-1501, EZD-1404, EZD-026 |  |  |  |
| EZD-1504 | 15 | Review table | todo | EZD-1501, EZD-103 |  |  |  |
| EZD-1505 | 15 | Review card actions | todo | EZD-1504 |  |  |  |
| EZD-1506 | 15 | Draft warnings | todo | EZD-1504 |  |  |  |
| EZD-1507 | 15 | Glossary | todo | EZD-1504 |  |  |  |
| EZD-1508 | 15 | Bulk approve | todo | EZD-1506 |  |  |  |
| EZD-1509 | 15 | Propagation | todo | EZD-1505 |  |  |  |
| EZD-1510 | 15 | Translation settings | todo | EZD-1504, EZD-716 |  |  |  |
| EZD-1601 | 16 | Catalog drawer | todo | EZD-401 |  |  |  |
| EZD-1602 | 16 | Place from catalog | todo | EZD-1601, EZD-234 |  |  |  |
| EZD-1603 | 16 | Add product: link | todo | EZD-1601, EZD-009, EZD-021 |  |  |  |
| EZD-1604 | 16 | Add product: paste text and screenshot | todo | EZD-1603, EZD-021 |  |  |  |
| EZD-1605 | 16 | Field confirmation | todo | EZD-1603 |  |  |  |
| EZD-1606 | 16 | Save and place | todo | EZD-1605 |  |  |  |
| EZD-1607 | 16 | Item detail | todo | EZD-1606 |  |  |  |
| EZD-1608 | 16 | Price snapshots and refresh | todo | EZD-1607 |  |  |  |
| EZD-1609 | 16 | Catalog settings | todo | EZD-103, EZD-1212 |  |  |  |
| EZD-1610 | 16 | Catalog states | todo | EZD-1601 |  |  |  |
| EZD-1611a | 16 | Takeoff framework and room finishes | todo | EZD-235, EZD-226, EZD-116 |  |  |  |
| EZD-1611b | 16 | Takeoff: cabinets, tops, fixtures and electrical | todo | EZD-1611a, EZD-418, EZD-604 |  |  |  |
| EZD-1611c | 16 | Takeoff: ACT, option costs and snapshot | todo | EZD-1611b, EZD-511, EZD-1010, EZD-121 |  |  |  |
| EZD-1612 | 16 | Waste factors | todo | EZD-1611, EZD-116 |  |  |  |
| EZD-1613 | 16 | Takeoff screen | todo | EZD-1611 |  |  |  |
| EZD-1614 | 16 | Tile layout preview | todo | EZD-1612, EZD-1001 |  |  |  |
| EZD-1615 | 16 | Takeoff CSV | todo | EZD-1613 |  |  |  |
| EZD-1616 | 16 | Catalog on the standard rail | todo | EZD-1601, EZD-230 |  |  |  |
| EZD-1617 | 16 | Catalog settings: markup per category and edge library | todo | EZD-1601, EZD-1609 |  |  |  |
| EZD-1701 | 17 | Performance targets | todo | EZD-1001, EZD-901 |  |  |  |
| EZD-1702 | 17 | DXF size limits | todo | EZD-1701 |  |  |  |
| EZD-1704 | 17 | Backups | todo | EZD-025 |  |  |  |
| EZD-1705 | 17 | Security review | todo | EZD-1302, EZD-1211 |  |  |  |
| EZD-1706 | 17 | Event log coverage | todo | EZD-109 |  |  |  |
| EZD-1707 | 17 | Terms of service | todo | EZD-007 |  |  |  |
| EZD-1708 | 17 | Accessibility pass | todo | EZD-222 |  |  |  |
| EZD-1709a | 17 | Screen states: Projects and Settings | todo | EZD-016 |  |  |  |
| EZD-1709b | 17 | Screen states: editor tabs | todo | EZD-1709a, EZD-1613 |  |  |  |
| EZD-1709c | 17 | Screen states: phone and client screens | todo | EZD-1709b |  |  |  |
| EZD-1710 | 17 | Code rule list and verification | todo | EZD-611, EZD-613, EZD-620 |  |  |  |
