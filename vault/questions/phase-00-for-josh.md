# Phase 0 · Questions for Josh

Updated 2026-10-23 evening by the orchestrator (`questions 0` unit, PROCESS.md section 7). Your answers of 2026-10-23 are recorded: Q-0243 (c); Q-0239, Q-0240, Q-0242, Q-0244, Q-0245, Q-0246 and Q-0248 confirmed; wording items 98 to 107 approved (the earlier text of this file, commit 0f88f76); L-020 and L-021 ratified (Q-0249, Q-0250). Answer by number ("2.1 confirm", "2.3 override"). Everything in section 2 stands as written until you change it.

Q-0089 (storage limit) and Q-0237 (charging other companies) belong to later phases and are not asked here.

## 1. Decisions needed

None.

## 2. Agent answers to confirm

1. **Q-0247** (EZD-017): the performance check's 8 files live in `scripts/perf/`, which the builder was not allowed to write. The orchestrator added `scripts/perf/` to the builder's allowed folders, like `scripts/release/`; the gate script and the other scripts stay protected. This was missing from the earlier file. Source: .claude/hooks/guard-paths.mjs; vault/plans/EZD-017.md section 1. **Confirm or override (revert).**
2. **Q-0251** (EZD-034): when the sign-in service refuses a password sign-in because the security check failed, it does not count as one of the person's 5 wrong passwords. The password was never checked, and counting it would let a script lock someone out of password sign-in for 15 minutes. Source (security-reviewer): Q-0104 (i); app/src/server/auth/actions.ts. **Confirm or override.**
3. **Q-0252** (EZD-034): a "send me a code" request that fails the security check still counts toward the 5 code emails per hour, because your Q-0104 (i) answer counts every code request. The catch: a script could use up someone's 5 code emails for an hour without passing the check. Override to "don't count it" if you prefer; it is a small change inside EZD-034. Source (orchestrator): Q-0104 (i); app/src/server/auth/actions.ts. **Confirm or override.**
4. **Q-0253** (EZD-023e): the release workflow ticket waited for EZD-003 to be done, but EZD-003 only finishes at the first real release, which that same workflow makes, so phase 0 could never reach its gate. EZD-023e only needs EZD-003's merged code, as its own plan says, so the wait was removed; EZD-003 stays blocked until launch. This lets EZD-023e, EZD-021, EZD-025 and EZD-031 build. Source (orchestrator): vault/plans/EZD-023e.md line 297; vault/plans/EZD-003.md Step 6. **Confirm or override.**

## 3. Proposed wording

From EZD-034 (vault/plans/EZD-034.md section 6). Lines the hand-check script prints in your terminal when you test the captcha on the dev site (Q-0243 (c)); not seen by users. Approve or edit:

108. (run in CI) "captcha-check.mjs does not run in CI or the gate. Run it by hand (docs/runbook.md, Captcha, step 5)."
109. (wrong argument) "Usage: node scripts/auth/captcha-check.mjs (set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY first)"
110. (settings missing) "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set in this terminal (docs/runbook.md, Captcha, step 5)."
111. (no connection) "Could not reach Supabase Auth: <error name>."
112. (pass) "PASS: Supabase Auth refused a sign-in code request without a captcha token (HTTP 400 captcha_failed)."
113. (fail) "FAIL: expected HTTP 400 captcha_failed, got HTTP <status> <code or none>. Captcha protection is not on for this project."

## 4. Rule candidates

None open.
