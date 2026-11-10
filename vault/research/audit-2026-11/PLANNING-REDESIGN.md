# Planning redesign, and the build changes Josh approved on 2026-11-10

Audit 2026-11, session 16, written after Josh's reply to the audit. Josh, in chat on 2026-11-10: "The biggest thing that will help this build is to put more effort into the planning of each ticket before the build starts. that includes every detail, what it needs to do, what it connects to, how it it should be designed, any database, etc."

This file is a design for the orchestrator to turn into build-system tickets. It changes no code, ticket or launcher file itself. Part 1 is the planning redesign Josh asked for. Part 2 records his answers and designs each approved change. Part 3 is the order of work.

---

## Part 1. Planning each ticket properly before it is built

### 1.1 What goes wrong today (evidence)

**Why built tickets strayed from their plans.**
- **Method.** A phase-auditor read every done product row in phases 2 to 5 (STATUS.md), plus EZD-5601, and the 8 later fix tickets whose own plans name an earlier ticket as the cause.
- **Scale.** It sorted 237 deviation, plan-gap, test-repair and fix-ticket items into causes. One reader sorted them all, so each count may be off by about two.

| Cause | Items | Typical example |
| --- | --- | --- |
| **(c) The plan missed what the change connects to** | **31** (23 in the tickets' own notes, plus 8 later fix tickets) | EZD-120c made project cards links. That broke the tap-target count and EZD-118's Create test, which cost two fix tickets (EZD-338, EZD-339; vault/plans/EZD-338.md:10, EZD-339.md:12). EZD-209 changed a page count that EZD-133's page inventory pins (STATUS.md:188). |
| **(f) The test was designed wrong** | 26 | EZD-299: "four test faults (T9 expects number; stored() uses object_id; ...)" (STATUS.md:658) |
| (h) Harmless or cosmetic | 24 | a key-count typo (EZD-211a, STATUS.md:191) |
| **(e) Screen or interaction detail missing** | 18 | EZD-117b missed the 44 px tap areas (PLAN-GAP, STATUS.md:156). EZD-208a never said what Shift-on-release or a drag over 10 px means (STATUS.md:186). |
| **(i) Behaviour or edge case never decided** | 18 | EZD-205a never decided the float margin in the room area, which gave 122 SF instead of 123 (STATUS.md:180). EZD-120b's drain-loop race (Q-0597). |
| **(d) Database detail missing or wrong** | 12 | EZD-294: SQL patched 4 times, and a member could poison project numbering (D-099, fixed by EZD-366; STATUS.md:710). EZD-117a's migrations would sort before develop's newest (STATUS.md:155). |
| (b) The dependency's real code differed from its plan | 9 | EZD-204b: doors pass `a.hand!` and `a.swing!` (STATUS.md:179) |
| (g) Tooling or environment | 6 | |
| **(a) The plan was wrong about code that already existed** | **4** | EZD-110a's 401 response missing no-store (fixed by EZD-349) |

**What this says**
1. **The plans are detailed but aimed at the wrong things.** Being wrong about the code is rare (4). Missing *connections* is the largest single cause (31). The template has no section for connections or for end-to-end data flow. "Data" is one line (vault/plans/TEMPLATE.md:12), and "what could break other tickets" is one line (TEMPLATE.md:61).
2. **Taken together, the wanted kinds (c, e, i, d) make up 79 of 237 items.** Those are connections, screen detail, undecided behaviour and database: exactly the four kinds Josh named.
3. **Lessons written as text do not stop repeats.** `vault/lessons/planner.md` has 60 entries. Mistakes came back after the lesson for them existed:
   - EZD-294's unbounded number came after L-061.
   - EZD-140's RLS audit list repeats L-049, after EZD-110a had already caused fix ticket EZD-292.
   - The 44 px tap area was missed in 117b, 118, 343 and EZD-330.
   - A lesson the planner must remember is weaker than a field the plan must fill, or a script that fails.
4. **Plans on disk do not match what was built.** EZD-294's four SQL patches were never written back to the plan, and EZD-210b's plan still has the wrong B6 row. So the next planner, reading the dependency's "interface contract", reads a plan that is no longer true. That is cause (b).

**Limits that make this worse** (current files):
- The planner agent has `maxTurns: 40` (.claude/agents/planner.md:6). Four audit agents in this session hit the same 40-turn wall.
- The plan target is 25,000 characters, with "tighten, don't split" (PROCESS.md section 6, Ticket size).
- The plan-checker is Sonnet at low effort with 12 turns. It reads only the plan and opens each "copy the pattern from" file only to see that it exists (.claude/agents/plan-checker.md:5-12).
- The phase plan review reads plans against each other, and reads spec files only "to settle a specific doubt" (.claude/skills/review-plans/SKILL.md step 1). **No step checks a plan against the code and the database as they stand when the build starts.**
- Planning runs ahead while dependencies are still unbuilt (lanes plan side by side, PROCESS.md section 6). So a plan's code facts can be stale by the time it is built.
- **Splits are found late.** 47 split proposals came only after a full plan had been written (B2-B4-process.md, B3).

### 1.2 The new planning method: five steps, each with a check that can fail

A ticket becomes `ready` only when all five steps have passed. Steps P1 and P2 can run phases ahead, because they need only the spec. P3 runs **just in time**, when every dependency has merged, so its code facts are current.

| Step | When | Who | Output | Check that must pass |
| --- | --- | --- | --- | --- |
| **P1. Brief and size** | As soon as the phase is signed off | planner (Opus 5.5) | One page: what the ticket must do in plain words, its ACs, the screens, tables and routes it touches, an estimate of files and tests, and a split decision **now**, before any full plan. | A script checks that the estimate is under the size limit, or that the split has been applied. No full plan is written for a ticket over the limit. |
| **P2. Design dossier** | Ahead, after P1 | planner (Opus 5.5, high effort) | Sections A, B, D and E below. These describe behaviour, design and database, which need the spec and decisions but not the latest code. | `plan_lint` gets a new rule: every required table has rows (or "none" with a reason). An independent reviewer (Fable 5.1, or Opus if Fable is not available) reads the dossier against the spec, decisions and mockup and answers one question: "Is every behaviour, state and database detail decided?" For a ticket that touches tables, permissions or money, the security-reviewer reads section D now, not after the build. |
| **P3. Code-bound plan** | Just in time: when every `depends_on` ticket has merged | planner (Opus 5.5, high effort) | Sections C, F, G and H below, written against develop's current code, with file:line for every connection. | Two scripts must pass before `ready`. (1) **Contract check:** every path, export and signature the plan says exists does exist at develop HEAD, and every "new" one does not. (2) **Connections check:** the plan's Connections table names every file in the shared-list register (section 1.4) that the change reaches. A missing row fails. |
| **P4. Readiness review** | After P3 | plan-checker, upgraded: Opus at high effort, reading the plan **and the code it names** | A list of any decision still left to the builder. | `READY`, or the gaps are fixed. The two-round cap stays, and anything still open becomes a question. |
| **P5. Phase cross-check** | When a phase's P3 plans are done | code-reviewer (existing review-plans unit) | Conflicts between plans, mismatched contracts, uncovered ACs. | VERDICT PASS (as today) **plus** a dependency check: each plan's contract matches what its dependencies *actually merged* (their committed plan and code), not what they first planned. |

**The plan stays true.** A plan-gap patch, structural repair or re-validation is committed to the plan **before** the merge. The feat commit is refused when the plan's interface contract and Connections table disagree with the merged diff (a script, at merge). This closes cause (b): the next planner reads the truth.

### 1.3 What every plan must contain (the new template)

Josh's four headings, each made into required tables. "None" is allowed only with a one-line reason.

**A. What it must do** (P2)
- For each AC: the behaviour in steps, for every role (owner, office, field, view-only, no permission).
- A **failure and edge-case table** for every function and screen action: empty input, bad input, too-large input (an integer or length bound for every number, from L-061), a double click or two requests at once (races), going offline and reconnecting, a storage or network failure, and floating-point margins for any measured or rounded value (cause i; the EZD-205a area, the calc-auditor's wall-length defect).
- **What the user sees when something fails.** No silent failure: every error path names its message or state. Josh's 2026-11-10 answer on the floor-plan labels sets this as the rule.

**B. Design** (P2)
- Component tree: the new and changed components, and which existing component each one copies.
- **A state table for each screen:** empty, loading, filled, error, no permission, offline, and partial (some data failed). Each row names its mockup board, or "not on a mockup", in which case the wording goes to Proposed wording.
- **An interaction table for each control:** pointer down, up and drag (with the drag threshold), Shift, Ctrl/Cmd, touch, keyboard, Escape and cancel. Each row gives the exact size and position from the mockup and the **44 px tap area** (cause e: the 44 px miss happened 4 times).
- How the screen sits next to elements other tickets own: header, rail, banners, editor bar.
- The viewports: desktop 1600×1000, iPad 1180×820, and phone where the spec asks for it.

**C. What it connects to** (P3, written from develop's code)
- A **Connections table**: one row for each caller, consumer, route, event, job, other screen, and other phase's test that the change reaches. Each row gives file:line, found by grep at develop HEAD. "Others: PLAN-GAP" is not allowed (EZD-210b's plan said exactly that, at vault/plans/EZD-210b.md:181).
- **Every row of the shared-list register (1.4) the change touches**, with the expected new value. Examples: page counts, route inventories, RLS audit lists, money route cases, tap-target lists, disclaimer page lists, bundle budgets, secret-key client lists.
- **Data flow end to end:** screen → API route → server function → SQL function or table → response → screen state. One row per hop, with the exact names.
- **What the live site uses.** Until launch, develop's migrations reach the database under the live site (Q-0264; A5). Name every database function or table the change alters that main's code still calls, and how main keeps working. If it cannot, the migration waits for the phase merge.

**D. Database** (P2 design, P3 confirmed against develop)
- The exact DDL for every new or changed table and column, with type, nullability, default, check constraint and **upper bound**.
- **The RLS policy text** (all of it, for each of select, insert, update and delete), and the tenant and role checks each one makes.
- Grants to anon, authenticated and service role.
- Every function: its signature, `SECURITY DEFINER` or not, and the `require_api_gate`, tenant and permission checks inside it.
- The migration file name, and its order against develop's newest migration (lesson L-060).
- The type regeneration step, and any backfill.
- The security-reviewer signs this section off at P2 for any ticket that touches tables, permissions, money or migrations.

**E. Wording** (P2)
- As today: Proposed wording for all text not on the mockup. Josh approves it in bulk at Stage 2 (PROCESS.md section 3a).

**F. Tests** (P3)
- One row per AC. Each row gives: the input, the expected value with its source, **the exact fixture and where it comes from**, how the test waits for timing or ordering (no fixed sleeps), and which gate scope runs it.
- **No count or timing that depends on the machine** (A1 phase 4 row 2: the iPad pan count is 8 on a Mac and 4 or 5 on CI). A test that must hold on CI says so, and the gate runs it on CI.
- **A regression list:** every existing test the Connections table touches, and the gate runs those tests whatever its scope.

**G. Build steps, Decided for the builder, Do not touch** (P3)
- As today, and now written against current code.

**H. Risks**
- What could break: performance budgets, other phases, the live site.
- The question for each: would this ticket's own gate notice? If not, the regression list covers it.

**Size.**
- The fixed 25,000-character target goes. A plan is as long as these tables need.
- The split rule moves to P1, on the estimated count of files and tests: over about 20 files or about 25 tests means split. The numbers are Josh's 2026-10-22 limits, applied before planning instead of after.
- The planner's turn limit rises from 40 to about 100, and P3 can be its own unit, so neither step runs out of room.

### 1.4 Lessons become checks

- **The shared-list register.** One file lists every test that pins an app-wide list or count, with how to read its current value. The connections check reads it. It starts with the lists named in lessons L-021, L-024, L-041, L-049 and L-064, and in fix tickets EZD-292, 338, 339, 340, 343, 350 to 353, 367, 370 and 371.
- **Lesson to check.** Each planner lesson that can be checked mechanically becomes a `plan_lint` rule or a template field:
  - L-060, migration order: a script compares timestamps.
  - L-061, integer bounds: every integer column in section D needs a bound.
  - 44 px: every row of the interaction table needs a tap-area size.
  - L-049 and L-041, pinned lists: the connections check.
- **A lesson that cannot be checked stays as text.** When a lesson's mistake happens again, it becomes a check (lessons 3 in 1.1).

### 1.5 What it costs and what it saves

- **Cost of planning today.** Plan units cost $1,321 est_usd in all, a median of $3.81 per successful plan unit (308 units; `jq` over vault/cost/log.jsonl). That is 31% of all spend (B1.3).
- **Expected cost.** With P1 to P5 and the higher turn limit, planning per ticket will probably cost 2 to 3 times as much: about $8 to $12 median. That is an estimate, not a measurement. For the 350 tickets left, that is about **$1,400 to $2,900 more est_usd**.
- **What it should save:**
  - The fix tickets caused by missed connections: 8 in phases 2 to 5, each a full plan, build, review and gate (median $7.81 a ticket, plus gate time).
  - Repeated units: $786, or 18% of spend (B6).
  - Split re-plans: 47.
  - Re-validations: 96.
  - The stalls these caused.
  - It does not remove cause (h), which is harmless, or (g), which is tooling.
- **How we will know.** Pilot the method on **phase 6**, which Josh is holding anyway: re-plan its 8 open tickets under P1 to P5 before releasing them. Compare deviations per ticket, fix tickets per phase and cost per merged ticket with phases 4 and 5 (the baseline in B1 and B3). Keep the method if deviations of kinds c, d, e and i fall by half or more. Otherwise adjust it before it applies to every phase.

---

## Part 2. Josh's answers (2026-11-10, chat) and the design for each

These are recorded here for the orchestrator to enter in the ledger and questions files. This session does not edit those files. Josh's words are quoted from his message.

| # | Josh's answer (as he wrote it) | Design |
| --- | --- | --- |
| Design question | "Yes, tell the user": "When the floor plan can't draw its labels, the screen shows a message instead of a plan with no labels." | A product requirement for the phase 4 fix that recommendation 1 starts (the plan draws no text on CI, A1 phase 4 row 1). Today the app only logs `plan.glyph_atlas` (app/src/editor/plan/controller.ts:405-416). The new behaviour: the plan area shows a message, and the wording goes in Proposed wording for Josh's Stage 2 approval (rule 3a). It also becomes the general rule in section A above: no silent failure. |
| 2. Stop the line | "Yes" | Overwatch reads develop's latest finished `CI` run on every pass (`gh run list --branch develop --workflow CI`). When it is red: one defect ticket at the front of the queue, naming the failing tests; **no product merge** until it is green, though fix tickets still merge; and a phone notice to Josh if it stays red more than 2 hours. Add the 9 missing runbook patterns (B2-B4-process.md, B4). |
| 3. Test everything before merging | "Yes, but 2 at a time": "run the full check once for every two merges, instead of once per merge, so it adds about half the time. The catch: if that check fails, it takes a few minutes longer to tell which of the two changes broke it." | After every second product merge to develop, the launcher runs the full gate (`gate.mjs --full`, about 13 min on the Mac: gate.log 19:11:50 to 19:25:09Z) on develop HEAD, in a free lane, before a third product merge. **Red:** stop the line (item 2). The launcher runs the full gate once more on the first of the two merge commits, which tells which ticket broke it (about 13 more min). It files a defect ticket against that ticket. Each ticket's own gate also runs its plan's regression list (section F), so known connections are tested on every merge. If Josh meant something else by "2 at a time", the orchestrator asks him; this is the reading his message gives. |
| 4. Fix the weekly-limit loop | "Yes" | **The cause is now shown, not guessed.** Claude Code's documented limit messages are "You've hit your weekly limit · resets Mon 12:00am" and "You've hit your session limit · resets 3:45pm" (https://code.claude.com/docs/en/errors.md). Tested with `node -p`, the launcher's `LIMIT_RE` (scripts/run.mjs:194) matches **neither**, so the unit ends `error:success` and restarts at once. EZD-369's exemption (vault/tools/next_ticket.mjs:959-961) **matches the weekly one**, so three strikes do not stop it either. The fix: (a) recognise both documented messages and read the reset time from them; (b) a unit that ends in under 30 s with about $0 and 1 turn is a strike or a pause, never an immediate restart; (c) the same unit key started more than 3 times in 10 minutes stops the launcher and sends Josh a notice. (d) A test replays the documented strings through the classifier. |
| 5. Check plans before building | "Yes" | Part 1. |
| 6. Honest repairs and calling in a person | "Yes" | The repair unit's verdict line is recorded: FAILED counts as a strike, and a report with no verdict counts as FAILED. Three strikes on any key, or any stall over 2 hours, opens an interactive Opus session (the overwatch's job) and sends Josh a phone notice. Every stall over 30 minutes gets an overseer-log line with its start and end time, so stall time can be measured next audit. |
| Money / capacity | "Second account already exists": "Make switching between your two accounts part of the build machine's design, so it's clean and automatic. Today the switch has been done by hand: the 11-07 log shows the CLI being signed in to the other account several times, with pauses lifted and restored." | See 2.1. |

### 2.1 Switching between two accounts automatically

**What happened on 11-07.** Five commits in 12 minutes record the account being switched by hand and the pause being lifted and restored. In order:
- 2db87d84 (18:51 EST) "Josh switched accounts";
- 7890d63e "launcher units still hit the limit after the account switch";
- 34da30f1 "Josh signed the CLI in to the other account";
- cabc5e43 "units still hit the limit after the CLI login";
- 9008a1e7 (19:03) "CLI signed in to the Pro account".

The usage meter has been unreadable since 11-09 (OAuth 401, B6). That could be a token tied to one account, but this was not checked.

**The design.** Each account gets its own Claude Code config folder, which Claude Code supports for this case (sources from a claude-code-guide lookup on 2026-11-10):
- "Log in with multiple accounts" with `CLAUDE_CONFIG_DIR` (https://code.claude.com/docs/en/authentication.md). On macOS, the Keychain entry is kept per config folder.
- `claude auth status` reports the folder and sign-in method as JSON (https://code.claude.com/docs/en/cli-reference.md).

1. **Setup.** There are two folders, one per account (for example `~/.claude-acct-1` and `~/.claude-acct-2`). Josh signs in once in each, using `CLAUDE_CONFIG_DIR=<folder> claude /login`. Any project settings both folders need are copied by a script, so the two cannot drift.
2. **Each unit.** The launcher starts every `claude -p` with `CLAUDE_CONFIG_DIR` set to the chosen account. Before the first unit on an account, it runs `claude auth status` and refuses to start if the account is not signed in. It **refuses to start any unit while `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` is set**, because either would silently override the account choice (authentication.md, precedence).
3. **Choosing an account.** It uses the account with the most headroom. When a unit returns a documented limit message, that account is marked "resting until <reset time>", read from the message, and the next unit goes to the other account. The unit that hit the limit is put back as it was, with no strike (it was not the unit's fault). When both accounts are resting, the launcher pauses until the earlier reset, with one notice to Josh. It never loops (item 4).
4. **Never mid-unit.** A running unit keeps its account. Switching happens only between units.
5. **The meter, per account.** The cost log gets an `account` field, so each account's weekly spend is tracked separately. The dollar estimate stays the fallback, per account, while the OAuth meter is unreadable.
6. **Tests.** Fake `claude` commands return each documented limit message, and the tests prove the switch, the rest-until time and the pause when both are resting.

**What Josh decides first (a money and policy question, his to make):**
- Claude Code's legal page says subscription sign-in "is designed to support ordinary use of Claude Code", and that plan limits "assume ordinary, individual usage". For people "building products or services", it says to use API keys (https://code.claude.com/docs/en/legal-and-compliance.md).
- The documentation does not say whether switching between two of your own subscriptions in an automated build is allowed. The lookup could not settle it.
- **Before the build relies on switching, Josh may want to ask Anthropic** (https://www.anthropic.com/contact-sales) and keep their answer. The documented route for automation is an API key, billed per use with no weekly cap.
- The same design works with an API key as the second "account": the folder holds a key instead of a login. If Josh chooses that, only step 1 changes.
- **Josh's decision (2026-11-10, chat):** "i believe it is allowed. i have done it already and read that countless others do it as well". The build goes ahead with switching between his two subscriptions, as designed above.

---

## Part 3. Order of work

Each step is a build-system ticket under rule 18. **Josh's yes on 2026-11-10 covers items 2 to 6 and the account switching** (Part 2). The orchestrator still records the one-line why and cost for each ticket, from this file.

1. **Weekly-limit loop fix plus account switching** (Part 2 items 4 and 2.1). Same code area (`classifyLimit`, the unit start in scripts/run.mjs, `strikeExempt`). It prevents the next 33-hour loss. About 2 tickets, medium.
2. **Stop the line** (item 2), with the overwatch runbook additions. 1 ticket.
3. **Phase 4 CI fix** (recommendation 1 plus the design answer). Find why the plan draws no text on CI, add the user message, re-scope EZD-372 to "CI green", and fix the angled-wall length rounding (length.ts:73). 2 to 3 product fix tickets, at the front of the queue.
4. **Full gate after every second merge** (item 3), with a regression list per ticket. 1 ticket.
5. **Honest repairs and hand-off** (item 6). 1 small ticket.
6. **The planning method** (Part 1):
   - the template, plan_lint rules, the contract check, the connections check and the shared-list register;
   - P1 and P3 as their own units;
   - the planner turn limit, and the plan-checker upgrade.
   - About 3 to 4 tickets. **Then pilot it on phase 6** (C3), and measure it before rolling it out to every phase.

The phase 6 hold (REPORT.md C3) gains one more condition: phase 6's 8 open tickets are re-planned with P1 to P5 before they are released.
