# EZD-004a · Local Supabase and migrations in the gate

- **ACs:** AC-EZD-004a-1, AC-EZD-004a-2, AC-EZD-004a-3 (`vault/spec/acceptance-criteria.md` lines 15–17, generated from Done-when)
- **Complexity:** high (section 8)
- **User-visible result:** every gate run (and the Phase 0 CI run) starts a fresh local database, applies every migration and checks that the database answers "ok" with its newest migration number.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: ready

Split from EZD-004 (Q-0148). This plan is the part "EZD-004a" of the split proposal in `vault/plans/EZD-004.md` (lines 12–20), with the re-validation findings F1–F12 there (lines 42–55) applied. Technical detail is taken from the v1 plan text (`git show de5030c:vault/plans/EZD-004.md`, "v1" below), Steps 1–4 and 8. Every interface name is kept from v1 because EZD-005, EZD-006, EZD-007, EZD-009, EZD-016a, EZD-018 and EZD-023b already cite them (grep of `vault/plans/*.md`, 2026-10-19). Test IDs keep v1's numbers (EZD-007's plan line 21 cites "EZD-004's T6"); the two new tests are T17 and T18.

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 12):
- **Scope:** Supabase CLI (pinned root devDependency); supabase/ folder (config, seed, first migration creating public.health()); scripts/db local and gen-types helpers and the root db:* scripts; the gate's test step starts the local Supabase and resets it; generated database types committed. Split from EZD-004 (Q-0148); plan Part EZD-004a.
- **Done when:** The gate's test step resets the local Supabase and applies every migration, so the applied versions equal the migration files; public.health() called through the local API returns status ok and the newest migration's timestamp; the committed generated types match the local database.
- **Depends on:** EZD-001
- **Spec ref:** Stack · Database, auth, files

### Steps

1. **CLI.** `pnpm add -D -w supabase@2.121.0` at the root (02 Named tools "Database migrations: Supabase CLI migrations"; docs/architecture.md Dependencies row `supabase` 2.121.0, Used in `root`, already present, so no Dependencies edit, finding F5). The package has no install script (finding F2), so no `allowBuilds` entry is added and EZD-001 T10 (`scripts/tooling/__tests__/tooling.test.mjs`: every `allowBuilds` entry `false`) stays green. If `pnpm install` reports a build script anyway, the builder denies it in `allowBuilds` (map form) and, if something then fails, stops with a question (Q-0140 (a); docs/architecture.md "Adding a dependency"). The lockfile must carry the Linux platform package so `--frozen-lockfile` works on `ubuntu-latest` (finding F12).
2. **CLI folder** (v1 Step 1). `pnpm supabase init` writes `supabase/config.toml` and `supabase/.gitignore`; both committed. Edits from the CLI defaults (planner's choice in v1, reviewed at the Phase 0 plan review):
   - `project_id = "ezdraft"` (one shared local stack for every worktree; one gate at a time, Q-0114).
   - `[analytics] enabled = false` (errors go to Sentry, 11 Operations; saves memory).
   - `[edge_runtime] enabled = false` (no Edge Functions: jobs are Vercel Functions, P4 in `vault/spec/decisions/13a-rounds-24-25.md`; 02 Stack "Background jobs").
   - Everything else stays at the CLI default, including Auth, Storage, Realtime, the mail catcher (02 Stack "Supabase: Postgres with row-level security, Auth, Storage, Realtime"), Studio, `[api] port` and `[db.seed]` `sql_paths = ["./seed.sql"]`. Auth settings, buckets and Realtime authorization are not set here (EZD-007, EZD-006, EZD-132, EZD-018).
   - `supabase/seed.sql`: comment-only, so the seed path resolves; EZD-005 fills it (vault/plans/EZD-005.md).
3. **First migration** (v1 Step 2). `pnpm supabase migration new create_health_function` → `supabase/migrations/<14-digit UTC>_create_health_function.sql` (docs/architecture.md Migrations; check C5). No table: a table would need `tenant_id`, RLS and the EZD-006 table checks (03 intro "Every table carries tenant_id"; 11 Operations "A CI test fails when any table lacks a policy"), and the PHASES.md Phase 0 "health row" needs none. Body, as in v1:
   ```sql
   create function public.health()
   returns table (status text, schema_version text)
   language sql stable security definer set search_path = ''
   as $$
     select 'ok'::text, max(version)::text from supabase_migrations.schema_migrations
   $$;
   revoke all on function public.health() from public;
   grant execute on function public.health() to anon, authenticated;
   ```
   `schema_version` is the newest applied migration's 14-digit timestamp (ticket Done when). It is the database migration version, not the model `schema_version` of 03 rule 5. Returned data: the literal `ok` and a timestamp; no tenant data.
4. **`scripts/db/local.mjs`** (v1 Step 3; Node 22 built-ins only, no new dependency). It runs the CLI from the repo root's `node_modules/.bin/supabase`, so it works under plain `node` as well as `pnpm run` (planner's choice).
   - `up`, in this order: (1) `supabase status`; if the stack is not running, `supabase start`; (2) `supabase db reset --local` in every case (a running stack is not a reason to skip the reset: the Done-when requires every gate run to reset and apply every migration); (3) on any CLI failure exit 1, and if the CLI's output contains `docker` (case-insensitive) first print the wording in section 6 to stderr. Exit 0 on success. EZD-006 later appends a step after (2) (vault/plans/EZD-006.md line 66).
   - `env`: reads `supabase status -o json` and prints one JSON object with exactly the keys `NEXT_PUBLIC_SUPABASE_URL` (the API URL), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the CLI's publishable key; its anon key if the pinned CLI prints no publishable key) and `SUPABASE_SECRET_KEY` (its secret key; else its service-role key). These are the CLI's published local defaults, not secrets. Exit 1 when the stack is not running. The names are the app variable names of v1 Step 5, which EZD-004b documents and EZD-007 extends (vault/plans/EZD-007.md line 21).
5. **`scripts/db/gen-types.mjs`** (v1 Step 4): runs `supabase gen types typescript --local` (schema `public`) and writes `app/src/server/db/database.types.ts` (path from docs/architecture.md Migrations). `--check` writes nothing and exits 1 when the target file differs from the CLI output (line endings normalized), else 0. `--file <path>` changes the compared/written file (default the committed path) so the test can prove a mismatch fails without touching the committed file (planner's choice). The generated file is committed (02 Named tools "with generated TypeScript types") and ignored by ESLint and Prettier because it is machine-written.
6. **Root `package.json`** (v1 Step 3; finding F4). New scripts: `db:up` = `node scripts/db/local.mjs up`, `db:env` = `node scripts/db/local.mjs env`, `db:reset` = `supabase db reset --local`, `db:stop` = `supabase stop`, `db:types` = `node scripts/db/gen-types.mjs`. `test` becomes `pnpm run db:up && ` + the current command unchanged (`node --test --test-concurrency=4 "scripts/**/*.test.mjs" && pnpm -r --if-present --filter "!./spikes/**" run test`). `scripts/gate.mjs` runs `test` (gate.mjs line 152) and `.github/workflows/ci.yml` runs the gate on `ubuntu-latest`, so the phase PR's CI run resets the local stack too, with no ci.yml edit (finding F11).
7. **Ignores.** `eslint.config.mjs` global `ignores` gains `app/src/server/db/database.types.ts`; `.prettierignore` gains the same line. `scripts/db/` is already outside Prettier (`.prettierignore` `scripts/*`) and outside lint and typecheck (no root package lint; no root tsconfig, docs/architecture.md Root config files).
8. **`docs/architecture.md`** (v1 Step 8, narrowed to this part; findings F5, F6):
   - `## Migrations` gains `### Local database`: `pnpm db:up` (start + reset; wipes local data; the root `test` runs it first), `pnpm db:types` after every migration and commit the result (T9 fails otherwise), `pnpm supabase migration new <name>`, the `public.health()` function and that EZD-006's table checks do not cover it (it is a function, not a table). No cloud-dev lines (EZD-004c adds them).
   - `## Folder layout`: a `scripts/db/` line (local stack and types scripts) and `supabase/` line naming `config.toml`, `seed.sql`, `migrations/`.
   - `## Machine checks`: exactly three rows with `Built by` = `EZD-004a`: migrations applied equal the files (T1); generated types match the local database (T9); CLI pinned, runnable and Linux binary in the lockfile (T10). Inserted in the table before `### CI`, which stays the last subsection (finding F6).

### Files

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `supabase/config.toml`, `supabase/.gitignore` | New (`supabase init`, then edits) | builder | Step 2 |
| `supabase/seed.sql` | New (comment only) | builder | Step 2 |
| `supabase/migrations/<ts>_create_health_function.sql` | New | builder | Step 3 |
| `scripts/db/local.mjs` | New | builder (needs the precondition in section 9) | Step 4 |
| `scripts/db/gen-types.mjs` | New | builder (same precondition) | Step 5 |
| `app/src/server/db/database.types.ts` | New (generated by `pnpm db:types`) | builder | Step 5 |
| `package.json` (root) | Change (extend) | builder | Steps 1, 6 |
| `pnpm-lock.yaml` | Change (regenerated) | builder | Step 1 |
| `eslint.config.mjs`, `.prettierignore` | Change (one line each) | builder | Step 7 |
| `docs/architecture.md` | Change | builder | Step 8 |
| `scripts/db/__tests__/db.test.mjs` | New | test-author | Section 4 (node:test; found by the root `"scripts/**/*.test.mjs"` glob) |
| `pnpm-workspace.yaml`, `.github/workflows/ci.yml`, `scripts/gate.mjs`, `app/package.json` | Not touched | — | F2 (no allowBuilds entry); ci.yml and gate are Josh's; app deps are EZD-004b |

### Data
No tables. One function, `public.health()`: `security definer`, `search_path = ''`, execute granted to `anon` and `authenticated` only. No RLS policy needed (no table). No model `schema_version` change. No money fields.

## 2. Sources

- Ticket: `vault/tickets/phases/phase-00.md` line 12; `vault/tickets/tickets.json` EZD-004a (`depends_on` `["EZD-001"]`, `mockups` `[]`, `acs` AC-EZD-004a-1..3); `vault/tickets/PHASES.md` Phase 0 ("the health row" in Out of scope; Josh's test script step 5); `vault/tickets/README.md` (split-dependency rule line 14; rules 1, 4).
- Split and re-validation: `vault/plans/EZD-004.md` (Part EZD-004a, findings F1–F12); v1 text at `de5030c` (Steps 1–4, 8; tests T1, T4, T6, T9–T12, T14). Q-0148 (split applied).
- Spec: `02-product-overview.md` (Stack: Database, auth, files; Background jobs. Named tools: Database migrations); `03-data-model.md` (intro "Every table carries tenant_id"; Architecture rules 1, 5); `11-non-functional-requirements.md` (Operations: environments "local (agents and tests)", "A CI test fails when any table lacks a policy", errors to Sentry; Performance: no budget this ticket touches, no browser code); `04-app-shell-and-global-ui.md` (no shell work). Non-goals: "No CI run on a push" (ci.yml unchanged). Glossary: no entry for these terms.
- Decisions: P4 (`13a-rounds-24-25.md`); Q-0003 (Docker Desktop installed), Q-0022 (b) (first real CI run is the Phase 0 PR), Q-0114 (one gate at a time; 4 workers), Q-0124 (a) and Q-0125 (a) (builder write exception form; see section 9), Q-0140 (a) (build scripts denied), Q-0148 (`vault/questions/QUESTIONS.md`).
- Code read 2026-10-19: `package.json`, `pnpm-workspace.yaml`, `eslint.config.mjs`, `.prettierignore`, `scripts/gate.mjs` (lines 14, 69–71, 147, 152), `.github/workflows/ci.yml`, `.claude/hooks/guard-paths.mjs` (builder rule), `.claude/settings.json` (lines 29–38 allow `pnpm supabase start|stop|db reset|gen types|migration new`; 65–68 deny `db push`, `link`), `scripts/tooling/__tests__/tooling.test.mjs` lines 190–192, `scripts/hosting/__tests__/hosting.test.mjs` T6 (Machine checks row format), `scripts/ci/__tests__/ci.test.mjs` T6 (`### CI` last), `scripts/conventions/__tests__/architecture-doc.test.mjs` (fixed `##` list), `docs/architecture.md`.
- Outside: npm registry facts for `supabase@2.121.0` and its platform packages come from finding F2 (planner, `npm view`, 2026-10-19). No research report covers this ticket.
- Mockup: none (no screen).

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| file | `supabase/config.toml` | `project_id = "ezdraft"`; `[analytics] enabled = false`; `[edge_runtime] enabled = false`; `[api] port` and `[db.seed] sql_paths` at CLI defaults (`./seed.sql`) |
| file | `supabase/seed.sql` | Exists; comments only |
| file | `supabase/migrations/<YYYYMMDDHHMMSS>_create_health_function.sql` | Creates `public.health()` per Step 3 |
| SQL function | `public.health()` | `returns table (status text, schema_version text)`; one row `('ok', <newest applied migration version>)`; execute: `anon`, `authenticated` |
| HTTP (local API) | `POST <NEXT_PUBLIC_SUPABASE_URL>/rest/v1/rpc/health` | Header `apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>`, body `{}`; 200 with a JSON array of one row (a set-returning function) |
| CLI script | `node scripts/db/local.mjs up` | Status → start if not running → `db reset --local` always; exit 0 / 1; Docker wording on stderr when CLI output mentions docker |
| CLI script | `node scripts/db/local.mjs env` | stdout: one JSON object, exactly keys `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`; exit 1 when the stack is down |
| CLI script | `node scripts/db/gen-types.mjs [--check] [--file <path>]` | Writes (no `--check`) or compares (`--check`: exit 0 equal, 1 different) the CLI's `public` types; default file `app/src/server/db/database.types.ts` |
| file | `app/src/server/db/database.types.ts` | Generated, committed; ESLint- and Prettier-ignored |
| root scripts | `db:up`, `db:env`, `db:reset`, `db:stop`, `db:types` | As Step 6 |
| root script | `test` | `pnpm run db:up && node --test --test-concurrency=4 "scripts/**/*.test.mjs" && pnpm -r --if-present --filter "!./spikes/**" run test` |
| devDependency | `supabase` | `2.121.0` exact, root |
| docs | `docs/architecture.md` | `### Local database` under `## Migrations`; 3 Machine checks rows, last cell `EZD-004a` |

## 4. Tests

All in `scripts/db/__tests__/db.test.mjs` (node:test, Node 22 built-ins only). Titles start `EZD-004a T<n>`; the tests that close an AC end `done when` (docs/architecture.md Tests). The root `test` script runs `db:up` first, so tests T1, T6, T9, T17 run against a freshly reset stack. Tests in the file run in order (no `concurrency` option), and T12 is the last test in the file. Each spawned child gets a copy of `process.env` with `NODE_TEST_CONTEXT`, `EZD_TEST_GREP` and `EZD_PHASE` deleted (pattern of `scripts/ci/__tests__/ci.test.mjs` `childEnv`). "Newest migration" = the largest 14-digit prefix among `supabase/migrations/*.sql`, computed by the test from the folder, so later tickets' migrations do not break it. Tests match exit codes, JSON values and names, not message wording, except where stated.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 Migrations applied equal the files, done when | AC-EZD-004a-1 | unit (node, local DB) | `node_modules/.bin/supabase migration list --local` | Exit 0. The set of 14-digit numbers in the output equals the set of 14-digit prefixes of `supabase/migrations/*.sql`, and each such number appears twice on its line (local and applied columns). Before writing the parser the test-author reads the pinned CLI's output format; if it differs from "one row per version, local and applied columns", that is a structural question, not a change of the rule | Ticket Done when; docs/architecture.md Migrations, C5 |
| T4 Health function is narrow | AC-EZD-004a-2 | unit (node) | Text of the migration file containing `public.health`, lower-cased, whitespace collapsed | Contains `security definer`, `set search_path = ''`, `revoke all on function public.health() from public`, `grant execute on function public.health() to anon, authenticated`; contains no `create table` | Step 3 (v1 Step 2, T4); 03 intro |
| T6 Local env output | AC-EZD-004a-2 | unit (node, local DB) | `node scripts/db/local.mjs env` | Exit 0; stdout parses as JSON with exactly the three keys of section 3; `new URL(url)` hostname is `127.0.0.1` or `localhost` and port equals the `[api] port` value in `supabase/config.toml`; both keys non-empty and different | Step 4; `supabase/config.toml` |
| T9 Types match the local database, done when | AC-EZD-004a-3 | unit (node, local DB) | (a) `node scripts/db/gen-types.mjs --check`; (b) copy of the committed file with one extra line `// drift` in a temp dir, `--check --file <copy>` | (a) exit 0 and the committed file contains `health`; (b) exit 1 | Ticket Done when; 02 Named tools; Step 5 |
| T10 CLI pinned, runnable, Linux binary locked | AC-EZD-004a-1 | unit (node) | `node_modules/.bin/supabase --version`; root `package.json`; `pnpm-lock.yaml` text | Exit 0; trimmed stdout equals the Version cell of the `supabase` row in docs/architecture.md Dependencies (`2.121.0`); root devDependency `supabase` equals the same; lockfile contains `@supabase/cli-linux-x64@2.121.0`; `pnpm-workspace.yaml` has no `supabase` key under `allowBuilds` | docs/architecture.md Dependencies; finding F2, F12 (ci.yml `runs-on: ubuntu-latest`) |
| T11 Config | AC-EZD-004a-1 | unit (node) | `supabase/config.toml` as text | `project_id = "ezdraft"`; inside `[analytics]` `enabled = false`; inside `[edge_runtime]` `enabled = false`; inside `[db.seed]` a `sql_paths` list containing `./seed.sql`; `supabase/seed.sql` exists and every non-blank line starts with `--` | Step 2; P4; 11 Operations |
| T12 Clear Docker message (last test in the file) | AC-EZD-004a-1 | unit (node) | `node scripts/db/local.mjs up` with `DOCKER_HOST=tcp://127.0.0.1:9`, `timeout` 60,000 ms | Exit code 1 before the limit; stderr contains `Docker` | Step 4 and section 6; 60,000 ms from v1 T12 (planner's choice) |
| T14 Root scripts | AC-EZD-004a-1 | unit (node) | root `package.json` | Scripts `db:up` = `node scripts/db/local.mjs up`, `db:env` = `node scripts/db/local.mjs env`, `db:reset` contains `supabase db reset --local`, `db:stop` contains `supabase stop`, `db:types` = `node scripts/db/gen-types.mjs`; `test` starts with `pnpm run db:up && ` and still contains, as separate tokens, `--test`, `--test-concurrency=4`, `"scripts/**/*.test.mjs"`, `pnpm -r`, `--if-present`, `"!./spikes/**"`, `run test`; `lint` still contains `scripts/conventions/check.mjs` | Step 6; finding F4; EZD-001 T10 (tooling.test.mjs lines 190–192; Q-0114) |
| T17 Health through the local API, done when | AC-EZD-004a-2 | unit (node, local DB) | URL and publishable key from `node scripts/db/local.mjs env`; Node `fetch` `POST <url>/rest/v1/rpc/health`, headers `apikey: <key>`, `Content-Type: application/json`, body `{}` | Status `200`; JSON body deep-equals `[{ status: 'ok', schema_version: <newest migration> }]` | Ticket Done when; Step 3 |
| T18 Docs | AC-EZD-004a-1 | unit (node) | `docs/architecture.md`; `node scripts/conventions/check.mjs <repo>` | A `### Local database` heading between `## Migrations` and the next `##`, whose text contains `pnpm db:up`, `pnpm db:types`, `public.health()`; exactly 3 Machine checks table rows (4 cells) whose last cell is `EZD-004a`, all before `### CI`; check.mjs exits 0 | Step 8; EZD-003 T6 row format; EZD-002 T6 |
| Gate (orchestrator) | all | gate | Docker running; `node scripts/gate.mjs .claude/worktrees/EZD-004a` | Exit 0; `typecheck pass`, `lint pass`, `test pass`, `build pass`; the test log shows `db reset` applying the migration | CLAUDE.md rule 12; ticket Done when ("the gate's test step") |

The Phase 0 PR's CI run (Q-0022 (b)) repeats the gate on `ubuntu-latest`; it is the phase gate's check, not this ticket's.

## 5. Visual checklist
None (no screen).

## 6. Proposed wording

| Where | Text |
| --- | --- |
| stderr of `node scripts/db/local.mjs up` when the CLI output mentions Docker (developer output in gate logs, not product text; v1 Step 3, still right on the Mac per finding F1) | `Local Supabase needs Docker running (start Docker Desktop).` |

## 7. Security review
security-review: yes. Areas: migrations (first migration); data access (a `security definer` function executable by `anon`, reading `supabase_migrations`); dependencies (`package.json`, `pnpm-lock.yaml`: a CLI that downloads a platform binary package). Gate SECURITY_PATHS flags `db/`, `migrations`, `package.json`, `pnpm-lock.yaml` (gate.mjs line 14; finding F9).
Reviewers needed: code-reviewer yes · calc-auditor no · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation
high: the first migration and the first database tooling in every gate run, with a `security definer` function granted to `anon` (PROCESS.md section 4 "data model … many files"; split proposal). test-author Fable 5.1 (`claude-fable-5-1`), builder Fable 5.1; code-reviewer and security-reviewer Fable 5.1 (PROCESS.md section 4 rule for high tickets).

## 9. Dependencies
- **EZD-001** (row; done): root scripts, `eslint.config.mjs`, `.prettierignore`, EZD-001 T10.
- **EZD-000** (missing from the row; transitive, used directly; done): Dependencies row `supabase`, `## Migrations` (folder, naming, types path), checks C1 and C5, the architecture-doc heading list.
- **Precondition, not a ticket (missing from the row):** `.claude/hooks/guard-paths.mjs` denies the builder every path under `scripts/` except `scripts/conventions/`, so `scripts/db/local.mjs` and `gen-types.mjs` cannot be written until the orchestrator adds a builder exception for `scripts/db/` in the same form as Q-0124 (a), under Q-0125 (a), and records it (finding F3; handoff 2026-10-19 "To do before EZD-004a's builder starts"; lesson L-002). Checked 2026-10-19: not added yet. The test file is the test-author's (`__tests__/` matches `isTest`).
- **Docker Desktop running on the Mac** (Q-0003; finding F1: client and server 29.8.2, daemon running).
- Not dependencies: EZD-002 (ci.yml already runs the gate), EZD-003, EZD-004b, EZD-004c.
- Risks:
  - From this ticket on, every gate run fails at `db:up` when Docker is not running; the first `supabase start` pulls several images (locally once; on each CI phase PR, inside ci.yml's 30-minute limit). Each gate run adds a `db reset`.
  - CLI 2.121.0 specifics (status JSON key names, publishable vs anon key, `migration list` layout, Docker context use on macOS) are read from the pinned CLI by the test-author and builder, never from memory.
  - All worktrees share `project_id = "ezdraft"`; safe only because one gate runs at a time (Q-0114).
  - A database restored without `supabase_migrations` returns `schema_version: null` (EZD-025's planner should know).
  - No browser code and no download-size change (11 Performance budgets untouched).

## 10. Open questions
None. Settled from sources instead of asked: the install script (F2: none in 2.121.0, so Q-0140 (a) needs no exception); the `scripts/db/` write rule (F3, Q-0125 (a): orchestrator adds the exception); test concurrency (F4: Q-0114, EZD-001 T10); the local API port (read from `supabase/config.toml`, not assumed).
