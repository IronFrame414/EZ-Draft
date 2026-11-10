# A4. Security and data isolation since the phase 3 security pass; A5. Is live what the phase 3 gate passed?

Audit 2026-11, session 16. Reviewer: security-reviewer (Opus 5.5; read-only, 30 tool calls). Range: f6576236 (phase 3 security pass, vault/tickets/gates/phase-03.md:12) to develop a8bf92fb. The orchestrator re-checked the A5 numbers itself (commands below).

## A4 findings

| Severity | Where | What | Failure scenario | Class |
| --- | --- | --- | --- | --- |
| **High (unconfirmed)** | scripts/run.mjs:329; scripts/gate.mjs:118; scripts/gate-user.mjs:55; the unit sandbox settings (scripts/unit-sandbox.json:56); the guard-bash hook (lines 63, 71) | Setting `EZD_GATE_AS_SELF=1` turns off the switch to the separate `ezdraft` gate user. Nothing strips or refuses it: `runUnit` copies `process.env` and deletes only the scrub and API-key variables, and guard-bash never mentions it. gate.mjs is on the sandbox's excluded-command list, so it runs unsandboxed. The live canary test L1 skips unless `EZD_GATE_USER=ezdraft` (scripts/process/gate-user-live.test.mjs:9, 12). | A builder runs `EZD_GATE_AS_SELF=1 node .../gate.mjs <wt>`. If the excluded-command match accepts a leading variable, the builder's test code runs unsandboxed as Josh's macOS user, with his keychain and files in reach. **Not tested** whether the match accepts a leading variable. The orchestrator read the excluded pattern: it is `node /Users/josh/Projects/ezdraft/scripts/gate.mjs *` (unit-sandbox.json:56), so a command that starts with `EZD_GATE_AS_SELF=1` probably does not match it and would stay sandboxed. Still open: `export EZD_GATE_AS_SELF=1` as an earlier command in the same shell, then the plain gate command. That needs a probe in fix mode, not a guess. | Whole class open: the gate trusts caller environment variables that weaken its own isolation. Build-system item, but it can expose secrets, so rule 18 lets it become a ticket (with Josh's yes on a one-line why and cost). |
| Medium | app/src/server/db/test-only-functions.test.ts:207-220 | EZD-370 kept T8 at the same strength and allowed one more file (`server/jobs/ai-key-rewrap.ts`). The test still only looks for the text `createJobsDbClient`. | A non-test file that builds its own client from `process.env.SUPABASE_SECRET_KEY` passes T8. Today only jobs/db.ts:10 reads that variable in app/src. No test walks the source tree for the variable name (session.test.ts:343 checks one file). | Whole class open |
| Low | supabase/migrations/20261110120003_create_user_ai_key_functions.sql:68-71 against :27-32, :117-121, :147-150, :197-200 | Only `save_my_ai_key` requires an active membership. The get, delete, take-attempt and rewrap functions check only the claims. | A suspended user who still holds a valid token can use check slots and call rewrap. Small impact: the trigger at :222-247 deletes the key row when the membership ends. | One-off |
| Low (probably deliberate) | 20261107180001_create_sync_conflict_functions.sql:30-41; app/src/app/api/projects/[id]/sync-conflicts/route.ts:4 | `record_sync_conflicts` checks View projects, not Edit model. | A user without Edit model can store up to 1000 conflict rows per call, visible only to themselves (select policy 20261107180000:34-39). Applying one still needs Edit model through `save_objects` (20261109100000:160-169). Not checked against the EZD-299 plan. | One-off |

**Passed**
- **EZD-5601 AI keys:**
  - The app encrypts them with AES-256-GCM, bound to tenant and user (key-crypto.ts:3, 66-67, 89).
  - The table has RLS with a deny-all policy and no grants to anon or authenticated (20261110120001:27-33).
  - Only `last4` reaches the browser (ai-key/route.ts:40, profile/route.ts:36, user-key.ts:90-94).
  - The cross-tenant rewrap is reached only through the sweep route, behind `CRON_SECRET` with a constant-time compare (sweep/route.ts:16-22).
- **New definer functions:** each calls `require_api_gate` and takes the tenant from the claims. `set_plan_scale` and `save_objects` check Edit model plus project scope.
- **Changed API routes:** all 18 were listed. The four new ones and notifications call `requireApiPermission`, `requireApiSession` or the cron check.

**Not reached:**
- The auth of checkpoints, model, objects, counts, projects and the notifications open and read-all routes. Only helper names were counted for these.
- The permission check inside `create_project`.
- The bodies of `list_my_sync_conflicts` and `project_benchmark_guard`.
- The `packages/` diff.
- A scan of the browser bundle for secrets.
- Tenant-isolation tests for user_ai_key, ai_key_attempt and sync_conflict.
- dev/notifications/route.ts:35, which hides itself only when `VERCEL_ENV` is production, so it is reachable on previews. It existed before this range.

## A5. Live against the phase 3 gate

**Code: matches.**
- The phase 3 gate: develop at the PR was a3ad5dd5 (vault/tickets/gates/phase-03.md:4), and the security pass was f6576236 (:12).
- `git log f6576236..origin/main` shows only a77cafee, 6236f1a5 and the merge 1ed1373e. `git diff --name-only f6576236 origin/main` lists only vault files.
- The release run on 1ed1373e (2026-11-06) is green.
- Local `main` (aee21dc3 "Build kit") is stale; origin/main is the real one.

**Database schema: does not match. This follows a design decision, but the risk it carries is not tracked anywhere.**
- The live check returns `{"status":"ok","schema_version":"20261110130000"}`: `curl -s https://ezdraft.ezcontractorbinder.com/api/health`, run by the orchestrator at 2026-11-10 ~21:0xZ.
- That is develop's newest migration (`git ls-tree --name-only develop supabase/migrations/ | tail -1` → 20261110130000_object_number_free_fallback.sql).
- main's newest is 20261105210000_create_model_object_level_check.sql. **13 develop migrations** that were never phase-gated are live under the phase 3 code (`... | awk -F/ '$3>"20261105210000"' | wc -l` → 13). They include user_ai_key, sync_conflict, and replaced versions of `save_objects` and `list_projects`.
- Why: by Josh's decision Q-0264, until launch Vercel Production runs on the `ezdraft-dev` database (docs/architecture.md:18, 76, 146-152). `supabase-dev.yml` pushes develop's migrations to that database on every develop push that changes them (architecture.md:146). The dev project holds made-up test data only (Q-0110, architecture.md:146), so this is **not a data leak**.
- **The risk:** the phase 3 code on the live address runs against functions that phase 4 and 5 tickets have replaced. If a replaced function changes its arguments or result, the live site breaks between phase merges. No test runs main's code against develop's schema. Josh's phase field checks on the live address (architecture.md:146) therefore run on a mix that no gate tested.
- This is a product, scope and workflow question for the orchestrator under rule 3 (Q-0264 exists). The UI side (what Josh sees on the live site during field checks) may go to Josh.
