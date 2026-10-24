# EZD-004c · Cloud dev migrations workflow

- **ACs:** AC-EZD-004c-1, AC-EZD-004c-2, AC-EZD-004c-3 (`vault/spec/acceptance-criteria.md` lines 19–21, generated from Done-when). AC-3 is a note ("waits for Josh's keys"), mapped in section 4 (vault/KNOWN-LIMITS.md, Phase 0 ACs).
- **Complexity:** medium (section 8)
- **User-visible result:** once Josh adds the dev database secret, every `develop` push that adds a migration updates the cloud dev database by itself; until then the workflow runs green and changes nothing, and Josh has written steps in `docs/runbook.md`.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: ready · Re-validated 2026-10-19 after EZD-004a (78b3103) and EZD-004b (22b6f0a): citations and one doc citation edit only; no test value or behavior changed.

Split from EZD-004 (Q-0148). This plan is part "EZD-004c" of the split proposal in `vault/plans/EZD-004.md` (lines 32–40), with re-validation findings F1–F12 there applied (F7, F8, F9, F10, F11 bear on this part). Technical detail comes from the v1 plan text (`git show de5030c:vault/plans/EZD-004.md`, "v1" below), Step 7 and test T13. Names kept from v1 because later plans cite them: `.github/workflows/supabase-dev.yml`, secret `SUPABASE_DEV_DB_URL`, GitHub environment `dev`, runbook heading `## Supabase cloud projects (EZD-004)` (vault/plans/EZD-023b.md lines 29, 107, 283, 461; `scripts/ci/__tests__/ci.test.mjs` line 151).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 14):
- **Scope:** GitHub workflow supabase-dev.yml that pushes migrations to the cloud dev project on develop pushes that change supabase/migrations and by hand (Q-0107, Q-0112); Josh's runbook steps for the ezdraft-dev and ezdraft-prod projects and the dev secret (Q-0024 (a)). Split from EZD-004 (Q-0148); plan Part EZD-004c.
- **Done when:** The cloud dev workflow passes EZD-002's workflow checks and this part's checks, and pushes nothing when SUPABASE\_DEV\_DB\_URL is not set; Josh's steps for the dev project and its secret are in docs/runbook.md. Applying to the cloud dev project waits for Josh's keys.
- **Depends on:** EZD-004a, EZD-004b, EZD-002
- **Spec ref:** Stack · Database, auth, files

No tables, columns, RLS, `schema_version` or money fields. No screen.

### Steps

1. **`.github/workflows/supabase-dev.yml`** (new; builder may add workflow files, `.claude/hooks/guard-paths.mjs` lines 82–83). Exactly the text in section 3 "Workflow text", with the two `<SHA>` placeholders replaced. Each rule and its source:
   - Triggers: `push` to `develop` with `paths: ['supabase/migrations/**']`, plus `workflow_dispatch`; nothing else (Q-0107; EZD-002 T2 rule (e), `ci.test.mjs` lines 181–186). Manual runs appear only once the file is on the default branch, so they start after the Phase 0 merge; the push trigger works as soon as the file is on `develop` (v1 Step 7).
   - Job `environment: dev` and `if: github.ref == 'refs/heads/develop'`; the secret is an environment secret of `dev`, which only `develop` may use (Q-0112 "SUPABASE_DEV_DB_URL moves to a dev environment limited to develop"; EZD-002 T2 rule (g), line 199).
   - Public-repo rules, matching EZD-023b Step 3 (vault/plans/EZD-023b.md lines 133–144; Q-0106, Q-0112): top-level `permissions: contents: read` only; `concurrency` group `supabase-dev` with `cancel-in-progress: false` so two pushes never migrate at once; `timeout-minutes: 15` (v1 Step 7, planner's choice); every `uses:` pinned to a full 40-hex commit SHA with the version as a comment (*builder looks up the SHAs of the current `actions/checkout` v4 and `actions/setup-node` v4 releases*, as in EZD-023b line 139); `actions/checkout` with `persist-credentials: false`; `actions/setup-node` with `node-version: 22` (docs/architecture.md Runtime) and no `cache:` key; pnpm installed at exactly the root `packageManager` version (`package.json` line 4, `pnpm@12.14.0`; EZD-023b Step 3 item 3); the secret appears only in the push step's `env:`, never in a `run:` line; no `set -x`, no artifact upload, no `continue-on-error`.
   - `pnpm install --frozen-lockfile` runs no dependency build script: every reported script is denied in `pnpm-workspace.yaml` `allowBuilds`, and `supabase@2.121.0` has none (docs/architecture.md "Adding a dependency"; EZD-004 finding F2). This meets Q-0112's "install scripts limited" without a separate rebuild step.
   - Push step: when `SUPABASE_DEV_DB_URL` is empty or unset it prints the notice in section 6 and exits 0 without calling anything; otherwise it runs `pnpm supabase db push --db-url "$SUPABASE_DEV_DB_URL"` (v1 Step 7; split proposal Scope). `--db-url` with a connection string, not `supabase link` with an access token, because the Supabase account is shared with EZ Binder and a token would reach its projects (v1 Step 5, planner's choice kept; Q-0003, Q-0024 (a)). No `--include-all` (*planner's choice*): an out-of-order migration file makes the run fail red and visible instead of being applied in an order a fresh database would not use (R-001 item 14; 11 Operations "Migrations add before they remove"). No `--yes`: Supabase's own GitHub Actions guide runs `db push` as a plain non-interactive step (R-001 item 16).
   - No `prod`, `link` or `SUPABASE_ACCESS_TOKEN` anywhere in the file, comments included (production migrates only through EZD-023b's release workflow, Q-0106; test T1 checks the substrings case-insensitively, so comments must avoid words such as "production" or "linked").
2. **`docs/runbook.md`** (change; append only; EZD-003's `## Vercel and the subdomain (EZD-003)` stays byte-for-byte, finding F7). Append the section `## Supabase cloud projects (EZD-004)` with the text in section 6 (Josh approves it at Stage 2). Content sources: Q-0024 (a) (own projects in EZ Binder's organization, on Pro), Q-0113 (only the dev project now; `ezdraft-prod` from the Before-launch checklist), Q-0110 (made-up data, password used nowhere else), Q-0112 and vault/plans/EZD-023b.md line 461 (lock `dev` to `develop` first, then add the secret), Q-0107 (runs by itself), Q-0106 (production only through the release workflow), 02 Relationship to EZ Binder ("EZ Draft never writes to EZ Binder's database"), R-001 items 1–7 (GitHub runners need the Session pooler string) and item 9 (`--db-url` must be percent-encoded, so the password is letters and digits only), docs/architecture.md Hosting (Vercel functions in `iad1`, so the dev project goes in East US, *planner's choice* from v1 Step 7 item 2), EZD-004a `supabase/config.toml` `[db] major_version` (v1 Step 7 item 3).
3. **`docs/architecture.md`** (change; four edits, nothing else; `### CI` stays last under `## Machine checks`, finding F6):
   - Under `## Migrations` → `### Local database` (created by EZD-004a, vault/plans/EZD-004a.md line 46, "No cloud-dev lines (EZD-004c adds them)"): append one paragraph: `Cloud dev: .github/workflows/supabase-dev.yml applies supabase/migrations/ to the cloud project ezdraft-dev with supabase db push --db-url on each develop push that changes them and by Run workflow (Q-0107); without the SUPABASE_DEV_DB_URL secret it ends green and pushes nothing. Agents never run db push or link themselves (.claude/hooks/guard-bash.mjs). Josh's setup: docs/runbook.md, Supabase cloud projects.` (file and name tokens in backticks). Append after the last bullet (the `public.health()` line); EZD-004a T18 (`scripts/db/__tests__/db.test.mjs` lines 326–355) still needs `pnpm db:up`, `pnpm db:types` and `public.health()` in this section, so nothing in it is removed.
   - Under `## Runtime` → `### Environment variables` (created by EZD-004b, vault/plans/EZD-004b.md lines 32–36, "No `SUPABASE_DEV_DB_URL` row: EZD-004c adds it"): one table row in that table's columns `Name | Reaches the browser | Local value | Dev / prod value | Used by`: `` | `SUPABASE_DEV_DB_URL` | never | none (the local stack needs none) | the dev project's Session pooler connection string, an environment secret of the GitHub environment `dev` (`develop` only); production has no counterpart (EZD-023b's `release` environment) | `.github/workflows/supabase-dev.yml` only | ``. Not added to `.env.example` (never a local value; EZD-004b T7, `scripts/db/__tests__/env.test.mjs` line 25, keeps that file at exactly three names; EZD-004b T8, line 32, needs a row only for each `.env.example` name, so the extra row passes).
   - `## Machine checks` table, before `### CI`: one row `| — | Cloud dev migrations workflow: pinned, dev-only, pushes nothing without its secret | scripts/db/__tests__/supabase-dev.test.mjs | EZD-004c |` (row format of EZD-002 T6 and EZD-003 T6: four cells, last cell the ticket). Put it after EZD-004a's three rows (docs/architecture.md lines 275–277 on develop at 910e884), directly before the blank line above `### CI`.
   - Under `### CI`, bullet "Workflows on a public repo" (docs/architecture.md line 287): `EZD-004 T13` → `EZD-004c T1`. Citation fix only: v1 T13 became this plan's T1 at the split (Q-0148; section 4 T1 source). No test reads that text (EZD-002 T6, `ci.test.mjs` lines 439–462, checks other strings).
4. **Orchestrator, not builder:** after merge, copy runbook items 1–6 into `vault/tickets/needs-from-josh.md` (the builder may not write `vault/`; v1 Step 7 last bullet); after Josh adds the secret, check the first run (section 4, O1).

### Files

| Path | New / change | Writer | Why |
| --- | --- | --- | --- |
| `.github/workflows/supabase-dev.yml` | New | builder (guard-paths.mjs lines 82–83: new workflow files allowed) | Step 1 |
| `docs/runbook.md` | Change (append one section) | builder | Step 2 |
| `docs/architecture.md` | Change (four edits) | builder | Step 3 |
| `scripts/db/__tests__/supabase-dev.test.mjs` | New | test-author (guard-paths.mjs `isTest`: `__tests__/`) | Section 4 (node:test; found by the root `"scripts/**/*.test.mjs"` glob, never filtered by scope, docs/architecture.md Test scope) |

Write rules checked against `.claude/hooks/guard-paths.mjs` lines 15, 76–83 (lesson L-002; line 82 now also lets the builder write `scripts/db/`, af17c5f, which this plan does not use): the builder paths are outside `scripts/`, `.claude/`, `vault/`, `ci.yml` and test patterns; the test file is the test-author's (`__tests__/`, line 15). No package, lockfile or dependency change (CLAUDE.md rule 7 not triggered).

## 2. Sources

- Ticket: `vault/tickets/phases/phase-00.md` line 14; `vault/tickets/tickets.json` (EZD-004c: `depends_on` EZD-004a, EZD-004b, EZD-002; `mockups` `[]`; `acs` AC-EZD-004c-1..3); `vault/tickets/PHASES.md` Phase 0 (lines 7–23); `vault/tickets/README.md` (rule 4; Needs from Josh: Supabase dev and prod keys).
- Split: `vault/plans/EZD-004.md` Split proposal Part EZD-004c and findings F1–F12; v1 Step 7 and T13 (`git show de5030c:vault/plans/EZD-004.md` lines 100, 112–135, 196).
- Spec: `vault/spec/sections/02-product-overview.md` Stack "Database, auth, files" (line 59), Named tools "CI and repository" (line 80), "Database migrations" (line 82), Relationship to EZ Binder (line 88); `11-non-functional-requirements.md` Operations (lines 57–66: environments local / dev / production; "Preview deploys use the dev database"; migrations add before they remove); Performance (lines 5–20: nothing in this ticket runs in the app or adds download size). `03-data-model.md` and `04-app-shell-and-global-ui.md`: no table and no screen, so no rule applies. `vault/spec/non-goals.md` line 32 "No CI run on a push": this is a deploy workflow, not CI, and Q-0107 allows its push trigger (EZD-002 T2 rule (b), `ci.test.mjs` line 170). Glossary: no product terms.
- Decisions (`vault/questions/QUESTIONS.md`; `vault/spec/decisions/02-product-overview.md`, `11-non-functional-requirements.md`): Q-0003, Q-0024 (a), Q-0106, Q-0107, Q-0108 (agents have Write access, so the dev password is agent-reachable, accepted under Q-0110), Q-0110, Q-0112, Q-0113, Q-0146 (T2 bypass forms), Q-0148 (the split).
- Code and docs read 2026-10-19: `scripts/ci/__tests__/ci.test.mjs` (lines 1–290 `checkWorkflow` and T2/T2b; 295–301 `childEnv`; 439–462 T6), `.github/workflows/ci.yml`, `docs/runbook.md`, `docs/architecture.md`, `package.json` line 4, `.claude/hooks/guard-paths.mjs` lines 15, 76–83, `.claude/hooks/guard-bash.mjs` line 20, `.claude/settings.json` lines 29–38 (allowed local `supabase` commands) and 65–68 (`db push` and `link` ask), `scripts/hosting/__tests__/hosting.test.mjs` line 141 (EZD-003's runbook check reads only its own section). Re-read on develop at 910e884 after EZD-004a and EZD-004b merged: `scripts/db/__tests__/db.test.mjs` (EZD-004a T18 lines 326–355: `### Local database` strings, exactly three EZD-004a Machine checks rows before `### CI`), `scripts/db/__tests__/env.test.mjs` (EZD-004b T7 line 25, T8 line 32), `.env.example` (three names), `docs/architecture.md` (`### Environment variables` line 23 under `## Runtime` after `### Hosting`; `### Local database` line 187; `## Machine checks` line 244; `### CI` line 279, still last), `pnpm-workspace.yaml` (`allowBuilds` still only `unrs-resolver: false`), `supabase/config.toml` (`[db]` line 32, `major_version = 17` line 41), root `package.json` (`supabase` 2.121.0 line 26). `ci.test.mjs`, `docs/runbook.md`, `hosting.test.mjs` and the hooks are unchanged since this plan was written, so their line numbers stand.
- Plans: vault/plans/EZD-004a.md (`### Local database`, `config.toml`, `scripts/db/__tests__/`), vault/plans/EZD-004b.md (`### Environment variables` table, `.env.example`), vault/plans/EZD-002.md (T2), vault/plans/EZD-023b.md (Step 3 public-repo rules; line 152 Session pooler; line 461 `dev` environment steps).
- Research: **R-001** (Supabase `db push` from GitHub Actions: Session pooler on IPv4, percent-encoding, `--include-all`, Supabase's CI guide; items 8 and 10 are unverified, see section 9).
- Mockup: none (no screen).

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| file | `.github/workflows/supabase-dev.yml` | Exactly the "Workflow text" below; only the two `<SHA>` placeholders (and their version comments) differ |
| step name | `Push migrations to ezdraft-dev` | The last step of job `migrate`; `shell: bash` (GitHub runs it as `bash --noprofile --norc -eo pipefail {0}`); `env:` holds exactly one key, `SUPABASE_DEV_DB_URL`; `run: |` block body is the five lines shown |
| secret | `SUPABASE_DEV_DB_URL` | Environment secret of GitHub environment `dev` (Q-0112); EZD-002 `EXPECTED_SECRETS['supabase-dev.yml']` (`ci.test.mjs` line 151) |
| command | `pnpm supabase db push --db-url "$SUPABASE_DEV_DB_URL"` | The only CLI call; the CLI is EZD-004a's root devDependency `supabase` 2.121.0 |
| docs | `docs/runbook.md` `## Supabase cloud projects (EZD-004)` | After `## Vercel and the subdomain (EZD-003)`; text in section 6 |
| docs | `docs/architecture.md` | `### Local database` paragraph; `### Environment variables` row `` `SUPABASE_DEV_DB_URL` ``; Machine checks row ending `EZD-004c` (Step 3) |
| test file | `scripts/db/__tests__/supabase-dev.test.mjs` | node:test, Node 22 built-ins only; titles start `EZD-004c T<n>` |

### Workflow text

```yaml
name: Supabase dev migrations
# Applies supabase/migrations to the cloud dev project ezdraft-dev (EZD-004c; Q-0107).
# Runs on a develop push that changes supabase/migrations, and by hand from the Actions tab.
# The secret lives in the GitHub environment dev, which only develop may use (Q-0112).
on:
  push:
    branches: [develop]
    paths: ['supabase/migrations/**']
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: supabase-dev
  cancel-in-progress: false
jobs:
  migrate:
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: dev
    steps:
      - uses: actions/checkout@<SHA> # v4.x.y
        with:
          persist-credentials: false
      - uses: actions/setup-node@<SHA> # v4.x.y
        with:
          node-version: 22
      - name: Install pnpm
        run: npm install -g pnpm@12.14.0
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Push migrations to ezdraft-dev
        shell: bash
        env:
          SUPABASE_DEV_DB_URL: ${{ secrets.SUPABASE_DEV_DB_URL }}
        run: |
          if [ -z "${SUPABASE_DEV_DB_URL:-}" ]; then
            echo "::notice::SUPABASE_DEV_DB_URL not set: cloud dev migrations wait for Josh"
            exit 0
          fi
          pnpm supabase db push --db-url "$SUPABASE_DEV_DB_URL"
```

`<SHA>` is a 40-character lowercase hex commit SHA; `12.14.0` equals the root `package.json` `packageManager` version (T1 reads it from there, so a later pnpm upgrade must edit this line too).

## 4. Tests

All in `scripts/db/__tests__/supabase-dev.test.mjs` (node:test). Every spawned child gets a copy of `process.env` with `NODE_TEST_CONTEXT`, `EZD_TEST_GREP` and `EZD_PHASE` deleted (pattern of `ci.test.mjs` `childEnv`, lines 295–301). The test that closes AC-1 ends its title `done when` (docs/architecture.md Tests). Agents run the file with `node --test`; the guard-bash rule against `supabase … db push` (line 20) applies to command text, and the file's own text never reaches a shell command line except inside the temp script T2 writes.

The file defines one checker `checkDevWorkflow(text, pnpmVersion) → string[]` (problems; empty = pass), line-based, no YAML package. Per lesson L-005 it fails every form it does not parse: brace-form `on:`, `permissions:` or `environment:`; scalar `permissions:`; a `uses:` value that is not `owner/repo@<40 hex>`; any `${{` line other than the one env line.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 Workflow is pinned and dev-only | AC-EZD-004c-1 | unit (node) | `.github/workflows/supabase-dev.yml`; root `package.json` `packageManager` | File exists. `checkDevWorkflow` returns `[]`, checking: (a) top-level `on:` is block form with children exactly `push`, `workflow_dispatch`; `push` children exactly `branches`, `paths`; (b) top-level `permissions:` block with exactly one child `contents: read`, and no other `permissions:` line in the file; (c) `concurrency:` children `group: supabase-dev`, `cancel-in-progress: false`; (d) exactly one job, `migrate`, with `runs-on: ubuntu-latest`, `timeout-minutes: 15`, exactly one `environment:` line in the file and it is `environment: dev`, and a line exactly `if: github.ref == 'refs/heads/develop'`; (e) every `uses:` value (quotes and trailing comment stripped) matches `^[\w.-]+/[\w.-]+@[0-9a-f]{40}$`, and the set of `owner/repo` is exactly {`actions/checkout`, `actions/setup-node`}; (f) a line `persist-credentials: false`; `node-version: 22`; no `cache:` line; (g) run lines `npm install -g pnpm@<version from packageManager>` and `pnpm install --frozen-lockfile`; (h) exactly one line contains `${{`, and it is `SUPABASE_DEV_DB_URL: ${{ secrets.SUPABASE_DEV_DB_URL }}`, inside the `env:` of step `Push migrations to ezdraft-dev`, which is the last step and whose `env:` has exactly one key; (i) the push step body contains `pnpm supabase db push --db-url "$SUPABASE_DEV_DB_URL"`; (j) case-insensitively the file contains none of `link`, `supabase_access_token`, `prod`, `set -x`, `upload-artifact`, `continue-on-error`, `pull_request`, `workflow_run`, `schedule`, `--include-all` | Section 3 Workflow text; Q-0107; Q-0112; Q-0106; EZD-023b Step 3; v1 T13 narrowed by finding F10; `package.json` line 4 |
| T1b Checker catches each bypass | AC-EZD-004c-1 | unit (node) | 20 in-memory copies of the real file, each with one edit (regex on the real text): m1 add `  pull_request:` under `on:`; m2 `on:` block → `on: { push: { branches: [develop] } }`; m3 `contents: read` → `contents: write`; m4 add `  id-token: write` under `permissions:`; m5 `permissions:` block → `permissions: write-all`; m6 job-level `    permissions:\n      contents: write`; m7 `environment: dev` → `environment: { name: dev }`; m8 → `environment: ${{ inputs.env }}`; m9 remove the `if:` line; m10 `cancel-in-progress: true`; m11 checkout pin → `@v4`; m12 add step `      - uses: "actions/cache@` + 40 × `a` + `"`; m13 push command → `pnpm supabase db push --db-url "${{ secrets.SUPABASE_DEV_DB_URL }}"`; m14 add `set -x` as the first body line; m15 add `        continue-on-error: true` to the push step; m16 `npm install -g pnpm@<v>` → `npm install -g pnpm`; m17 add `          cache: pnpm` under setup-node `with:`; m18 `persist-credentials: true`; m19 add `          SUPABASE_ACCESS_TOKEN: x` to the push step `env:`; m20 remove `timeout-minutes: 15` | Each copy: `checkDevWorkflow` returns at least one problem. Control: the unedited real text returns `[]` | Lesson L-005; Q-0146 (bypass forms); same sources as T1 |
| T2 Pushes nothing without the secret, done when | AC-EZD-004c-1, AC-EZD-004c-3 | unit (node + bash) | The `run: |` body of step `Push migrations to ezdraft-dev` (lines indented deeper than `run:`, dedented by the first body line's indent) written to a temp file; a temp dir holding a stub `pnpm` (`#!/bin/sh`, appends `$*` and a newline to `$STUB_LOG`, exits `${STUB_EXIT:-0}`), put first on `PATH`; run `bash --noprofile --norc -eo pipefail <file>`. Cases: (a) `SUPABASE_DEV_DB_URL` absent; (b) `''`; (c) `postgresql://postgres.stubref:Pw123abc@example.invalid:5432/postgres`; (d) as (c) with `STUB_EXIT=1` | (a), (b): exit 0; stdout trimmed is exactly `::notice::SUPABASE_DEV_DB_URL not set: cloud dev migrations wait for Josh`; `$STUB_LOG` does not exist. (c): exit 0; `$STUB_LOG` is exactly `supabase db push --db-url postgresql://postgres.stubref:Pw123abc@example.invalid:5432/postgres\n`; stdout + stderr contain neither `::notice::` nor `Pw123abc`. (d): exit status not 0 | Done when ("pushes nothing when SUPABASE_DEV_DB_URL is not set"); section 6 notice; command from section 3; Q-0112 (no secret in logs); GitHub `shell: bash` form (section 3) |
| T3 EZD-002's workflow checks pass on it | AC-EZD-004c-1 | unit (node, child runner) | `node --test --test-reporter=tap --test-name-pattern="^EZD-002 T2" scripts/ci/__tests__/ci.test.mjs`, cwd repo root, child env as above | File `.github/workflows/supabase-dev.yml` exists (so T2 is not vacuous, finding F10); exit status 0; stdout has a line matching `^ok \d+ - EZD-002 T2 Push triggers only where Josh allowed them` and one matching `^ok \d+ - EZD-002 T2b `; no line starts `not ok` | Done when ("passes EZD-002's workflow checks"); `ci.test.mjs` lines 243–286 |
| T4 Josh's steps and docs | AC-EZD-004c-2 | unit (node) | `docs/runbook.md`, `docs/architecture.md`, `.env.example`; `node scripts/conventions/check.mjs <repo>` | Runbook: exactly one line `## Supabase cloud projects (EZD-004)`, after the line `## Vercel and the subdomain (EZD-003)`; its section (to the next `## ` or end) contains `ezdraft-dev`, `ezdraft-prod`, `SUPABASE_DEV_DB_URL`, `` `dev` ``, `develop`, `Session pooler`, `Selected branches`, `made-up`, `Run workflow`, `supabase-dev.yml`, and does not contain `postgresql://`. Architecture: the `### Local database` section (to the next `##`/`###`) contains `supabase-dev.yml` and `SUPABASE_DEV_DB_URL`; the `### Environment variables` section has a table row whose first cell is `` `SUPABASE_DEV_DB_URL` `` and second cell `never`; a `## Machine checks` table row with 4 cells, third cell `scripts/db/__tests__/supabase-dev.test.mjs`, last cell `EZD-004c`, before the `### CI` line. `.env.example` does not contain `SUPABASE_DEV_DB_URL`. check.mjs exits 0 | Steps 2–3; section 6; EZD-002 T6 / EZD-003 T6 row format; EZD-004b Step 6 (three names) |
| O1 First cloud run (orchestrator, not a test) | AC-EZD-004c-3 | field check | After Josh adds the secret and the next `develop` push with a migration or a manual run: `gh run list --workflow supabase-dev.yml --limit 1 --json conclusion` | `success`, and the run's log has no `::notice::SUPABASE_DEV_DB_URL not set` line | Done when ("waits for Josh's keys"); needs-from-josh |

Smoke: no. Gate: the existing EZD-002 T2 also runs on the new file in every gate (root `scripts/**/*.test.mjs`, never filtered).

## 5. Visual checklist

None (no screen).

## 6. Proposed wording

Developer and owner text, not product UI; Josh approves at Stage 2. The notice was proposed in v1 Step 7 and is unchanged.

| Where | Text |
| --- | --- |
| Workflow notice (Actions run, when the secret is missing) | `SUPABASE_DEV_DB_URL not set: cloud dev migrations wait for Josh` |
| `docs/runbook.md`, appended section | (below) |

```markdown
## Supabase cloud projects (EZD-004)

Josh's steps in Supabase and GitHub. Agents never connect to a cloud database. The workflow `.github/workflows/supabase-dev.yml` is the only thing that changes `ezdraft-dev`.

1. **Create the dev project.** In EZ Binder's Supabase organization (it is on Pro): New project, name `ezdraft-dev`, region East US (North Virginia), next to the app's Vercel functions. Never use one of EZ Binder's own projects: EZ Draft never writes to EZ Binder's database. Do not create `ezdraft-prod` yet; it comes from the Before-launch checklist.
2. **Database password.** A new password of letters and digits only (no symbols), at least 20 characters, used nowhere else. Keep only made-up test data in this project, never real client data.
3. **Postgres version.** Tell the orchestrator the Postgres version the new project shows (Project Settings, Infrastructure). It checks it against `supabase/config.toml`.
4. **Lock the GitHub environment first.** In the GitHub repository: Settings, Environments, New environment `dev`. Deployment branches and tags: Selected branches and tags, add branch `develop` only. Turn off "Allow administrators to bypass configured protection rules" if GitHub shows it. Save protection rules.
5. **Then add the secret.** In the Supabase project: Connect, Session pooler, copy the connection string and put your password where the string shows the password placeholder. In the `dev` environment: Add environment secret, name `SUPABASE_DEV_DB_URL`, value that string. Never as a repository secret; if a repository secret with that name exists, delete it. GitHub's machines cannot reach the direct connection, so it must be the Session pooler string.
6. **First run.** From then on the workflow runs by itself whenever `develop` is pushed with new migrations. To apply what is already there, after the Phase 0 merge: Actions, Supabase dev migrations, Run workflow, branch `develop`. A green run with the note "SUPABASE_DEV_DB_URL not set" means step 5 is not done yet.
7. **App keys.** Each project's URL, publishable key and secret key go into Vercel in EZD-023b's setup, never into the repo.
8. **Production** gets migrations only from the release workflow when you merge into `main` (EZD-023b).
```

Dashboard names (Connect, Session pooler, Project Settings, Infrastructure; GitHub's environment page names) are as of R-001 and vault/plans/EZD-023b.md line 461; EZD-003 found Vercel's names differed from its plan (STATUS.md EZD-003), so the orchestrator corrects any name Josh finds different, with no plan change.

## 7. Security review

security-review: yes. Areas: data access (a workflow holding the cloud dev database connection string), migrations (applies them to a cloud database automatically on `develop` pushes), API / CI on a public repo (`.github/workflows/**` is production-sensitive, PROCESS-EZDRAFT.md section 7; gate SECURITY_PATHS `.github/workflows/`, finding F9). Points for the reviewer: secret only in a step `env:` and only in environment `dev`; the workflow never uses `pnpm db:env` or `scripts/db/local.mjs` (EZD-004a follow-up in STATUS.md: `db:env` prints the local secret key and must not be reused for cloud); no fork or `pull_request` path to the secret; SHA pins; no token persisted by checkout; dev password reachable by agents with Write access (Q-0108), accepted only because dev holds made-up data (Q-0110).

Reviewers needed: code-reviewer always · calc-auditor no · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation

Medium: one workflow and two doc edits following EZD-023b's public-repo pattern and EZD-002's checks, but it holds a database secret and the T1b bypass samples need care (lesson L-005). test-author Sonnet 5.5; builder Sonnet 5.5; code-reviewer and security-reviewer Opus 5.5 (split proposal Part EZD-004c; PROCESS.md section 4).

## 9. Dependencies

- From the row: **EZD-004a** (done, 78b3103: the `supabase` CLI devDependency, `supabase/migrations/`, `supabase/config.toml`, `### Local database`, `scripts/db/__tests__/`; its STATUS deviations, stdout-only `local.mjs`, `gen-types.mjs` wording and EZD-004 → EZD-004a doc refs, touch nothing this plan uses), **EZD-004b** (done, 22b6f0a: the `### Environment variables` table, `.env.example` and `scripts/db/__tests__/env.test.mjs`; its deviation, the relative import in `route.ts`, touches nothing here), **EZD-002** (done; T2 `checkWorkflow` and `EXPECTED_SECRETS`).
- Missing from the row (named here, not build blockers): **EZD-000** (done; `docs/architecture.md` and check.mjs); **EZD-003** (repo work merged dc6e8e6; `docs/runbook.md` and its section this one follows; T4 relies on its heading).
- Josh (needs-from-josh, not a ticket): the `ezdraft-dev` project, the locked `dev` environment and the `SUPABASE_DEV_DB_URL` secret. The ticket goes `done` on the repo work; O1 is the field check after his keys (AC-3; README "Needs from Josh": "the cloud part of EZD-004 … wait").
- Not dependencies: EZD-023b (re-uses the `dev` steps in its own list), EZD-016a (no screen).

Risks:
- **`--db-url` without `supabase link` is not confirmed by Supabase's docs** (R-001 item 10: the db push page says it "requires" a linked project yet documents `--db-url`), nor is `db push` through the Session pooler (item 8). Agents cannot test it (guard-bash.mjs line 20). O1 proves it at the first real run; if it fails, the fallback (link plus an access token) reaches EZ Binder's projects through the shared account and would be a question for Josh then.
- An out-of-order migration timestamp (a ticket's migration older than one already pushed) makes the dev run fail until the file is renamed (no `--include-all`, Step 1); EZD-023a's migration check is the place to catch it before merge.
- Once the secret exists, every `develop` push with a migration changes `ezdraft-dev` with no human step (Q-0107, accepted). A broken migration leaves dev part-applied; dev holds made-up data only (Q-0110).
- A later pnpm upgrade must edit the workflow's `npm install -g pnpm@…` line; T1 fails until it does.
- No effect on the app bundle or the performance budgets (11 Performance).

## 10. Open questions

None. Settled from sources: which connection string (Session pooler; R-001 items 1–7, vault/plans/EZD-023b.md line 152); password characters (letters and digits, so no percent-encoding; R-001 item 9); install scripts (none run: `allowBuilds` all false and F2; Q-0112 finding 14 met); whether a non-interactive `db push` needs `--yes` (no; R-001 item 16); runbook heading and secret name (kept from v1, cited by EZD-023b and `ci.test.mjs`).
