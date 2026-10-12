# EZD-023b · Environments, promote and rollback

Phase: 0 · Planned by: planner · Date: 2026-10-11 · Status: planned

## Ticket (copied from the phase file)
Scope: Local, dev and production environments; preview deploys use the dev database; production is updated only by a promote script run by Josh on a tagged build, which first takes a database dump; rollback steps in the runbook. Split from EZD-023 (Q-0042); plan Part B.
Done when: The promote script refuses an untagged build.
Depends on: EZD-023a, EZD-004, EZD-008. Also, not in the ticket row:
- **EZD-023a** (row). This ticket reads its `scripts/release/tags.mjs` (tag format `phase-N[.k]`, `listReleaseTags`, `previousReleaseTag`) and `check-migrations.mjs --base <tag> --head <ref>`. Its tests reuse `scripts/release/__tests__/git-fixture.mjs` (vault/plans/EZD-023a.md).
- **EZD-004** (row). This ticket uses:
  - the `supabase` CLI devDependency;
  - `supabase/migrations/`;
  - the `/api/health` route, which returns `schema_version` (the newest applied migration);
  - the `### Environment variables` table and `.env.example`;
  - `docs/runbook.md`;
  - the plan's line "Prod receives migrations only through EZD-023's promote script" (vault/plans/EZD-004.md Steps 2, 5, 6, 7).
- **EZD-008** (row). Its email names in `.env.example` and its hand-off "Preview values are left to EZD-023" (vault/plans/EZD-008.md Step 6 part B item 4, Risks). EZD-008 builds both transports, selectable per environment (its Step 4); this ticket sets and checks the Preview value per Q-0041 (Step 8).
- **EZD-003 (deliberately not a formal dependency, Q-0042).** This ticket needs only its merged files:
  - the Vercel project with production branch `main`;
  - `app/vercel.json`;
  - `HOST`, `observe` and `evaluate` from `scripts/hosting/check-live.mjs`;
  - `### Hosting`;
  - its `docs/runbook.md` section (vault/plans/EZD-003.md Steps 1, 2, 4, 5).

  The orchestrator starts this ticket only after EZD-003's commit is on `develop`, even if EZD-003 itself stays blocked on its live check (Q-0032).
- **EZD-000 and EZD-001** (transitive, used directly): the "no new `##` heading" rule (EZD-000 T5), C1, and root node tests running in full on every ticket (EZD-001 Step 6.1; Q-0006).
- **EZD-005: not a dependency (missing from the row on purpose).** Under Q-0033 (a), EZD-005 owns `supabase/bootstrap/tenant-1.sql` and its runbook section `## Tenant 1 setup (EZD-005)` (vault/plans/EZD-005.md Step 7). This ticket's runbook only orders that step after the first promote (Step 10). EZD-005 builds at position 6, before this ticket (12) (`tickets.json` `build_position`), so the file exists when this runbook names it; no code is shared.
- **Answered questions this plan applies:**
  - **Q-0023 (a)** (answered-agent): cloud dev migrations run only through EZD-004's `supabase-dev.yml` when Josh clicks Run workflow. This ticket adds no `release:migrate-dev` (Step 9).
  - **Q-0024 (a)** (Josh 2026-10-12): EZ Draft's own `ezdraft-dev` and `ezdraft-prod` projects inside EZ Binder's existing Supabase organization, which is on Pro. The prod project must exist before the first promote.
  - **Q-0031 (a)** (Josh 2026-10-12): the `ezdraft` Vercel project sits inside EZ Binder's existing Vercel team, which is on Pro. The Vercel features this ticket relies on are Pro features (Risks); the release token is a token for that shared team (Reviewers).
  - **Q-0032 (a)** (Josh 2026-10-12): EZD-003's live HTTPS check runs right after the Phase 0 merge, as part of the field check. With promote-only production, "right after" means right after the first `release:promote phase-0` (Risks).
  - **Q-0033 (a)** (Josh 2026-10-12): a one-time SQL setup file Josh pastes into each cloud project's SQL editor, typing his own email there; a runbook step. EZD-005 builds it; it runs on prod after the first promote (Step 10).
  - **Q-0041** (Josh 2026-10-12): both email transports, chosen per environment; Preview defaults to `stub` now; a setting can switch a preview to live sending later (Step 8). EZD-021 adds the same shape for `AI_MODE` (Q-0077; vault/plans/EZD-021.md Step 6).
- **Facts that decide who runs what (Level 1, not questions):**
  - Production changes only at a phase gate or on Josh's approval (11 Operations "Releases"; Q-0007).
  - Remote database changes and production deploys are Josh's: `.claude/hooks/guard-bash.mjs` ("Remote database changes are Josh's"; "Production deploys are Josh's"), and `.claude/settings.json` denies `supabase db push`, `supabase link`, `vercel --prod` and `vercel promote`.
  - So Josh runs `release:tag` and `release:promote`, and agents never act on external accounts.
  - CI runs only on the phase PR to `main` and by manual dispatch (commit aad5540). Only Josh edits `ci.yml` and `scripts/gate.mjs`.
- **Scope boundaries (not dependencies):** Sentry is EZD-024. The System status page is EZD-135. Off-site dumps and the restore drill are EZD-025 (R26 R13). Old app versions are EZD-134 (03 rule 12).
Spec ref: Non-functional · Operations; R26 R12

## Sources read
- Spec:
  - `vault/spec/sections/11-non-functional-requirements.md`:
    - Operations: "Environments: local (agents and tests), dev (cloud, preview deploys) and production. Preview deploys use the dev database."; "production is updated only by promoting a tagged build at a phase gate or on Josh's approval. A script takes a database dump before each promotion."; add before remove; "Rollback is Vercel's previous deployment".
    - Data retention: Supabase Pro daily backups; EZD-025.
    - Security and audit; Performance.
    - Running cost: a second Supabase project for development.
  - `02-product-overview.md`: Stack (Hosting; Database, auth, files); Named tools.
  - `03-data-model.md`: Architecture rules 1, 12.
  - `04-app-shell-and-global-ui.md`: read; no screen here.
- Decisions: R24 #1; R26 R12, R13; R33. Build answers (Josh): Q-0003, Q-0006, Q-0019, Q-0025; 2026-10-12: Q-0024 (a), Q-0031 (a), Q-0032 (a), Q-0033 (a), Q-0041, Q-0077. QUESTIONS.md: Q-0007, Q-0023 (answered-agent (a)), Q-0042.
- Process and kit:
  - `vault/PROCESS.md`, `vault/KNOWN-LIMITS.md`, `vault/tickets/README.md` (rules 4, 8; Needs from Josh), `vault/tickets/needs-from-josh.md`, `CLAUDE.md` (rules 4, 10, 11, 12).
  - `SETUP.md` (Notes: "production branch `main`. Production deploys therefore happen only when you merge a phase PR").
  - `scripts/gate.mjs` (sets `CI=1`), `.github/workflows/ci.yml`, `.claude/settings.json`, `.claude/hooks/guard-bash.mjs`, `.claude/hooks/guard-paths.mjs`, `.claude/skills/phase-gate/SKILL.md`.
  - `.gitignore` (`.env.*` is ignored; `.env.example` is kept).
- Earlier plans: `vault/plans/EZD-000.md`, `EZD-001.md`, `EZD-002.md`, `EZD-003.md`, `EZD-004.md`, `EZD-005.md`, `EZD-008.md`, `EZD-010.md` (`VERCEL_ENV === 'production'` rule), `EZD-023a.md`. This plan extends their files and replaces nothing.
- Mockup: none (no screen; `tickets.json` `mockups: []`).

Technical choices that no source makes are marked *planner's choice (CLAUDE.md rule 4)*. The code-reviewer confirms them at plan review.

Facts about Vercel, the Supabase CLI and Claude Code come from the planner's knowledge as of Oct 2026, not from vault sources. They are marked *(builder confirms)*: the builder checks each against the pinned tool or the provider's docs on the build date.

## Approach

### Step 1: The three environments
`docs/architecture.md` → `## Runtime` gets a new `### Environments and releases (EZD-023b)`. It holds this table, plus the rules from Steps 2–7:

| Environment | Database | App | Env values | Changed by |
| --- | --- | --- | --- | --- |
| local | Local Supabase in Docker (`pnpm db:up`; each gate run wipes it, EZD-004) | `next dev` and tests | `pnpm db:env`; email stub (EZD-008) | Agents and tests |
| dev | Supabase project `ezdraft-dev` in EZ Binder's Supabase organization (EZD-004 runbook; Q-0024 (a)) | Vercel **Preview** deployments from `develop` pushes and the phase PR (Q-0007; EZD-003) | Vercel Preview values = the dev project's values; `EMAIL_TRANSPORT=stub` and `AI_MODE=stub` by default, `resend` / `live` only when Josh sets them (Q-0041; Q-0077) | Migrations through EZD-004's `supabase-dev.yml`, run when Josh clicks Run workflow (Q-0023 (a)) |
| production | Supabase project `ezdraft-prod` in the same organization (Q-0024 (a)) | Vercel **Production** at `ezdraft.ezcontractorbinder.com` (R24 #1) | Vercel Production values = the prod project's values | Josh only, with `pnpm release:promote <tag>` |

### Step 2: Promote-only production (Josh's Vercel setting; *builder confirms the name*)
- EZD-003 keeps Production Branch = `main`. Each phase merge therefore builds a production-target deployment.
- Josh turns off **"Auto-assign Custom Production Domains"** (Vercel → Project → Settings → Environments → Production).
- After that, merges build without moving the domain. Only a promote moves it. This meets 11 Operations: "production is updated only by promoting a tagged build".
- This replaces SETUP.md's note "Production deploys therefore happen only when you merge a phase PR". SETUP.md is Josh's file, so the orchestrator tells Josh rather than editing it.

### Step 3: Guards (`scripts/release/guards.mjs`)
Agents must never run these scripts (guard-bash: production and the remote database are Josh's). The scripts start `git push`, `supabase db push` and Vercel calls themselves, so the Bash hooks never see those commands.

Every release script (`tag`, `promote`, `check-env`) refuses on its own. The guards run after the script's read-only git checks and before it reads any secret, in this order:
1. **`agent_refused`** when `CLAUDECODE` is set. Claude Code sets it for commands its agents run *(builder confirms with `node -e "console.log(process.env.CLAUDECODE)"` in an agent shell)*.
2. **`ci_refused`** when `CI` or `GITHUB_ACTIONS` is set. `scripts/gate.mjs` sets `CI=1` for every step.
3. **`tty_required`** when stdin or stdout is not a terminal (TTY), except with `--dry-run`. Agent shells have no TTY.

The CLI has no `--yes` flag. A real run always asks Josh to type the tag name.

**Extra lock (Josh-only runbook step; these files are his):**
- Add these to `deny` in `.claude/settings.json`:
  - `Bash(pnpm release:*)`
  - `Bash(node scripts/release/promote*)`
  - `Bash(node scripts/release/tag*)`
  - `Bash(node scripts/release/env-check*)`
- Add a matching pattern to the `always` list in `.claude/hooks/guard-bash.mjs`.

### Step 4: Release secrets (Josh's PC only; `scripts/release/release-env.mjs`)
- **File:** `.env.release.local` at the repo root.
  - It is git-ignored by `.env.*`.
  - Agents cannot read it (`.claude/settings.json` denies `Read(./.env.*.local)`), and guard-paths blocks writes to it.
- **Parsing:** with Node's `util.parseEnv` *(builder confirms on Node 22)*; no dependency is added. Values go only to child processes and requests. They are never put into `process.env`.
- **Names:**
  - `SUPABASE_PROD_DB_URL`: the prod project's **Session pooler** connection string, which works on IPv4 home networks *(builder confirms)*.
  - `VERCEL_TOKEN`.
  - `VERCEL_PROJECT_ID`.
  - `VERCEL_TEAM_ID` (optional).
  - `RELEASE_DUMP_DIR` (optional; default `<home>/ezdraft-release-dumps`).
  - No dev database URL: dev migrations go through EZD-004's workflow (Q-0023 (a)).
- **Where the names are listed:**
  - In `docs/architecture.md` (`### Environment variables`, marked "Josh's PC only, `.env.release.local`").
  - In the runbook.
  - In `.env.example` as **comment lines** (`# SUPABASE_PROD_DB_URL=` …) under the header `# Release (Josh's PC only, file .env.release.local)`. EZD-004 T7 counts only non-comment lines, so it stays true (CLAUDE.md rule 12; Q-0025 (a)).
- **Redaction:** `redactUrl()` replaces a password with `***`. Secrets are never printed.

### Step 5: `pnpm release:tag <name>` (`scripts/release/tag.mjs`)
In order:
1. Check the name against `RELEASE_TAG_RE` from EZD-023a (`bad_name`).
2. `git fetch origin main --tags`.
3. The tag must not exist (`tag_exists`) and must be higher than every release tag (`not_newer`).
4. Run the EZD-023a check with `--base <previous tag> --head origin/main` (`migration_check_failed`).
5. Guards (Step 3).
6. Josh types the name (`confirm_mismatch`).
7. `git tag -a <name> -m "Release <name>" origin/main`, then `git push origin refs/tags/<name>`.

### Step 6: `pnpm release:promote <tag> [--dry-run]` (`scripts/release/promote.mjs`)
- **CLI plus `runPromote(opts, deps)`**, so tests can swap in fakes. `deps` injects:
  - `git`: real in tests, run against fixture repos.
  - `vercel`: `createVercelApi({ token, projectId, teamId, fetch })` in `scripts/release/vercel-api.mjs`.
  - `supabase`: starts the pinned `supabase` CLI.
  - `loadReleaseEnv`, `processEnv`, `isTTY`, `confirm`, `fetch`, `sleep`, `now`, `checkLive` (EZD-003's `observe` + `evaluate`) and `log`.
- **Result:** `{ ok, code, dumpDir?, deploymentId? }`. The CLI exits 0 only if `ok`.

**Steps, in order.** Steps 1–5 are read-only git work. Secrets are read only at step 6. Nothing outside the PC changes before step 11.
1. **`usage`**: no argument was given.
2. **`untagged`** (this is the Done when): the argument is not a release tag name (a SHA, `main`, `develop`, a non-release tag), or the tag does not exist after `git fetch origin main --tags`.
3. **`not_on_main`**: the tag's commit is not reachable from `origin/main` (`git merge-base --is-ancestor`).
4. **`not_latest`**: a higher release tag exists. Going back to an older release is a rollback (Step 7), not a promote.
5. **`migration_check_failed`**: the EZD-023a check fails with `--base <previous tag below this one> --head <tag>`.
6. **Guards, then secrets.** Run the guards (Step 3), then `loadReleaseEnv()`.
   - **`env_missing`**: lists whichever of `SUPABASE_PROD_DB_URL`, `VERCEL_TOKEN` and `VERCEL_PROJECT_ID` is missing.
   - **`dump_dir_in_repo`**: `RELEASE_DUMP_DIR` is inside the repo. The repo is public and dumps hold client data.
7. **`no_build`**: no production-target Vercel deployment for the tag's commit SHA has state `READY`. Call: `GET /v6/deployments?projectId=…&target=production`, matched on `meta.githubCommitSha` *(builder confirms the endpoint and fields)*.
8. **`env_mismatch`**: `evaluateVercelEnv` (Step 8) fails on the result of `GET /v10/projects/<id>/env?decrypt=true` *(builder confirms)*.
9. **Pending migrations.** Run `supabase db push --dry-run --db-url <prod> --workdir <tmp>`.
   - `<tmp>` is a `git worktree add --detach <tmpdir> <tag>` checkout. Migrations always come **from the tag**, never from the working tree.
   - The pending list is printed.
   - `--dry-run` stops here with `ok: true, code: 'dry_run'`.
10. **`confirm_mismatch`**: Josh types the tag name and it does not match.
11. **Database dump** (11 Operations: "A script takes a database dump before each promotion").
    - Folder: `<RELEASE_DUMP_DIR>/<tag>-<UTC yyyyMMddHHmmss>/`.
    - Three `supabase db dump --db-url` runs: `roles.sql` (`--role-only`), `schema.sql`, `data.sql` (`--data-only --use-copy`). This follows Supabase's backup guide *(builder confirms flags)*. Docker must be running.
    - **`dump_failed`**: any run exits non-zero, or any file is missing or 0 bytes.
    - It writes `release.json`: tag, SHA, previous tag, deployment id, start time, and each file's size and SHA-256. The file never holds a URL with a password, and never the token.
12. **`migrate_failed`**: `supabase db push --db-url <prod> --workdir <tmp>` fails (run with the pinned CLI's non-interactive flag).
    - The message names the dump folder.
    - Production still serves the old deployment, which add-before-remove keeps working.
13. **`promote_failed`**: the call `POST /v10/projects/<id>/promote/<deploymentId>` fails *(builder confirms)*.
14. **Verify.** Poll `https://<HOST>/api/health` every **5 s** for up to **120 s** (*planner's choice*). `HOST` comes from EZD-003; the route from EZD-004.
    - Health passes when `schema_version` equals the newest 14-digit migration prefix at the tag.
    - `checkLive` (EZD-003's 8 checks) must then pass.
    - **`verify_failed`** if either fails. The output then prints the rollback steps (Step 7).
15. **Record.** Append `promoted_at` and the result to `release.json`. Print a summary with the dump folder.

**Other rules:**
- Re-running the same tag after a failure is safe: a new dump is taken, `db push` applies nothing new, and the promote is repeated.
- The temporary worktree is removed in `finally`.

### Step 7: Rollback (runbook; 11 Operations: "Rollback is Vercel's previous deployment")
1. **Roll back the app.** In Vercel → Deployments, open the previous production deployment (its commit carries the previous `phase-…` tag) and use **Instant Rollback** *(builder confirms the name)*.
2. **Leave the database alone.** Do **not** revert, edit or delete migrations. Add-before-remove (EZD-023a) means the previous deployment still works with the current database (11 Operations).
3. **Check.** Run `node scripts/hosting/check-live.mjs` (EZD-003). `/api/health` will still show the newer `schema_version`; that is expected.
4. **Fix forward.** Fix on `develop` → PR to `main` → `release:tag phase-N.k` → `release:promote`.
5. **If data was damaged, stop.** Never load a dump into production by hand. The script prints the pre-promote dump folder. The restore procedure is EZD-025's restore runbook (R26 R13).

### Step 8: Preview uses the dev database (`scripts/release/env-check.mjs`)
**`evaluateVercelEnv({ envs, requiredNames, prodRef })`** is a pure function. It returns `{ ok, problems: [{ code, name, target }] }`.
- `requiredNames` = the non-comment names in `.env.example` at the tag.
- `prodRef` = the project ref parsed from `SUPABASE_PROD_DB_URL`.

Rules:
- **`missing`**: a required name is absent for target `production`.
- **`missing`**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_SECRET_KEY` is absent for target `preview`.
- **`production_not_prod`**: the production `NEXT_PUBLIC_SUPABASE_URL` ref is not `prodRef`.
- **`preview_uses_prod`**: the preview `NEXT_PUBLIC_SUPABASE_URL` ref equals `prodRef`.
- **`unreadable`**: the API returns no value for one of those URLs (for example, a variable marked Sensitive).
- **Preview email**, per Q-0041 (both transports, chosen per environment; Preview defaults to `stub` now; a setting can switch a preview to live sending later):
  - the preview `EMAIL_TRANSPORT` must be set explicitly to `stub` or `resend`; missing, empty or any other value → `{ code: 'preview_email', name: 'EMAIL_TRANSPORT', target: 'preview' }`;
  - `resend` is accepted when Josh sets it, and then `RESEND_API_KEY` must exist for `preview`, otherwise `{ code: 'preview_email', name: 'RESEND_API_KEY', target: 'preview' }` (*planner's choice*: EZD-008 Step 4 fails every send with `email_key_not_set` without it, and `RESEND_API_KEY` is a required name there);
  - Production `EMAIL_TRANSPORT` is covered by the `missing` rule, and a Production `stub` is refused at run time (EZD-008 Step 4, `email_stub_not_allowed`).
- **Preview AI mode** (`preview_ai_mode`): added by EZD-021 with the same shape (Q-0077; vault/plans/EZD-021.md Step 6). Not built here.

Ref helpers:
- `supabaseRefFromApiUrl('https://<ref>.supabase.co')`.
- `supabaseRefFromDbUrl(…)`, which reads both the pooler form (`postgres.<ref>@…pooler.supabase.com`) and the direct form (`@db.<ref>.supabase.co`).

**CLI `pnpm release:check-env`** is read-only. It uses the same guards (Step 3), because it reads the token. Promote step 8 calls the same function.

### Step 9: Dev migrations (Q-0023 (a))
Nothing is added. EZD-004's `supabase-dev.yml` applies dev migrations when Josh clicks Run workflow, and Step 1 documents it.

### Step 10: Tenant 1 in the cloud (Q-0033 (a))
Nothing is built here. EZD-005 builds `supabase/bootstrap/tenant-1.sql` and its runbook section `## Tenant 1 setup (EZD-005)` (vault/plans/EZD-005.md Step 7). This ticket's runbook orders it: on prod, Josh runs it once **after the first `release:promote phase-0`**, because the tables exist only once the promote has applied the migrations (Step 6 step 12). On dev, it runs after EZD-004's workflow has applied the migrations (EZD-005's runbook section).

### Step 11: Docs (under existing headings only)
**`docs/architecture.md`:**
- `## Runtime` → `### Environments and releases (EZD-023b)`. It holds:
  - the Step 1 table;
  - the tag format (with a link to `### Release safety (EZD-023a)`);
  - the three scripts and their guards;
  - the promote step order;
  - where dumps go;
  - "rollback = Vercel Instant Rollback; the database is never rolled back".
- EZD-004's `### Environment variables` table gets the release names (Step 4).
- Two Machine checks rows:
  - `Promote refuses untagged or unsafe releases | scripts/release/__tests__/promote.test.mjs | EZD-023b`
  - `Preview on dev database, production on prod (run by Josh) | pnpm release:check-env | EZD-023b`

**`docs/runbook.md`** (the file exists; add a section, never rewrite): `## Environments and releases (EZD-023)`, written for a non-engineer.
- **One-time setup:**
  1. Turn off Vercel auto-assign (Step 2).
  2. Enter the Preview values (dev project) and Production values (prod project) for every name in `### Environment variables`. Preview `EMAIL_TRANSPORT` = `stub` (Q-0041: no email leaves a preview; links show through Copy link). To let a preview send real email later, change Preview `EMAIL_TRANSPORT` to `resend` and add a Preview `RESEND_API_KEY`; `release:check-env` accepts either.
  3. Create a Vercel token with an expiry date, for EZ Binder's existing Vercel team, which holds the `ezdraft` project (Q-0031 (a)).
  4. Copy the prod Session pooler connection string.
  5. Create `.env.release.local`.
  6. Add the settings.json deny lines (Step 3).
- **Each release:** start Docker Desktop. After merging the phase PR, run in order:
  1. `pnpm release:tag phase-N`
  2. `pnpm release:check-env`
  3. `pnpm release:promote phase-N --dry-run`
  4. `pnpm release:promote phase-N`
  5. The Field check.
- **First release (Phase 0):**
  1. The `ezdraft-prod` project must exist in EZ Binder's Supabase organization (Q-0024 (a)).
  2. Run the promote.
  3. Run the tenant 1 setup file `supabase/bootstrap/tenant-1.sql` on prod, as `## Tenant 1 setup (EZD-005)` says (Q-0033 (a)).
  4. The orchestrator runs EZD-003's subdomain check, part of the Phase 0 field check (Q-0032 (a)).
- **Rollback:** Step 7.
- **Dumps:** where they are, that they hold client data, and that they stay until Josh deletes them.

The orchestrator copies the one-time setup into `vault/tickets/needs-from-josh.md`; the builder may not write `vault/`.

## Files
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `scripts/release/guards.mjs` | New | builder | Step 3 |
| `scripts/release/release-env.mjs` | New | builder | Step 4 (parse `.env.release.local`; `redactUrl`) |
| `scripts/release/vercel-api.mjs` | New | builder | Step 6 steps 7, 8, 13 |
| `scripts/release/env-check.mjs` | New | builder | Step 8 |
| `scripts/release/tag.mjs` | New | builder | Step 5 |
| `scripts/release/promote.mjs` | New | builder | Step 6 |
| `package.json` (root) | Change (extend) | builder | Scripts `release:tag`, `release:promote`, `release:check-env` |
| `supabase/bootstrap/tenant-1.sql` | Not touched | — | EZD-005's file (Q-0033 (a); Step 10) |
| `.env.example` | Change (comment lines only) | builder | Step 4 |
| `docs/architecture.md`, `docs/runbook.md` | Change | builder | Step 11 |
| `scripts/release/__tests__/promote.test.mjs`, `tag.test.mjs`, `env-check.test.mjs`, `release-docs.test.mjs` | New | test-author | Tests below; they reuse EZD-023a's `git-fixture.mjs` |
| `scripts/db/__tests__/db.test.mjs` | Not changed | — | EZD-004 T7 counts non-comment lines only |
| `.claude/settings.json`, `.claude/hooks/guard-bash.mjs`, `SETUP.md` | Not touched (Josh's) | — | Josh steps in Steps 2 and 3 |
| `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**` | Not touched | — | Owned by Josh or the orchestrator |

No new dependency. The scripts use Node 22 built-ins only. The `supabase` CLI is already a root devDependency (EZD-004). There is no Vercel package: the scripts call Vercel's REST API with `fetch`.

## Data
- No migrations. No table, column, policy or schema_version change. No bootstrap file (EZD-005 owns it, Q-0033 (a)).
- Dumps are written outside the repo only.
- No money fields.

## Tests (written by test-author before any code)
- All tests are `node:test` with a top-level `describe('EZD-023b …')`.
- No test reaches the network:
  - `vercel`, `supabase`, `fetch`, `confirm`, `sleep` and `now` are fakes that record their calls;
  - `git` is real, run against fixture repos with a local bare `origin` (EZD-023a's `git-fixture.mjs`).
- **Fixture `R`:**
  - `main` commit C1 adds:
    - `supabase/migrations/20261101000000_create_fixture.sql` = `create table public.fixture_item (id uuid primary key, legacy_note text);`
    - `supabase/retired.json` = `{"retired":[]}`
    - `.env.example` with EZD-004's three names.

    C1 carries the annotated tag `phase-0`.
  - `main` commit C2 adds `20261102000000_add_note.sql` = `alter table public.fixture_item add column new_note text;`. C2 is **untagged**.
  - A side-branch commit C3 carries the tag `phase-9.1`.
  - A lightweight tag `v1` points at C1.
  - **`DROP`** is a migration `20261103000000_drop_legacy_note.sql` = `alter table public.fixture_item drop column legacy_note;`.
- **Clean fakes:**
  - `processEnv: {}` and `isTTY: true`.
  - `confirm` returns the tag.
  - `loadReleaseEnv` returns `{ SUPABASE_PROD_DB_URL: 'postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres', VERCEL_TOKEN: 'tok_TEST', VERCEL_PROJECT_ID: 'prj_TEST', RELEASE_DUMP_DIR: <tmp> }`.
  - The Vercel fake has a READY production deployment for the tag's SHA and a passing env list.
  - `supabase.dump` writes a non-empty file.
  - Health returns the tag's newest migration.
- **No external call** means:
  - `loadReleaseEnv`, every `vercel.*` call, every `supabase.*` call, `fetch` and `confirm` recorded 0 calls;
  - the dump folder is still empty.

| Test | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- |
| T1 **Done when** `EZD-023b done when: the promote script refuses an untagged build` | unit (git) | `runPromote({ tag })` on `R` with clean fakes, `tag` = (a) C2's full SHA; (b) `main`; (c) `develop`; (d) `v1`; (e) `phase-7` (does not exist). Then the CLI `node <repo>/scripts/release/promote.mjs <C2 SHA>` with cwd = `R`, `CLAUDECODE` and `CI` removed from the env, and `RELEASE_DUMP_DIR` = an empty temp folder | Each call: `ok === false`, `code === 'untagged'`, no external call. CLI: exit 1; output contains `untagged`; the dump folder is still empty | Ticket Done when; Step 6 step 2 |
| T2 Not on main | unit (git) | `runPromote({ tag: 'phase-9.1' })`. `phase-9.1` is the highest tag and sits on side-branch C3 | `code === 'not_on_main'`; no external call | Step 6 step 3 |
| T3 Not the latest | unit (git) | Add tag `phase-1` on C2, then `runPromote({ tag: 'phase-0' })` | `code === 'not_latest'`; no external call | Step 6 step 4; Step 7 (an older release is a rollback) |
| T4 Unsafe migrations | unit (git) | Tag `phase-1` on a `main` commit that adds `DROP`; `runPromote({ tag: 'phase-1' })` | `code === 'migration_check_failed'`; no external call | Step 6 step 5; vault/plans/EZD-023a.md T14 |
| T5 Guards come before secrets | unit (git) | Latest valid tag `phase-0`, clean fakes except: (a) `processEnv: { CLAUDECODE: '1' }`; (b) `{ CI: '1' }`; (c) `{ GITHUB_ACTIONS: 'true' }`; (d) `isTTY: false`; (e) `isTTY: false` with `dryRun: true` | (a) `agent_refused`. (b) and (c) `ci_refused`. (d) `tty_required`. In (a)–(d), `loadReleaseEnv` was called 0 times. (e) gets past the guards: `loadReleaseEnv` is called once and the result is `dry_run` | Step 3 order |
| T6 Env and dump-folder checks | unit (git) | (a) `loadReleaseEnv` returns `{}`; (b) `RELEASE_DUMP_DIR` = `<R>/backups` | (a) `env_missing`; the message lists exactly `SUPABASE_PROD_DB_URL`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`. (b) `dump_dir_in_repo`. Neither case makes any `vercel.*` or `supabase.*` call | Steps 4 and 6 (step 6) |
| T7 No READY build | unit (git) | The Vercel fake returns, case by case: no deployment; one for the SHA with state `ERROR`; one `READY` with target `preview`; one `READY` production deployment for another SHA | Each case: `no_build`; no `supabase.*` call; no dump file | Step 6 step 7 ("tagged build") |
| T8 Order of a full promote | unit (git) | Clean fakes. `R`'s working tree also holds an **uncommitted** extra migration `20261201000000_wip.sql` | `ok === true`. Recorded call order: `vercel.findDeployment`, `vercel.listEnv`, `supabase.pushDryRun`, `confirm`, `supabase.dump(roles)`, `supabase.dump(schema)`, `supabase.dump(data)`, `supabase.push`, `vercel.promote`, health poll(s), `checkLive`. The `workdir` given to both pushes lists exactly the tag's migration files, without `…wip.sql`. The dump folder name matches `^phase-0-\d{14}$` and holds `roles.sql`, `schema.sql`, `data.sql`, `release.json`. `release.json` has `tag: 'phase-0'`, the C1 SHA, `previous_tag: null`, the deployment id, 3 file entries each with `size > 0` and a 64-hex `sha256`, and `promoted_at`. Neither `release.json` nor any logged output contains `S3cret` or `tok_TEST`. The temporary worktree no longer exists afterwards | 11 Operations ("takes a database dump before each promotion"); Step 6 steps 7–15; Step 4 redaction |
| T9 Dry run stops before changes | unit (git) | Clean fakes, `dryRun: true` | `code === 'dry_run'` and `ok === true`. `confirm`, `supabase.dump`, `supabase.push` and `vercel.promote` each have 0 calls | Step 6 step 9 |
| T10 Wrong confirmation | unit (git) | `confirm` returns `phase-0x` | `confirm_mismatch`; 0 dump, push or promote calls | Step 6 step 10 |
| T11 Dump failure stops the release | unit (git) | (a) `dump(schema)` writes a 0-byte file; (b) `dump(data)` exits 1 | Both cases: `dump_failed`; `supabase.push` and `vercel.promote` have 0 calls | 11 Operations (dump first); Step 6 step 11 |
| T12 Migrate and promote failures | unit (git) | (a) `supabase.push` exits 1; (b) `vercel.promote` rejects | (a) `migrate_failed`; `vercel.promote` has 0 calls; output contains the dump folder path. (b) `promote_failed` | Step 6 steps 12 and 13 |
| T13 Verify window | unit (git) | Fake clock: `sleep(ms)` advances `now` by `ms`. Health always returns `schema_version: '20261101000000'`, but the tag's newest migration is `20261102000000` (tag `phase-1` on C2, the only higher tag) | `verify_failed` after exactly **25** health polls (t = 0, 5, …, 120 s); output contains `Instant Rollback` | Step 6 step 14 (5 s and 120 s, planner's choice); Step 7 |
| T14 Vercel env rules | unit | `evaluateVercelEnv` with `requiredNames` = EZD-004's three names and `prodRef: 'prodref123'`. Cases: (a) Production and Preview both complete; prod URL `https://prodref123.supabase.co`, preview URL `https://devref456.supabase.co`; Preview `EMAIL_TRANSPORT` = `stub`, no Preview `RESEND_API_KEY`. (b) Preview URL `https://prodref123.supabase.co`. (c) Production URL `https://devref456.supabase.co`. (d) Production lacks `SUPABASE_SECRET_KEY`. (e) Preview lacks `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. (f) The preview URL entry has no `value`. (g) (a) without a Preview `EMAIL_TRANSPORT`. (h) (a) with Preview `EMAIL_TRANSPORT` = `resend` and a Preview `RESEND_API_KEY`. (i) (a) with Preview `EMAIL_TRANSPORT` = `resend` and no Preview `RESEND_API_KEY`. (j) (a) with Preview `EMAIL_TRANSPORT` = `smtp` | (a) `ok === true`. (b) `preview_uses_prod`. (c) `production_not_prod`. (d) `missing` / `SUPABASE_SECRET_KEY` / `production`. (e) `missing` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `preview`. (f) `unreadable`. (g), (j) exactly one problem `preview_email` / `EMAIL_TRANSPORT` / `preview`. (h) `ok === true`. (i) exactly one problem `preview_email` / `RESEND_API_KEY` / `preview` | 11 Operations ("Preview deploys use the dev database"); Step 8; Q-0041 (both transports per environment; Preview `stub` by default, `resend` when set); EZD-008 Step 4 (`stub` / `resend`; key needed for `resend`) |
| T15 Ref parsing and redaction | unit | `supabaseRefFromApiUrl('https://abcd1234.supabase.co')`; `supabaseRefFromDbUrl('postgresql://postgres.abcd1234:p%40ss@aws-0-us-east-1.pooler.supabase.com:5432/postgres')`; `supabaseRefFromDbUrl('postgresql://postgres:secret@db.abcd1234.supabase.co:5432/postgres')`; `supabaseRefFromDbUrl('not a url')`; `redactUrl` of the third URL | `abcd1234`, `abcd1234`, `abcd1234`, `null`. The redacted string contains `***` and does not contain `secret` | Steps 4 and 8 |
| T16 release:tag | unit (git) | On `R`, with fakes for `confirm` and `processEnv`: (a) name `v2`; (b) `phase-0` (exists); (c) `phase-0.1` while `phase-1` exists; (d) `phase-1` where `origin/main` adds `DROP`; (e) `phase-1` on an additive `origin/main` with `CLAUDECODE=1`; (f) `phase-1`, clean | (a) `bad_name`. (b) `tag_exists`. (c) `not_newer`. (d) `migration_check_failed`. (e) `agent_refused`, and no tag is created. (f) `ok`; `git ls-remote --tags origin` lists `refs/tags/phase-1`; `git cat-file -t phase-1` = `tag` (annotated); the tag points to `origin/main` | Step 5 |
| T17 Scripts stay out of the gate | unit | Root `package.json` | `release:tag`, `release:promote` and `release:check-env` run `node scripts/release/tag.mjs`, `promote.mjs` and `env-check.mjs`. None of `typecheck`, `lint`, `test`, `build` contains `release:` or `promote` | Step 3 (agents and the gate never run releases) |
| T18 Docs, runbook, env names | unit | `docs/architecture.md`, `docs/runbook.md`, `.env.example` (read by the test) | Architecture: `### Environments and releases (EZD-023b)` sits under `## Runtime` and contains `ezdraft-dev`, `ezdraft-prod`, `Preview`, `Production`, `ezdraft.ezcontractorbinder.com`, `release:promote`, `release:tag`, `Instant Rollback`, `.env.release.local`. Two Machine checks rows end in `EZD-023b`. `node scripts/conventions/check.mjs .` exits 0. Runbook: `## Environments and releases (EZD-023)` contains `Auto-assign Custom Production Domains`, `release:tag`, `release:check-env`, `release:promote`, `--dry-run`, `Instant Rollback`, `Session pooler`, `SUPABASE_PROD_DB_URL`, `VERCEL_TOKEN`, `Docker`, `supabase/bootstrap/tenant-1.sql`, `EMAIL_TRANSPORT`. `.env.example` has the comment lines `# SUPABASE_PROD_DB_URL=`, `# VERCEL_TOKEN=`, `# VERCEL_PROJECT_ID=`, and its non-comment lines are unchanged by this ticket | Steps 4, 7, 10, 11; Q-0033 (a); Q-0041; EZD-000 T5, C1; EZD-004 T7, T8 |
| T19 (removed) | — | — | Not used: under Q-0033 (a) the bootstrap file is EZD-005's and its T17 tests it (vault/plans/EZD-005.md) | Q-0033 (a) |
| T20 Gate (orchestrator) | gate | `node scripts/gate.mjs <worktree>` | Exit 0 | CLAUDE.md rule 9 |
| Josh's live step (not in the gate; no agent runs it) | manual | After the Phase 0 merge and Josh's one-time setup: `pnpm release:tag phase-0`, then `pnpm release:promote phase-0` | Exit 0. The orchestrator then runs EZD-003's T8 (`check-live.mjs`, read-only) | 11 Operations; Q-0032 |

## Reviewers needed
code-reviewer always · calc-auditor no (no calculations) · ui-verifier no (no screen) · security-reviewer **yes**, for these points (CLAUDE.md rule 12; 11 Security and audit):
- Production database credentials and a Vercel token sit on Josh's PC. The Vercel team is shared with EZ Binder (Q-0031 (a)), so the token can reach EZ Binder's projects too; the runbook says to give it an expiry date and keep it only in `.env.release.local` (Q-0003).
- The Supabase organization is shared with EZ Binder (Q-0024 (a)); the release scripts use only the `ezdraft-prod` connection string, never an organization-wide credential.
- Database dumps hold client data. They are kept outside the public repo.
- The agent, CI and TTY guards.
- The separation of the Preview and Production databases.
- Redaction in logs and in `release.json`.

## Risks
- **Vercel features on Pro (Q-0031 (a): EZ Binder's team, on Pro).** These are the planner's knowledge, not vault facts, and the builder confirms them for a Pro team:
  - the auto-assign switch;
  - staged production builds of `main`;
  - Instant Rollback, which on lower plans may reach only the deployment just before;
  - the REST endpoints.

  If the Pro team has no auto-assign switch, "production only by promote" needs another mechanism (for example an Ignored Build Step on `main` plus a deploy hook), and this plan changes.
- **First release ordering.** With auto-assign off, the subdomain shows nothing until the first `release:promote phase-0`. EZD-003's T8 (Q-0032 (a), answered by Josh: "right after the Phase 0 merge, as part of the field check") therefore runs right after that promote. The orchestrator should note this on EZD-003's row.
- **The agent guard is a speed bump, not a lock.** `CLAUDECODE` and the TTY check stop an agent that runs a release script by accident. Something that runs a process with a pseudo-terminal and can use Josh's `.env.release.local` could get past them. Josh's settings.json deny lines (Step 3) close the normal path; until he adds them, `Bash(pnpm *)` is allowed.
- **Supabase CLI and Docker.** `db dump` runs pg_dump in Docker, so Docker Desktop must be running when Josh releases. `db push` may prompt for confirmation; the builder uses the pinned CLI's non-interactive flag.
- **Dumps on Josh's PC** hold client personal data with no automatic expiry. EZD-025 adds the off-site copies. Deleting old local dumps is Josh's job.
- **Preview sign-in.** Preview deployments use the dev project's Auth, so its redirect allow list must include the Vercel preview URLs. That is EZD-007's runbook item; noted for the orchestrator.
- **Newer app than server after a rollback.** After a rollback, some devices may run a newer app than the server. EZD-134 (old app versions, 03 rule 12) should handle "newer than server" as well as "older".
- **Test time.** Root node tests run on every ticket (EZD-001 Step 6.1). This ticket's git fixtures must stay small so the run takes seconds on the 16 GB PC (Q-0019).

- **A live preview sends real email (Q-0041).** Previews default to `stub`. If Josh switches a preview to `resend`, it emails whatever addresses are in the dev data; the runbook says so.

## Open questions
None.

Answered since the first draft (2026-10-12):
- Q-0041 (answered-josh): build both modes, chosen per environment; previews default to the stub transport now; a setting can switch a preview to live sending later. Applied in Step 1, Step 8 (`preview_email` accepts `stub` or `resend` set explicitly; `resend` needs a Preview key), Step 11 runbook, T14 (g)–(j), Risks. The earlier "(a) must be stub / (b) must be resend" branches are removed.
- Q-0032 (a), Q-0024 (a), Q-0031 (a) (answered-josh): applied in Depends on, Step 1, Step 11 runbook, Reviewers and Risks.
- Q-0033 (a) (answered-josh): EZD-005 builds the tenant-1 setup file (vault/plans/EZD-005.md Step 7); this ticket's runbook runs it on prod after the first promote (Step 10). The (b) bootstrap file, its Files row and T19 are removed.
- Q-0023 (a) (answered-agent): dev migrations by manual workflow; the (c) `release:migrate-dev` script, `SUPABASE_DEV_DB_URL` and its deny line are removed (Steps 3, 4, 9).
