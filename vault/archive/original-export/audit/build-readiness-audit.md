# EZ Draft: Build-readiness audit

Oct 11, 2026 · @Josh

Every item in this audit is now resolved in the documents except one question for Josh (R2 below). The sections after the first one are the original findings, kept as the record of what was found.

## Resolved on Oct 11, second pass

Josh answered the first six architecture items and directed that everything else be resolved. Each decision is recorded in the spec as Round 26 (R1 to R33), in the last section, marked Josh or Claude.

| Document | What changed |
| --- | --- |
| Build specification, main tab | Round 26 decisions table; Architecture rules in Data model (server-only access, versioned sheets and options, schema versioning, lock generation, one outbox, client link); Named tools table; Code check engine with 17 electrical rules and 25 building rules; voltage-drop formula; load calc worked example and the five cases; takeoff formulas; Where each output is produced; Operations; 18 wording fixes where sections contradicted each other |
| Phases and tickets tab | 381 tickets, up from 346. All 14 splits applied, plus the code check ticket split in three. 22 new tickets: conventions file, environments, error reporting, backups, message helper, five spikes, file storage, access harness, app-shell cache, System status, benchmark generator and page, drawing list, three building-rule tickets, two render follow-ups. 5 tickets removed (1016, 1313, 1703, 1711, 1712), their work folded into other tickets or the Phase 17 field check. 180 more cell edits. Gates for Phases 6, 9 and 17 rewritten. Needs from Josh has 6 new rows |
| Mockups | Screen 11 status bar now shows the "Not drawn" count for entity types the DXF parser cannot read. No other board needed a change |
| Original plan doc | Not changed; it is superseded by the spec |

Checked after editing: every ticket cell matches the intended text, every dependency resolves to the same or an earlier phase, and there are no dependency cycles.

**Still needs Josh**

- [ ] **R2, money visibility.** Answered and applied: two permissions, See company costs and See sell prices, replace See costs and prices in the spec (40 places), the tickets (11 places) and the Settings mockup. Owner and Designer have both; Foreman and Crew have company costs only.
- [ ] **Code rules.** Checked Oct 11. The 25 building rules were compared with the code text in the official online viewer for the 8th and 9th Editions: 14 of the 25 were edited: one was wrong (lighting efficacy), eight had a wrong detail or section number, and five gained an exception or clearer wording; the 9th Edition keeps the same section numbers. The 17 electrical rules, the voltage-drop method and the load calc were compared with published 2023 NEC summaries, because the NEC text could not be opened: 7 rules corrected, the voltage-drop arithmetic confirmed, and the load calc example changed (a heater-fan and the refrigerator do not belong in the 75% appliance group; the total is now 35,868 VA, 149.5 A). The app still shows its own wording with section numbers and a link, not copied code text. Each rule keeps the "not yet verified" tag until a licensed person marks it; the electrical rules need the NEC book for that.
- [ ] **Decisions made by Claude that are worth a look:** R14 (signer check left as typed email with an attempt limit), R17 (Spanish for crew phone screens only), R18 (cloud render first until the GPU test passes), R21 (Google's image API as the first render provider), R24 (which walls get elevations).

## Decisions needed before the architecture is locked

The first six would each cause rework across many tickets if decided late. None was changed in the spec; each needs a yes, a no or a different choice. The review was done by an independent pass that read the stack, data model, workflows, integrations, non-functional requirements and decisions, and sampled the screen sections.

| # | Issue | Why it matters | Recommended |
| --- | --- | --- | --- |
| A1 | The spec never says whether the browser reads the database directly or only through the server. Row-level security checks tenant and project only, not permissions. | If any ticket queries from the browser, a Crew user's sign-in can read costs and write model objects. Different sessions will choose differently. | All table access goes through server routes that check permissions; row-level security is the backstop. Cost fields live in separate tables only the server reads. Move the cost-removal test from Phase 16 to Phase 1. |
| A2 | Sheets, viewports, countertops, panels and circuits, details and option changes are stored per project, outside the versioned model. | A sent version or Rev 0 does not freeze them, Revert does not revert them, and revision clouds cannot see them. | Anything that prints on a sheet or is in a signed package is a model object. State that reference markup and camera views are not versioned. |
| A3 | The model has no schema definition, validation or schema version. | About 100 tickets add object types, and sent versions are permanent. Old versions and offline queues will hold shapes later code cannot read. | Extend EZD-202: one schema module, a schema version on versions, objects and queued changes, migrate-on-read functions, server validation on save, and a CI test that loads every earlier schema version. |
| A4 | The edit lock has no generation number tied to saves, and checkpoints are assembled in the browser. | After the 5-minute auto-release, a sleeping iPad tab can wake and save over the new holder's work. Tab-close is unreliable on iOS. | Add a lock generation that every save must match; build checkpoints on the server from saved rows. Decide: may a non-holder send while someone else is editing? Recommended yes, from the last checkpoint, with a notice. |
| A5 | Offline is a second write path added in Phase 14 on top of the Phase 1 autosave. The spec says offline changes sync "the same way as an autosave" and also "as a new version". | Phase 14 reworks the save path every editor ticket depends on. | Build one outbox in EZD-120 that autosave drains; offline is a long drain. Move the app-shell cache to Phase 1 or 2. Queued changes sync as autosaves and a checkpoint follows. |
| A6 | The permit PDF pipeline names no library and does not say where the sheet is built. Plan, sheet and PDF are three renderers of the same geometry. | Line weights, hatches, text and scale drift between screen and print, and the first proof is Phase 7. The permit set is the core deliverable. | The geometry package emits one drawing list used by the plan canvas, the on-screen sheet and a direct PDF writer. Prove it with a Phase 0 spike: one room to a 24x36 PDF that measures true. |
| A7 | "Nothing is recomputed on the server" conflicts with jobs that need derived results: PDF sets, issue-time code check, stored takeoff, GLB export, render guide images. | Stored results would depend on one browser's copy; GLB export and guide images cannot run in a server function. | Add a table to the spec: where each output is produced. Calculations run in both browser and server and are re-run on the server at send or issue. |
| A8 | The riskiest unknowns are first proven late: 150,000-entity DXF on the iPad (Phase 9 and 17), vector PDF (7), DXF parser fidelity (9), wall openings (10), AI render approach (11). | The plan canvas architecture is locked in Phase 2. | Add a short spikes phase after Phase 0 with five throwaway tests and a go or no-go note each. The architect DXFs are needed then, not in Phase 9. |
| A9 | The automated frame-time gate runs on CI machines with no GPU. | A noisy gate that blocks every ticket either stalls the agents or gets loosened. | Gate CI on countable things (draw calls, rebuilt buffers, rows written per save, download size). Add a one-tap benchmark page Josh runs on the iPad at each field check. |
| A10 | Many technologies are unnamed: DXF parser and writer, PDF library, state store, test runner, schema library, email provider, IndexedDB wrapper, migration naming, folder layout. | One ticket per fresh session means each session can pick differently. | Add EZD-000: a conventions file with one named, version-pinned choice per item, read before every ticket. |
| A11 | No release process, rollback, error monitoring or environment policy. Field checks on real jobs start at Phase 2 while about 300 more commits with migrations land. | A solo owner reviewing through the UI has no way to learn something broke. | Production deploys only at a phase gate or on approval; migrations never destructive in the same release; a named error-reporting service that emails on new errors; a System status page. |
| A12 | Backups cover the database only and are kept 7 days. Uploaded files, issued PDFs, signatures and renders are not backed up. The restore drill is in Phase 17. | Supabase states that database backups do not include stored files. | Nightly copy of new files to a second provider, weekly database dump, and the restore drill before the first real job. |
| A13 | Client share link: the server path, file exposure and signer check are not specified. Typing the email on file proves only knowledge of the address the link was sent to. | A signed approval is evidence. | Client pages served only by server routes with an explicit field list; private files with short-lived links; rate limits. Decide the signer check: keep typed email (Round 24 #32) or email a 6-digit code at signing. Recommended: the code. |
| A14 | Magic-link sign-in on an installed iPad or iPhone app opens in Safari, which has separate storage, so the installed app stays signed out. The exchange that turns an EZ Binder token into a session is not designed. | Crew sign-in is the first step of every field flow. Needs checking on the devices. | The email carries the link and a 6-digit code typed into the app. Specify the sign-on exchange in the EZD-019 contract. |
| A15 | "DXF references keep 100% of the source drawing" cannot be tested as written; open-source parsers drop some entity types, and the Phase 9 gate only counts what the parser reports. | The parser choice also decides Phase 3 import, export and the revision diff. | Pick the parser in the spikes phase, publish a supported-entity list, show "N entities of type X not drawn" per reference, and use the same parser in Phase 3. |
| A16 | Is the app's own interface translated, or only tasks, notes and keynotes? | If buttons and messages are Spanish in the field pack, every string needs a message helper from Phase 0. | Field pack and client link bilingual; every string goes through one helper from EZD-015 on. |
| A17 | The local GPU worker is the preferred render path while its model, runtime and GPU suitability are all open. | The cloud path is the only one that can be tested today. | Build the protocol as planned, treat the cloud API as primary until the GPU test passes, and give the worker its own revocable key. |

Smaller architecture items: the job queue needs claim, lease and idempotency rules (EZD-009); the single WebGL renderer rule is stated three different ways; row-level security needs a token hook, session revocation on deactivation and channel authorization; iPad storage can be evicted, so the app should request persistence and warn about unsynced changes; the running-cost rows add up to about $70 to $80, not $80 to $110, and omit a second Supabase project, CI minutes, monitoring and file backup.

Sources for platform facts: [Vercel Functions limits](https://vercel.com/docs/functions/limitations), [Supabase database backups](https://supabase.com/docs/guides/platform/backups.md), [WebKit storage policy](https://webkit.org/?p=14403).

## Decisions needed on tickets

Each of these would stop a builder under rule 5 (do not guess) or let it guess wrong. The first five block whole phases.

| # | Tickets | What is missing | What is needed from Josh |
| --- | --- | --- | --- |
| T1 | EZD-611 | The code-check ticket says to implement "the rule table in Calculations", and Calculations has only rule names. Only countertop receptacle spacing has numbers. The ticket forbids looking up code text; the spec says code sections must be verified during build. | A confirmed rule table: rule, where it applies, test condition, NEC reference. Add it to Needs from Josh. |
| T2 | EZD-610 | No voltage-drop formula in the spec, and the expected 3.1% in the test is not reproducible from the stated inputs (the usual formula gives 3.8% at 20 A). | The formula, conductor table, load basis and voltage. |
| T3 | EZD-607, EZD-615, Phase 6 gate | No demand factors or VA values in the spec; the five load-calc cases are named but not defined; the test numbers come from a mockup. The gate needs Josh's hand calc with no fallback. | A worked standard-method example with every line, and inputs and outputs for each case. |
| T4 | EZD-1611 | Takeoff rules are a list of names with no formulas: drywall sheet size, wire-run method, ACT main and tee spacing, tile box coverage, paint coats. | A formula table in Calculations. |
| T5 | EZD-1102, EZD-1103 | No image-model provider is named, so the adapter cannot be written. | Which provider to adapt first; the rest become follow-up tickets. |
| T6 | EZD-1701, 1703, 1704, 1710, 1711, 1712, Phase 17 gate | These need the real iPad, a live restore, NEC text, real invoices or a first real submittal. The gate is not automatable, which contradicts rule 7. | Approve moving 1703, 1711 and 1712 to the field-check list and rewriting the others as automated checks with a field check each. |
| T7 | EZD-1403 | The offline conflict list has no resolution actions anywhere in the spec. | The choices per conflict, for example Keep mine or Keep theirs per object. |
| T8 | EZD-1009, 1010, 1011, 1016 | What an option's model change contains, where internal cost lines come from, and how A, B and C start are undefined. 1010 shows a status that 1016 adds later. | Cost lines typed or catalog cost times quantity; approve folding 1016 into 1009. |
| T9 | EZD-401, EZD-408 | "Seeded items" and "vendor cabinet lines" are undefined; auto-fill depends on them. | A real cabinet line, or approval of a generic seed line (B, DB, SB and W in 3" steps from 9" to 36", fillers 3" and 6"). |
| T10 | EZD-707 | Scope reads as elevations of every wall; the test covers cabinet runs only. | Cabinet-run walls only, or every wall of kitchen and bath rooms. |
| T11 | EZD-306 | No ticket says how a non-Polycam DXF layer becomes walls and openings. | Reuse the Polycam detector, or convert lines to walls only. |
| T12 | EZD-233 | Saved groups are "placed again from the library Saved tab", which exists only in the cabinet library. | Where non-cabinet groups are placed from. |
| T13 | EZD-1313 | A job-feed ticket conditioned on "once the integration is live"; the EZ Binder contract has no job-feed call. | Delete it, or define a notification event in the contract. |
| T14 | EZD-1707 | Terms of service text is legal content. | Text from Josh or the attorney; the builder ships the page with placeholder text. |
| T15 | EZD-710, 716, 130 | "Scope of work" prints in the title block and gates "Title block complete", and no field or input exists for it. | Approve adding the field to the project and to Project settings. |
| T16 | EZD-1212 | The optional allowance summary has no source for allowance amounts until Phase 16. | Move it to Phase 16 or define the source. |
| T17 | EZD-1105 | The browser path tracer has no interface text in the spec, and it is not stated whether its result is saved as a render. | Saved as a Photoreal render at cost 0 needing review, or not saved. |
| T18 | EZD-1104 | The local worker's language and packaging, where its token and heartbeat are stored, and what happens to a claimed job when the worker dies are unstated. | Approve a Node command-line program, a render\_worker table, and requeue to the cloud after a timeout. |
| T19 | EZD-921, EZD-1422 | How the architect's revision letter is obtained, and which Foreman gets the field-measure link. | Typed at upload and prefilled with the next letter; Foreman picked in the wizard. |
| T20 | EZD-1301, EZD-1303 | Where the per-tenant webhook endpoint, signing secret and inbound key are entered is not in Settings or the tickets. | Stored at Connect (EZD-114) as the contract defines. |

## Ticket splits proposed

Fourteen tickets bundle more than one session of work, and most have a test that covers a small part of the scope, so QA would pass them mostly unbuilt. None was split yet, because each split needs new tests and repoints other tickets. Say which to apply.

| Ticket | Why it is too large | Proposed parts |
| --- | --- | --- |
| EZD-016 Test harness and fixtures | Test runner, seed data and all fixture generation. The generator also lacks a GLB and a scanned PDF that four later tickets need. | a: runner, helpers, seed. b: fixtures folder and generator, with the GLB and scanned PDF added. |
| EZD-017 Performance benchmark | Generates a 3,000-object model, a DXF and renders before the model schema, canvas or render table exist. | Keep the check harness in 017. New EZD-236 in Phase 2: benchmark project generator. |
| EZD-117 Projects page (optional) | One large screen. | a: query, cards, paging, tabs, sort. b: header, search, states. |
| EZD-120 Model save | Two tables, autosave, checkpoints, the device copy, header state and error banner. The in-memory store it needs is in EZD-202, which depends on it. | a: tables and checkpoint API. b: model store, autosave, editor route. EZD-202 keeps schema only. |
| EZD-611 Code check rules | Many unrelated rules in one ticket. | a: engine, countertop spacing, GFCI, AFCI. b: dedicated circuits, small-appliance count, smoke and CO, voltage drop. |
| EZD-702 Sheets screen | The screen and the whole sheet renderer and thumbnail cache; the test covers neither renderer nor cache. | a: Sheets screen. b: sheet renderer. |
| EZD-708 Electrical sheets | Three sheets, two schedules, a note and a signature block; the test covers one sheet. | a: RCP sheet and fixture schedule. b: E1.0. c: E2.0, note and signature block. |
| EZD-901 Reference DXF | Conversion job, binary format, snap index, loader, draw path. No test file with blocks, hatches, text or paper space exists. | a: conversion job and a generated fixture pair. b: drawing in Plan. |
| EZD-909 Reference diff | The diff engine and the whole diff interface; the test is one moved wall. | a: diff job. b: diff interface. |
| EZD-922 Reference and supplier states | States and events across about ten earlier tickets on two screens. | a: screen 11. b: screen 12. Move each event to the ticket that owns its feature. |
| EZD-1001 3D scene | Meshes for every object family, textures, caching, shared renderer. | a: scene core and walls. b: ceilings and beams. c: cabinets, tops, fixtures, devices, finishes. |
| EZD-1104 Local render worker | Server protocol, a command-line program and routing. | a: worker protocol. b: worker program. Give the real-runner follow-up its own ID. |
| EZD-1611 Takeoff | About 15 quantity families plus option costs and the sent snapshot. | a: framework and room finishes. b: cabinets, tops, fixtures, electrical. c: ACT, option costs, snapshot. |
| EZD-1709 State review | Every screen times six states in one session. | a: Projects and Settings. b: editor tabs. c: phone and client screens. |

## For the build-setup session

The documents assume a vault, a handoff file and agents that do not exist yet. These items belong to the setup session and are listed so nothing is missed.

- [ ] **Spec into the vault as files.** The spec lives in a Claude doc that Claude Code agents cannot open. It is about 340,000 characters, so it must be exported and split one file per section and per screen for rule 1 ("do not load the whole spec") to work. Decide which copy is the source of truth after the export.
- [ ] **Tickets into the repo, with a status ledger.** The tickets tab has no status column. The coordinator needs one file per phase and a record of each ticket: not started, in progress, passed with commit, blocked with the reason.
- [ ] **Mockups into the vault.** QA checks each ticket against its mockup, and the mockups are on a design canvas the agents cannot open. Export only the 22 Studio boards (S01 to S18b). The canvas still holds 16 superseded boards on the Polished, Refined and Layout C pages.
- [ ] **Handoff file.** Rules 5 and 8 write questions and skipped tickets to it, but its path and format are not defined. Suggested sections: last ticket and commit, open questions for Josh, skipped tickets and why, next ready ticket.
- [ ] **Conventions file.** See A10: one named, version-pinned choice per technology, read before every ticket.
- [ ] **Commit and branch policy.** EZD-002 says a failing test blocks merge and each branch gets a preview, while the plan is one commit per passing ticket. Decide: one branch per ticket merged on pass, or commits straight to main.
- [ ] **QA run time.** Rule 3 has QA run the whole suite on every ticket. With three device sizes and several hundred browser tests this will take a long time by Phase 10. Suggested: QA runs the phase's tests plus a smoke set, and CI runs everything.
- [ ] **Agent machine.** Docker Desktop for the local Supabase (now in Needs from Josh) and the Playwright browsers must be installed where the agents run.
- [ ] **Coordinator rule.** Ten tickets depend on a later-numbered ticket in the same phase. The tickets tab now states the rule: take the lowest-numbered ticket whose dependencies are all committed. The coordinator agent's instructions should repeat it.

## What was changed

In the Phases and tickets tab, 155 cells in 118 tickets were edited, plus the rules and the Needs from Josh table. Every edit was checked afterwards against the intended text; the tab still has 346 tickets, every dependency resolves to an earlier or same phase, and there are no dependency cycles. The doc's version history holds the earlier text of each cell.

| Kind of fix | Count | Tickets (EZD-) |
| --- | --- | --- |
| Depends on: added the ticket that creates a table, screen, stub or helper the scope uses; removed or replaced wrong ones | 46 | 013, 109, 110, 111, 307, 403, 614, 615, 711, 720, 727, 816, 903, 906, 907, 911, 916, 917, 918, 920, 1007, 1103, 1108, 1110, 1115, 1208, 1301, 1303, 1306, 1309, 1310, 1314, 1408, 1409, 1410, 1413, 1417, 1418, 1419, 1420, 1502, 1602, 1603, 1604, 1609, 1617 |
| Done when: replaced tests that needed a later ticket, a live account, a printer or a person; widened tests that covered a small part of the scope | 57 | 002, 004, 007, 008, 018, 110, 223, 226, 303, 305, 306, 307, 404, 415, 504, 507, 510, 513, 612, 705, 713, 714, 715, 720, 726, 803, 815, 905, 907, 911, 913, 919, 1002, 1005, 1107, 1108, 1109, 1113, 1114, 1201, 1206, 1302, 1314, 1401, 1404, 1405, 1408, 1409, 1419, 1420, 1603, 1604, 1614, 1701, 1705, 1706, 1708 |
| Scope: named the ticket that creates each table; removed work claimed by two tickets; added fixtures a test needs | 40 | 005, 008, 021, 117, 122, 214, 307, 516, 608, 614, 615, 711, 816, 915, 916, 1006, 1007, 1012, 1102, 1117, 1204, 1211, 1314, 1401, 1404, 1408, 1410, 1413, 1415, 1419, 1420, 1421, 1422, 1501, 1502, 1507, 1603, 1608, 1609, 1617 |
| Spec ref: pointed to a heading that exists | 12 | 022, 107, 124, 222, 227, 415, 515, 723, 724, 1314, 1420, 1421 |

The changes with the widest effect:

- **Project table moved to EZD-005.** Four Phase 0 tickets needed it before EZD-117 created it.
- **Phase 0 no longer waits on accounts.** EZD-002, 004, 007 and 008 now pass on the local Supabase and a stub email transport; only EZD-003 and the cloud steps wait for keys. EZD-013 no longer depends on DNS.
- **Email stub moved from EZD-021 to EZD-008**, because four tickets send email before EZD-021 exists.
- **Phase 7 export tests untangled.** EZD-713, 714 and 726 had tests that needed tickets built after them.
- **Phase 14 ordering knot untangled.** The field pack issue table is created in EZD-1404, task drafting in EZD-1408, and publishing is tested where the screens exist.
- **EZD-1314 changed from a second event registry to an audit of the EZD-022 registry.**
- **Print tests made automatic.** "Prints to scale" is now a check of page size and the check dimension in PDF units, with a field check by Josh.
- **Rules.** Added the ready-ticket rule, the rule that the first ticket naming a table creates it with its security policy, the full list of stub tickets in rule 4, and the Studio-boards-only rule for mockups.
- **Needs from Josh.** Added the GitHub repository and Docker Desktop; corrected two rows that told agents to skip tickets they can build on stubs.

Not changed: the spec's main tab, the mockups and the original plan doc. The status note's ticket count of about 317 is out of date; the tab holds 346.

## Found but not fixed

- **Vague state tests.** EZD-015, 225, 314 and 722 say "each state renders as specified". Each needs one named assertion per state.
- **Data model disagrees with tickets.** The Data model lists a panel table and edge\_profile.price\_per\_lf; EZD-604, 606 and 417 put the panel in the model and price per top. Builders read Data model on every ticket.
- **Tables with no owner.** The Settings libraries have no table in the Data model, and four tickets store files before the source\_file table exists in EZD-301. A small file-storage ticket in Phase 1 would fix the second.
- **Placeholders before their features.** EZD-118 and 130 pick a submittal profile and code edition that arrive in Phases 6 and 7; EZD-230 registers shortcuts for tools not built yet.
- **Duplicates.** EZD-607 and EZD-717 both store the electrical calc; EZD-1601 and EZD-1616 both build the Catalog rail button; EZD-229 and the Phase 5 ceiling tickets create the same object kinds.
- **Unnamed library.** EZD-1106 converts HEIC photos with no library or fixture named.
- **Spec wording.** EZD-1001 says walls use three-bvh-csg and, in the same row, only as a fallback. The Phase 17 goal says performance is met there, while section 10 says it is not left to the hardening phase.
- **Not verified.** Whether Playwright's WebKit project supports the Phase 14 service-worker tests, and whether CI machines can meet frame budgets without a GPU. Spec refs were checked only where they looked wrong.
