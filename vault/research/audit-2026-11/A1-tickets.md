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
