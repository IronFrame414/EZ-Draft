# Live signed-in UI audit, 2026-11-24 (EZD-1960)

Follow-up to the 2026-11-23 audit (`vault/plans/audit-2026-11-23.md`, Area 7). That audit could not sign in (U12) and left
U4 unverified. This pass signed in and looked at every screen U12 names. It is a report only: no app code was changed.

## How it was run

- **Database.** The base stack (lane 0, port 54321) was brought up to date with EZD-1959's
  `node scripts/db/local.mjs base` (run with `EZD_LANE` unset). Its output: "Newest migration applied: 20261124150000",
  "sign_in_throttle_take passed the API request gate (HTTP 200, allowed true)". `base` resets the database, so the data
  is the seed: tenant 1, owner `josh@example.com`, 200 empty "Seed project NNN" projects.
- **App.** A production build (`next build`, then `next start -p 3960 -H 127.0.0.1`) from this worktree. Port 3960 is
  not 3000 and not a lane port (3010/3020/3030). The server ran with the same stub settings as the e2e web server in
  `app/playwright.config.ts` (email, Sentry and AI stubs, no captcha, the net-guard preload), so nothing live was called.
- **Browser run.** `audit/ui-live-2026-11-24/screens.audit.ts`, run with
  `AUDIT_ENV=<file with the local.mjs env JSON> env -u EZD_LANE npx playwright test -c audit/ui-live-2026-11-24/audit.config.ts`
  from the repo root while the app runs on 3960. It is not a gate test (its own config, `*.audit.ts`). Sign-in uses
  the app's real link page (`/auth/confirm`, as `app/test-harness/e2e/sign-in-as.ts` does); U4 uses the sign-in page.
- **Profiles.** Desktop 1600 × 1000. iPad: Playwright's `iPad Pro 11 landscape` at 1180 × 820 (isMobile and hasTouch,
  the same descriptor as the repo's `ipad-landscape` project, `app/test-harness/e2e/devices.ts`). Phone: `iPhone 13`
  at 390 × 844.
- **Proof the iPad profile took effect.** `notes.json` records `matchMedia('(any-pointer: coarse)')` per screen: `true`
  on every iPad and phone screen, `false` on every desktop screen. The typed bar on iPad shows "Next field" and
  "Cancel" (`screens/ipad-S03d-typed-bar.png`), the touch layout of `editor/typed-entry/TypedEntryLayer.tsx` that the
  2026-11-23 run did not get.
- **Touch targets.** Each iPad and phone screen ran the repo's own `expectTouchTargets(page, body)`
  (`app/test-harness/touch-targets.ts`). Its failure list was caught and saved, not asserted.
- **Two set-up steps the seed needed.** (1) One 12' × 10' room was drawn with Room rectangle so the tools had walls.
  (2) Send needs a client with an email, and no seed project has one. The script gave Seed project 001 a made-up
  customer ("Audit client", `audit-client@example.test`) through the service-role client, then sent it, to get a real
  client link for S18. Both changes live only in the base stack; the next `db:base` removes them.
- **Not reachable with seed data.** The S03b conflict list (needs two people saving at once), a populated field pack (nothing is issued: `phone-S17-field-pack.png` shows "No field
  pack issued yet."), import review steps 2 and 3 (no file uploaded), render setup and render view (S08, S08b: no
  Render tab, see F2), S10 detail editor, S11 DXF reference (needs a DXF), the
  supplier compare view. The repo's e2e specs cover these states with fixtures.
- Console errors: none on any screen except the expected 404 resource error on `/no-such-page`.
- 65 screens in `screens/` (the desktop pass was run a second time after the gate to add S09 and a real wall selection; the room drawn by the first pass was already there, so `desktop-S03-plan-empty.png` shows it, and Send made a second version), per-screen notes (URL, HTTP status, any-pointer, console errors, touch results) in
  `screens/notes.json`.

## U4: after signing in from a deep link, does the person land where they asked? **No.**

Signed out, `/settings/users` answered with the sign-in page at `/sign-in` with no query string
(`screens/desktop-U4-deep-link-signed-out.png`). After signing in with email and password on that page, the person
landed on `/` (Projects), not `/settings/users` (`screens/desktop-U4-after-sign-in.png`).

Cause: the request gate redirects to a bare `/sign-in` and keeps no return address, by its own design note
("a 307 to /sign-in with no query string", `app/src/proxy.ts:2`; redirects at `app/src/proxy.ts:48` and
`app/src/proxy.ts:91`). The sign-in page sends a signed-in person to `/` (`app/src/app/sign-in/page.tsx:23`).

This matters most for emailed links: a "New field pack issued" email or a notification link opened on a phone whose
session has ended lands on Projects, and the person has to find the job again. Fix: carry the asked-for path (same-origin,
path only, to avoid an open redirect) through sign-in and land there. The bare redirect was a planner's choice to avoid an
open redirect (`vault/architecture.md:644`, EZD-007d), not one of Josh's decisions (Q-0173 there is about cache headers),
so a same-origin return path keeps that safety. **technical.**

## Findings

Each row has one tag. **design-for-Josh** = a design or wording choice for Josh. **technical** = a bug or a clear gap
against the spec, mockup or a decision that an agent can fix. Items that an open ticket already covers are listed under "Not yet built" instead.

| # | Finding | Evidence | Who |
|---|---|---|---|
| F1 | **A client link sent today opens the staff sign-in page.** Send works and shows a link `/c/<token>`, but there is no `/c` page and `/c` is not a public path, so the client sees "Sign in to EZ Draft". The client page is EZD-1202 (phase 39, not built). Until then Send emails clients a link that cannot work. | `screens/desktop-S18-share-sent.png`, `screens/phone-S18-client-link.png`; `app/src/server/auth/public-paths.ts:4` (no `/c`); no `app/src/app/(client)/c` route | technical (hold Send until EZD-1202, or bring EZD-1202 forward) |
| F2 | **U4: deep links are lost at sign-in** (above). | `screens/desktop-U4-*.png`; `app/src/proxy.ts:48,91`; `app/src/app/sign-in/page.tsx:23` | technical |
| F3 | **Projects on a phone is unusable.** The grid stays at 4 columns at 390 px, so titles break one word per line; the header runs off the right edge, so search is cut off and the bell, settings and avatar cannot be reached; the status tabs run off too. Crews reach Field measure from this page on a phone (`app/e2e/field-measure-entry.spec.ts:58-65`). | `screens/phone-S01-projects.png`; `app/src/components/projects/Projects.module.css:173,416` (`repeat(4, …)`) | technical |
| F4 | **On iPad the edit bar covers Zoom in.** The edit bar (Undo … Paste) sits over the top of the zoom stack on every iPad plan screen, so "Zoom in" is covered (the touch check reports it "covered at center") and "Zoom out" shows a 44 × 24 tap area. In Electrical the tool strip is drawn over the edit bar, covering all eight of its buttons, and runs on over the top of the inspector card. | `screens/ipad-S03-plan.png`, `ipad-S03-tool-electrical.png`; `app/src/editor/plan/ZoomStack.module.css:5` (`top: 16px`), `app/src/editor/selection/SelectionLayer.module.css:36-40` (`.bar`) | technical |
| F5 | **Status bar cells wrap onto two lines** at 1180 px and, in some tools, at 1600 px: `1/2" = 1'-0"`, "Power + lighting", "NEC 2023 · FBC 9th ed.", "Joists unknown · beam clash checks off", "Exposed edge"; the disclaimer is cut with "…" on iPad. | `screens/ipad-S03-plan.png`, `ipad-S05-ceiling-surface.png`, `desktop-S03-tool-electrical.png`, `desktop-S03-tool-countertops.png`; `app/src/editor/status/PlanStatus.tsx` | technical |
| F6 | **The "Working copy · Version" switcher in the editor header has a 15 px tall tap area on iPad** and is "covered at center" on most iPad editor screens. | `screens/ipad-S03-plan.png` and the touch list below | technical |
| F7 | **Settings at iPad width squeeze or clip content.** Users: the heading column is narrow, emails wrap mid-word, the third row is cut. Company: the Customers pane is clipped on the right ("Add cu…"). Sheet presets on desktop too: the inspector is about 316 px against about 600 px on the board, so selects are cut ("Combined set (", "None (GC load c"). | `screens/ipad-S15-settings-users.png`, `ipad-S15-settings-company.png`, `desktop-S15-settings-sheet-presets.png` vs `vault/mockups/S15cSubmittal.png` | technical |
| F8 | **107 controls under 44 px on iPad** from `expectTouchTargets` (full list below). The biggest groups: Settings Defaults (30 inputs at 34 px tall and 27 px segment buttons), Libraries (16: tabs 38 px, filter chips 30 px, note rows 40 px), Sheet presets (14), Sheets left list (13 rows at 32 px, Previous/Next sheet 32 × 32), Render models (8), Company (6), Title block (5), Cabinets tool (TK/LR/CM 28 × 28, search 18 px). Spec: 44 px minimum on touch (`vault/spec/sections/11-non-functional-requirements.md:92`). The editor rail, typed bar, header buttons and dialogs pass. | touch list below | technical |
| F9 | **Cabinets tool on desktop hides the room** and the TK/LR/CM rows of its panel are misaligned; the rail tooltip covers the "Sink base" row. | `screens/desktop-S03-tool-cabinets.png` vs `vault/mockups/S04Cabinets.png` | technical (cause not checked) |
| F10 | **Supplier files page has no editor header.** `/projects/<id>/supplier` shows a rail and a "Supplier files" panel but no header card, so there is no project name, tabs or way back. | `screens/desktop-S12-supplier.png` vs `vault/mockups/S12RenderMarkup.png` | technical (EZD-922b "Supplier markup states" is open; check it covers the shell) |
| F11 | **The 404 page is bare:** "Page not found." top left, no header and no link to Projects. No mockup draws it. | `screens/desktop-not-found.png`; `app/src/app/not-found.tsx` | design-for-Josh |
| F12 | **Fixtures opens a large floating panel over the canvas** whose bottom fields (Width, Depth) are cut by the window edge at 1000 px. No board shows the Fixtures tool. | `screens/desktop-S03-tool-fixtures.png` | design-for-Josh (where it sits; the cut-off is F12b) |
| F13 | **Left panel adds Floor / Ceiling / Both and per-row lock icons**, and the overlays are Plumbing and Mechanical, where S03 shows Electrical, Ceiling, Dimensions and Architect DXF. These come from later tickets (ceiling surfaces, overlays), not from the board. | `screens/desktop-S03-plan-room.png` vs `vault/mockups/S03Plan.png` | design-for-Josh (confirm the board is out of date) |
| F14 | **Users page says "Roles"** where the S15 board says "Role presets". Board text is decided (CLAUDE.md rule 6). | `screens/desktop-S15-settings-users.png` vs `vault/mockups/S15Settings.png` | technical (use the board text, rule 6) |
| F15 | **System status has an extra "This device" card** (storage, waiting to sync) not on S15i. | `screens/desktop-S15-settings-system-status.png` vs `vault/mockups/S15iSystemStatus.png` | design-for-Josh |
| F16 | **The field pack's empty state has no "EZ Binder" back link.** The spec makes that link "persistent on every tab"; with nothing issued the page shows only the title and "No field pack issued yet." | `screens/phone-S17-field-pack.png`; `vault/spec/sections/screens/S17-field-pack-phone.md:31` | technical (the link may wait for EZ Binder single sign-on; check before fixing) |
| F17 | **New project step 1 has fields the S01b board does not show** (scope of work, trades, permit application date). They may come from later decisions; not checked. | `screens/desktop-S01b-new-project.png` vs `vault/mockups/S01bWizard.png` | design-for-Josh (confirm) |
| F3b | **What Projects should look like on a phone** (one column? a list?). No board or spec line draws a phone Projects page; F3 is only the breakage. | `screens/phone-S01-projects.png` | design-for-Josh |
| F5b | **Which status bar cells to show at iPad width** once they stop wrapping (F5). | `screens/ipad-S03-plan.png` | design-for-Josh |
| F12b | **The Fixtures panel's Width and Depth fields are cut off by the window edge** at 1600 × 1000. | `screens/desktop-S03-tool-fixtures.png` | technical |
| F18 | **Title block settings lack the board's "Used on N sheets · Open Sheets" line and "Zoom to title block" button**, and the preview sheet is blank apart from the title block. EZD-709 (merged) has two ACs (preview updates, missing license listed) that do not name them, the S15b spec does not either, and no open ticket was found. | `screens/desktop-S15-settings-title-block.png` vs `vault/mockups/S15bTitleBlock.png`; `vault/spec/acceptance-criteria.md` AC-EZD-709-1, -2 | design-for-Josh (build the board controls or drop them) |
| F19 | **The selected wall's "12' 0"" size chip is drawn on top of the room label** "ROOM 1 · 120 SF", so the label cannot be read while a wall is selected. | `screens/desktop-S03d-wall-selected.png` | technical |

## Not yet built (open tickets, not findings)

What the live app lacks against the boards and an open ticket already covers: Render tab, Export and Issue set in the
editor header (EZD-1111 render view, EZD-721 export menu, EZD-736 export and issue; the Help list already shows the
"Render tab 4" shortcut, `screens/desktop-S03-help.png`); the 3D tab's rail, layers and panels (EZD-1008, EZD-1005,
`screens/desktop-S07-3d.png`); Settings Catalog is a title-only page (EZD-1609, `desktop-S15-settings-catalog.png`);
Code edition rule list and verification (EZD-1710); Translations in the Settings menu (EZD-1510); Takeoff (EZD-1613)
and the Tasks tab (EZD-1409); the client page (EZD-1202, see F1); Render models' local worker panel (EZD-1104a,
EZD-1104b) and usage bar (EZD-1117 Render allowance). The Defaults keyboard shortcut table is built
(`app/src/components/settings/defaults/ShortcutsTable.tsx`, EZD-222) and sits below the fold of the screenshot.

## Per screen

| Screen | Screenshot(s) | Against board and spec |
|---|---|---|
| S01 Projects | `desktop-S01-projects.png`, `ipad-S01-projects.png`, `phone-S01-projects.png` | Desktop matches S01 (header, status tabs incl. decided Completed and Archived, cards, "Working copy" line). iPad: tabs and sort wrap to two lines. Phone: F3 |
| S01b New project | `desktop-S01b-new-project.png`, `ipad-S01b-new-project.png` | Step 1 as a dialog over Projects, "Step 1 of 2"; extra fields (F17). The board draws step 2 |
| S01c, S01d, S01e | `desktop-S01c-notifications.png`, `desktop-S01d-avatar-menu.png`, `desktop-S01e-my-profile.png` | Match their boards (empty notification list; My profile with the S01g AI key block) |
| S15 Users | `desktop-S15-settings-users.png`, `ipad-…users.png` | Matches the layout; "Roles" (F14); iPad squeeze (F7) |
| S15a Company | `desktop-S15-settings-company.png` | Matches the not-connected state (no EZ Binder card, no customers); 4 MB logo hint is decided (Q-0512). iPad clip (F7) |
| S15b Title block | `desktop-S15-settings-title-block.png` | Form matches; F18 |
| S15c Sheet presets | `desktop-S15-settings-sheet-presets.png` | Narrow inspector (F7); name chips show {address} {description} {rev} {date}, the board also has {sheet} {discipline} |
| S15d Defaults | `desktop-S15-settings-defaults.png` | Groups match; the shortcut table is below the fold; many small inputs on iPad (F8) |
| S15e Catalog | `desktop-S15-settings-catalog.png` | Title only (EZD-1609 open) |
| S15f Render models | `desktop-S15-settings-render-models.png` | Tiers and allowance match in outline; local worker and usage panels are open tickets (EZD-1104a/b, EZD-1117) |
| S15g Code edition | `desktop-S15-settings-code-edition.png` | Edition and electrical defaults present; rule list absent (EZD-1710 open) |
| S15h Libraries | `desktop-S15-settings-libraries.png` | Matches (Notes tab) |
| S15i System status | `desktop-S15-settings-system-status.png` | Matches with empty states; extra "This device" card (F15) |
| S03 Plan | `desktop-S03-plan-empty.png`, `desktop-S03-plan-room.png`, `ipad-S03-plan.png` | Shell matches (header, rail, left panel, inspector, status bar); header tabs Plan / 3D / Sheets only ("Not yet built"); left panel differs (F13); iPad F4, F5, F6 |
| S03d selected / tablet | `desktop-S03d-wall-selected.png`, `ipad-S03d-typed-bar.png` | Wall 4 selected: inspector shows Length 10' 0", Thickness 4 1/2", Height 8' 0", the layer stack (Drywall, Stud, Drywall, Total), Status and Bearing, and the drawn ⋯ More button (the board's "more_hori" glitch is not copied), as on S03dWallSelected; size chip over the room label (F19). iPad typed bar shows Next field and Cancel as on S03dTablet |
| Drawing tools | `desktop-S03-tool-{wall,door,window,sketch,measure}.png` | Typed-dimension bar shown; match the shell |
| S04 Cabinets | `desktop-S03-tool-cabinets.png`, `ipad-S03-tool-cabinets.png` | F9; small targets on iPad (F8) |
| S04b Countertops | `desktop-S03-tool-countertops.png` | Pieces / Edges / Material and default overhangs match; status bar wraps (F5) |
| S05 Ceiling | `desktop-S03-tool-ceiling.png`, `desktop-S05-ceiling-surface.png`, `ipad-S05-ceiling-surface.png` | Rail and panel match; on iPad the rail folds Ceiling into its "more" menu (the audit used the Ceiling switch); status bar wraps |
| S06 Electrical | `desktop-S03-tool-electrical.png`, `ipad-S03-tool-electrical.png` | Circuits / Devices / Panel match; iPad tool strip over the edit bar (F4) |
| Fixtures | `desktop-S03-tool-fixtures.png` | F12 |
| S03c Assistant | `desktop-S03c-assistant.png` | Matches the "no key" board (copy, Open My profile, prompt box); adds a Photo button |
| Help | `desktop-S03-help.png` | Shortcut list per spec; lists the Render tab shortcut although the tab is not built |
| S20 Versions | `desktop-S20-versions.png`, `ipad-S20-versions.png` | Working copy, Sent, Named snapshots, Working versions present; revision log and cleanup sheet not reachable with seed data. The Assistant panel opened earlier stays open in this and the next shots (audit order, not a finding) |
| S03b Conflict list | none | Appears only when a save conflicts with another person's save; not reachable with one signed-in person. `app/e2e/conflict-list.spec.ts` covers it through `/dev/saves/<id>` |
| S09 Catalog picker | `desktop-S09-catalog-picker-dev.png` | Categories with counts and the Generic cabinet line (42 items) as on S09's picker; product add and pricing not shown. In the app it opens from a countertop's material row, which needs cabinets and tops the seed lacks; shot on its harness page `/dev/catalog` (the page `app/e2e/catalog-picker.spec.ts` uses) |
| S10 Detail editor, S11 DXF reference | none | Need a detail callout or an uploaded DXF; not reachable with seed data |
| S02 / S11 entry | `desktop-S02-upload-files.png` | Upload files dialog (step 1); review steps need a file |
| S07 3D | `desktop-S07-3d.png` | Room extruded as a grey box with "Model synced with plan"; no rail or panels yet (EZD-1008, EZD-1005 open) |
| S13 Sheets | `desktop-S13-sheets.png`, `ipad-S13-sheets.png` | Sheet list A0.0 to E2.0 and the sheet view match in outline; issue checklist and clouds toggle absent; sheet rows 32 px on iPad (F8) |
| S12 Supplier | `desktop-S12-supplier.png` | Empty "Supplier files" panel; no header (F10) |
| Send (S18 sender side) | `desktop-S18-share-dialog.png`, `desktop-S18-share-sent.png` | Matches Q-0213: no-email state with Project settings, then sent with link, expiry, Renew / Turn off, Copy link |
| S17 Field pack | `phone-S17-field-pack.png` | Empty state only (nothing issued); F16 |
| S17b Field measure | `phone-S17b-field-measure.png` | Shape picker, keypad with 1/2 1/4 1/8 1/16 and Next wall; 29 controls checked, none under 44 px |
| S18 Client link | `phone-S18-client-link.png` | Staff sign-in page (F1) |
| 404 | `desktop-not-found.png` | F11 |

## Touch targets (iPad and phone, from expectTouchTargets)

"Tap area" is the helper's measured width × height in px (capped at 200). "Covered at center" means another element
sits on the control's center. Behind an open dialog that is expected (all 30 entries on `ipad-S01b-new-project` and the
three header buttons on `phone-S01-projects`, which run off the screen, F3). "Outside the viewport" counts controls
scrolled below or beside the screen; the helper does not judge them. A screen not listed had no failures
(`ipad-S15-settings-catalog`: 12 checked; `phone-S17-field-pack`: 0 controls; `phone-S17b-field-measure`: 29;
`phone-S18-client-link`: 9).

#### ipad-S01-projects (`screens/ipad-S01-projects.png`)

Under 44 px (tap area): 0. Covered at center: 0. Outside the viewport (scrolled off, not judged): 80.

#### ipad-S01b-new-project (`screens/ipad-S01b-new-project.png`)

Under 44 px (tap area): 1. Covered at center: 30. Outside the viewport (scrolled off, not judged): 80.

- BUTTON "Paste page text or s" tap area 150x14

Covered at center:

- INPUT "Search projects" covered at center 257x46
- BUTTON "Notifications" covered at center 44x44
- A "Company settings" covered at center 42x40
- BUTTON "Account menu" covered at center 32x32
- BUTTON "All200" covered at center 61x46
- BUTTON "Draft40" covered at center 67x46
- BUTTON "Client review40" covered at center 106x46
- BUTTON "Permit submitted40" covered at center 130x46
- BUTTON "Approved40" covered at center 91x46
- BUTTON "In build40" covered at center 77x46
- BUTTON "Completed0" covered at center 91x46
- BUTTON "Archived0" covered at center 80x46
- BUTTON "Sort by Last edited" covered at center 71x56
- BUTTON "New project" covered at center 161x44
- A "Seed project 001Draf" covered at center 264x287
- BUTTON "Actions for Seed project 001" covered at center 44x44
- A "Seed project 002Clie" covered at center 264x287
- BUTTON "Actions for Seed project 002" covered at center 44x44
- A "Seed project 003Perm" covered at center 264x287
- BUTTON "Actions for Seed project 003" covered at center 44x44
- A "Seed project 004Appr" covered at center 264x287
- BUTTON "Actions for Seed project 004" covered at center 44x44
- A "Seed project 005In b" covered at center 264x287
- BUTTON "Actions for Seed project 005" covered at center 44x44
- A "Seed project 006Draf" covered at center 264x287
- BUTTON "Actions for Seed project 006" covered at center 44x44
- A "Seed project 007Clie" covered at center 264x287
- BUTTON "Actions for Seed project 007" covered at center 44x44
- A "Seed project 008Perm" covered at center 264x287
- BUTTON "Actions for Seed project 008" covered at center 44x44

#### ipad-S15-settings-company (`screens/ipad-S15-settings-company.png`)

Under 44 px (tap area): 6. Covered at center: 2. Outside the viewport (scrolled off, not judged): 2.

- INPUT "" tap area 200x38
- INPUT "" tap area 200x38
- INPUT "" tap area 178x38
- INPUT "" tap area 178x38
- BUTTON "0 archived" tap area 64x32
- INPUT "Search customers" tap area 154x18

Covered at center:

- INPUT "" covered at center 365x38
- INPUT "" covered at center 365x38

#### ipad-S15-settings-users (`screens/ipad-S15-settings-users.png`)

Under 44 px (tap area): 0. Covered at center: 2. Outside the viewport (scrolled off, not judged): 0.

Covered at center:

- BUTTON "More actions for Seed Designer" covered at center 44x44
- BUTTON "More actions for Seed Foreman" covered at center 44x44

#### ipad-S15-settings-title-block (`screens/ipad-S15-settings-title-block.png`)

Under 44 px (tap area): 5. Covered at center: 0. Outside the viewport (scrolled off, not judged): 2.

- BUTTON "" tap area 34x20
- A "Edit in Company" tap area 99x16
- A "Sheet presets" tap area 83x17
- BUTTON "24x36" tap area 88x30
- BUTTON "11x17" tap area 88x30

#### ipad-S15-settings-sheet-presets (`screens/ipad-S15-settings-sheet-presets.png`)

Under 44 px (tap area): 14. Covered at center: 0. Outside the viewport (scrolled off, not judged): 23.

- INPUT "" tap area 143x38
- BUTTON "Electronic" tap area 78x32
- BUTTON "Paper" tap area 58x32
- SELECT "None (GC load calc a" tap area 143x38
- SELECT "Combined set (one PD" tap area 143x38
- INPUT "" tap area 64x38
- INPUT "" tap area 200x38
- INPUT "Longest file name (characters)" tap area 64x38
- BUTTON "As typed" tap area 74x32
- BUTTON "ALL CAPS" tap area 74x37
- BUTTON "{address}" tap area 83x22
- BUTTON "{description}" tap area 112x22
- BUTTON "{rev}" tap area 54x22
- BUTTON "{date}" tap area 62x22

#### ipad-S15-settings-defaults (`screens/ipad-S15-settings-defaults.png`)

Under 44 px (tap area): 30. Covered at center: 5. Outside the viewport (scrolled off, not judged): 99.

- INPUT "Search defaults" tap area 200x38
- INPUT "Plan dimensions round to" tap area 84x34
- INPUT "Detail dimensions round to" tap area 84x34
- BUTTON "Pencil only" tap area 82x27
- BUTTON "Finger" tap area 57x27
- INPUT "Cabinet auto-fill" tap area 84x34
- INPUT "Countertop" tap area 84x34
- INPUT "Snap" tap area 84x34
- INPUT "Wall thickness" tap area 84x34
- INPUT "Overhang: standard" tap area 84x34
- INPUT "Overhang: seating, counter" tap area 84x34
- INPUT "Overhang: seating, bar" tap area 84x34
- INPUT "Overhang: against wall" tap area 84x34
- INPUT "Seating support limit" tap area 84x34
- INPUT "Support bracket spacing" tap area 84x34
- INPUT "Seat width" tap area 84x34
- BUTTON "1/4 tile" tap area 56x27
- BUTTON "1/3 tile" tap area 56x27
- BUTTON "1/2 tile" tap area 57x27
- INPUT "Fan blade clearance" tap area 84x22
- INPUT "Tile" tap area 84x34
- INPUT "LVP" tap area 84x34
- INPUT "Drywall" tap area 84x34
- INPUT "Paint" tap area 84x34
- INPUT "Trim" tap area 84x34
- INPUT "Countertop" tap area 84x34
- INPUT "Pattern: straight" tap area 84x34
- INPUT "Pattern: diagonal" tap area 84x34
- INPUT "Pattern: herringbone" tap area 84x34
- INPUT "Recently added window" tap area 84x26

Covered at center:

- BUTTON "2x4" covered at center 41x27
- BUTTON "2x6" covered at center 41x27
- INPUT "Drywall each side" covered at center 84x34
- INPUT "Wall height" covered at center 84x34
- INPUT "Unsent working versions delete after" covered at center 84x34

#### ipad-S15-settings-render-models (`screens/ipad-S15-settings-render-models.png`)

Under 44 px (tap area): 8. Covered at center: 0. Outside the viewport (scrolled off, not judged): 0.

- SELECT "Choose a modelGemini" tap area 200x38
- INPUT "Fast cost per render" tap area 72x18
- SELECT "Choose a modelGemini" tap area 200x38
- INPUT "Standard cost per render" tap area 72x18
- SELECT "Choose a modelGemini" tap area 200x31
- INPUT "Photoreal cost per render" tap area 72x18
- INPUT "" tap area 200x18
- INPUT "" tap area 200x18

#### ipad-S15-settings-code-edition (`screens/ipad-S15-settings-code-edition.png`)

Under 44 px (tap area): 2. Covered at center: 0. Outside the viewport (scrolled off, not judged): 0.

- SELECT "By permit date (auto" tap area 200x38
- BUTTON "" tap area 34x20

#### ipad-S15-settings-libraries (`screens/ipad-S15-settings-libraries.png`)

Under 44 px (tap area): 16. Covered at center: 0. Outside the viewport (scrolled off, not judged): 0.

- BUTTON "Notes" tap area 39x38
- BUTTON "Symbols + abbreviati" tap area 156x38
- BUTTON "Details" tap area 45x38
- BUTTON "Hatches" tap area 54x38
- BUTTON "Parts" tap area 34x38
- BUTTON "Saved groups" tap area 88x38
- BUTTON "Field task templates" tap area 129x38
- INPUT "Search notes" tap area 195x18
- BUTTON "All" tap area 42x30
- BUTTON "Kitchen" tap area 73x30
- BUTTON "Bath" tap area 54x30
- BUTTON "Whole-home interior" tap area 153x30
- BUTTON "Verify all dimension" tap area 200x41
- BUTTON "Cabinet codes per ca" tap area 200x41
- BUTTON "Details per A5.0. Re" tap area 200x40
- BUTTON "Electrical, lighting" tap area 200x41

#### ipad-S15-settings-system-status (`screens/ipad-S15-settings-system-status.png`)

Under 44 px (tap area): 0. Covered at center: 0. Outside the viewport (scrolled off, not judged): 1.

#### ipad-S03-plan (`screens/ipad-S03-plan.png`)

Under 44 px (tap area): 2. Covered at center: 1. Outside the viewport (scrolled off, not judged): 0.

- BUTTON "Working copy · Versi" tap area 158x15
- BUTTON "Zoom out" tap area 44x24

Covered at center:

- BUTTON "Zoom in" covered at center 44x44

#### ipad-S03d-typed-bar (`screens/ipad-S03d-typed-bar.png`)

Under 44 px (tap area): 1. Covered at center: 2. Outside the viewport (scrolled off, not judged): 0.

- BUTTON "Zoom out" tap area 44x24

Covered at center:

- BUTTON "Working copy · Versi" covered at center 158x15
- BUTTON "Zoom in" covered at center 44x44

#### ipad-S03-tool-cabinets (`screens/ipad-S03-tool-cabinets.png`)

Under 44 px (tap area): 5. Covered at center: 1. Outside the viewport (scrolled off, not judged): 0.

- INPUT "Code or size, e.g. B24" tap area 174x18
- BUTTON "Line: Generic" tap area 200x36
- BUTTON "TK" tap area 28x28
- BUTTON "LR" tap area 28x28
- BUTTON "CM" tap area 28x28

Covered at center:

- BUTTON "Working copy · Versi" covered at center 158x15

#### ipad-S03-tool-electrical (`screens/ipad-S03-tool-electrical.png`)

Under 44 px (tap area): 1. Covered at center: 10. Outside the viewport (scrolled off, not judged): 0.

- BUTTON "Zoom out" tap area 44x24

Covered at center:

- BUTTON "Working copy · Versi" covered at center 158x15
- BUTTON "Zoom in" covered at center 44x44
- BUTTON "Undo" covered at center 62x56
- BUTTON "Redo" covered at center 62x56
- BUTTON "Delete" covered at center 62x56
- BUTTON "Duplicate" covered at center 62x56
- BUTTON "Select more" covered at center 62x56
- BUTTON "Select all" covered at center 62x56
- BUTTON "Copy" covered at center 62x56
- BUTTON "Paste" covered at center 62x56

#### ipad-S05-ceiling-surface (`screens/ipad-S05-ceiling-surface.png`)

Under 44 px (tap area): 2. Covered at center: 2. Outside the viewport (scrolled off, not judged): 0.

- BUTTON "Switching zones" tap area 200x38
- BUTTON "Zoom out" tap area 44x24

Covered at center:

- BUTTON "Working copy · Versi" covered at center 158x15
- BUTTON "Zoom in" covered at center 44x44

#### ipad-S20-versions (`screens/ipad-S20-versions.png`)

Under 44 px (tap area): 1. Covered at center: 2. Outside the viewport (scrolled off, not judged): 0.

- BUTTON "Zoom out" tap area 44x24

Covered at center:

- BUTTON "Working copy · Versi" covered at center 158x15
- BUTTON "Zoom in" covered at center 44x44

#### ipad-S13-sheets (`screens/ipad-S13-sheets.png`)

Under 44 px (tap area): 13. Covered at center: 1. Outside the viewport (scrolled off, not judged): 0.

- BUTTON "Permit set" tap area 108x32
- BUTTON "A0.0Cover" tap area 200x32
- BUTTON "A1.0Existing" tap area 200x32
- BUTTON "A2.0Demo" tap area 200x32
- BUTTON "A3.0Proposed" tap area 200x32
- BUTTON "A4.0Elevations" tap area 200x32
- BUTTON "A5.0Details" tap area 200x32
- BUTTON "E1.0Electrical" tap area 200x32
- BUTTON "E2.0Panel + load cal" tap area 200x32
- BUTTON "Add sheet" tap area 200x36
- BUTTON "Property appraiser i" tap area 200x36
- BUTTON "Previous sheet" tap area 32x32
- BUTTON "Next sheet" tap area 32x32

Covered at center:

- BUTTON "Working copy · Versi" covered at center 158x15

#### phone-S01-projects (`screens/phone-S01-projects.png`)

Under 44 px (tap area): 0. Covered at center: 3. Outside the viewport (scrolled off, not judged): 53.

Covered at center:

- BUTTON "Notifications" covered at center 44x44
- A "Company settings" covered at center 42x40
- BUTTON "Account menu" covered at center 32x32
