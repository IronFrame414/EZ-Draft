# A1. Phases 0 to 4, ticket by ticket

Audit 2026-11, session 16. **Mechanical pass, all 298 rows** (done and blocked, phases 0 to 4): `node vault/research/audit-2026-11/scripts/mech.mjs > a1-mechanical.csv`, summarised with `awk -f scripts/summ.awk a1-mechanical.csv`:
- All 274 done tickets have their recorded commit on develop (`git merge-base --is-ancestor`): **274 of 274**.
- 30 tickets have no `feat(<id>)` commit subject. For most this is only the subject line: early build-system tickets used `fix(...)` or `chore(...)`, and one commit can carry two tickets (EZD-352 is carried by feat(EZD-350), EZD-367 by feat(EZD-368)). The rest are blocked tickets with no commit.
- 33 tickets are never named in a test file (list in the CSV, `test_file_mentions` = 0). Most are vault, ledger or record-only fixes (EZD-037, 038, 039, 162, 170, 195, 196, 282). The product ones: **EZD-351** (phase 4 fix of rls.audit T18 and handlers T19), **EZD-371** (phase 4 fix of EZD-108 T18) and **EZD-292** (phase 2 fix). Their changes edit tests filed under other ticket IDs.
- **Ledger gap:** EZD-365 and EZD-369 are merged on develop (beca1e89, 20acdd99) but STATUS.md still shows them `blocked` with no commit (STATUS.md rows EZD-365 and EZD-369; the session 15 brief section 2 says to set them done).

**Judgement pass.** One phase-auditor agent per slice. Each agent stops at 40 tool calls, so every slice is a risk-chosen sample. Each section below names what was deep-checked and what was not.

## Phase 0 (79 done): 2 gaps; 8 deep-checked

| Ticket | AC | Gap | Evidence | Kind |
| --- | --- | --- | --- | --- |
| EZD-034 | AC-EZD-034-1 (Auth refuses a code request with no valid captcha token) | No automated test, by Josh's choice (Q-0243 (c): captcha is off locally and in tests and is checked by hand on the dev project). **No record that the hand check was ever done.** | supabase/config.toml:219-222 (captcha commented out); scripts/auth/__tests__/captcha.test.mjs:139 (N7 asserts it stays off); scripts/auth/captcha-check.mjs:3-4, 75-82 (the hand script); vault/tickets/STATUS.md:645 still says "AC-EZD-034-1 awaits Josh's hand check" | debt. It becomes a security finding if the check was never run: production captcha would be unverified. |
| EZD-018 | AC-EZD-018-2 / T5 "public channels stay apart" | Weak test. It checks only that a public sender's message does not reach private subscribers. It never checks that the public subscriber `pub` receives no private traffic. | app/src/server/realtime/realtime-auth.test.ts:203-205 and 216-219 (`pub.events` is never asserted); migrations/20261022120002_create_realtime_broadcast_functions.sql:18, 34 send with private=true, so the behaviour is probably right | debt |

- **Deep-checked, no gap:** EZD-006 (RLS, tenant isolation), EZD-005a (membership stays in one company), EZD-007a (account gate), EZD-007b (link_app_user and the API gate header), EZD-033 (password sign-in, same error each way).
- **Partly checked:** EZD-007d (only app/src/proxy.ts and public-paths.ts; pages are deny-by-default, and every dev route has a production guard).
- **Quick pass only (every AC row read; test files grepped):** every other phase 0 ticket. Unreached, in risk order: EZD-023a-e, 041, 042, 040, 032, 009, 002, 024. Part (3), the plan-versus-commit deviation check, was not run for phase 0.
- AC-EZD-035-1 needs 10 browser runs in a row. How those 10 runs were evidenced was not checked. The field-check ACs (013-2, 025-2, 027-3, 028-2, 031-2) have no automated test by design, and whether their field checks were recorded was not checked.

## Phase 1, product tickets (11) and EZD-142 to EZD-200: 4 gaps; 7 product tickets deep-checked

| Ticket | AC | Gap | Evidence | Kind |
| --- | --- | --- | --- | --- |
| EZD-112 | AC-EZD-112-4 | The AC text is out of date. It still says "up to 5 MB". The code, the test and the wording use 4 MB, following Josh's Q-0512. The AC row was never updated, so TRACE counts a 5 MB AC as met by a 4 MB build. | vault/spec/acceptance-criteria.md:257; app/src/lib/company/company.ts:5; app/src/lib/company/company.test.ts:10-14; en.ts:78; decisions/10-permissions-and-settings.md:53 | debt (doc) |
| EZD-102 | AC-EZD-102-1 | Weak test on a security AC. The write-route check works per file, not per method: one `requireApiPermission(` anywhere in a route file covers every POST, PUT, PATCH and DELETE in that file. A second, unchecked write method added to a checked file would pass. No route does this today, but the check can drift (rule 18). The real 403 browser tests cover only the rename route. | app/test-harness/permissions/write-routes.ts:61; app/src/server/permissions/write-routes.test.ts:31-33; app/e2e/permissions.spec.ts:48-122 | debt (security-class) |
| EZD-113 | AC-EZD-113-4 "one grouped query" | Weak test: T3 only counts the text `group by` in the function's source. The function itself is correct. | app/src/server/customers/list-customers.db.test.ts:146-152; migration 20261026233829_create_list_customers.sql | debt |
| EZD-113 | (none) | Unrecorded deviation: the feat commit added 6 screenshots under vault/plans/shots/ that the plan and the Notes cell do not name. This is probably the ui-verifier's normal output. | `git show --stat 8047e76`; STATUS.md:153 | note |

- **Passed:** every product AC maps to named tests in TRACE (TRACE.md:236-280, 396-398). None of the 84 product test files contains `.skip`, `.only`, `.todo`, `fixme`, `skipIf` or `runIf`. e2e runs inside the gate (scripts/gate.mjs:373, 416), and CI runs the gate (.github/workflows/ci.yml:47).
- **Deep-checked:** EZD-101, 102, 112, 113, 132, 1707, 100.
- **Partly checked:** EZD-103a (test list only), EZD-103b, EZD-136, EZD-1704.
- **Not reached:** the build-system tickets EZD-142 to EZD-200, and the plan-against-commit deviation check (done by hand for EZD-113 and EZD-103b only).

## Phase 1, build-system tickets EZD-239 to EZD-364 (60 done) and the blocked tickets: 8 notes, 1 security lead; 8 deep-checked

| # | Ticket | Gap | Evidence | Kind |
| --- | --- | --- | --- | --- |
| 1 | EZD-365, EZD-369 | Merged, but the ledger still says `blocked` with no commit. STATUS.md is generated from records.db and is gitignored. | beca1e89, 20acdd99 on develop; `.gitignore:33`; a8bf92fb changed only LAUNCHER_FIX.md | note |
| 2 | EZD-243 | Wrong commit hash in the ledger. f19f5ec1 is a Q-0371 answer commit; the ticket's commit is 864c546d. | STATUS.md:572 | note |
| 3 | EZD-267, EZD-250, EZD-277 | Their ACs count as done, but the code and tests were later removed by 26ba6dee (REMEDIATION 2.8: grants.json, grants.mjs, grants.test.mjs, -630 lines). Their rows don't say so. | `git show --stat 26ba6dee`; STATUS.md:596 | note |
| 4 | EZD-262 | Marked `done` but never built ("superseded, agent answer for Josh to confirm"). The recorded commit is a records migration. | STATUS.md:591 | note |
| 5 | EZD-282 | Marked `done` but closed as obsolete, not built; no test for either AC. | STATUS.md:610 | note |
| 6 | EZD-279, EZD-280 | The plan the code follows exists only as uncommitted edits on develop. The committed plan (0ee70aa3) still describes `ENV_PROBES`. The 279 note cites tooling note D-086, which does not exist. | `git diff --stat -- vault/plans/EZD-279.md vault/plans/EZD-280.md`; the secret-paths hook, lines 159 and 198 | note |
| 7 | EZD-268 | Dropped, but its uncommitted re-validated plan (167 lines), the branch t/EZD-268 (79e0d30d) and its worktree are still kept. | `git diff --stat`; STATUS note | note |
| 8 | EZD-354 | Plan rows R1b and R1c have no test (recorded in the note). | STATUS.md:703 | note |

**Security lead, passed to the security reviewer (A4).**
- `EZD_GATE_AS_SELF=1` turns off the switch to the separate `ezdraft` gate user (scripts/gate-user.mjs:55, scripts/gate.mjs:118).
- The live canary L1 skips unless `EZD_GATE_USER=ezdraft` (scripts/process/gate-user-live.test.mjs:9, 12), and nothing checks that it actually ran.
- If a sandboxed unit can set that variable, builder code runs as Josh's own user. See A4 for the verdict.

**Not a gap: EZD-370's fix of EZD-323 T8 is a real fix.** 9aff3804 adds one entry to the exact list (`app/src/server/jobs/ai-key-rewrap.ts`) with its reason. The `toEqual` exact list and the matching rule are unchanged.

**Blocked tickets (23: 22 in phase 1 including EZD-365/369, plus EZD-276 in phase 2)**

| Ticket | Why (Notes cell) | Since | Owner / next step |
| --- | --- | --- | --- |
| EZD-141 | Waiting on Supabase's fix of supabase/auth#2852 (Q-0274 (a)) | 2026-10-24 | External; each wrap checks the issue |
| EZD-185, 191, 261, 264 | Put off by Josh: "set ready once the sandbox is back on" | 2026-11-03 | **Probably stuck.** The sandbox came back 2026-11-06 (EZD-328 note), and nobody has set them ready. 261 and 264 are already built, with worktrees kept since 10-29/10-30. |
| EZD-248, 249, 263, 273, 275 | Dropped by the 11-02 triage, reopened 11-03: "do not set ready until he says" | 2026-11-03 | Josh. 248 also needs a fix-mode rebase (Q-0427). |
| EZD-265, 268, 269, 270, 271, 272, 274 | Dropped by the lean process ("not built, never resumed") but left `blocked` | 2026-11-04 | **Nobody.** `blocked` misreads as pending work. |
| EZD-276 (phase 2) | Put off by Josh | 2026-11-03 | Josh |
| EZD-328 | Needs an interactive fix-mode session to check launcher.log and close it | 2026-11-06 | No session scheduled |
| EZD-355a, 355b | Need planning in an interactive fix-mode session (Q-0614, Q-0615) | 2026-11-07 | No session scheduled |
| EZD-365, 369 | Merged; only the ledger is behind | 2026-11-10 | Orchestrator |

- **Deep-checked (read, not run):** EZD-279, 280, 260, 277, 267/250/282 (the removal commit), 323 via 370, 344 (test list and notes), 354.
- **Not reached:** EZD-256, 331, 337, 316, 317, 345, 333, 336, 290, 295, 296, 320, 321, 322, 298, 326, 241, 257, 266, 361, 362, and the plan-against-commit comparison for the rest.

## Phases 2 and 3 (38 done, live): 5 gaps, 0 defects; 8 deep-checked

| Ticket | AC | Gap | Evidence | Kind |
| --- | --- | --- | --- | --- |
| EZD-117a | AC-EZD-117a-5 | The AC still says "A project card is not a link and opens nothing (Q-0394)". Q-0500 replaced that, and test B6 now checks that the card *is* a link. The AC row was never marked as replaced. | acceptance-criteria.md:625; decisions/05-screens.md:39; app/e2e/projects.spec.ts:272 | debt (doc) |
| EZD-118 | AC-EZD-118-6 | The AC says Create "returns to Projects". Q-0500 sends Create to the editor (EZD-339). | acceptance-criteria.md:639 | debt (doc) |
| EZD-120d | AC-EZD-120d-3 | "Nothing is sent while another user is signed in" is shown by a fixed 5 s wait and then posts===0. A later check partly backs it up. | app/e2e/sign-out-outbox.spec.ts:251-253, 263 | note |
| TRACE | all ACs of EZD-117a, 120b, 120d, 299b | TRACE gives every AC its ticket's whole test list, so it cannot show which test proves which AC. "Covered" counts tickets, not ACs. | TRACE.md:625, 627, 681, 684, 726, 727 | note (see A2) |
| gate scope | EZD-108 T18, EZD-299a T9, EZD-014b | A later ticket broke an earlier phase's test, and its own ticket gate could not see it. The EZD-371 plan says its own ticket gate "does not run T18". | vault/plans/EZD-371.md (Decided); A3 | note (class; see C) |

- **EZD-371 is a real fix.** The locator at app/e2e/my-profile.spec.ts:401 now searches inside a new `profile-password-section` hook, and the expected count stays 2. The third match was EZD-5601's AI-key input, which is meant to be type=password. What was lost: a stray password field outside that section would no longer be caught.
- **EZD-299a T9 (CI 11-09 14:13Z) broke deterministically, not by chance.** The save response gained `number` (EZD-294), and 61ebd7a0 (an EZD-299 commit) changed the expected JSON in an EZD-299a test. No fix ticket was opened. The resolves case is looser now (`number: expect.any(Number)`).
- **EZD-014b (touch CSS)** was red in 8 CI runs over about 2 days, then cleared. That pattern fits a deterministic break. The cause was not found, and there is no fix ticket.
- **The 2 uncovered phase 2 ACs** are AC-EZD-276-1 and -2: the one blocked phase 2 ticket, EZD-276, which Josh put off on 2026-11-03 (STATUS.md:618). The 1 s first-cards budget is still checked by app/e2e/projects.spec.ts:152.
- **Deep-checked, strong tests:** EZD-120a (stale lock, conflicts, refusals; model.db.test.ts:155-351), EZD-133 (money routes with a leaking canary that must be caught; money-routes.test.ts:141-187), EZD-299a (T1, T9, T12), EZD-120d B5, EZD-120b U4 (by name only), EZD-108 T18. Only 2 phase 2/3 tests read source text.
- **Not reached:** EZD-110a, 110b, 117b, 140, 283, 288, 292-335, 120c, 202, 238, the ACs of EZD-299 and 299b, and EZD-338 to 348.

## Phase 4 (29 done, gate not passed): 6 gaps, 3 defects; 7 deep-checked

**CI on develop is red because the plan draws no text on the CI machine, not only because of the pan count. EZD-372 fixes neither.** The orchestrator checked this against CI run 42888313901's artifacts (`gh run download 42888313901` → gate-logs/gate.log, perf-results/latest.json).

| # | Ticket | AC | Gap | Evidence | Kind |
| --- | --- | --- | --- | --- | --- |
| 1 | EZD-207b, 210b, 208b, 120c, **133** | AC-EZD-210-3, -11 and others | **The same 9 browser tests fail on CI in every run and pass on the Mac.** In the plan-text tests, `glyphs` reads 0 where 11 or 13 are expected. EZD-208b B5/B9 see extra React commits. EZD-120c B1 sees one extra request. **EZD-133 W1/W2, the money-pages @smoke tests, fail on a 5.0 min timeout.** Every pan and load row in the CI perf results is `error: plan_not_ready` (16 rows). When the text sheet fails, the app only logs `plan.glyph_atlas` and shows the user nothing. | CI gate.log list `1) ... 9)`; drawing-tools.spec.ts:321, 341, 437; plan-zoom-hover-text.spec.ts:413; scripts/perf/pan-script.mjs:132, 138; app/src/editor/plan/controller.ts:405-416; glyph-atlas-canvas.ts:70, 81; local gate.log GATE PASS on 45146b1c | **defect** (cause not yet known: CI browser setup, or a real app bug that could reach a user's device) |
| 2 | EZD-207c, 356 | AC-EZD-207-5 | The perf tool's own fixture test expects exactly 8 long tasks on the iPad row (4x CPU slowdown). CI counts 4 or 5. | scripts/perf/__tests__/pan.test.mjs:15-18, 100-111; CI gate.log:6590-6592 `4 !== 8` | **defect** (fails the merge gate) |
| 3 | EZD-372 (planned) | AC-EZD-372-1 | Its evidence is one long task on a Mac lane gate, and its done-when is "10 consecutive lane gates" on the Mac. It freezes every existing expected value, so P2/T1 keep expecting 8. Nothing in it addresses `plan_not_ready` or glyphs 0 on CI. **No ticket owns "CI green".** | vault/plans/EZD-372.md:10-14, 42, 48, 52 | **defect** |
| 4 | EZD-207b | none found | If the text sheet fails, the plan shows no text and no message. Not checked against the spec. | controller.ts:414-416 | product question (design/UI, may go to Josh) |
| 5 | audit | none | The phase-auditor may not start calc-auditor (hook), so the numeric audit was not obtained this way. | dispatch refusal | note |
| 6 | EZD-372 | none | The D-Busy step hard-codes one Mac temp folder path. | EZD-372.md:43 | note |

- **Numbers spot-checked by the phase auditor; all hold:**
  - 141.5" × 168" = 165.08 SF, shown as 165.
  - 147" × 120" = 122.5 SF, rounded half up to 123.
  - A shown gap is never 0" (floored at 1/16", rooms/closure.ts:30).
  - The 12" limit includes the 1/64" tolerance (closure.ts:158).
- **Deep-checked, strong tests:** EZD-205a (area.test.ts:39-71, rotated shapes too), EZD-205b (closure.test.ts:112, 143), EZD-209 (typed-entry.test.ts:47-105), EZD-366 (object-numbers.db.test.ts:427-462; numbers.test.ts:152-169), EZD-221a (route.templates.test.ts:149-156). The EZD-210a/b browser tests are real checks but red on CI (row 1).
- **Not reached:**
  - AC-EZD-205-3 to -6; AC-EZD-209-1, -2, -5; most of AC-EZD-210 and AC-EZD-221.
  - EZD-201, 203, 207a, 236, 349-353, 357-359, 363, 367, 368, 370, 371.
  - The root cause of row 1. The next step is to read the CI browser console for `plan.glyph_atlas`.
