# EZD-004b · App reads the health row

- **ACs:** AC-EZD-004b-1 (`vault/spec/acceptance-criteria.md` line 18, generated from Done-when)
- **Complexity:** medium (section 8)
- **User-visible result:** the app's address `/api/health` answers "ok" with the database's newest migration number, or a clear "database unavailable" error, so a deploy can be checked in one request.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

Split from EZD-004 (Q-0148). This plan is part "EZD-004b" of the split proposal in `vault/plans/EZD-004.md` (lines 22–30), with re-validation findings F1–F12 there (lines 42–55) applied. Technical detail comes from the v1 plan text (`git show de5030c:vault/plans/EZD-004.md`, "v1" below), Steps 5, 6 and 8, and tests T2, T3, T5, T7, T8. Interface names and test numbers are kept from v1 because later plans already cite them: `createPublicDbClient()` and "env read per call" (EZD-024 line 19, EZD-018 line 18), `app/src/server/db/env.ts` (EZD-007 line 122 adds `serverGateSecret()` to it), the Vitest global setup `app/test-harness/supabase-env.global-setup.ts` (EZD-006 lines 15, 185, 225 extend it; EZD-016a line 73 relies on it copying values into `process.env`), `.env.example` and "T7" (EZD-006 line 186, EZD-008 line 16, EZD-021 line 17), the `### Environment variables` table and "T8" (EZD-008 line 16), the health route body and `error.db_unavailable` (EZD-026a lines 18, 84, 237; EZD-015 line 429), `/api/health` as the web-server ready URL (EZD-016a lines 139, 188). The one new test is T19.

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 13):
- **Scope:** Server-only Supabase env and client in the app; GET /api/health reads public.health() and returns status and schema version or the db\_unavailable error body; .env.example with the Supabase variable names; Environment variables in docs/architecture.md. Split from EZD-004 (Q-0148); plan Part EZD-004b.
- **Done when:** Against the local Supabase, GET /api/health returns 200 with status ok and the newest migration's timestamp, and returns 500 with the db\_unavailable error body when the database cannot be reached or its address is missing.
- **Depends on:** EZD-004a
- **Spec ref:** Stack · Database, auth, files

### Steps

1. **App dependencies.** `pnpm --filter @ezdraft/app add @supabase/supabase-js@2.118.0 zod@4.6.7` (v1 Step 6; 02 Stack "Database, auth, files: Supabase"; 02 Named tools "Schema and validation: Zod"). Both Dependencies rows already list `app` in `Used in` (docs/architecture.md Dependencies; finding F5), so `docs/architecture.md` Dependencies is not edited; check C1 passes on the exact versions. If `pnpm install` reports a dependency build script, the builder denies it in `pnpm-workspace.yaml` `allowBuilds` (map form, `false`) and, if the build or tests then fail, stops with a question naming the package (Q-0140 (a); docs/architecture.md "Adding a dependency"). Nothing in this ticket needs one.
2. **`app/src/server/db/env.ts`** (v1 Step 5). Exports `readPublicDbEnv(): { url: string; publishableKey: string }`. It reads `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **inside the function, on every call, never at module load**, and validates them with Zod: `url` is an `http` or `https` URL, `publishableKey` a non-empty string after trim. Missing, empty or invalid → throws (the class or message is not part of the contract). Reason for per-call reads: the gate's `build` step runs with no Supabase env (finding F9), and `.env.example` ships empty values (Step 5). It does not read `SUPABASE_SECRET_KEY`: the secret key is for job handlers, migrations, seeds and admin scripts only (docs/architecture.md "Server-only data access and can()"), and nothing in this ticket needs it (v1 Step 5 table, "nothing in this ticket reads it").
3. **`app/src/server/db/client.ts`** (v1 Step 6). Exports `createPublicDbClient(): SupabaseClient<Database>`, built per call from `readPublicDbEnv()` with `createClient<Database>(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } })`; `Database` is imported as a type from `./database.types` (EZD-004a, generated). Server-only by location (`src/server/`, docs/architecture.md Folder layout); EZD-133 adds the lint rule that keeps it out of browser code. No module-level client instance (a module-level client would read env at load time).
4. **`app/src/server/db/health.ts`** (v1 Step 6). Exports `readHealth(): Promise<{ status: 'ok'; schema_version: string | null }>`: calls `createPublicDbClient().rpc('health')` (the function EZD-004a creates, vault/plans/EZD-004a.md section 3) and returns its single row as exactly `{ status, schema_version }`. Throws when the env is invalid, when the RPC returns an error (network failure, missing function), when the result is not exactly one row, or when that row's `status` is not `'ok'`.
5. **`app/src/app/api/health/route.ts`** (v1 Step 6; docs/architecture.md "Errors and logging").
   - `export const dynamic = 'force-dynamic'` (the app sets no `cacheComponents`, `app/next.config.ts`, so the segment option is allowed; builder confirms against Next.js 16.4.2).
   - `export async function GET(): Promise<Response>`.
   - Success: status `200`, body exactly `{ "status": "ok", "schema_version": "<value from readHealth>" }` (an explicit field list, docs/architecture.md "Server-only data access": "return an explicit field list").
   - Any failure, including a throw from `readPublicDbEnv`, `createPublicDbClient` or `readHealth`: status `500`, body exactly `{ "error": { "code": "db_unavailable", "message_key": "error.db_unavailable" } }`. The handler catches every error and never throws (docs/architecture.md "Errors and logging": body shape, "500 unexpected", "no raw server text reaches the UI"). Code and key from v1 Step 6; EZD-026a adds the key's text (Q-0086 (a)).
   - Both responses carry header `Cache-Control: no-store` (v1 Step 6: Vercel never serves a cached health result).
   - Public, no session and no `can()`: it reads no tenant data and uses only the publishable key (v1 Step 6; 03 rule 1 concerns table reads, and `public.health()` reads none of the app's tables). It writes no log line: `logger.ts` does not exist yet (EZD-024) and check C8 forbids `console.*` (docs/architecture.md Machine checks C8).
6. **`.env.example`** (new, repo root; v1 Step 5; Q-0025 (a) makes it readable, guard-paths.mjs lets the builder write it). Exactly three non-comment lines, each with an empty value: `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`, `SUPABASE_SECRET_KEY=`. One leading comment line is allowed (`# Names only. Values never go in the repo; see docs/architecture.md, Environment variables.`). `SUPABASE_SECRET_KEY` is listed now, although no code here reads it, because v1 Step 5 names it, EZD-004a's `local.mjs env` prints it (vault/plans/EZD-004a.md Step 4), and EZD-023b's env check takes its required names from this file (vault/plans/EZD-023b.md Step 8, cited by EZD-024 line 25).
7. **`docs/architecture.md`** (v1 Step 8, narrowed; finding F6). A new `### Environment variables` subsection under `## Runtime`, directly after `### Hosting` (EZD-003 T6 keeps `### Hosting` first, `scripts/hosting/__tests__/hosting.test.mjs` lines 115–120), with:
   - The line: values never go in the repo; names go in `.env.example`; the app reads them per call, so `next build` needs none.
   - A table with columns `Name | Reaches the browser | Local value | Dev / prod value | Used by` and one row per `.env.example` name, first cell the name in backticks, content from v1 Step 5: `NEXT_PUBLIC_SUPABASE_URL` (yes, for Realtime and signed uploads later, 03 rule 1; local `pnpm db:env`; that project's API URL; `app/src/server/db/env.ts` now, EZD-018, EZD-132 later); `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (yes, RLS applies; `pnpm db:env`; that project's publishable key; same); `SUPABASE_SECRET_KEY` (**never**; `pnpm db:env`; that project's secret key; job handlers, migrations, seeds and admin scripts only, nothing reads it yet).
   - Which project's values go where: local = the local stack; preview = the dev project; production = the production project once Josh sets it up from the Before-launch checklist (11 Operations "Preview deploys use the dev database"; Q-0113). Entering values in Vercel is EZD-023b's (Q-0106); not done here.
   - No `SUPABASE_DEV_DB_URL` row: EZD-004c adds it (vault/plans/EZD-004.md Part EZD-004c Scope).
   - No other section changes. `### CI` stays the last subsection of `## Machine checks` (finding F6); no Machine checks row is added (the split proposal names none for this part).

### Files

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `app/package.json` | Change (two dependencies) | builder | Step 1 |
| `pnpm-lock.yaml` | Change (regenerated) | builder | Step 1; the gate installs with `--frozen-lockfile` (finding F9) |
| `app/src/server/db/env.ts` | New | builder | Step 2 |
| `app/src/server/db/client.ts` | New | builder | Step 3 |
| `app/src/server/db/health.ts` | New | builder | Step 4 |
| `app/src/app/api/health/route.ts` | New | builder | Step 5 |
| `.env.example` | New | builder | Step 6 |
| `docs/architecture.md` | Change (one subsection) | builder | Step 7 |
| `app/vitest.config.ts` | Change | test-author | `globalSetup: ['test-harness/supabase-env.global-setup.ts']`, `testTimeout: 15000` (v1 Files) |
| `app/test-harness/supabase-env.global-setup.ts` | New | test-author | Section 3 |
| `app/src/app/api/health/route.test.ts` | New | test-author | T2, T3 |
| `app/src/server/db/local-services.test.ts` | New | test-author | T5 |
| `scripts/db/__tests__/env.test.mjs` | New | test-author | T7, T8, T19 (node:test, found by the root `"scripts/**/*.test.mjs"` glob) |
| `docs/architecture.md` Dependencies, `pnpm-workspace.yaml`, `supabase/**`, `scripts/db/*.mjs`, `scripts/gate.mjs`, `.github/workflows/ci.yml` | Not touched | — | F5 (rows exist); EZD-004a owns `supabase/` and `scripts/db/`; gate and ci.yml are Josh's |

Write rules checked against `.claude/hooks/guard-paths.mjs` (lesson L-002): every builder path above is outside `scripts/`, `.claude/`, `vault/` and test patterns; `.env.example` is excluded from the `.env` deny (lines 20–22). Every test-author path matches `isTest` (`*.test.ts`, `test-harness/`, `__tests__/`, `vitest.config.ts`).

### Data
No tables, columns, migrations, RLS policies or model `schema_version` changes. Reads `public.health()` only (EZD-004a). "schema_version" in the response is the database migration version, not 03 rule 5's model schema version (vault/plans/EZD-004a.md Step 3). No money fields.

## 2. Sources

- Ticket: `vault/tickets/phases/phase-00.md` line 13; `vault/tickets/tickets.json` EZD-004b (`depends_on` `["EZD-004a"]`, `mockups` `[]`, `acs` `["AC-EZD-004b-1"]`, `spec_files` 02); `vault/tickets/PHASES.md` Phase 0 (lines 7–23: "the health row" in Out of scope; test script step 5); `vault/tickets/README.md` (split-dependency rule; rules 1, 4).
- Split and re-validation: `vault/plans/EZD-004.md` (Part EZD-004b lines 22–30; findings F5, F6, F9); v1 text at `de5030c` (Steps 5, 6, 8; T2, T3, T5, T7, T8, T15). Q-0148.
- Dependency contract: `vault/plans/EZD-004a.md` section 3 (`public.health()` returns `(status text, schema_version text)`; `node scripts/db/local.mjs env` prints exactly the three names; `POST <url>/rest/v1/rpc/health` with the publishable key; root `test` runs `db:up` first; `app/src/server/db/database.types.ts` generated).
- Spec: `02-product-overview.md` (Stack: "Database, auth, files: Supabase: Postgres with row-level security, Auth, Storage, Realtime"; Named tools: Schema and validation (Zod), Database migrations); `03-data-model.md` (Architecture rules 1 "server-only data access", 12 "every request carries the app version": not touched, no browser caller here); `04-app-shell-and-global-ui.md` (no shell work); `11-non-functional-requirements.md` (Performance: no browser code, no download-size change; rule 10 indexes: no tables; Operations: "local (agents and tests), dev (cloud, preview deploys) and production. Preview deploys use the dev database"; Security and audit). Non-goals: none touched. Glossary: no entry for these terms.
- Decisions: R26 R1, R12, R17 (`vault/spec/decisions/13b-round-26.md`: server routes; environments; every interface string through one message helper, hence `message_key` only); Q-0025 (a) (`.env.example` readable), Q-0086 (a) (`error.db_unavailable` English text, EZD-026a), Q-0106 (production values through EZD-023b's release workflow), Q-0113 (one Supabase project until the Before-launch checklist), Q-0114 (workers 4), Q-0140 (a) (build scripts denied), Q-0148 (`vault/questions/QUESTIONS.md`; `decisions/02-product-overview.md`, `11-non-functional-requirements.md`, `process.md`).
- Conventions: `docs/architecture.md` (Runtime/Hosting; Dependencies; Folder layout; Server-only data access and can(); Errors and logging; Tests and Test scope; Machine checks C1, C7, C8, C9).
- Code read 2026-10-19: `app/package.json`, `app/vitest.config.ts`, `app/next.config.ts`, `app/tsconfig.json`, root `package.json`, `.gitignore` (`.env.*` ignored, `!.env.example`), `.claude/hooks/guard-paths.mjs`, `.claude/settings.json` (supabase allows), `scripts/gate.mjs` line 14 (SECURITY_PATHS), `scripts/hosting/__tests__/hosting.test.mjs` lines 115–129, `scripts/ci/__tests__/ci.test.mjs` lines 445–451.
- Later plans whose citations this contract keeps: EZD-006, EZD-007, EZD-008, EZD-015, EZD-016a, EZD-018, EZD-021, EZD-023b, EZD-024, EZD-026a (lines listed in the intro).
- No research report covers this ticket. Mockup: none (no screen).

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| export | `readPublicDbEnv` in `app/src/server/db/env.ts` | `() => { url: string; publishableKey: string }`; reads `process.env` on every call; throws when either name is missing, empty or invalid. EZD-007 adds `serverGateSecret()` to this file |
| export | `createPublicDbClient` in `app/src/server/db/client.ts` | `() => SupabaseClient<Database>`; publishable key; `auth.persistSession` and `auth.autoRefreshToken` false; new client per call; throws what `readPublicDbEnv` throws |
| export | `readHealth` in `app/src/server/db/health.ts` | `() => Promise<{ status: 'ok'; schema_version: string \| null }>`; one `rpc('health')` call; throws on error, row count ≠ 1, or status ≠ `'ok'` |
| route | `GET /api/health` (`app/src/app/api/health/route.ts`) | Exports `dynamic = 'force-dynamic'` and `async function GET(): Promise<Response>`. 200 body `{ status: 'ok', schema_version }`; 500 body `{ error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } }`; both with `Cache-Control: no-store`; never throws |
| env names | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Same names and order as EZD-004a's `local.mjs env` keys |
| file | `.env.example` (repo root) | Non-comment, non-blank lines exactly `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=`, `SUPABASE_SECRET_KEY=` (in that order). Later tickets that add names update T7's list |
| docs | `docs/architecture.md` `### Environment variables` | Under `## Runtime`, after `### Hosting`, before the next `##`; table whose first column holds each `.env.example` name in backticks |
| test config | `app/vitest.config.ts` | Adds `globalSetup: ['test-harness/supabase-env.global-setup.ts']` and `testTimeout: 15000`; keeps `environment: 'node'`, `include`, `testNamePattern`, `maxWorkers: 4` unchanged |
| test harness | `app/test-harness/supabase-env.global-setup.ts` | Default export `async function setup()`. Runs `node <repo>/scripts/db/local.mjs env` (path resolved from the file's own location, not the cwd), parses the JSON and **overwrites** `process.env` for the three names, so a value inherited from the shell can never point tests at a cloud project (CLAUDE.md rule 6; README rule 4). On a non-zero exit it throws an Error whose message contains `pnpm db:up`. Workers must see the values: the test-author confirms against Vitest 5.0.5 that `process.env` set in a global setup reaches the test workers (EZD-016a line 73 relies on it); if it does not, that is a structural question, not a change of contract. EZD-006 extends this file |
| test titles | Vitest top-level `describe('EZD-004b …')`; node:test titles `EZD-004b T<n> …` | docs/architecture.md Test scope, check C9; tests that close the AC end with `done when` |

## 4. Tests

Written by test-author before any code. The root `test` script runs `db:up` (reset) first (EZD-004a), so the Vitest tests run against a freshly reset local stack with the env from the global setup. "Newest migration" = the largest 14-digit prefix among `supabase/migrations/*.sql`, computed by the test from the folder (resolved from the test file's location), so later migrations do not break it (v1 Tests). Env changes inside tests use `vi.stubEnv` and are undone with `vi.unstubAllEnvs()` in `afterEach`. Tests match status codes, headers, JSON values and names, never message wording. None is marked smoke.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T2 Health route reads the local database, done when | AC-EZD-004b-1 | unit (Vitest, local DB), `route.test.ts` | `await GET()` imported from `route.ts`, env from the global setup | Status `200`; header `cache-control` contains `no-store`; `await res.json()` deep-equals `{ status: 'ok', schema_version: <newest migration> }` | Ticket Done when; Step 5; EZD-004a section 3 (`public.health()` row) |
| T3 Health failure, done when | AC-EZD-004b-1 | unit (Vitest), `route.test.ts` | (a) `NEXT_PUBLIC_SUPABASE_URL` = `http://127.0.0.1:9` (nothing listens); (b) `NEXT_PUBLIC_SUPABASE_URL` removed, then `vi.resetModules()` and a fresh dynamic `import()` of `route.ts`, then `GET()`; (c) `NEXT_PUBLIC_SUPABASE_URL` = `''` (the `.env.example` value); (d) `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` removed | Each case: `GET()` resolves (no rejection); status `500`; body deep-equals `{ error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } }`; header `cache-control` contains `no-store`. (b) also: the `import()` itself resolves (no env read at module load) | Ticket Done when ("cannot be reached or its address is missing"); docs/architecture.md Errors and logging (body shape, 500); Steps 2, 5, 6 (code, key, per-call read, empty values) |
| T5 Local services up | — (Spec ref check; split proposal Part EZD-004b Tests) | unit (Vitest, local DB), `local-services.test.ts` | URL and keys from `process.env` (global setup) | (a) `fetch('<url>/auth/v1/health', { headers: { apikey: <publishable key> } })` status `200`; (b) `createClient(url, <secret key>).storage.listBuckets()` returns `error === null` and `Array.isArray(data)`; (c) a Realtime channel `ezd-004-probe` on a publishable-key client reaches status `SUBSCRIBED` within 10,000 ms, and the channel is removed afterwards; (d) `supabase status -o json` (repo root `node_modules/.bin/supabase`) has a non-empty mail catcher URL (the key name is read from the pinned CLI's output) | 02 Stack "Postgres with row-level security, Auth, Storage, Realtime"; EZD-007 row (mail catcher); v1 T5; 10,000 ms is v1's planner's choice |
| T7 `.env.example` names | AC-EZD-004b-1 | unit (node:test), `env.test.mjs` | Repo-root `.env.example` read with `fs` | Its non-comment (`#`), non-blank lines, trimmed, equal exactly `['NEXT_PUBLIC_SUPABASE_URL=', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=', 'SUPABASE_SECRET_KEY=']`. Any other form (`export NAME=`, `NAME = `, a value, a duplicate) fails because the comparison is exact (lesson L-005) | Step 6; v1 T7; CLAUDE.md rule 8 (no values) |
| T8 Env names documented | AC-EZD-004b-1 | unit (node:test), `env.test.mjs` | `docs/architecture.md`; `.env.example`; `node scripts/conventions/check.mjs <repo>` | A `### Environment variables` line sits after `## Runtime`, after `### Hosting`, and before the next `## ` line; for every non-comment name in `.env.example` its section has a table row whose first cell is that name in backticks; check.mjs exits 0 | Step 7; finding F6; v1 T8 (the `SUPABASE_DEV_DB_URL` part moves to EZD-004c); docs/architecture.md C1 |
| T19 Secret key stays out of the request path | AC-EZD-004b-1 | unit (node:test), `env.test.mjs` | Text of every file under `app/src/` (recursive), and of `app/src/server/db/env.ts`, `client.ts`, `health.ts`, `app/src/app/api/health/route.ts` | No file under `app/src/` outside `app/src/server/` contains `SUPABASE_SECRET_KEY`; none of the four named files contains `SUPABASE_SECRET_KEY` or `service_role` | docs/architecture.md "Server-only data access and can()" (service-role key only in job handlers, migrations, seeds, admin scripts; never request-path routes or browser bundles); Step 2 |
| Gate (orchestrator) | AC-EZD-004b-1 | gate | Docker running; `node scripts/gate.mjs .claude/worktrees/EZD-004b` | Exit 0; `typecheck pass`, `lint pass`, `test pass`, `build pass`; `build` runs with no Supabase env set (gate.mjs, finding F9) | CLAUDE.md rule 12; Step 2 (per-call env read) |

The Phase 0 PR's CI run repeats the gate on `ubuntu-latest` (Q-0022 (b); v1 T16); it is the phase gate's check, not this ticket's.

## 5. Visual checklist
None (no screen).

## 6. Proposed wording
None user-visible. The route returns only `message_key` `error.db_unavailable`; its text ("Can't reach the database. Try again in a minute.") is EZD-026a's catalog entry under Q-0086 (a) (vault/plans/EZD-026a.md line 237). Developer-only text, not product wording, for the record: the global setup's error when the local stack is down contains `pnpm db:up` (for example `Local Supabase is not running: run pnpm db:up (Docker must be running).`), and the `.env.example` comment in Step 6.

## 7. Security review
security-review: yes. Areas: API (a public, unauthenticated route that calls the database on every request); data access (reads `public.health()`, a `security definer` function granted to `anon`, through the publishable key); key handling (env names, the secret key kept out of request-path code, T19); dependencies (`app/package.json`, `pnpm-lock.yaml`). Gate SECURITY_PATHS flag `api/`, `db/`, `package.json`, `pnpm-lock.yaml` (gate.mjs line 14).
Reviewers needed: code-reviewer yes · calc-auditor no · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation
medium: four small server files and one route that follow patterns already written in docs/architecture.md (server-only access, error body), with no tables, money or permissions (PROCESS.md section 4 "medium (default)"; split proposal Part EZD-004b). test-author Sonnet 5.5, builder Sonnet 5.5; code-reviewer and security-reviewer Opus 5.5.

## 9. Dependencies
- **EZD-004a** (row; `planned`, not built): `public.health()`, `scripts/db/local.mjs env`, the root `test` running `db:up` first, `app/src/server/db/database.types.ts`. If EZD-004a's STATUS note records a deviation from its plan, this plan is re-validated before its test-author starts (PROCESS.md Stage 3 step 1).
- **EZD-001** (transitive, used directly; done): `app/vitest.config.ts`, app `tsconfig.json`, ESLint config, C9 describe rule.
- **EZD-000** (transitive, used directly; done): Dependencies rows `@supabase/supabase-js` 2.118.0 and `zod` 4.6.7, `## Runtime`, Errors and logging, Server-only data access, checks C1, C7, C8.
- **EZD-003** (missing from the row; done): its `### Hosting` subsection and T6 fix where `### Environment variables` goes (finding F6).
- **Docker Desktop running on the Mac** (Q-0003; finding F1) for T2, T5 and the global setup.
- Not dependencies: EZD-026a (adds the key text; ordering only, vault/plans/EZD-026a.md line 18), EZD-004c (adds `SUPABASE_DEV_DB_URL` to the table this ticket creates), EZD-016a (no screen).
- Risks:
  - From this ticket on, every app Vitest run needs the local stack (the global setup throws without it); the root `test` already starts it first (EZD-004a), so gate runs are unaffected, but a bare `pnpm --filter @ezdraft/app test` needs `pnpm db:up` first.
  - Next.js inlines `NEXT_PUBLIC_*` values present at build time into compiled code; the gate builds with none, but a Vercel build with values freezes them into that build. Harmless while each Vercel environment has one project's values; EZD-023b's planner should know (Q-0106).
  - The route is unauthenticated and queries the database on each call with no rate limit and no client-side timeout; no source asks for either. The security-reviewer judges whether that needs a question.
  - `@supabase/supabase-js` stays under `app/src/server/`, so no browser download-size change (11 Budgets); EZD-018 brings it to the browser later.
  - Exact Vitest 5.0.5 behaviors (`vi.stubEnv` with `undefined`, global-setup env reaching workers) and Next.js 16.4.2 route-segment options are read from the pinned packages by the test-author and builder, not from memory.

## 10. Open questions
None. Settled from sources instead of asked: which keys the route uses (publishable only; docs/architecture.md Server-only data access); the error code and key (v1 Step 6, cited by EZD-026a and EZD-015); whether the global setup prefers inherited values (no: tests use only local stubs and services, CLAUDE.md rule 6, README rule 4); where the env table goes (finding F6); whether Dependencies rows change (no, finding F5).
