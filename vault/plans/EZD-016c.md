# EZD-016c · Test harness: seed rows for browser tests

- **ACs:** AC-EZD-016c-1 (`vault/spec/acceptance-criteria.md` line 71; generated from Done-when).
- **Complexity:** medium (section 8).
- **User-visible result:** nothing on screen. The local test database now also holds a second company with its owner and 200 Worth Properties projects, so later tests can check that one company never sees another's rows and that long project lists page.
- Phase: 0 · Planned by: planner · Date: 2026-10-20 (part plan after the split, Q-0198) · Status: planned

**Pre-split plan:** `git show 548a74e:vault/plans/EZD-016a.md` (Split proposal "Part EZD-016c", Step 7, Step 8 [c], section 3 `seed-ids.ts` row, T4). This plan keeps its names, test ID T4 and every expected value (Q-0198). Short forms: **PS** = that pre-split plan; **5b** = vault/plans/EZD-005b.md; **arch** = docs/architecture.md.

## 1. What to build

**Ticket row (phase-00.md line 35).**
- **Scope:** Plan vault/plans/EZD-016a.md Step 7 (second tenant with its owner, 200 tenant 1 projects in supabase/seed.sql; seed-ids.ts) plus Step 8's seed docs lines. Local seed only, never the cloud bootstrap file (Q-0033 (a)). Split from EZD-016a (Q-0198); plan Part EZD-016c.
- **Done when:** After `pnpm db:up` the local database holds a second tenant with its owner and 200 tenant 1 projects, and tenant 1 and Josh are unchanged.
- **Depends on:** EZD-005b, EZD-004a, EZD-004b.
- **Spec ref:** Build phases and acceptance tests; Import and export · Imports. The Imports part is EZD-016b's (PS line 87); nothing from 08 is built here.

**Data:** no table, column, migration, RLS policy, grant or `schema_version` change. Seed rows only, local stack only (`supabase db reset --local` inside `pnpm db:up`, arch `### Local database`). No money fields. `database.types.ts` is unchanged.

### Step 1 · Seed rows (builder appends to `supabase/seed.sql`, below EZD-005b's rows; 5b section 3 "appends below them, never replaces")
Values are the PS Step 7 table (planner's choices confirmed at plan review, PS line 91) except where a source is named. Emails use `example.com`, as 5b did.

| Rows | Values | Source |
| --- | --- | --- |
| Tenant 1, Josh, Josh's membership | Unchanged, not rewritten | 5b Step 1; AC-EZD-016c-1 |
| Tenant 2 (`tenant`) | `id` `00000000-0000-4000-8000-000000000002`, `name` `Test Tenant 2`; other columns default | phase-00 Build gate ("a test user of a second tenant"); id pattern 5b (EZD-005.md Step 1.2) |
| Tenant 2 owner (`app_user`) | `id` `00000000-0000-4000-8000-000000002001`, `name` `Tenant 2 Owner`, `email` `tenant2-owner@example.com`, `language` `en`, `role_preset` `owner`; `ipad_input_mode`, `auth_user_id` null | PS Step 7; 03 Tables user; `create_app_user` checks |
| Its membership | `tenant_id` tenant 2, `user_id` the owner, `status` `active`, `scope` `all`; `invited_at`, `last_active_at` null | PS Step 7; Phase 0 Build gate; same shape as Josh's (5b Step 1) |
| 200 tenant 1 projects (`project`) | For i = 1…200: `id` `00000000-0000-4000-8000-` ‖ `lpad((100000 + i)::text, 12, '0')`; `name` `Seed project ` ‖ `lpad(i::text, 3, '0')`; `client_name` `Seed client ` ‖ same; `address` `Seed address ` ‖ same; `type` = `['kitchen','bath','whole_home_interior'][(i − 1) % 3]`; `status` = `['draft','client_review','permit_submitted','approved','in_build'][(i − 1) % 5]`; `created_at` = `updated_at` = `2026-10-01T12:00:00Z` − (i − 1) hours; every other column default | Ticket row "200 tenant 1 projects"; 11 Performance rule 9 (lists over 50 rows are paged); allowed values `supabase/migrations/20261019165203_create_project.sql` lines 10–12; 03 Tables project (status list) |

- One `insert … select` over `generate_series(1, 200)` for the projects (PS Step 7). No `membership_project` rows (PS Step 7).
- A comment above the new rows: local test data for browser and isolation tests (EZD-016c), never copied into `supabase/bootstrap/tenant-1.sql` (Q-0033 (a)); the "keep the two files in step" note at the top of the file covers tenant 1 and Josh only.
- No 64-character hex literal (EZD-006 T19 (d), `scripts/db/__tests__/rls-config.test.mjs` line 77).

### Step 2 · Seed ids (test-author extends `app/test-utils/seed-ids.ts`; `.claude/hooks/guard-paths.mjs` line 15 puts `test-utils/` with the test-author)
Add the exports in section 3. `TENANT_1_ID` and `JOSH_USER_ID` stay unchanged (5b section 3). Update the header comment to name EZD-016c.

### Step 3 · Tests (test-author) in `app/src/server/db/seed.test.ts`
A new top-level `describe('EZD-016c seed', …)` after EZD-005b's, which stays as is (PS V10; check C9). Section 4.

### Step 4 · Docs (builder), `docs/architecture.md`, existing headings only
- `### Tenancy tables (EZD-005)`, the Seed rows bullet (line 309): add the tenant 2 owner and the 200 projects as local test rows (EZD-016c) with tenant 2's id and the owner's email; say the "same ids and values" rule between `seed.sql` and the bootstrap file covers tenant 1 and Josh only; name the new `seed-ids.ts` exports; add the seed rule: tests never change seeded rows, a test that changes data creates its own rows with EZD-006 or EZD-007a fixtures and removes them (PS Step 6 "Seed rule"). Keep every needle EZD-005b T15b reads (`TENANT_1_ID` value, `JOSH_USER_ID` value, `supabase/bootstrap/tenant-1.sql`).
- `### Local database`, the bullet "`supabase/seed.sql` holds tenant 1 and Josh (EZD-005b)": add "and tenant 2 with its owner and 200 tenant 1 projects (EZD-016c)".
- Placement note: PS Step 8 lists "[c] the seed contents and the seed rule" next to `### Browser tests (EZD-016a)`, which EZD-016d creates after this part is built (build order c → d → a, Q-0198; vault/plans/EZD-016a.md Step 7). So they go in the Tenancy tables bullet now; EZD-016d's subsection points to it.

### Files
| Path | New / change | By | Why |
| --- | --- | --- | --- |
| `supabase/seed.sql` | Change (append) | builder | Step 1 |
| `app/test-utils/seed-ids.ts` | Change | test-author | Step 2 |
| `app/src/server/db/seed.test.ts` | Change (new top-level describe) | test-author | Step 3 |
| `docs/architecture.md` | Change | builder | Step 4 |
| Not touched: `supabase/bootstrap/tenant-1.sql` (Q-0033 (a)), `scripts/db/__tests__/tenancy-bootstrap.test.mjs`, `supabase/migrations/**`, `database.types.ts`, `app/test-harness/**`, `app/playwright.config.ts`, `app/src/**` other than the test file | — | — | Out of scope |

## 2. Sources
- **Ticket:** `vault/tickets/phases/phase-00.md` line 35 (EZD-016c row) and the Build gate paragraph; `tickets.json` EZD-016c (`acs` AC-EZD-016c-1, `mockups` []).
- **Split:** Q-0198 (vault/questions/QUESTIONS.md line 207, answered-agent): parts, order c → d → a, names and values kept. PS (548a74e): Split proposal Part EZD-016c, Step 6 Seed rule, Step 7, Step 8 [c], section 3 `seed-ids.ts` row, T4, section 7 seed line.
- **Spec:**
  - `12-build-phases-and-acceptance-tests.md`: the acceptance tests the harness serves (Permissions, Edit lock rows need a second user; nothing here is a row of its own).
  - `11-non-functional-requirements.md` Performance rule 9 (more than 50 rows → paged; reason for 200), rule 10 (tenant from the claim), Operations ("local (agents and tests)" environment), Security and audit (RLS by `tenant_id`).
  - `03-data-model.md` intro (every table carries `tenant_id`), Tables tenant, user, membership, project (status list).
  - `08-import-and-export.md` Imports: EZD-016b's; not built here.
  - `04-app-shell-and-global-ui.md`: read; no screen changes.
  - `vault/spec/non-goals.md`, `glossary.md`: nothing touched.
- **Decisions:** Q-0033 (a) (`vault/spec/decisions/02-product-overview.md`: seed local only, no personal data, cloud rows from the bootstrap file); Q-0085 (a) (EZD-032 owns the build-gate test that reads the second tenant); Q-0006 (test scope, phase 0 grep matches `EZD-016c`). No decision in `08-import-and-export.md` (Q-0017, Q-0189, Q-0193) bears on the seed.
- **Merged code (read 2026-10-20, develop 164d3bd):** `supabase/seed.sql`; `app/test-utils/seed-ids.ts`; `app/src/server/db/seed.test.ts`; `supabase/migrations/20261019165201_create_tenant.sql`, `…165202_create_app_user.sql`, `…165203_create_project.sql`, `…165204_create_membership.sql`; `supabase/bootstrap/tenant-1.sql` lines 10–14 (refuses when tenant 1 exists); `scripts/db/__tests__/tenancy-bootstrap.test.mjs` (T15b needles lines 88–96, T17 `truncate public.tenant, public.app_user cascade` line 62, T18 needles line 217); `scripts/db/__tests__/rls-config.test.mjs` line 77; `.claude/hooks/guard-paths.mjs` line 15.
- **Plans:** 5b section 3; EZD-004a section 3 (`db:up` resets every run; root `test` runs `db:up` first); EZD-004b section 3 (Vitest global setup sets `SUPABASE_SECRET_KEY`); EZD-032 plan lines 24, 189–193 (uses `TENANT_2_ID`, `TENANT_2_OWNER_USER_ID`, `seedProjectId(1)`, `seedProjectId(200)`); vault/plans/EZD-016a.md section 3 row "from EZD-016c".
- **arch:** `### Local database`, `### Tenancy tables (EZD-005)`, `### Policy test harness (EZD-006)`, `## Tests`, Test scope.
- **Mockup:** none (`mockups: []`).
- **Research:** no R-NNN report covers this ticket.

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| export | `app/test-utils/seed-ids.ts` `TENANT_2_ID` | `'00000000-0000-4000-8000-000000000002'` |
| export | `TENANT_2_OWNER_USER_ID` | `'00000000-0000-4000-8000-000000002001'` |
| export | `JOSH_EMAIL` | `'josh@example.com'` (5b seed value) |
| export | `TENANT_2_OWNER_EMAIL` | `'tenant2-owner@example.com'` |
| export | `SEED_PROJECT_COUNT` | `200` |
| export | `seedProjectId(i: number): string` | For an integer 1 ≤ i ≤ `SEED_PROJECT_COUNT`: `'00000000-0000-4000-8000-' + String(100000 + i).padStart(12, '0')`, so `seedProjectId(1)` = `'00000000-0000-4000-8000-000000100001'`, `seedProjectId(200)` = `'00000000-0000-4000-8000-000000100200'` (EZD-032 lines 192–193). Any other input throws `RangeError` |
| export (unchanged) | `TENANT_1_ID`, `JOSH_USER_ID` | 5b section 3 |
| file | `supabase/seed.sql` | Step 1 rows below EZD-005b's; contains `generate_series(1, 200)` |
| test names | `describe('EZD-016c seed', …)` in `app/src/server/db/seed.test.ts`; Done-when title `EZD-016c done when: after db:up the local database holds tenant 2 with its owner and 200 tenant 1 projects, and tenant 1 and Josh are unchanged` | C9; arch Tests (ticket id in the closing test's title) |
| docs | arch `### Tenancy tables (EZD-005)` | Contains `00000000-0000-4000-8000-000000000002`, `tenant2-owner@example.com`, `TENANT_2_ID`, `seedProjectId`, plus EZD-005b's T15b needles |
| used by | EZD-016d (global setup checks tenant 1, Josh, tenant 2 and 200 projects, PS Step 6), EZD-016a (`JOSH_EMAIL`, re-exports every export), EZD-032 (`TENANT_2_*`, `seedProjectId`) | Names as PS section 3 |

## 4. Tests
- Admin client exactly as EZD-005b T1: `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } })` from EZD-004b's global setup. Seeded rows are only read (seed rule). Queries filter by the seeded ids, never count whole tables, because other test files create tenants at the same time (`maxWorkers: 4`, arch Test scope).

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T4 (a) Done when (title in section 3) | AC-EZD-016c-1 | unit (Vitest, admin client) | Read `tenant` by `TENANT_2_ID` and `TENANT_1_ID`; `app_user` by `TENANT_2_OWNER_USER_ID` and `JOSH_USER_ID`; `membership` by `user_id` for each; `project` `.eq('tenant_id', …)` for each tenant, ordered by `id`; `membership_project` `.in('project_id', seed ids)` | Tenant 2 `name` `Test Tenant 2`. Owner: `name` `Tenant 2 Owner`, `email` `tenant2-owner@example.com`, `language` `en`, `role_preset` `owner`, `ipad_input_mode` null, `auth_user_id` null; exactly 1 membership: `tenant_id` = `TENANT_2_ID`, `active`, `all`, `invited_at` null. Tenant 1 `name` `Worth Properties`; Josh `Josh Bishop`, `josh@example.com`, `en`, `owner`, `ipad_input_mode` null, `auth_user_id` null; exactly 1 membership in all tenants: tenant 1, `active`, `all`, `invited_at` null. Projects: tenant 1 = `200`, tenant 2 = `0`; ids = `seedProjectId(1…200)`. Status `draft`, `client_review`, `permit_submitted`, `approved`, `in_build`: `40` each. Type `kitchen` `67`, `bath` `67`, `whole_home_interior` `66`. All `archived_at` null, `open_items_count` `0`. Project 1: `name` `Seed project 001`, `client_name` `Seed client 001`, `address` `Seed address 001`, `type` `kitchen`, `status` `draft`, `created_at` `2026-10-01T12:00:00Z`. Project 200: `Seed project 200`, `Seed client 200`, `Seed address 200`, `bath`, `in_build`, `created_at` `2026-09-23T05:00:00Z`. All 200 `created_at` distinct; each `updated_at` = its `created_at` (compare as instants). `membership_project` rows: `0` | Step 1 table; counts from `(i − 1) % 5` (200/5 = 40) and `(i − 1) % 3` (residues 0 and 1: 67, residue 2: 66); project 200 = 12:00 − 199 h; project 200 type index 199 % 3 = 1, status 199 % 5 = 4; `set_updated_at` fires on update only (`create_project.sql`); `open_items_count` default 0 (same file); Josh values 5b T1 (`seed.test.ts`) |
| T4 (b) Seed and bootstrap files | AC-EZD-016c-1 | unit (Vitest, file read) | Text of `supabase/seed.sql`, `supabase/bootstrap/tenant-1.sql`, the arch `### Tenancy tables (EZD-005)` section (heading to next `##`) | `seed.sql` contains `generate_series(1, 200)` and `00000000-0000-4000-8000-000000000002`. The bootstrap file contains neither `00000000-0000-4000-8000-000000000002`, `tenant2-owner` nor `generate_series`. The arch section contains `00000000-0000-4000-8000-000000000002`, `tenant2-owner@example.com`, `TENANT_2_ID` and `seedProjectId` | PS T4 (b) (moved from PS T9); Q-0033 (a) (never the cloud bootstrap file; ticket row); Step 4 |
| T4 (c) Seed ids | AC-EZD-016c-1 | unit (Vitest) | `seed-ids.ts` exports | `TENANT_2_ID`, `TENANT_2_OWNER_USER_ID`, `JOSH_EMAIL`, `TENANT_2_OWNER_EMAIL`, `SEED_PROJECT_COUNT` equal the section 3 values; `seedProjectId(1)`, `seedProjectId(200)` equal the section 3 strings; `TENANT_2_ID`, `TENANT_2_OWNER_USER_ID` and every `seedProjectId(1…200)` match EZD-005b's `UUID_V4` regex; the 200 ids are distinct; `seedProjectId(0)`, `seedProjectId(201)` and `seedProjectId(1.5)` throw `RangeError`. `TENANT_1_ID`, `JOSH_USER_ID` unchanged | Section 3; PS section 3; EZD-005.md Step 1.2 (uuid v4 shape, as `seed.test.ts` `UUID_V4`); EZD-032 lines 189–193 |
| Kept green (not new) | AC-EZD-016c-1 ("tenant 1 and Josh unchanged") | existing | EZD-005b T1, T12 (`seed.test.ts`), T15b, T17 (a)–(e), T18 (`tenancy-bootstrap.test.mjs`); EZD-006 T19 (d) | Pass unchanged | 5b section 4; the builder edits none of them (CLAUDE.md rule 5) |
| T10 Gate (orchestrator) | all | gate | Docker running; `node scripts/gate.mjs .claude/worktrees/EZD-016c` | Exit 0: `typecheck`, `lint` (incl. C1–C10, migration check), `test` (starts with `db:up`), `build`, `test:e2e` in phase 0 + `@smoke` scope | CLAUDE.md rule 12; Q-0006 |

Smoke: no (T4 is phase 0; EZD-016d's global setup checks the seed in every browser run, PS Step 6).

## 5. Visual checklist
None. No screen changes.

## 6. Proposed wording
None. No user-visible text. The names `Test Tenant 2`, `Tenant 2 Owner` and `Seed project 001` … live only in the local test database.

## 7. Security review
security-review: **yes**. Areas: data access.
- A second tenant and its owner exist on the local stack only; nothing goes into `supabase/bootstrap/tenant-1.sql` or any cloud project (Q-0033 (a); T4 (b)).
- The tenant 2 owner has an `active` membership, so the before-user-created hook lets `tenant2-owner@example.com` sign in locally (arch Auth and session); that is the purpose (EZD-016a, EZD-032). Reserved `example.com` addresses, no personal data, no secret, no 64-character hex (CLAUDE.md rule 8; EZD-006 T19 (d)).
- No migration, policy or grant changes; RLS stays the backstop that EZD-032 tests against these rows (03 rule 1; 11 rule 10).

Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation
**Medium.** Four files following EZD-005b's seed pattern, but the rows are the second tenant every isolation test relies on and the docs must keep EZD-005b's checks green (Q-0198 rating). test-author Sonnet 5.5, builder Sonnet 5.5 (PROCESS.md section 4 table).

## 9. Dependencies
- **Row:** EZD-005b, EZD-004a, EZD-004b (all `done`, STATUS.md).
- **Used directly but not in the row (all `done`):** EZD-005a (tables and checks the rows must satisfy), EZD-001 (Vitest, C9, phase grep), EZD-006 (T19 (d) hex check; the hook claims EZD-032 relies on).
- **Not a dependency:** EZD-016a (no browser test, no visual checklist).
- **Later users:** EZD-016d, EZD-016a, EZD-032; EZD-101 adds one user per preset to the seed (ticket row, original EZD-016a scope).

**Risks:**
- `tenancy-bootstrap.test.mjs` T17 truncates `tenant, app_user cascade` inside a rolled-back transaction; the cascade now also covers the 200 projects. It rolls back, so the seed survives, but the lock on `project` is held a little longer while other files run.
- EZD-006 T17 (`rls.audit.test.ts`) asserts an InitPlan in `explain select * from public.project`; with 200 rows the planner may pick another scan, but the InitPlan comes from the wrapped helper, not the row count. If it fails, the builder stops and raises it rather than changing the seed.
- PostgREST's row cap (`supabase/config.toml` line 18, `max_rows = 1000`) is above 200, so T4 (a) reads all rows in one request.
- Josh's punch list step 4 ("sign in as the second-tenant test user") runs on the preview, which uses the dev database (11 Operations); this ticket puts tenant 2 only in the local seed (ticket row; Q-0033 (a)). Who creates that user on cloud dev is not this ticket's; the orchestrator routes it with EZD-032 or the phase gate.
- If EZD-016d renames the docs placement or the seed names, EZD-016a and EZD-032 are re-validated (vault/plans/EZD-016a.md section 9).

## 10. Open questions
None.

Not re-asked: Q-0033 (a) (local seed only), Q-0198 (split, names and values kept), Q-0085 (a) (EZD-032 reads the second tenant).
