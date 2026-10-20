# Interview round 0 · prep (2026-10-20)

Round 0 of `vault/questions/interview-plan-2026-10-20.md` (approved by Josh 2026-10-20). Orchestrator only; Josh was not interviewed and **nothing here is decided**. Every fix below is a recommendation for Josh to accept or change in Round 1 or later; accepted fixes get Q-IDs and go into the spec during the restructure.

Sources: one phase-auditor pass (Mode A, `.claude/agents/phase-auditor.md`) over `vault/spec/INDEX.md` and every file it lists, against the 10 items of `vault/spec/READINESS.md`; a contradiction sweep by the orchestrator with grep and range reads. The auditor's findings are its claims; the contradictions in part 2 were each checked against the cited file in this session.

## 1. Gap list by area

**Status: partial audit. 56 gaps found; the count is a lower bound.** The auditor could not reach every file within one dispatch: **not audited** are `02-product-overview.md`, `03-data-model.md`, `08-import-and-export.md`, `09-calculations-and-rules.md`, screens S04–S14, S15–S15h, S16, S17–S18b and the four X-files (only their mockup labels were checked, part 2 C1). Expect many more gaps under items 2, 4 and 5 there; they are covered by Rounds 2–4 or a second auditor pass before the restructure. Format: `id | READINESS item | file | what is missing | what it would stall`. The S01–S03 rows came through a retriever; the auditor spot-checked S3, S5 and S6, and the orchestrator re-checked S12 and C-A4 (part 2).

| Area | Gaps |
| --- | --- |
| Product and phases | 2 |
| Data model (from S01–S02 only) | 4 |
| App shell | 3 |
| Screens S01–S03 (projects, import, plan editor) | 18 |
| Workflows | 5 |
| Outside services | 5 |
| Calculations | 2 |
| Permissions | 3 |
| Non-functional | 3 |
| Acceptance criteria | 2 |
| Glossary | 2 |
| Open items | 7 |
| **Total (lower bound)** | **56** |

**Product and phases**
- P1 | 1 | `tickets/PHASES.md:5,25` | Phases 1–17 are a 53-slice re-cut marked "draft for Josh's approval"; `tickets.json` `phase` still holds the spec phases | every phase after 0 (Round 1, part 2 C7)
- P2 | 1/8 | `PHASES.md` ("ACs:" only under Phase 0) | Slices have Goal and Out of scope but no AC list | every slice

**Data model** (03 itself not audited)
- D1 | 5 | `screens/S01-projects.md:53,128` | Delete and Archive do not say what is kept (source files, versions, client link) | EZD-117a/b
- D2 | 5 | `S01-projects.md:65-66` | Where property-appraiser values and new-customer fields are stored | EZD-118, EZD-711
- D3 | 5 | `S02-import-review.md:32,62` | Where detected items live between upload and Finish, and whether they survive a session end | phase 3 imports
- D4 | 5 | `S02-import-review.md:54,94` | "Records an override" names an event only; stored fields undefined | phase 3

**App shell**
- A1 | 2 | `11-non-functional-requirements.md:64`; `13-…:142` (R12) | Settings → System status has no screen spec, no board, no states; `04` does not list it | EZD-135, EZD-237
- A2 | 2 | `04-app-shell-and-global-ui.md:22-23` | Share panel and Export menu are one line each: no fields or states | EZD-1201, export tickets (phases 7, 10, 12)
- A3 | 4/5 | `13-…:112`; AC-EZD-116-1 | Every threshold is owner-entered and blank shows "Not set"; no default numbers (tolerance, high-confidence cutoff, bath clearances, voltage-drop threshold, lock release, webhook retries), so no values for worked examples or tests (S15d not audited; it may hold some) | slices 8, 13, 17, 19, 20

**Screens S01–S02 (projects and import)**
- S1 | 2 | `S01-projects.md:58-74` | Wizard has no loading or error state, no result if Create fails | EZD-118
- S2 | 2 | `S01-projects.md:37-42,53` | Archived projects: no tab, filter or restore | EZD-117a/b
- S3 | 2 | `S01-projects.md:68` | Input source lists 5 choices and omits "Supplier kitchen PDF" (in `06-workflows.md:11` and board S01b) | EZD-118, phases 3, 9
- S4 | 2 | `S02-import-review.md:32-33` | Cancel and Finish import: no failure state; Cancel names no landing screen | phase 3
- S5 | 3 | `S01-projects.md:83-87` | No path for an uncalibrated PDF or an unreadable file | EZD-303..306
- S6 | 3 | `S01-projects.md:68` | Field measure: nothing on the Foreman never sending rooms or the link email failing | EZD-1415..1419
- S7 | 4 | `S02-import-review.md:83,99` | High-confidence cutoff has no value; no formula for the confidence % | phase 3
- S8 | 4 | `S02-import-review.md:65-66,84` | The ±1/2" tolerance comes from mockup sample data, not a decision | phase 3, EZD-1413
- S12 | 4 | board `S01bWizard.dc.html` | "Permits applied after Dec 31, 2026 use FBC 9th ed." has no spec or decision text (orchestrator confirmed the board text) | EZD-118, EZD-613

**Screen S03 (plan editor)**
- S9 | 4 | `S02:85-86`; `S03-plan-editor.md:153-155` | Room-closure gap and opening-offset warnings: no inputs, formula or examples | phase 2 (EZD-215 and others)
- S10 | 4 | `S03-plan-editor.md:157` | Bath clearance points to "values in Defaults (Round 3)", a plan-doc round not in the vault; no numbers | EZD-228
- S11 | 4 | `S01:70` vs `S03:90,131,133` | Which precision applies where (1/16" stored vs 1/2" shown); no room-area formula or rounding | phase 2
- S13 | 2 | `S02:87` vs `S03:116,154` | Bearing-wall removal "blocked" (S02) vs "blocked or flagged" (S03); can the user proceed past the engineer prompt? | slice 10
- S14 | 3 | `S03-plan-editor.md:144` | No result if the holder's save fails during the 5-minute auto-release | EZD-125/126
- S15 | 6 | `S01:16,53` | No permission for Rename or Set status; Archive tied to Delete projects, yet after a send only Archive is offered | EZD-117b
- S16 | 6 | `S02:8,15-17` | No permission named for uploading into an existing project or cancelling an import | phase 3
- S17 | 6 | `S03:18,29,110` | Run total shows money with no See company costs / See sell prices rule | phase 4
- S18 | 7 | `S01:45,62,66`; `S02:79` | Job picker, customer sync, appraiser read and cabinet-label reading: no fields sent or received, no sample response, no down-service behaviour | EZD-115, 119, 711, 916/918

**Workflows** (`06-workflows.md`)
- W1 | 3 | `06:5-109` | No workflow says what happens when a step fails, except W1 step 3 (appraiser read blocked); 14 workflows affected | 17 tickets cite 06 (EZD-118, 119, 123, 215, 220, 234 …)
- W2 | 3 | `06:3` | Project status Draft → Client review → Permit submitted → Approved → In build: who moves it, manual or automatic, when | EZD-117a/b
- W3 | 3 | `06` (absent) | No workflow for invite and first sign-in, edit-lock hand-over, offline sync conflict (R6), architect reference, supplier markup, details, takeoff, catalog add, field tasks | phases 1, 8, 9, 14, 16
- W4 | 3 | `06:92` | "When EZ Binder marks the CO approved, the matching revision locks": no matching rule, nothing on no match or already locked | EZD-1303..1312
- W5 | 3/4 | `06:78`; `13-…:144` (R14) | Client signer check has an "attempt limit" with no number and no lockout or recovery | EZD-1210

**Outside services** (`07-hooks-events-and-integrations.md`)
- I1 | 7 | `07:9-17,21-28` | Webhooks and inbound API are field-name lists only: no sample JSON, types, error responses or idempotency-key format; EZD-019 (Phase 0, ready) must write the contract from this | EZD-019, EZD-1301..1306
- I2 | 7/4 | `07:19` | Webhook retry count and backoff are "company settings" with no default; unclear whether Q-0059 (job retries) covers them | EZD-1301
- I3 | 7 | `07:72` | Claude uses (catalog, translation, task drafts, CO scope, panel label, appraiser): no sample responses, timeout or cost cap | EZD-021, 606, 711, 916, 918, 1310, 1408, 1502, 1603
- I4 | 7 | `07:73` | Property appraiser sites (PBC, Broward): no sample page; nothing for other counties | EZD-711
- I5 | 7 | `07:71` | Image-model request, response and cost reporting undefined until the provider pick (Q-0076, Q-0082) | EZD-1103, phase 11

**Calculations** (09 not audited)
- K1 | 4 | `READINESS.md` EZ Draft note | Load calc and voltage drop have one worked example each; two more of each, with zero and maximum cases, are needed | slice 19, EZD-6xx
- K2 | 4 | `12-build-phases-and-acceptance-tests.md:16` | Cabinet auto-fill has one example (117 1/2" wall); the other areas in `12:9-28` have one case each | slices 14–17

**Permissions** (`10-permissions-and-settings.md`)
- PM1 | 6 | `10:9-39` | Role × permission only, no "which data" column; "own jobs" for Foreman and Crew undefined (listed projects? assigned how?) | EZD-101, 102, 129
- PM2 | 6 | `10` vs AC-EZD-103-1 | The AC gives Foreman Settings access to Translations and Libraries, but no permission row grants Settings pages other than Manage users and settings | EZD-103
- PM3 | 6 | `10:7` | No client action table for the share link (view, comment, choose, sign) | phase 12

**Non-functional** (`11-non-functional-requirements.md`)
- N1 | 10 | `11:43`; `13:175` | DXF size limits set "after testing real architect files"; files "when available"; no phase | EZD-306, EZD-901a
- N2 | 8 | `11:90-93` | Accessibility: only 44 px targets and labels; no contrast level, keyboard focus or screen-reader target | slice 53
- N3 | 8 | `11:41` | iPad memory limit has no number | EZD-017, phase 10

**Acceptance criteria**
- AC1 | 8 | `acceptance-criteria.md:3`; `tickets.json` (all `acs_source: done-when`) | Phases 1–17 have only generated ACs (rows per spec phase 1→17: 62, 65, 28, 24, 26, 124, 51, 22, 43, 33, 35, 17, 16, 35, 11, 24, 18) | every phase's Stage 0
- AC2 | 8 | `acceptance-criteria.md` phases 1, 12 | Generated rows split sentences and are not testable alone (AC-EZD-104-2, AC-EZD-105-2, AC-EZD-1211-1) | phases 1, 12

**Glossary** (`glossary.md`, 14 terms)
- G1 | 9 | `glossary.md` | Missing central terms (file counts by grep of sections/): RCP (10), ACT, load calc (11), allowance (14), tolerance (15), change order (9), field task (9), cleanup sheet (7), review pill (6), issue checklist (6), orphan flag (5), symbol key, design option, drawing list, project scope, customer, detail, outbox, Automatic / Needs data / Reminder, Foreman, "To check", project status vs object status | all phases
- G2 | 9 | `glossary.md` second table | Code names are placeholders (EZD-1xx, 7xx, 12xx, 14xx) and marked not citable | phases 1, 7, 12, 14

**Open items** (`13-decisions-and-remaining-items.md:166-179`, same as `decisions/13c`)
- O1 | 10 | `13:174` | Supplier 2020 sample export "when available"; no phase; it is the fixture source | EZD-916..918
- O2 | 10 | `13:176` | Per-render costs and default model per tier "measured during testing" | phase 11
- O3 | 10 | `13:177` | Unverified department items (PBC stamp and size, WPB naming, Broward revision naming) deferred to "first job there" | EZD-712, 714, 727
- O4 | 10 | `13:171` | Real vendor cabinet line: no phase (seed line R23 covers until then) | slice 14
- O5 | 10 | `13:178` | GPU suitability test: no phase in the spec (PHASES puts EZD-1120 in slice 52) | slice 52
- O6 | 10 | `13:168,179`; `13c:7,18` | Stale unchecked boxes: "R2 is answered; nothing open" and "Mockups needed before build" | clean-up only (C2)
- O7 | 10 | `S01-projects.md:72` | Submittal profile "optional; can set later" names no point where it becomes required | EZD-118, phase 7 issue

## 2. Contradictions, each with a recommended fix

**Found in the orchestrator's sweep:**

**C1. The four "not in mockup" screens have boards.** `vault/spec/INDEX.md` lists Takeoff, Revisions / version history, Field measurements review and Field tasks as "(not in mockup)", and each file says "needs a mockup before build" or "needs design" (`screens/X-takeoff-not-in-mockup.md:9`, `X-revisions-version-history-not-in-mockup.md:9`, `X-field-measurements-review-not-in-mockup.md:9`, `X-field-tasks-not-in-mockup.md:9` and `:37`). But `vault/mockups/INDEX.md` has boards S19 Takeoff, S20 Versions + cleanup sheet, S21 Field measurements review, S22 Field tasks, and `vault/spec/decisions/05-screens.md:8` (2026-10-11, no Q-ID) says every screen now has a mockup. A text check of the four board HTML files found the main controls the X-files name (S19: Group by, waste, Straight/Diagonal/Herringbone, Export CSV; S20: Sent / Named snapshots / Working versions, Revert, Revision log, cleanup Keep/Delete; S21: Pending, Approve, Reject, tolerance; S22: Demo / Rough-in, Spanish, Publish, Issue field pack).
*Recommended fix:* the boards are the mockups. In the restructure, name the files S19–S22, link each board, and drop "(not in mockup)" where the board shows the control; where the board and the text differ, the board wins for layout and wording, the text for rules (spec `01-how-to-use-this-spec.md:21` defines the label). Give the 05-screens row a Q-ID when Josh confirms.

**C2. "Mockups needed before build" is out of date.** `sections/13-decisions-and-remaining-items.md:179` still lists the New project wizard, Takeoff, Versions and cleanup sheet, Field measurements review, Field tasks, Settings 15a–15h and the phone 3D viewer. All have boards now: S01b, S19, S20, S21, S22, S15a–S15h, S17c (`vault/mockups/INDEX.md`).
*Recommended fix:* mark the item done (Oct 11, 2026) in `decisions/13c-open-and-resolved.md`.

**C3. Wizard: "modal or full page; not in mockup."** `screens/S01-projects.md:56`. Board S01b draws it as a dialog over S01 (`vault/mockups/INDEX.md`).
*Recommended fix:* the wizard is a dialog (modal), as S01b shows.

**C4. Other screens still say "not in mockup" though their board exists.** `screens/S15b-settings-title-block.md:9` and `:11` (board S15b exists); `screens/S17-field-pack-phone.md:106` says the 3D tab follows "the earlier field pack mockup" while board S17c (Field pack 3D) exists. Many single controls on S08b, S12, S13 and S14 are also labelled "(not in mockup)"; those may be correct (the control really is not drawn) and are checked control by control in the restructure.
*Recommended fix:* same as C1 for S15b and S17; per-control labels kept only where the board truly lacks the control.

**C5. "28 switches" vs 29.** `screens/S15-settings-users-permissions.md:27` and `:128` say 28; Q-0034 (`decisions/05-screens.md:7`) settled 29. Decided already; only the spec text is stale.
*Recommended fix:* correct the text to 29 in the restructure (no new question).

**C6. The spec index misses six boards.** `vault/spec/INDEX.md` has no entry for S01b, S17c or S19–S22, and the screen files do not name their board.
*Recommended fix:* the reading map lists each screen's board; INDEX.md gets the new names.

**C7. Two phase numberings.** `vault/tickets/PHASES.md:5` and `:25`: the spec's phases 1–17 (368 tickets) were re-cut on Oct 18 into 53 slices, and the re-cut waits for Josh's approval; until then nothing after Phase 0 is scheduled. Only Phase 0 and the 53 slices have a Goal, user-visible result and test script; spec phases 1–17 have none in PHASES.md (they appear only as the mapping table at `PHASES.md:42–62`). Yet the interview plan asks Josh to "approve or change the 17-phase order" (Round 1) and plans Round 2 by "Phase 1–2 areas", and the Phase 0 entry says "Phase 2 cannot start until … all five [spikes] have a verdict" (`PHASES.md:15`), which means spec phase 2; after the re-cut, spec-phase-2 tickets start in slice 3 (`PHASES.md:47`). PROCESS.md section 2a rule 1 (`vault/PROCESS.md:46`) says a phase is a vertical slice, which the 17 spec phases are not.
*Recommended fix:* Josh approves the 53 slices as the phase list (each slice = one phase with its goal, after any moves he wants), then `apply_recut.mjs` renumbers; the spike gate becomes "slice 3 cannot start until …"; Round 2 is re-labelled "slices 1–11 areas". This is follow-up 1 below.

**C8. Slices cite a moved file.** PHASES.md cites `spec/decisions.md` 48 times (for example slice 1, `PHASES.md:127`); that file is now a pointer to `vault/spec/decisions/` (`vault/spec/decisions.md:1–3`).
*Recommended fix:* the reading map replaces it with the area decision files per ticket; no question for Josh.

**C9. One Josh answer not in a decisions file.** QUESTIONS.md's header says Josh's answers are also appended to the area decisions file; of 93 `answered-josh` rows, only Q-0171 (launcher budget hold, process tooling) is in none of `vault/spec/decisions/*.md` (grep, this session).
*Recommended fix:* append it to `decisions/process.md`; no question for Josh.

No contradiction found between the Spanish-language rules: R17 (`decisions/13b-round-26.md:27`), Q-0002, Q-0029 and Q-0121 (`decisions/10-permissions-and-settings.md:8,24,26`) and `06-workflows.md:104` agree.

**Found by the auditor** (the orchestrator re-read the cited lines for C10 (acceptance-criteria.md only), C11, C12, C13, C14 (01:22 only) and C15 this session; C16 and the other citations are the auditor's reading, not re-checked):

**C10. Permission counts in the ticket.** AC-EZD-101-1 (`acceptance-criteria.md:172`) and `tickets/phases/phase-01.md:9` say Owner 28, Designer 24, Foreman 10, Crew 4; section 10 lists 29 rows (`10-permissions-and-settings.md:11-39`; auditor's count: Owner 29, Designer 25, Foreman 11, Crew 5), and Q-0034 says 29. Stalls EZD-101 (slice 1).
*Recommended fix:* restate the AC from the section 10 table after a recount in EZD-101's spec check; no new question unless the recount disagrees.

**C11. Copy link on crew sign-in.** `11-non-functional-requirements.md:77` gives crew magic links "a Copy link fallback"; Q-0035's note (`decisions/07-hooks-events-and-integrations.md:8`) and `docs/architecture.md` (Email) say sign-in emails never show their link on screen.
*Recommended fix:* Q-0035 wins (it is later and is a security rule); correct 11:77 in the restructure.

**C12. Fixed numbers or settings?** Lock auto-release is 5 minutes (`04-app-shell-and-global-ui.md:92`; `13:50`) and share links expire at 30 days (`06-workflows.md:76`; `11:78`), but `10:51` lists lock release and share-link expiry as Defaults the owner enters, and `13:112` says every threshold is owner-entered.
*Recommended fix:* they are settings whose starting values are 5 minutes and 30 days. A Round 3 question asks Josh for the starting value of every other Default (gap A3).

**C13. Input sources.** `S01-projects.md:68` lists Polycam scan, PDF, DXF, Field measure, Blank; `06-workflows.md:11` and board S01b add the supplier kitchen PDF.
*Recommended fix:* the six-item list (board wins on wording, part 2 C1 rule); confirm in Round 2.

**C14. Section numbers in cross-references are one off.** `01-how-to-use-this-spec.md:22` numbers sections from 1 (Product overview), but the files start at 02; so "section 9 table" (`phase-01.md:9`) means file 10, and "section 10 (Performance)" (`12:28`, `13:118`) means file 11.
*Recommended fix:* the restructure replaces section numbers with file paths; no question for Josh.

**C15. Render provider timing.** `13:172` says confirm the first image-model provider "at the render trial spike"; Q-0082 (`decisions/07-hooks-events-and-integrations.md:18`) moved the live trial to after Phase 10.
*Recommended fix:* Q-0082 wins; update the open item in `13c` to "before Phase 11".

**C16. Wizard missing fields; client scope.** Auditor's reading: the S01 wizard field list (`S01-projects.md:58-74`) has no Scope of work field (R28, `13:158`) and no Foreman picker (R31, `13:161`); `S01-projects.md:14` scopes "clients" like users while `10:7` says clients are not a preset.
*Recommended fix:* add both fields as R28 and R31 require (Round 2 confirms wording against board S01b); clients reach a project only through its share link (`10:7`).

## 3. Round 1 interview guide (about an hour)

### How it runs
Josh tells the story of real jobs in his own words; the orchestrator listens, asks the prompts below only where the story skips a step, and writes it up afterwards for Josh to confirm (interview plan, "How every round works"). Then up to 15 numbered follow-ups, recommendation first.

### Part A · Three real jobs (about 40 minutes)
Pick three recent or typical Worth Properties jobs: **a kitchen**, **a bath**, and **one with electrical work** (panel change, new circuits, or a kitchen with new appliances). For each job, walk through the steps below. At every step, say three things:
- **Where is EZ Draft used?** (office desk, iPad on site, crew phone, client's phone, or not at all)
- **Who uses it?** (you, an office designer, the foreman, the crew, the client, the architect, the cabinet supplier, the permit department)
- **What must it produce?** (a drawing, a PDF, a number, a list, an email, a signature, a file for EZ Binder)

Steps and prompts:
1. **First call.** How does the job come in? Is there already an EZ Binder job? What do you know about the house before you visit (address, property appraiser record, old plans)?
2. **Measure.** Who measures, with what (tape, laser, Polycam scan on the iPhone)? What do you write down? What goes wrong most often?
3. **Draw.** What do you draw first? Which sheets does this job need (floor plan, demo plan, elevations, ceiling plan, electrical plan, details)? Who draws it today and how long does it take?
4. **Client approval.** What does the client see before they say yes: plan, 3D, a photoreal picture, selections, a price? How do they approve or ask for changes? Do they sign?
5. **Permit set and department.** Which building department? Does this job need a permit set at all? What did the department ask for or reject last time? Who signs and seals, and when is an engineer or architect involved?
6. **Changes.** What changes after approval or after the permit is issued? Who asks for it, who prices it, how does the client agree? Does the permit set get a revision?
7. **Field crew.** What does the crew need on site, in which language, on what device? What do they send back to the office (measurements, photos, questions)?
8. **Closeout.** What ends the job: final inspection, punch list, final photos, invoice in EZ Binder? Does anything from EZ Draft need to be kept or handed over?

For the electrical job, also: when do you need a load calculation (panel upgrade only, or any new circuit)? Who does it today, and what does the department want to see?

### Part B · The phase order (about 10 minutes)
Shown on screen: the slice list in `vault/tickets/PHASES.md` (`### Slice list`, line 64) and the spec-phase → slice table (line 42). Questions:
- After hearing your three jobs, which result do you need first on a real job: a drawn plan, a permit set PDF, a client approval link, the field pack?
- Is anything in the first ten slices something you would not use for months?
- Is anything near the end (EZ Binder connection, slice 35; field pack, slices 40–42; code rule packs, slices 43–46; takeoff, slice 51) something you need much sooner?

### Part C · Numbered follow-ups (recommendation first; at most 15)
1. **Phase list.** Use the 53 slices in PHASES.md as the phase list, with any moves you name today (recommended), or keep the 17 spec phases as they are? (Contradiction C7.)
2. **Phase order.** Keep the slice order as drafted: settings and projects, then drawing, then imports, cabinets, ceilings, electrical, sheets, then 3D, renders and the client link (recommended), or move something earlier?
3. **First real job.** Start using EZ Draft on a live job once the permit set PDF works (slice 23), before 3D and renders (recommended), or wait for more?
4. **EZ Binder.** Keep the EZ Binder connection late (slice 35), since jobs and customers can be typed in by hand until then (recommended), or move it earlier?
5. **Code rules.** Keep the code check engine early (slice 20) and the full rule packs late (slices 43–46) (recommended), or do you rely on the code warnings from day one?
6. **Field crew.** Keep the field pack and offline work after the client link (slices 40–42) (recommended), or does the crew need it sooner?
7. **Mockups.** Treat boards S19–S22, S01b, S15b and S17c as the mockups for those screens, so the "not in mockup" labels come off (recommended), or redraw any of them? (C1–C4.)
8. **New project wizard.** A dialog over the Projects page, as board S01b shows (recommended), or a full page? (C3.)
9. **Who uses EZ Draft.** From your stories: you and one office person draw; the foreman and crew only view and send back on the phone; clients only view and sign (recommended starting point, to be corrected by what you said), or different?
10. **Departments.** Which three building departments do you submit to most? Recommended: build and test the submittal presets for those three first; the others stay as written in `08-import-and-export.md` (Department submittal rules, line 45) until a first job there (`13-decisions-and-remaining-items.md`, unverified department items).
11. **Permit set contents.** For a kitchen with no walls moved, is the set floor plan, electrical plan and cabinet elevations only (recommended, to be confirmed against your story), or more?
12. **Load calculation.** Only when the panel or service changes (recommended), or for every job that adds a circuit?
13. **Change orders.** EZ Draft drafts the change order from the revision (before/after pictures, scope, line items, cost change, overhead, profit, total) and sends it to EZ Binder, where the client approves and signs (recommended, as `screens/S14-change-order-hand-off.md:3` and `:14` read), or should pricing live only in EZ Binder?
14. **Closeout.** EZ Draft has no closeout step in v1 (recommended unless your stories show one), or does something need to be produced at the end?
15. **Gaps you skip.** For gaps in part 1 that your stories did not touch, may they wait for their round (Rounds 2–4) (recommended), or do you want any of them first?

### After Round 1
Write-up for Josh to confirm; then `vault/spec/sections/00-job-stories.md`, decision rows with Q-IDs, an approved PHASES.md and a goal line per phase (interview plan, Round 1 Output).
