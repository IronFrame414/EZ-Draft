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
