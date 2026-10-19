# EZD-005b · Tenant 1 and Josh: seed and cloud setup file

- **ACs:** AC-EZD-005b-1, AC-EZD-005b-2 (`vault/spec/acceptance-criteria.md` lines 25–26; generated from Done-when, KNOWN-LIMITS "Acceptance criteria for Phase 0")
- **Complexity:** high (section 8)
- **User-visible result:** after every local database reset Worth Properties is company 1 with Josh as its owner, and Josh has a one-time file and plain steps to create the same in the cloud dev database (nothing on screen yet).
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: ready (Stage 2, 2026-10-19: no open questions)

Planned from `vault/plans/EZD-005.md` "Split proposal · Part EZD-005b", its "Re-validation findings" V1–V8 and its "Re-validated plan text" (Approach Steps 3, 6 seed lines, 7; Tests T1, T12, T15, T17, T18; Risks), per Q-0150 (answered-agent: each part is planned from that text; every interface name other plans cite is kept). Choices no source makes are marked *planner's choice*; they were made in EZD-005.md and stand unless noted "new in 005b".

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 16):
- **Scope:** supabase/seed.sql rows for Worth Properties as tenant 1 and Josh as owner with fixed ids; one-time cloud setup file supabase/bootstrap/tenant-1.sql (Q-0033 (a); run on prod by the release workflow, Q-0106); local SQL runner scripts/db/sql.mjs; Tenant 1 setup steps in docs/runbook.md. Split from EZD-005 (Q-0150); plan Part EZD-005b.
- **Done when:** Seed creates Worth Properties as tenant 1 with Josh as owner. The one-time cloud setup file creates the same rows with the email typed into it, and refuses a missing email or a second run without changing anything.
- **Depends on:** EZD-005a, EZD-004a, EZD-004c · **Spec ref:** Data model · Tables

### Steps
1. **Seed rows** (`supabase/seed.sql`; EZD-005.md Step 3). `supabase db reset --local`, run by `pnpm db:up`, loads it after the migrations on the local stack only (`supabase/config.toml` `[db.seed]` `enabled = true`, `sql_paths = ["./seed.sql"]`; EZD-004a Step 4; finding V1). Replace both current comment lines (they call the file a placeholder, which stops being true) with a header comment: local seed only; cloud projects get these rows from `supabase/bootstrap/tenant-1.sql`; keep the two files in step (*planner's choice*, new in 005b; Q-0151 (a) lets the file hold non-comment lines). Plain `insert` statements, in this order:

   | Table | Values | Source |
   | --- | --- | --- |
   | `public.tenant` | `id` = `00000000-0000-4000-8000-000000000001`, `name` = `Worth Properties`; every other column at its default (`logo_path`, `license_no`, `code_edition` null; `contact`, `title_block`, `defaults` = `{}`) | Ticket Done when; 02 Scope "WP as tenant 1"; fixed id EZD-005.md Step 1.2; no source gives tenant 1's license, contact or logo, so Josh enters them in S15a (EZD-112); `code_edition` null per EZD-118 ("store null" until EZD-613) |
   | `public.app_user` | `id` = `00000000-0000-4000-8000-000000001001`, `name` = `Josh Bishop`, `email` = `josh@example.com`, `language` = `en`, `role_preset` = `owner`, `ipad_input_mode` null, `auth_user_id` null | Name: CLAUDE.md ("Owner … Josh Bishop"), 02 Users and role presets ("Owner \| Josh"). Email: *planner's choice* (EZD-005.md Step 3), local test data on the reserved `example.com` domain (RFC 2606) so no real address enters the public repo (Q-0033 (a) "No personal data committed"); EZD-016a cites it as `JOSH_EMAIL` (vault/plans/EZD-016a.md line 126). `en`: Q-0029 (a), Q-0121 (a). `owner`: Done when. `ipad_input_mode` null = company default (S15d Decision 5). `auth_user_id` null: EZD-007 links it at first sign-in (EZD-005a Step 1) |
   | `public.membership` | `tenant_id` = tenant 1, `user_id` = Josh, `status` = `active`, `scope` = `all`, `invited_at` null, `last_active_at` null; `id` from its default | 10 preset table (Owner views every project) → `all`; Josh was not invited → `invited_at` null (EZD-005.md Step 3) |

   No `project` or `membership_project` rows (EZD-016a adds tenant 2 and 200 projects; EZD-101 adds one user per preset; phase-00 EZD-016a row).
2. **Cloud setup file** `supabase/bootstrap/tenant-1.sql` (new; EZD-005.md Step 7; Q-0033 (a); prod path Q-0106 via vault/plans/EZD-023b.md Step 9). Not under `migrations/` and not in `[db.seed]` `sql_paths`, so neither `supabase db reset --local` nor EZD-004c's `supabase db push` runs it. Content:
   - Two comment lines above the block for Josh: what the file does and "replace only the placeholder text on the `owner_email` line below with the email you sign in with; keep the quote marks" (wording in section 6). The comments must **not** contain the placeholder string itself: the file holds it exactly once (T18; EZD-023b `renderBootstrap` refuses a file with it more than once, vault/plans/EZD-023b.md line 274). No text matching an email address anywhere (T18).
   - One `do $$ declare … begin … end $$;` block, so it applies all or nothing. First declaration: `owner_email text := 'PASTE-YOUR-EMAIL-HERE';`.
   - `v := lower(btrim(owner_email))`. If `v = 'paste-your-email-here'` or `v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'`: `raise exception 'ezd_bootstrap_email_missing'`. This check runs first, before the tenant check.
   - If `public.tenant` has id `00000000-0000-4000-8000-000000000001`: `raise exception 'ezd_bootstrap_already_done'` (*planner's choice*, EZD-005.md Step 7: refuse rather than skip, so Josh sees it was done).
   - Insert the same three rows as Step 1 with the same fixed ids and values, except `app_user.email` = `v`.
   - Last statement in the block: `raise notice 'ezd_bootstrap_done'`.
   - The three `ezd_bootstrap_*` strings are codes read by tests, the runbook and EZD-023b (line 223), not app wording.
3. **Local SQL runner** `scripts/db/sql.mjs` (new; Node 22 built-ins only; builder may write `scripts/db/`, `.claude/hooks/guard-paths.mjs` lines 81–82, Q-0148). `runLocalSql(sqlText)` writes `sqlText` to the stdin of `docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q -t -A`, where `<project_id>` is read from `supabase/config.toml` next to the script (today `ezdraft`, container `supabase_db_ezdraft`, finding V7), `docker` from PATH (Mac build machine, `ubuntu-latest` CI; finding V7). It resolves `{ code, stdout, stderr }` with psql's exit code (non-zero when the SQL raises; psql prints notices and errors on stderr). It takes no connection argument, so it can reach only the local container. If `docker` cannot be started it resolves `code` 1 with stderr holding the existing local.mjs Docker wording `Local Supabase needs Docker running (start Docker Desktop).` (`scripts/db/local.mjs` line 11; no new wording). *Planner's choice*, new in 005b: `docker exec psql` only; EZD-005.md Step 7's optional `supabase db query` route is dropped so the runner has one behaviour. If the container refuses `-U postgres`, the builder stops and reports (CLAUDE.md rule 1). EZD-006 Step 1b reuses this export from `scripts/db/local.mjs` (vault/plans/EZD-006.md line 66).
4. **Narrow EZD-004a T11** (test-author; Q-0151 (a)): in `scripts/db/__tests__/db.test.mjs` remove only the comment-only loop (lines 278–281: read `seed.sql`, every non-blank line starts with `--`); keep `existsSync(seedPath)` and every `sql_paths` assertion. Recorded as an assertion change on a merged test; code-reviewer mode 2 checks nothing else in the file changed; Josh confirms or reverts (Q-0151).
5. **`docs/runbook.md`:** append `## Tenant 1 setup (EZD-005)` after `## Supabase cloud projects (EZD-004)` (finding V3; EZD-005.md Step 7); never rewrite the file. Text: section 6.
6. **`docs/architecture.md`** (extend only, EZD-000 T5):
   - In `### Tenancy tables (EZD-005)` (added by EZD-005a under `## Migrations`; vault/plans/EZD-005a.md Step 5 "EZD-005b adds those lines") add: the fixed ids of tenant 1 (`00000000-0000-4000-8000-000000000001`) and Josh (`00000000-0000-4000-8000-000000001001`) and that `app/test-utils/seed-ids.ts` exports them; `supabase/seed.sql` is local only; cloud projects get the same rows from `supabase/bootstrap/tenant-1.sql`, run once (dev by Josh, Q-0033 (a); prod by EZD-023b's release workflow on the first real release, Q-0106, Q-0113); the two files hold the same ids and values except the email, and the placeholder and three codes are a contract with EZD-023b; `scripts/db/sql.mjs` `runLocalSql` is the local-only SQL runner.
   - In `### Local database` (line 195) change only the clause "`supabase/seed.sql` is comment-only until EZD-005." to say the seed holds tenant 1 and Josh (EZD-005b) and see `### Tenancy tables (EZD-005)`. EZD-004a T18 reads only `pnpm db:up`, `pnpm db:types`, `public.health()` there (`scripts/db/__tests__/db.test.mjs` lines 335–338), so it stays green.
   - No Dependencies or Machine checks row (no new package; T17/T18 are this ticket's own tests).

No migration, no app code, no route, no UI, no new dependency, no env variable, no workflow. No money fields (03 rule 2). No `schema_version` change.

### Files
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `supabase/seed.sql` | Change (replace the 2 comment lines; add the inserts) | builder | Step 1 |
| `supabase/bootstrap/tenant-1.sql` | New | builder | Step 2 |
| `scripts/db/sql.mjs` | New | builder | Step 3 |
| `docs/runbook.md` | Change (append one section) | builder | Step 5 |
| `docs/architecture.md` | Change (Step 6 lines only) | builder | Step 6 |
| `app/test-utils/seed-ids.ts` | New | test-author | Contract exports (guard-paths.mjs line 15: `test-utils/` is the test-author's) |
| `app/src/server/db/seed.test.ts` | New | test-author | T1, T12 |
| `scripts/db/__tests__/tenancy-bootstrap.test.mjs` | New | test-author | T15b, T17, T18 |
| `scripts/db/__tests__/db.test.mjs` | Change (T11 loop only) | test-author | Step 4 (Q-0151 (a)) |
| `supabase/migrations/**`, `database.types.ts`, `scripts/gate.mjs`, `.github/workflows/**`, `CLAUDE.md`, `vault/**` | Not touched | — | EZD-005a owns the tables; Josh / orchestrator files |

## 2. Sources
- `vault/spec/sections/03-data-model.md`: intro line 3 ("Every table carries `tenant_id` with row-level security from day one"); Tables lines 31–33 (tenant, user "Email required", membership scope); Architecture rule 2 (no money here).
- `vault/spec/sections/02-product-overview.md` Scope "WP as tenant 1"; Users and role presets "Owner | Josh" (via EZD-005.md Sources read).
- `vault/spec/sections/11-non-functional-requirements.md`: Operations (local / dev / production environments; releases take a dump; add before remove); Security and audit (RLS by `tenant_id`); Performance read, no effect (section 9).
- `vault/spec/sections/04-app-shell-and-global-ui.md`: read (headings); no shell work. `non-goals.md`: nothing applies (Billing hidden for tenant 1 is not touched). `glossary.md`: no entry for tenant, seed or owner beyond the money permissions.
- Decisions: Q-0033 (a) (`decisions/02-product-overview.md` line 13: one-time SQL file, Josh types his email, runbook step, no personal data committed); Q-0113 (same file line 19: one Supabase project until launch); Q-0106 (`decisions/11-non-functional-requirements.md` line 14: automatic release, production secrets only in a GitHub environment limited to main); Q-0029 (a), Q-0121 (a) (`decisions/10-permissions-and-settings.md` lines 8, 26: English default); Q-0150 (split), Q-0151 (a) (narrow EZD-004a T11) in `vault/questions/QUESTIONS.md` lines 159–160.
- Plans: `vault/plans/EZD-005.md` (Split proposal Part EZD-005b; V1–V8; Steps 3, 6, 7; Tests; Risks); `EZD-005a.md` (tables, contract, Step 5); `EZD-004a.md`, `EZD-004c.md` (merged; findings V1, V3); `EZD-006.md` lines 66, 245 (reuses `runLocalSql`, `seed-ids.ts`); `EZD-016a.md` lines 20, 114–126 (extends `seed.sql` and `seed-ids.ts`); `EZD-023b.md` lines 31, 223, 274, 361 (placeholder, codes, block).
- Code read 2026-10-19: `supabase/seed.sql` (2 comment lines); `supabase/config.toml` `[db.seed]`; `scripts/db/__tests__/db.test.mjs` lines 265–281 (T11), 326–338 (T18); `scripts/db/local.mjs` line 11; `docs/runbook.md` headings (lines 3, 19) and EZD-004 step style; `docs/architecture.md` lines 149, 195; `.claude/hooks/guard-paths.mjs` lines 15, 81–82; `scripts/gate.mjs` lines 14–15 (SECURITY_PATHS has `db/`, `supabase/bootstrap/`).
- Mockup: none (`tickets.json` `mockups: []`). Research reports: none cover this ticket.

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| file / exports | `app/test-utils/seed-ids.ts` | `export const TENANT_1_ID = '00000000-0000-4000-8000-000000000001'`; `export const JOSH_USER_ID = '00000000-0000-4000-8000-000000001001'`. Exactly these two (EZD-016a adds `JOSH_EMAIL` and others later, vault/plans/EZD-016a.md line 126; EZD-006 line 245 imports them) |
| file | `supabase/seed.sql` | Rows of Step 1. EZD-016a appends below them, never replaces (EZD-016a line 20) |
| file | `supabase/bootstrap/tenant-1.sql` | One `do $$ … $$;` block; `PASTE-YOUR-EMAIL-HERE` exactly once, inside `owner_email text := '…';`; codes `ezd_bootstrap_email_missing` (exception), `ezd_bootstrap_already_done` (exception), `ezd_bootstrap_done` (notice). EZD-023b depends on all four strings and on the all-or-nothing block (EZD-023b lines 31, 223, 274) |
| export / signature | `scripts/db/sql.mjs` `runLocalSql(sqlText: string) → Promise<{ code: number, stdout: string, stderr: string }>` | ESM named export. Local container only (Step 3); `code` 0 on success, non-zero when the SQL raises; never rejects for an SQL error. Used by T17 and by EZD-006's `local.mjs` change |
| docs | `docs/runbook.md` `## Tenant 1 setup (EZD-005)` | After `## Supabase cloud projects (EZD-004)`; contains `supabase/bootstrap/tenant-1.sql`, `PASTE-YOUR-EMAIL-HERE`, `SQL Editor`, `TENANT1_OWNER_EMAIL`, `owner_email_secret_unused` (T15b). Base ID kept in the heading (Split proposal) |
| docs | `docs/architecture.md` `### Tenancy tables (EZD-005)` | Adds both seed ids and `supabase/bootstrap/tenant-1.sql` (T15b) |
| test files | `app/src/server/db/seed.test.ts` (top-level `describe('EZD-005b seed', …)`, check C9); `scripts/db/__tests__/tenancy-bootstrap.test.mjs` (test titles start `EZD-005b`) | Phase 0 grep matches `EZD-005b` (finding V8) |

Done-when titles (docs/architecture.md Tests): T1 `EZD-005b done when: seed creates Worth Properties as tenant 1 with Josh as owner` (AC-1); T17 (a) `EZD-005b done when: the cloud setup file creates the same rows with the typed email` and T17 (b)–(e) `EZD-005b done when: the cloud setup file refuses a missing email or a second run without changing anything` (AC-2).

## 4. Tests
Common setup: the root `test` runs `pnpm run db:up` first, so the database is freshly reset and seeded (root `package.json`; finding V1); root `node:test` files run before each package's Vitest. Vitest (T1) uses an **admin** client `createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } })` from EZD-004b's global setup env, as `app/src/server/db/local-services.test.ts` does (finding V2). node:test files have no supabase-js at the root, so T17 reads rows through `runLocalSql` with a `select` that prints one JSON line (`json_build_object` of the tenant row, the app\_user row and a `json_agg` of the matching memberships; *planner's choice*, new in 005b, replacing EZD-005.md T17's "re-read with the admin client"). Tests never leave seeded rows changed. They match codes and values, never message wording. T17 cases run sequentially in one file.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 Seed: tenant 1 with Josh as owner (done when) | AC-1 | unit (Vitest, local DB) | Admin client: `tenant` by `id = TENANT_1_ID`; `app_user` by `id = JOSH_USER_ID`; `membership` by `tenant_id = TENANT_1_ID and user_id = JOSH_USER_ID` | Tenant `name === 'Worth Properties'`. User `name === 'Josh Bishop'`, `email === 'josh@example.com'`, `language === 'en'`, `role_preset === 'owner'`, `ipad_input_mode === null`, `auth_user_id === null`. Exactly 1 membership: `status === 'active'`, `scope === 'all'`, `invited_at === null` | Step 1 table (each value's source listed there); Done when |
| T12 Seed ids are uuid v4 shaped | AC-1 | unit (Vitest, no DB) | `TENANT_1_ID`, `JOSH_USER_ID` | Values `00000000-0000-4000-8000-000000000001` and `00000000-0000-4000-8000-000000001001`; both match `^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` | EZD-005.md Step 1.2 (fixed ids, strict uuid validators accept them) |
| T11 change (EZD-004a, narrowed) | AC-1 | unit (node) | Existing EZD-004a T11 | Still asserts `[db.seed]` `sql_paths` contains `./seed.sql` and `supabase/seed.sql` exists; the comment-only loop is gone; title unchanged | Q-0151 (a) |
| T15b Docs | AC-2 | unit (node) | `docs/runbook.md`; `docs/architecture.md` | Runbook: heading `## Tenant 1 setup (EZD-005)` whose section (to the next `## `) contains `supabase/bootstrap/tenant-1.sql`, `PASTE-YOUR-EMAIL-HERE`, `SQL Editor`, `TENANT1_OWNER_EMAIL`, `owner_email_secret_unused`, and sits after `## Supabase cloud projects (EZD-004)`. Architecture: the `### Tenancy tables (EZD-005)` section (to the next `##` or `###`) contains `00000000-0000-4000-8000-000000000001`, `00000000-0000-4000-8000-000000001001`, `supabase/bootstrap/tenant-1.sql` | EZD-005.md T15 (runbook half; Split proposal T15b); Q-0033 (a); Q-0106; EZD-023b Step 6 step 12 (`owner_email_secret_unused`) |
| T17 (a) File creates the rows (done when) | AC-2 | unit (node, `runLocalSql`) | F = text of `supabase/bootstrap/tenant-1.sql`. One SQL text: `begin;` `truncate public.tenant, public.app_user cascade;` F with `PASTE-YOUR-EMAIL-HERE` → ` Owner.Test@Example.com `; the JSON `select` for tenant 1 / `JOSH_USER_ID`; `rollback;` | `code === 0`; tenant `name === 'Worth Properties'`, `contact` deep-equals `{}`; app\_user `id === JOSH_USER_ID`, `email === 'owner.test@example.com'`, `name === 'Josh Bishop'`, `language === 'en'`, `role_preset === 'owner'`, `auth_user_id === null`; exactly 1 membership, `status === 'active'`, `scope === 'all'`, `invited_at === null`; stdout or stderr contains `ezd_bootstrap_done` | Q-0033 (a); Step 2 (trim, lower-case, same rows as Step 1); Q-0029 (a). Truncate inside the rolled-back transaction: EZD-005.md T17 *planner's choice* (later tickets' FKs to tenant 1 would block row deletes) |
| T17 (b), (c) Missing email refused | AC-2 | unit (node) | Same setup; (b) F unchanged; (c) placeholder → `not-an-email` | `code !== 0`; stderr contains `ezd_bootstrap_email_missing` | Step 2; Q-0033 (a) |
| T17 (d) Second run refused | AC-2 | unit (node) | No truncate (tenant 1 exists from the seed): F with placeholder → `second.run@example.com`; then a separate `runLocalSql` JSON `select` of tenant 1, Josh and `count(*)` of `app_user` where `email = 'second.run@example.com'` | First call `code !== 0`, stderr contains `ezd_bootstrap_already_done`. Second call: tenant `name === 'Worth Properties'`; Josh `email === 'josh@example.com'`; exactly 1 membership of Josh in tenant 1; count `0` | Step 2; Q-0033 ("one-time"); Step 1 (seed values) |
| T17 (e) Refusal changes nothing (empty tables) | AC-2 | unit (node) | For F′ in {F unchanged, placeholder → `not-an-email`}: one SQL text `begin;` truncate as (a); `do $t$ begin execute $f$<F′>$f$; exception when others then raise notice 'caught:%', sqlerrm; end $t$;` (dollar tags chosen so they do not occur in F); `select` counts of `tenant`, `app_user`, `membership`; `rollback;` | `code === 0`; stderr contains `caught:ezd_bootstrap_email_missing`; the three counts are `0`, `0`, `0`. Afterwards T1's values re-read through `runLocalSql` are unchanged | Done when "without changing anything"; Step 2 (one all-or-nothing block); new in 005b, because with `ON_ERROR_STOP` a failed plain run ends the session before a `select` can show the empty state |
| T18 No personal data; in step with the seed | AC-2 | unit (node) | Text of `supabase/bootstrap/tenant-1.sql` and `supabase/seed.sql`; the bootstrap path | Bootstrap contains `PASTE-YOUR-EMAIL-HERE` exactly once and no match of `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`; both files contain `00000000-0000-4000-8000-000000000001`, `00000000-0000-4000-8000-000000001001`, `Worth Properties`, `Josh Bishop`; the bootstrap file is not under `supabase/migrations/`; bootstrap contains `ezd_bootstrap_email_missing`, `ezd_bootstrap_already_done`, `ezd_bootstrap_done` | Q-0033 (a) "No personal data committed"; Step 2; EZD-005.md Step 1.2; EZD-023b line 274 (placeholder exactly once) |
| T16 Gate (orchestrator) | all | gate | Docker running; `node scripts/gate.mjs <worktree>` | Exit 0; typecheck, lint, test, build pass | CLAUDE.md rule 12 |

## 5. Visual checklist
None (no screen; `mockups: []`).

## 6. Proposed wording
Josh-facing text (runbook and the comments he sees when pasting the file), in the style of the approved `## Supabase cloud projects (EZD-004)` steps. The `ezd_bootstrap_*` codes and the reused Docker message are not new wording.

| Where | Text |
| --- | --- |
| `supabase/bootstrap/tenant-1.sql`, comment line 1 | `-- One-time setup of Worth Properties (company 1) and its owner account in a cloud project. Steps: docs/runbook.md, "Tenant 1 setup".` |
| same, comment line 2 | `-- Replace only the placeholder text on the owner_email line below with the email you sign in with. Keep the quote marks.` |
| `docs/runbook.md` intro | Worth Properties is company 1 in EZ Draft and you are its owner. On the local test database this happens by itself every time it is reset. Each cloud database gets it once from the file `supabase/bootstrap/tenant-1.sql`. The file holds no email; you type yours in only where it runs. |
| runbook, Dev heading | **Dev (`ezdraft-dev`), once:** |
| step 1 | **Wait for the migrations.** The "Supabase dev migrations" workflow (section "Supabase cloud projects", step 6) must have run green on `develop` after this setup reached `develop`. If it has not, open Actions, Supabase dev migrations, Run workflow, branch `develop`. |
| step 2 | **Copy the file.** Open `supabase/bootstrap/tenant-1.sql` on GitHub and copy all of it. |
| step 3 | **Paste it.** In Supabase open the `ezdraft-dev` project, then SQL Editor, New query, and paste. |
| step 4 | **Type your email.** Replace `PASTE-YOUR-EMAIL-HERE` with the email you sign in with. Keep the quote marks around it. |
| step 5 | **Run it.** Press Run. "Success" or `ezd_bootstrap_done` means Worth Properties and your owner account now exist. `ezd_bootstrap_email_missing` means the email was not typed in correctly; fix it and run again. `ezd_bootstrap_already_done` means this project is already set up, and nothing changed. |
| step 6 | **Keep the email out of the repo.** Never paste the edited text into chat, a ticket or the repo. |
| runbook, Production heading | **Production (`ezdraft-prod`): nothing to paste.** |
| step 7 | Production does not exist until launch. When you set it up from the Before-launch checklist, add the email you sign in with as the secret `TENANT1_OWNER_EMAIL` in the GitHub environment `release`. The first real release then creates Worth Properties and your owner account. If company 1 is already there, the release skips this. Do not paste the file into production. |
| step 8 | After that first release, delete `TENANT1_OWNER_EMAIL` from the `release` environment. Until you do, every release summary shows the notice `owner_email_secret_unused`. |

The orchestrator copies steps 1–8 into `vault/tickets/needs-from-josh.md` (EZD-005.md Step 7).

## 7. Security review
security-review: yes. Areas: auth data (the owner account row), data access, SQL run on production by the release workflow (EZD-023b Step 9), a local SQL runner that connects as the `postgres` role (local only). Gate SECURITY_PATHS matches `supabase/bootstrap/` and `db/` (`scripts/gate.mjs` lines 14–15). Points to check: no email in the repo (T18); the placeholder cannot be used to inject SQL on prod (EZD-023b's pattern forbids quotes, line 274); `runLocalSql` cannot reach a cloud database (no connection argument); the block is all or nothing.
Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation
High: a new pattern, a SQL file the release workflow runs on production plus the local SQL runner EZD-006 reuses, creating the owner's account (PROCESS.md section 4; EZD-005.md Split proposal Part b). Test-author Fable 5.1, builder Fable 5.1; code-reviewer and security-reviewer Fable 5.1. Size: 5 builder files + 4 test-author files, 6 tests + gate (T17 has five cases), within the split the orchestrator accepted (Q-0150).

## 9. Dependencies
- Ticket row: **EZD-005a** (the five tables, their defaults and checks; vault/plans/EZD-005a.md section 3; not yet merged, this ticket builds after it), **EZD-004a** (seed loading on `db:up`, container `supabase_db_ezdraft`, T11 being narrowed; merged 78b3103), **EZD-004c** (runbook section and the dev workflow step 1 names; merged ea665d3).
- Not in the row, used directly: **EZD-004b** (`@supabase/supabase-js` 2.118.0 and the Vitest global setup T1 uses; merged 22b6f0a; transitive through EZD-005a), EZD-000 and EZD-001 (test naming, C9, docs/architecture.md). Docker running (docs/architecture.md `### Local database`).
- No EZD-016a: no visual checklist.
- Dependents citing this contract: EZD-006 (`runLocalSql`, `seed-ids.ts`), EZD-016a (`seed.sql`, `seed-ids.ts`), EZD-023b (placeholder, codes, block), EZD-025 (seeded tenant).
- Risks: the bootstrap file is a contract with EZD-023b, so a change to the placeholder, the codes or the block breaks the release (T17, T18 here and EZD-023b T7, T9 catch it); seed and bootstrap drift by hand (T18 checks ids and names only); T17's `truncate … cascade` holds an exclusive lock on the tenancy tables until rollback, so a later root node:test that reads them concurrently waits briefly (root runs `--test-concurrency=4`); the dev database stays empty until Josh runs the file (no preview sign-in before then); no performance budget effect.

## 10. Open questions
None. EZD-005's QP-1 is Q-0151, answered-agent (a), applied in Step 4.
