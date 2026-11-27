# Spec readiness audit of the unbuilt tickets, 2026-11-27

Read-only audit. Nothing was built, run or committed. Written by one agent; the six-way parallel split it planned was refused (the session's subagent limit was full), so the depth differs by check. Read "Coverage" before relying on a "nothing found".

## Coverage: what was checked, and how deeply

| Check | Scope | Depth |
| --- | --- | --- |
| AC rows exist, spec and decision files exist, anchors, mockup files, dependencies known, dependencies on retired or held tickets | all 240 live tickets | every ticket, by script |
| Every acceptance criterion read | all 240 | read once, for thin, untestable or pointer ACs |
| Prep choices (`vault/build/assumptions/<ticket>.md`) | 216 files, 1,131 rows | keyword scan of every row (no ticket, contradict, missing, retired, EZ Binder, pointer, plan-time, recommend), then the hits read |
| Cross-references: AC or prep row names an unbuilt ticket outside its dependency chain; file paths cited in prep rows still exist | all 240 | by script |
| Code-rule numbers in ACs against `vault/spec/code-rules.json` | phases 57 and 58 (106 rule ids named) | all 106 ids exist; about 45 rules' numbers compared by hand with the check text and edition_difference; no mismatch |
| Spec section read against the ticket | about 25 tickets (EZD-801, 1202, 1205, 1215, 1711 to 1714, 516, 512, 610, 608, 615, 704, 721, 736, 645, 667, 1018 to 1021, 1103, 1105, 907, 223) | full read of prep rows and the named spec rows |
| Spec section read against the ticket | the other 215 or so | **not done**; only ACs, prep-row scan and the scripts above |

So: structural gaps, orphan dependencies and process traps are well covered. A wrong number or a contradiction buried in a spec row of a ticket outside the 25 could still be there.

## Counts

- `tickets.json` held 843 tickets at the start and 864 at the end of the audit (other sessions were adding fix tickets while it ran).
- "No `feat(<id>)` commit on origin/develop": 280 tickets. That rule over-counts:
  - 37 are retired in `vault/build/holds.json` (never to be built).
  - 9 were finished under the old process without a `feat(` commit and are `done` in `vault/build/state.json` and `STATUS.md`: EZD-039, 162, 170, 195, 196, 262, 282, 352, 367.
- **Live tickets still to build: 240** (3 were running during the audit: EZD-1913b, EZD-640, EZD-2000).
- Held, not retired: 4 (EZD-141, EZD-393, EZD-1020, EZD-1120).
- Mechanical result: 0 AC rows missing, 0 unknown dependencies, 0 dependencies on a retired ticket, 0 missing spec or decision files (EZD-2000 has two malformed pointers, below).
- 96 of the 240 have a single acceptance criterion; 180 take their ACs from the old one-line "Done when".
- Every live ticket in phases 18 to 58 except EZD-722 has a prep file of settled choices (prep passes of 2026-11-18 and 11-20), and Josh approved the wording rows on 2026-11-23 (Q-0803). That prep is why few plain spec gaps are left; most findings below are about order, tests and things no ticket owns.

## Findings by phase

Tags: MISSING (too thin or absent), CONTRADICTION, ORPHAN (needs something no ticket builds), PROCESS (the loop will trip on it). Severity is rework risk.

### Across phases

**X1. PROCESS, high. The final sweep tickets build before the last 31 feature tickets.**
Phases 54 and 55 hold the sweeps: EZD-1705 security review, EZD-1706 event log coverage, EZD-1710 code rule list, EZD-1701 performance, EZD-1708 accessibility, EZD-1709a/b/c screen states. The loop sorts by phase (`scripts/loop/order.mjs:4`), so they run before phases 57 and 58 (EZD-644 to EZD-674: stairs, fireplaces, pools, EV chargers, new room types, new inspector sections). None of the sweeps depends on a phase 57 or 58 ticket.
- Direct contradiction: `vault/build/assumptions/EZD-1708.md:12` says the accessibility run opens each rail panel "so phase 57's Fixtures panel sections are covered", but EZD-1708 depends only on EZD-222 and EZD-1709c and is phase 55.
- `vault/build/assumptions/EZD-1701.md:13`: "Phase 57 objects are not added" to the benchmark.
- Fix (not design): rank phases 54 and 55 after 58 (the `phaseRank` exception for phase 56 is the precedent), or add EZD-664 and EZD-674 to each sweep's `depends_on`.

**X2. PROCESS, high. The reviewer's "every AC is named in a test" rule has no exemption for ACs that cannot be an automated test.**
`scripts/conventions/ac-trace.mjs:59-67` lists every AC id of the ticket; `scripts/loop/ac-review.mjs` tells the reviewer each unnamed one is a blocking finding. The header of `vault/spec/acceptance-criteria.md` says field-check rows are Josh's manual checks, "not automated tests". Affected live ACs:
- Field checks: AC-EZD-901b-4, AC-EZD-1014-3, AC-EZD-1105-2, AC-EZD-1611c-4, AC-EZD-1701-2.
- Device-only but not marked as a field check: AC-EZD-1019-1 ("On an iPad the model opens in AR at true scale"; `assumptions/EZD-1019.md` calls it a device field check), AC-EZD-1020-1.
- Pointers to a later ticket: AC-EZD-516-4 ("becomes the selection item of an option in EZD-1011"; prep: "met by not building it"), the "accept a pin" half of AC-EZD-1205-1 (prep: belongs to EZD-1204).
- Not a builder task: AC-EZD-1921-2 ("done by the planner or overseer session, not the builder"), AC-EZD-1956-3 and the second sentence of AC-EZD-1920-2 ("waits for Josh"), AC-EZD-1120-1 ("Defined when the model is chosen").
Result if left: a failed review, or a test that only names the id (against CLAUDE.md rule 10). Fix: exempt `*(field check)*` rows in ac-trace, mark AC-EZD-1019-1 and 1020-1 as field checks, and reword or move the pointer ACs (see Settled S4, S5).

**X3. MISSING, medium. Thin ACs: one sentence stands for a whole screen.**
The builder prompt says the ACs "define done" (`scripts/loop.mjs:393`) and the reviewer reports only blocking problems against the ACs, spec files and decisions. For 96 tickets the single AC proves one behaviour of a spec row set with many. Worst phases (tickets with one AC / live tickets): 29 (7/9), 30 (6/8), 31 (7/8), 32 (2/2), 35 (6/8), 39 (8/9), 40 (5/7), 55 (5/6). Examples: EZD-801 "A detail saves and reopens with its content" for the whole detail data shape and editor shell; EZD-1202 "The page shows the sent version label and no cost data" for the client page; EZD-1211 "Client acceptance test passes"; EZD-718 "Revisions acceptance test passes".
Two things soften it and one does not:
- The prep files hold the real scope, and builders do open them (EZD-614 followed its prep rows).
- But the builder prompt never says the "Settled" rows are to be followed; it mentions the file only as the place to add new rows (`scripts/loop.mjs:405`).
- `next_ticket.mjs --reads` returns nothing for 238 of the 240 (no architecture list), so the prompt falls back to "Read the spec_files and decisions listed in the record".
Fix (not design): one line in the builder and reviewer prompts making the ticket's Settled prep rows binding input; optionally promote the prep rows' test lines to ACs for the one-AC tickets.

**X4. MISSING, medium. Choices the prep left to a planning stage that build v3 does not run.**
- EZD-1103: Gemini model id "not pinned"; "the plan dispatches retriever-web for current ids" (`assumptions/EZD-1103.md:13`).
- EZD-1121: OpenAI model id, mask format, sizes "not written from memory. The plan dispatches retriever-web".
- EZD-1711: Stripe API facts "taken at plan time from a retriever-web report".
- EZD-620: who may see renovation cost and assessed value "goes to the security-reviewer at plan time".
- EZD-1105: the path tracer stops "at a pass count the plan sets".
With no planner the builder will fill these from memory. Fix: a short research note per item before the ticket builds, added to its prep file.

**X5. ORPHAN, medium. Things the spec or a drawing shows that no ticket builds.** Each was listed "for your information" in an earlier question file and never became a ticket or a decision:
- A section detail cut from an elevation (S10 Entry points, `S10-detail-editor.md:10`; `assumptions/EZD-811.md`: plan only).
- A page that lists a project's history (the events are recorded; EZD-736 shows only the acknowledgement line in the Revision log).
- Saving Sketch strokes: S03 puts them "on a markup layer" (`S03-plan-editor.md:49`); EZD-223 (built) keeps them "on this page only (lost on reload)"; EZD-907 creates the markup table but writes only reference markup and has no AC for sketches.
- Reference markup while offline; converting cabinets or furniture from an architect DXF; a third render model (the "Flux Kontext max" row on the S15f drawing).
- Company rules C-01 to C-10 (`vault/spec/code-check-rules.md:176-185`) and the dedicated-circuit warning list.
- Takeoff lines for the phase 57 objects (EZD-673 adds only the phase 58 kinds).
- "Edit in Detail" on the edge library (S15e drawing; `assumptions/EZD-1617.md`).
- `edit_lock.offline` (03c) is never written (`assumptions/EZD-1403.md`).
Questions J2 to J7 cover the ones that are Josh's call.

### Phase 1 and 4 (held fix tickets)

- EZD-393, PROCESS, low: its hold reason and its AC ("5 counting lane gates", Q-0748) describe the old launcher. Under build v3 it is stale; treat like the 26 old-machinery tickets retired on 2026-11-23.
- EZD-141: waits on Supabase's fix of supabase/auth#2852. Nothing to do; not checked whether the fix has shipped.
- `vault/questions/QUESTIONS.md` still shows Q-0717 open (EZD-111's plan could not name helpers from EZD-116, 125, 130). All four are built. Stale row.

### Phase 10 (editor split, audits, loop)

- EZD-1921, PROCESS, medium: AC-2 is overseer work, not builder work (X2). Only one unbuilt prep file names a file the split moves (`assumptions/EZD-1616.md`), so the re-validation is small.
- EZD-2000, low: `spec_files` holds `vault/spec/sections/11-non-functional-requirements.md` (a doubled `vault/` prefix) and `decisions` holds the bare text `Q-0814`; neither resolves in the reading map. It was running, and had been set aside once, during the audit.
- EZD-2007, low: overlaps EZD-1202 (see Settled S6).
- Ready, nothing found: EZD-1913b, 1913c, 1914 to 1920, 1922, 1956, 2001 to 2006.

### Phases 18 to 28 (ceiling, electrical, code rules part 1, sheets)

- EZD-516, PROCESS, medium: AC-EZD-516-4 is a pointer to EZD-1011 (X2).
- EZD-718 and EZD-1211, MISSING, low: the AC is "the acceptance test passes"; the steps live in `12-build-phases-and-acceptance-tests.md` and are not in the tickets' `spec_files` anchors as a list of steps. The builder has to find them.
- EZD-722, low: the only prepped-phase ticket with no prep file of its own (its wording row is under EZD-721). Five clear ACs; fine.
- EZD-738: its retired dependency EZD-732 was already replaced by EZD-731 and EZD-743 (Q-0780). Fine.
- Ready, nothing found: EZD-512, 608, 610, 615, 640, 611b, 611c, 620, 641, 743, 704, 721, 720, 723, 724, 725, 727, 735, 736.

### Phases 29 and 30 (detail editor)

- All 17: thin ACs (X3); the prep rows carry the scope (for example the whole `detail` data shape is fixed in `assumptions/EZD-801.md`).
- EZD-811, ORPHAN, medium: elevation cut has no ticket (X5, J4).
- EZD-817: company detail library starts empty (Q-0773). Settled.
- Otherwise nothing found, at scan depth (only EZD-801 was read in full).

### Phases 31, 32 and 52 (catalog, takeoff)

- EZD-1613, CONTRADICTION, low: shows "Push to EZ Binder estimate" disabled with a "v2" tag, while EZD-1709a treats the other EZ Binder controls as absent (Q-0190). J9.
- EZD-1617, ORPHAN, low: "Edit in Detail" not built (X5).
- EZD-1609 reaches back into EZD-1215 (a tick box) and EZD-1212 (a PDF page). Both are earlier phases, so the order works.
- Otherwise nothing found, at scan depth.

### Phases 33 to 38 (3D, options, AR, renders)

- EZD-1018, 1019, 1020, MISSING, medium: the loop has no iPhone or iPad. The spike's go or no-go "resting on docs alone says so, and Josh confirms on a device" (`assumptions/EZD-1018.md`); EZD-1019's only AC is a device check (X2); EZD-1020 stays held on the verdict (Q-0777). Nothing useful ships from these three until Josh tests on a device.
- EZD-1103, EZD-1121, MISSING, medium: model ids unsettled (X4).
- Phase 36 to 38 as a whole, ORPHAN, medium: Q-0082 says the provider pick "is needed before Phase 11" of the spec (these phases) and comes from a live render trial "after Phase 10". No ticket runs that trial. The phases will build on stubs with no chosen provider or default model per tier. J8.
- EZD-1120: held for a GPU machine; AC "Defined when the model is chosen". Fine as a hold.
- Otherwise nothing found, at scan depth.

### Phases 39 and 40 (client page)

- **EZD-1202, CONTRADICTION with Josh's intent, high.** Q-0805 (b), 2026-11-25: "build the client page sooner" so emailed links stop landing on the staff sign-in. EZD-1202 was moved to the front of the queue. But its prep says every part "stays hidden (not greyed) until its ticket ships" (`assumptions/EZD-1202.md`): renders EZD-1203, selections EZD-1208, signature EZD-1210, approve EZD-1211, and the Plans tab EZD-1205. EZD-1205 depends on EZD-1215, which depends on EZD-1114 (render approval, phase 37) and EZD-1208. So after EZD-1202 the client opens a header with "Version 3 · sent Sep 26" and nothing else, until phases 36 to 40. J1.
- EZD-1205, CONTRADICTION, medium: AC says "Shared sheets open and accept a pin"; the prep says pins belong to EZD-1204 and recommends moving that half (X2, S4). Not yet moved.
- EZD-1205, low: the sheet images are made by a new job this ticket adds; sends made before it have no Plans tab. Matters if J1 pulls it forward.
- Otherwise nothing found, at scan depth.

### Phases 41 to 43 (architect DXF, supplier markup)

- EZD-907, ORPHAN, medium: Sketch strokes are not saved (X5, J6).
- Field checks need real files Josh has not supplied yet: 2 or 3 architect DXFs (EZD-901b, EZD-1702) and a supplier 2020 export (phase 43). Tests run on made-up files until then.
- Otherwise nothing found, at scan depth.

### Phases 44 and 45 (offline, field pack)

- EZD-1403, low: `edit_lock.offline` left unwritten (X5).
- EZD-1406: the drawing's "fire laser" hint is dropped (Q-0759). Settled.
- Otherwise nothing found, at scan depth.

### Phases 46 to 49 (code rules part 2)

- Each of the 23 tickets has the same four generic ACs; the rule ranges and the special cases are in the shared prep rows under EZD-616 and EZD-630. EZD-626 has no file of its own but is covered by the "EZD-616 to EZD-629" rows. Nothing found. The individual rule fixtures were not checked against the catalog here (the ACs carry no numbers to check).

### Phases 50, 51, 53 (Spanish, billing)

- EZD-1711, MISSING, medium: Stripe facts unsettled (X4). Prices and rules are decided: Stripe, $50 a month with 5 office users, $10 per extra, 14-day trial, 14 days of view and export after lapse (Q-0237, Q-0794, Q-0795).
- Billing stays off until Josh creates the Stripe account, two prices and keys. Until then sign-up (EZD-1713) is closed, so these tickets ship dark.
- Ready otherwise: EZD-1502, 1503, 1712, 1713, 1714.

### Phases 54 and 55 (hardening)

- X1 applies to all eight.
- EZD-1705, low: AC-2 names the EZD-1609 allowance summary page, but EZD-1609 and EZD-1618 are not in its `depends_on`. Phase order covers it today; add them so a re-order cannot break it.

### Phases 57 and 58 (code-rule objects)

- The ACs are specific and match the catalog (sample: R3-096 to R3-100, R3-109, RC-030 to 032, RC-084 to 093, G-007, G-087, M-098, NE4-018, NE4-067, NE4-087 to 092, NE4-105 to 108, NE2-086, NE2-108, NE2-115, P-066, EN-058 and R3-122 in both editions).
- `03f-model-json-objects.md` does not define the new types; they rest on Q-0789 and the prep rows of EZD-644 and EZD-665, which fix the fields up front. Acceptable, since decisions outrank the spec.
- ORPHAN, low: takeoff does not count the phase 57 objects (J2).
- Otherwise nothing found.

## Settled here (not design; from spec, decisions or code)

- S1. The ten "anchor not found" pointers (reference_drawing, camera_view, render_allowance, selection_offer, design_option, field_pin, field_measurement, project_price_snapshot, field_pack.issued) all exist. The spec writes `reference\_drawing` with an escaped underscore, so the plain anchor text does not match. Source: `03c-tables.md`, `03d-tables-rounds-24-25.md`, `07-hooks-events-and-integrations.md`. Cosmetic.
- S2. EZD-039, 162, 170, 195, 196, 262, 282, 352, 367 are done, not unbuilt. Source: `vault/build/state.json` done list, `STATUS.md` rows with commits. Count remaining work from `state.json`, not from `feat(` commits.
- S3. Q-0717 is stale: EZD-111, 116, 125 and 130 are all built. Close the row.
- S4. The "accept a pin" half of AC-EZD-1205-1 belongs to EZD-1204, which adds `render_comment.sheet_id` and tap-to-pin. Source: `assumptions/EZD-1205.md`, phase-12 row of EZD-1204.
- S5. AC-EZD-516-4 belongs to EZD-1011 (phase 35), which depends on EZD-516. Source: `assumptions/EZD-516.md`, S05 Decision 10.
- S6. EZD-2007's first AC and the header half of its second are already in EZD-1202's settled row (`/c/` added to the public paths, `Referrer-Policy: no-referrer`). After EZD-1202, EZD-2007 only adds "the sign-in return path refuses any /c/ path" and its tests.
- S7. The allowance summary page is built by EZD-1609 and the budgets by EZD-1618 (Q-0793); EZD-1705's AC names the right ticket.
- S8. Field-check ACs are not automated tests (header of `acceptance-criteria.md`), so the AC trace should skip rows marked `*(field check)*`. This is a tooling change for a ticket, not a spec question.
- S9. Where the phase-57.md "Done when" text and the ACs differ, the ACs win (prep row under EZD-646; CLAUDE.md "acceptance criteria define done").
- S10. Billing provider, prices, trial and lapse rules are decided (Q-0237, Q-0372, Q-0794, Q-0795). The non-goal "payments, and client billing in any form" (Q-0236) is about billing a contractor's clients, not about companies paying for EZ Draft, so phase 53 does not break it.
- S11. Phase 57 tool names and their place (sections of the Fixtures panel, now docked right by Q-0809) are in the wording rows Josh approved on 2026-11-23 (Q-0803). No question needed.

Recommended, not applied (read-only audit): X1 re-rank, X2 trace exemption and AC moves, X3 prompt line, X4 research notes, retire EZD-393, fix EZD-2000's two pointers, add EZD-1609 and EZD-1618 to EZD-1705.

## Questions for Josh

None of these stops the loop today. J1 and J8 decide what gets built next; the rest decide whether a small ticket is added.

### J1. The client's link page is being built early. What should the client see on it?

**What it is:** you asked for the client page sooner so emailed links stop opening the staff sign-in (Q-0805). The piece that was moved up is only the page frame: company name, project name and "Version 3 · sent Sep 26". The drawings, renderings, selections and signature each come from later tickets, and the drawings tab is tied behind the rendering work (phases 36 to 37).

**Options:**
- (a) Also bring the drawings tab forward, so the client can open the sheets you sent. Renderings, selections and signing still arrive later. **Recommended:** it is the smallest step that makes the link useful.
- (b) Leave it as the frame only until the rendering and client phases are built.
- (c) Bring the whole client page forward (drawings, selections, signing), and add renderings when they exist.

Tickets: EZD-1202, EZD-1205, EZD-1215, EZD-1208.

### J2. Should the takeoff count the new objects (stairs, fireplaces, floor drains, garage doors, skylights, generators and so on)?

**What it is:** the takeoff counts cabinets, tile, fixtures and devices. The objects added for the code rules are not in it, and no ticket adds them. EV chargers, disconnects, microwaves and wall ovens are already covered.

**Options:** (a) add a simple count line for each kind, no material quantities (**recommended**), (b) leave them out of the takeoff in v1.

### J3. Your ten company rules (dedicated refrigerator, microwave, dishwasher and disposal circuits, panel spaces left, and the rest): build them?

**What it is:** the rule book lists ten Worth Properties standards, marked "Company rule" so nobody mistakes them for code. No ticket builds them. The code rules cover what code requires.

**Options:** (a) build them, each with an on/off switch in Defaults (**recommended**: they are your own standards and already written down), (b) leave them out of v1.

### J4. Cutting a section detail from an elevation

**What it is:** the spec lets you draw a section line on a plan or on an elevation to start a detail. Only the plan cut has a ticket.

**Options:** (a) plan only in v1 (**recommended**), (b) add the elevation cut.

### J5. A page to read a project's history

**What it is:** EZ Draft records who issued, sent, exported and ticked the responsibility box, and when. Nothing shows that list on screen; only the acknowledgement line appears in the revision log.

**Options:** (a) a simple read-only list on the project, newest first (**recommended**), (b) no page in v1; the record is kept for later.

### J6. Sketch tool: should pen strokes still be there after you close the project?

**What it is:** today a sketch on the plan disappears when the page reloads. The spec puts sketches on a markup layer, but the ticket that builds that layer saves only markup on the architect's drawing.

**Options:** (a) save sketches with the project (**recommended**), (b) keep Sketch as a scratch pad that clears.

### J7. A third rendering model

**What it is:** your Render models drawing shows a "Flux" row. Tickets build two providers (Gemini and GPT Image).

**Options:** (a) two providers in v1 (**recommended**), (b) add Flux as a third.

### J8. When do you want to run the live rendering trial and pick the provider?

**What it is:** you decided to pick the rendering provider after seeing the same rooms run through each one (Q-0016, Q-0082). No ticket runs that trial, so the rendering phases will build on stand-in images with no provider or default model chosen. The trial costs real money per image and needs the provider keys.

**Options:**
- (a) Run it right after the render setup phase (36) builds, on your real 3D views, and pick then. **Recommended.**
- (b) Run it after all three rendering phases are built.
- (c) Skip the trial and start with Gemini; change later if you don't like the results.

### J9. "Push to EZ Binder estimate" on the Takeoff screen

**What it is:** the Takeoff drawing has this button. EZ Binder is not connected in v1. The plan is to show it greyed out with a "v2" tag, while the other EZ Binder controls (sync switches in Settings) are left out entirely.

**Options:** (a) leave the button out, like the others (**recommended**), (b) show it greyed out with "v2".

## Things only Josh can supply (not questions)

- An iPhone or iPad test of AR after the EZD-1018 research note; until then AR viewing ships unproven and AR editing stays held.
- A GPU machine test for the local render worker (EZD-1120 held).
- A Stripe account, the two prices and the keys; billing and sign-up stay off until then.
- Provider keys for the live render trial (J8).
- 2 or 3 architect DXFs and one supplier 2020 export for the field checks.
- Terms of service text (EZD-1707 shipped a placeholder).
