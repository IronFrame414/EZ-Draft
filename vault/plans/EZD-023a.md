# EZD-023a · Release safety: migration check

- **ACs:** AC-EZD-023a-1 (`vault/spec/acceptance-criteria.md`, generated from Done-when; KNOWN-LIMITS last bullet)
- **Complexity:** high (section 8)
- **User-visible result:** nothing on screen; a database change that would stop the previous live version from working (dropping or renaming something it still reads, or editing a released migration) now fails the checks, so the phase PR cannot pass CI and going back to the previous version always works.
- Phase: 0 · Planned by: planner · Date: 2026-10-11 (revised 2026-10-12 for Q-0106, Q-0112, Q-0113); re-validated 2026-10-19 against develop (v2 template; EZD-000, EZD-001, EZD-002, EZD-004a, EZD-004b deviations; EZD-004 split, Q-0148) · Status: planned

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md):
- Scope: A CI check (run through the gate's lint step) that refuses a migration which drops or renames something the previous tag still reads, plus edited or deleted released migrations. Split from EZD-023 (Q-0042); plan Part A.
- Done when: CI fails a fixture migration that drops a column the previous tag reads.
- Depends on: EZD-002, EZD-004 (read as EZD-004a, EZD-004b, EZD-004c: R26 R33; Q-0148; `tickets.json` `depends_on`).
- Spec ref: Non-functional · Operations; R26 R12.

Technical choices no source makes are marked *planner's choice* (CLAUDE.md rule 3: agents decide how to build); the code-reviewer confirms them at test review. Tool behaviour that comes from the planner's knowledge, not from a vault source, is marked *(builder confirms)*.

**Precondition (orchestrator, before the builder starts).** `.claude/hooks/guard-paths.mjs` line 83 denies the builder every path under `scripts/` except `scripts/conventions/`, `scripts/db/` and `scripts/email/`, so `scripts/release/*.mjs` cannot be written as planned. Q-0125 (a) settles this: "a plan that names a path a guard denies: the orchestrator adds the exception and records it" (as done for `scripts/db/`, Q-0148, and `scripts/email/`, Q-0153 (a)). The exception is `scripts/release/` only; `scripts/gate.mjs` stays protected. The test-author's files under `scripts/release/__tests__/` are already allowed (guard-paths `isTest`).

### Step 1. Release tags (`scripts/release/tags.mjs`)
- **Format** *(planner's choice)*: `phase-<N>` for the release at the end of phase N; `phase-<N>.<k>` (k ≥ 1) for a release Josh approves between phase gates (11 Operations: "at a phase gate or on Josh's approval"). Regex `^phase-(0|[1-9]\d*)(?:\.([1-9]\d*))?$`. Order: by N, then by k; a plain `phase-N` counts as k = 0. EZD-023b names releases with this format (vault/plans/EZD-023b.md Step 6 step 7).
- **No ancestry check.** Release tags sit on `main`'s merge commits, which are not ancestors of `develop` (Q-0007 flow). "Previous tag" means the highest release tag that exists.
- **Who creates tags.** Only EZD-023b's release workflow, on `main`, through the GitHub API (annotated tag object plus ref), after the migrations are applied to production and before the build goes live (vault/plans/EZD-023b.md Step 6 step 16; Q-0106). No local command creates one; agents are denied the release commands (`.claude/settings.json` deny list; `.claude/hooks/guard-bash.mjs` line 23). So a tag exists on `origin` first and reaches a machine only by a fetch (Step 4).
- **Tags cannot be moved or deleted** (Q-0112: tag ruleset `phase-*` blocking updates and deletions, set by Josh; vault/plans/EZD-023b.md "Josh's GitHub and account settings" item 5). So `origin`'s tags are the fixed record of what production received, which is why the fetch may overwrite a local tag (`+` refspec, Step 4). Creation stays allowed so the workflow can tag.
- **Today:** the repo has no `phase-*` tag (`git tag --list` empty, 2026-10-19), and none is made until the first real release before launch (Q-0113).

### Step 2. What "still reads" means (*planner's choice*)
A static check cannot see what the app reads. The rule:
- **Reads** = the object exists in the previous release tag and is **not** listed in that tag's `supabase/retired.json`.
- **Removal takes two releases:** release N stops reading the object and lists it in `supabase/retired.json` (the code-reviewer checks no code at that commit reads it); release N+1 may drop or rename it.
- An object created after the previous tag (in a migration that tag does not have) may be dropped or renamed freely: the previous release never had it.
- Without the retired list nothing released could ever be removed, which would contradict "add before they remove" (11 Operations).

**`supabase/retired.json` format:** `{ "retired": [ { "kind": "<kind>", "name": "<name>", "ticket": "EZD-xxx", "reason": "<text>" } ] }`.
- `kind` is one of `table`, `view`, `materialized_view`, `function`, `procedure`, `type`, `domain`, `schema`, `sequence`, `extension`, `column`.
- `name` is lower case, unquoted and schema-qualified: `column` has 3 dot-separated segments, `schema` 1, every other kind 2. Function names carry no argument list.
- A retired table also covers its columns.
- This ticket creates the file as `{ "retired": [] }`. It sits outside `supabase/migrations/`, so it does not trigger `.github/workflows/supabase-dev.yml` (paths `supabase/migrations/**`, docs/architecture.md `### Local database` Cloud dev; Q-0107) and check C5 does not read it (`scripts/conventions/check.mjs` `MIGRATIONS = 'supabase/migrations'`).
- A base tag without the file is read as an empty list (*planner's choice*; cannot occur in practice: every tag is made after this ticket merges, Step 1 Today).

### Step 3. SQL scan (`scripts/release/sql-scan.mjs`; Node 22 built-ins only)
- `stripComments(sql)` removes `-- …` and `/* … */`; keeps string literals and dollar-quoted bodies.
- `splitStatements(sql)` splits on `;` outside single quotes, double-quoted identifiers and dollar-quoted bodies (`$$…$$`, `$tag$…$tag$`).
- **Names:** unquoted identifiers lower-cased; `"Quoted"` identifiers kept as written; a missing schema is `public`; `if exists`, `if not exists`, `only` skipped.
- `findDestructive(statement)` returns fully qualified `{ kind, name }` items:
  - `drop (table|view|materialized view|function|procedure|type|domain|schema|sequence|extension) [if exists] n1[, n2…]`: one item per name; a function's argument list is ignored.
  - In `alter table <t> …`, each top-level comma-separated action on its own: `drop [column] [if exists] <c>` → `column t.c` (the word `column` is optional in Postgres); `rename [column] <c> to <d>` → `column t.c`; `rename to <u>` → `table t`; `set schema <s>` → `table t`; ignored: `drop constraint …`, `alter column <c> drop default|not null|identity|expression`, `rename constraint …`.
  - `alter (view|materialized view|function|procedure|type|domain|sequence|schema) <n> … rename to | set schema` → that object; `alter type <n> rename value | rename attribute` → `type n`.
  - **Not destructive** (the app does not read them): `drop index`, `drop trigger`, `drop policy`, `drop constraint`, `alter index … rename`. A widened check constraint (drop, then add) therefore passes (docs/architecture.md `### Tenancy tables (EZD-005)`: enumerated values are `check` constraints, "widening is add before remove").
  - **Not checked:** `truncate`, `alter column … type` (outside the ticket's "drops or renames"; section 9).
- `findCreated(statement)`: `create [or replace] (table|view|materialized view|function|procedure|type|domain|schema|sequence|extension) [if not exists] <n>`; `alter table <t> add [column] [if not exists] <c>` → `column t.c`; a table created after the tag covers all its columns.
- `findUnverifiable(statement)` flags any drop ending in `cascade` (dependents cannot be checked statically), and any `drop <kind>`, `drop column`, `rename to`, `rename column`, `rename value` or `set schema` text inside a string literal or dollar-quoted body (e.g. `do $$ … execute 'drop table x' … $$`, or a function body).

### Step 4. The check (`scripts/release/check-migrations.mjs`)
- **Pure core** `checkMigrations({ baseTag, released, retired, current })` → `{ ok, notes, violations }` (section 3). New migrations = files in `current` not in `released`.

| ID | Fails when |
| --- | --- |
| M0 | In GitHub Actions (`GITHUB_ACTIONS === 'true'`: CI on the phase PR, or the release workflow) the release tags cannot be fetched from `origin` (fails closed). Locally a failed fetch is the warning `tags_not_fetched`, not M0 |
| M1 | A new migration drops or renames an object that is (1) not created by a new migration with a version ≤ its own and (2) not retired in the **base tag's** `retired.json`, nor inside a retired table there |
| M2 | A released migration is changed at the head (text compared after normalizing line endings to LF; `.gitattributes` `* text=auto eol=lf`) or removed |
| M3 | A new migration's 14-digit version is ≤ the newest released version (`supabase db push` refuses out-of-order files without `--include-all` *(builder confirms)*; docs/architecture.md `## Migrations` file names) |
| M4 | `findUnverifiable` matches in a new migration |
| M5 | The head's `supabase/retired.json` is missing, not JSON, or has a wrong shape, kind or segment count. Checked even when no tag exists |

- **No release tag yet.** The CLI prints `no release tag yet: nothing is released` and checks M5 only. This is the state until the first real release before launch (Q-0113; vault/plans/EZD-023b.md Step 6 step 16): nothing is live, so nothing can break a released build.
- **CLI:** `node scripts/release/check-migrations.mjs [--root <dir>] [--base <tag>] [--head <git ref>] [--no-fetch]`. `--root` defaults to the current folder; every git call runs with `-C <root>`. `--base` defaults to `previousReleaseTag(listReleaseTags(git))`. `--head` defaults to the working tree (`<root>/supabase/migrations/*.sql`, `<root>/supabase/retired.json`); with a ref it reads files through `git ls-tree` and `git show <ref>:<path>` (EZD-023b's release workflow passes `--base <highest tag below the new name> --head <sha>`, vault/plans/EZD-023b.md Step 6 step 8). Base files are always read from git. Output: one line per violation `[Mn] <file>: <object> <detail>`, then one summary line naming the base tag (section 6). Exit 1 on any violation, else 0.
- **Tag fetch (every run, locally and in CI).** Before listing tags the CLI runs `git fetch --no-tags origin "+refs/tags/phase-*:refs/tags/phase-*"` with `GIT_TERMINAL_PROMPT=0` and a 30 s timeout (*planner's choice*), adding `--depth=1` only when `git rev-parse --is-shallow-repository` prints `true`. ci.yml's `actions/checkout@v4` uses its defaults (depth 1, no tags *(builder confirms)*; `.github/workflows/ci.yml`), so CI gets each tag's commit only; EZD-023b's release job checks out with `fetch-depth: 0` (vault/plans/EZD-023b.md Step 3 step 1) and is never made shallow (T15 (f)). A glob refspec that matches no tag on `origin` is a successful fetch, not M0 (today's state on the Phase 0 PR; T11 (b)) *(builder confirms git's exit code)*.
  - In GitHub Actions: a failed fetch → **M0**; `--no-fetch` is ignored.
  - Locally: the gate's `lint` runs the check, so every gate run fetches the newest tags first; worktrees share the main checkout's tags. A failed fetch (offline, `origin` unreachable) prints `tags_not_fetched` and the check goes on with local tags (*planner's choice*: less strict, never stricter; CI on the phase PR fails closed).
  - `--no-fetch` (local only) skips the fetch and prints `tags_not_fetched (--no-fetch)`; only tests use it.
  - Tests use a local bare repository as `origin` and never touch the network (vault/tickets/README.md rule 4; CLAUDE.md rule 6).

### Step 5. Wiring and docs
- **Root `package.json` `lint`** (extend, do not replace; current value on develop: `node scripts/conventions/check.mjs && pnpm -r --if-present --filter "!./spikes/**" run lint`). Insert `node scripts/release/check-migrations.mjs` after the conventions check and before the fan-out (T3). `test`, `typecheck`, `build` and the `db:*` scripts are not touched.
- **Chain of failure:** `scripts/gate.mjs` runs `lint` (`required = ['typecheck', 'lint', 'test', 'build']`); `.github/workflows/ci.yml` runs `node scripts/gate.mjs .` on the PR to `main` and by hand (EZD-002; Q-0021; `gate` is the required check on `main`, Q-0144 (a)). No ci.yml edit (docs/architecture.md `### CI`: add a check through a script the gate already runs; ci.yml is Josh's). The release workflow re-runs the check on the merge commit before it changes production (vault/plans/EZD-023b.md Step 6 step 8, `migration_check_failed`).
- **`supabase/retired.json`:** new, `{ "retired": [] }`.
- **`docs/architecture.md`**, under existing headings only (the 13 `##` headings of `scripts/conventions/__tests__/architecture-doc.test.mjs` REQUIRED_HEADINGS stay as they are, EZD-000 T5):
  - `## Migrations`: the intro sources line and the bullet "Add before remove: … check by EZD-023" now cite `EZD-023a`, and a new `### Release safety (EZD-023a)` goes after `### Row-level security (EZD-006)` (still before `## Errors and logging`, so EZD-004a T18's `### Local database` placement check is unaffected). It covers: the tag format; tags are made only by the release workflow on GitHub (EZD-023b); the tag fetch (every run; fails closed in GitHub Actions, warns `tags_not_fetched` locally); "reads" (Step 2) and the two-step removal through `supabase/retired.json`; M0–M5; what is not checked (indexes, triggers, policies, constraints, `truncate`, column type changes); "never edit a released migration".
  - `## Machine checks`: edit the existing row `| — | Destructive migrations (drop or rename) | CI check | EZD-023 |` (before `### CI`) so its Check cell is `` `scripts/release/check-migrations.mjs` (root `lint`) `` and its Built by cell is `EZD-023a`.
- No new dependency (CLAUDE.md rule 7); no Dependencies row.

### Files
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `scripts/release/tags.mjs` | New | builder | Step 1 |
| `scripts/release/sql-scan.mjs` | New | builder | Step 3 |
| `scripts/release/check-migrations.mjs` | New | builder | Step 4 |
| `supabase/retired.json` | New | builder | Step 2 |
| `package.json` (root) | Change (`lint` only) | builder | Step 5 |
| `docs/architecture.md` | Change | builder | Step 5 |
| `scripts/release/__tests__/git-fixture.mjs` | New | test-author | Temp repos with a bare `origin` (section 3); EZD-023b reuses it |
| `scripts/release/__tests__/sql-scan.test.mjs`, `tags.test.mjs`, `check-migrations.test.mjs` | New | test-author | Section 4; `node:test`, found by the root `node --test --test-concurrency=4 "scripts/**/*.test.mjs"` |
| `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**`, `.claude/**` | Not touched (except the orchestrator's precondition in `.claude/hooks/guard-paths.mjs`) | — | Josh's or the orchestrator's |

**Data:** none. No table, column, policy, migration or `schema_version` change; `supabase/retired.json` is a repo file. No money fields.

## 2. Sources
- `vault/spec/sections/11-non-functional-requirements.md` **Operations** (Round 26): "Releases: production is updated only by promoting a tagged build at a phase gate or on Josh's approval"; "Migrations add before they remove: a release never drops or renames something the previous release still reads, so the previous deploy can be restored at any time". **Performance:** no target applies (no screen, no browser code).
- `02-product-overview.md` Named tools: "Database migrations: Supabase CLI migrations, timestamp-named"; "CI and repository: GitHub with GitHub Actions".
- `03-data-model.md` intro and Architecture rule 5: no table or model change here. `04-app-shell-and-global-ui.md`: no screen.
- Decisions: R26 R11 (conventions file), R12 (environments, promotion-only releases, add-before-remove migrations), R33 (a dependency on a split ticket's base number means all parts) (`vault/spec/decisions/13b-round-26.md`). Q-0006, Q-0019 read as Q-0114 (`decisions/process.md`); Q-0106, Q-0107 (`decisions/11-non-functional-requirements.md`); Q-0113 (`decisions/02-product-overview.md`); Q-0007, Q-0042, Q-0112, Q-0125, Q-0144, Q-0148, Q-0153 (`vault/questions/QUESTIONS.md`).
- Code on develop (read 2026-10-19): root `package.json` (`lint`, `test` with `db:up` first and `--test-concurrency=4`); `scripts/gate.mjs` (`required`, `CI: '1'`, gate lock `takeLock`, `SECURITY_PATHS` includes `scripts/release/` and `package.json`); `.github/workflows/ci.yml` (`actions/checkout@v4` defaults, `run: node scripts/gate.mjs .`); `.gitattributes`; `supabase/migrations/` (14 files, `20261019153713_create_health_function.sql` … `20261019170007_restrict_api_table_grants.sql`); `scripts/conventions/check.mjs` (C5 reads `supabase/migrations` only); `scripts/conventions/__tests__/architecture-doc.test.mjs` (T5 headings); `scripts/db/__tests__/db.test.mjs` (EZD-004a T18); `.claude/hooks/guard-paths.mjs`, `guard-bash.mjs`; `docs/architecture.md`.
- Earlier plans: `vault/plans/EZD-002.md`, `EZD-004a.md`, `EZD-004c.md`, `EZD-005a.md` (Risks: renaming after merge fails add-before-remove), `EZD-023b.md` (Step 3 step 1; Step 6 steps 4, 7, 8, 16; "Josh's GitHub and account settings" item 5); this plan extends their files and replaces nothing.
- STATUS deviations applied: EZD-000 (CLAUDE.md v2 rule numbers; T5 checks only the 13 required `##` headings in order); EZD-001 (root node tests run concurrently, 4 files at a time; never filtered by scope); EZD-002 (none touching this plan; T2 rules cover workflow files only, this ticket adds none); EZD-004a (`docs/architecture.md` EZD-004 references now EZD-004a); EZD-004b (none touching this plan).
- Research: no report covers this ticket (`vault/research/INDEX.md`: R-001 is EZD-004c's).
- Mockup: none (`tickets.json` `mockups: []`).

## 3. Interface contract
| Kind | Name or path | Details |
| --- | --- | --- |
| export | `RELEASE_TAG_RE` (`scripts/release/tags.mjs`) | `/^phase-(0\|[1-9]\d*)(?:\.([1-9]\d*))?$/` |
| export | `parseReleaseTag(name)` | → `{ phase: number, patch: number }` (`patch` 0 for `phase-N`) or `null` |
| export | `compareReleaseTags(a, b)` | negative / 0 / positive, by phase then patch |
| export | `listReleaseTags(git)` | `git(args: string[]) → string` (stdout) is injected; runs `tag --list 'phase-*'`; returns parsing tags sorted ascending |
| export | `previousReleaseTag(tags, below?)` | highest tag, or highest tag lower than `below`; `null` when none |
| export | `stripComments(sql)`, `splitStatements(sql)` (`sql-scan.mjs`) | → `string`; → `string[]` |
| export | `findDestructive(stmt)`, `findCreated(stmt)` | → `Array<{ kind, name }>`; `kind` uses the retired.json kind words; `name` fully qualified (`public.fixture_item.legacy_note`, `public.health`, `extra`) |
| export | `findUnverifiable(stmt)` | → `Array<{ reason: 'cascade' \| 'dynamic' }>` (empty when clean) |
| export | `checkMigrations({ baseTag, released, retired, current })` (`check-migrations.mjs`) | `released`, `current`: `Record<fileName, sqlText>` keyed by basename (`20261101000000_create_fixture.sql`); `retired`: the base tag's entry array; → `{ ok: boolean, notes: string[], violations: Array<{ id: 'M1'\|'M2'\|'M3'\|'M4', file, object, detail }> }`; `file` = `supabase/migrations/<name>`; `ok === (violations.length === 0)` |
| export | `validateRetired(text)` | `text` = file contents or `null` (missing) → `{ entries, errors: string[] }`; the CLI turns each error into an `M5` line with file `supabase/retired.json` |
| CLI | `node scripts/release/check-migrations.mjs [--root <dir>] [--base <tag>] [--head <ref>] [--no-fetch]` | exit 1 on any violation, else 0; stdout lines `[Mn] <file>: <object> <detail>`; M0 line file is `origin`; tokens tests match: `[M0]`–`[M5]`, `no release tag yet`, `tags_not_fetched`, `tags_not_fetched (--no-fetch)`, the base tag name |
| env | `GITHUB_ACTIONS` | `'true'` → fail closed (M0), `--no-fetch` ignored; anything else → local mode |
| file | `supabase/retired.json` | format in Step 2; committed as `{ "retired": [] }` |
| script | root `package.json` `scripts.lint` | exactly `node scripts/conventions/check.mjs && node scripts/release/check-migrations.mjs && pnpm -r --if-present --filter "!./spikes/**" run lint` |
| test helper | `scripts/release/__tests__/git-fixture.mjs` (test-author; *planner's choice* names) | `makeRepo()` → `{ origin, work, cleanup }`: a bare `origin` and a working clone, each under its own `fs.mkdtempSync(os.tmpdir() + '/ezd-023a-')` (test files run 4 at a time, EZD-001); `git(dir, ...args)` runs git with `-c user.name=… -c user.email=… -c commit.gpgsign=false -c tag.gpgSign=false`, branch `main`; `commitFiles(dir, files, message)`; `tagAnnotated(dir, name)`; `cloneFrom(origin, { depth?, noTags? })` using `file://`; `runCheck(cwd, args, env)` → `{ status, stdout }`, spawning `node <repo>/scripts/release/check-migrations.mjs` with an env copied from `process.env` minus `GITHUB_ACTIONS`, then the case's `env` merged in. EZD-023b imports these names |
| docs | `docs/architecture.md` | `### Release safety (EZD-023a)` under `## Migrations`; Machine checks row Check `scripts/release/check-migrations.mjs` (root `lint`), Built by `EZD-023a` |

## 4. Tests
All `node:test` with a top-level `describe('EZD-023a …')` (docs/architecture.md `### Test scope (Q-0006)`). Root repo-script tests are never filtered by scope, so they run on every ticket (EZD-001). `FIX` is the base migration `20261101000000_create_fixture.sql`:

```sql
create table public.fixture_item (id uuid primary key, legacy_note text);
create view public.fixture_view as select id from public.fixture_item;
create type public.fixture_kind as enum ('a','b');
create schema extra;
create function public.health() returns text language sql as $$ select 'ok' $$;
```

released as tag `phase-0` with `supabase/retired.json` = `{"retired":[]}`. New migrations use versions `20261102000000` and later. Unit rows call `checkMigrations` directly; git rows use `git-fixture.mjs`. Every spawned check gets `GITHUB_ACTIONS` removed unless the case sets it (the gate's CI run has `GITHUB_ACTIONS=true` and must not reach GitHub). Tests match exit codes, violation IDs, file names and object names, never message wording (section 6 wording is not asserted).

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 `EZD-023a done when: CI fails a fixture migration that drops a column the previous tag reads` | AC-EZD-023a-1 | unit (git, no network) | Bare `origin`; commit `FIX` on `main`, annotated tag `phase-0`, push both. Commit `20261102000000_drop_legacy_note.sql` = `alter table public.fixture_item drop column legacy_note;`, push. `git clone --depth 1 --no-tags file://<origin>`. In the clone run the check with env `GITHUB_ACTIONS=true`, `CI=1` | Exit 1; output contains `[M1]`, `supabase/migrations/20261102000000_drop_legacy_note.sql`, `public.fixture_item.legacy_note` and `phase-0` | Ticket Done when; 11 Operations; ci.yml (`actions/checkout@v4` defaults, then the gate); Step 4 tag fetch |
| T2 Additive change passes in CI | AC-EZD-023a-1 | unit (git) | As T1, new migration `alter table public.fixture_item add column new_note text;` | Exit 0; output names `phase-0` | 11 Operations ("add before they remove") |
| T3 The gate runs the check | AC-EZD-023a-1 | unit | Root `package.json`; `scripts/gate.mjs` and `.github/workflows/ci.yml` read as text | `scripts.lint` equals the section 3 value; gate.mjs `required` includes `lint`; ci.yml contains `run: node scripts/gate.mjs .` | Step 5; scripts/gate.mjs; ci.yml. Does **not** run gate.mjs (one gate at a time, `takeLock`, Q-0114) |
| T4 Drops and renames refused | AC-EZD-023a-1 | unit | `FIX` released at `phase-0`. One new migration per case: (a) `alter table fixture_item drop column legacy_note`; (b) `ALTER TABLE "public"."fixture_item" DROP "legacy_note"`; (c) `alter table if exists only public.fixture_item drop column if exists legacy_note`; (d) `alter table fixture_item rename column legacy_note to note`; (e) `alter table fixture_item rename legacy_note to note`; (f) `alter table fixture_item rename to item`; (g) `drop table public.fixture_item`; (h) `drop view fixture_view`; (i) `drop function public.health()`; (j) `alter type fixture_kind rename value 'a' to 'c'`; (k) `alter table fixture_item set schema extra`; (l) `drop schema extra`; (m) `drop table fixture_item, other_table` | Each: `ok === false`, every violation `M1`. Objects: (a)–(e) `public.fixture_item.legacy_note`; (f), (g), (k) `public.fixture_item`; (h) `public.fixture_view`; (i) `public.health`; (j) `public.fixture_kind`; (l) `extra`; (m) both `public.fixture_item` and `public.other_table` | Steps 2–3; 11 Operations ("never drops or renames") |
| T5 Non-destructive changes pass | AC-EZD-023a-1 | unit | New migrations: `drop index fixture_item_idx`; `drop policy p on fixture_item`; `alter table fixture_item drop constraint fixture_item_check, add constraint fixture_item_check check (true)`; `alter table fixture_item alter column legacy_note drop not null`; `… alter column legacy_note drop default`; `drop trigger t on fixture_item`; `alter index a rename to b`; `alter table fixture_item rename constraint a to b`; `create or replace function public.health() returns text language sql as $$ select 'ok' $$`; `alter table fixture_item add column extra text`; a file holding only `-- drop column legacy_note` and `/* drop table fixture_item */` | `ok === true`, 0 violations | Step 3 "Not destructive"; docs/architecture.md `### Tenancy tables (EZD-005)` (widening is add before remove) |
| T6 Created after the tag | AC-EZD-023a-1 | unit | `…02…`: `create table public.tmp_x (a int, b int); alter table fixture_item add column temp_c text;`. `…03…`: `alter table tmp_x drop column b; drop table tmp_x; alter table fixture_item drop column temp_c;` | `ok === true` | Step 2 (the previous release never had them) |
| T7 Retired objects | AC-EZD-023a-1 | unit | (a) base `retired` lists `{kind:'column', name:'public.fixture_item.legacy_note'}`, new migration drops that column; (b) same entry only at the head, base `retired` `[]`; (c) base retires `{kind:'table', name:'public.fixture_item'}`, new migration drops column `legacy_note` then the table | (a) ok; (b) `M1` on `public.fixture_item.legacy_note`; (c) ok | Step 2 (a retirement must be released first) |
| T8 Released migrations are frozen | AC-EZD-023a-1 | unit | (a) head changes one character in `20261101000000_create_fixture.sql`; (b) head removes it; (c) head has the same text with CRLF | (a), (b) `M2` naming that file; (c) ok | Step 4 M2; `.gitattributes` `eol=lf` |
| T9 Out-of-order version | AC-EZD-023a-1 | unit | New migration `20261031000000_late.sql`, additive SQL | `M3` naming that file | Step 4 M3 |
| T10 Unverifiable | AC-EZD-023a-1 | unit | (a) `create table public.tmp_y (a int); drop table tmp_y cascade;`; (b) `do $$ begin execute 'drop table fixture_item'; end $$;`; (c) `create function f() returns void language plpgsql as $$ begin alter table fixture_item drop column legacy_note; end $$;` | Each: `ok === false` with an `M4` violation for that file | Step 3 `findUnverifiable` |
| T11 No tag yet | AC-EZD-023a-1 | unit (git) | Bare `origin` and clone, no tags on either; the working tree adds a migration dropping `legacy_note`. (a) no `GITHUB_ACTIONS`; (b) `GITHUB_ACTIONS=true` (re-validation addition: origin reachable, no `phase-*` tag, the Phase 0 PR's state today) | (a) Exit 0; output contains `no release tag yet`. (b) Exit 0; output contains `no release tag yet` and no `[M0]` | Step 4 (no tag yet; M0 only when tags cannot be fetched); Q-0113 |
| T12 retired.json shape | AC-EZD-023a-1 | unit (git, no tags) | As T11 (a); head's `supabase/retired.json` one case at a time: `not json`; `{"retired":[{"kind":"index","name":"public.x"}]}`; `{"retired":[{"kind":"column","name":"public.fixture_item"}]}`; file deleted | Each: exit 1 with `[M5]` | Step 2 format; Step 4 M5 |
| T13 Tag order | AC-EZD-023a-1 | unit | Tags `phase-0`, `phase-1`, `phase-1.2`, `phase-10`, `phase-2`, `v3`, `phase-01`, `phase-1.0` (through an injected `git`) | `listReleaseTags` → `phase-0, phase-1, phase-1.2, phase-2, phase-10` (ignores `v3`, `phase-01`, `phase-1.0`); `previousReleaseTag(tags, 'phase-2')` = `phase-1.2`; `previousReleaseTag(tags)` = `phase-10` | Step 1 |
| T14 Ref mode (used by EZD-023b) | AC-EZD-023a-1 | unit (git) | Tag `phase-0` = `FIX`; tag `phase-1` adds T1's drop migration; working tree clean at `phase-0`; `--no-fetch` | `--base phase-0 --head phase-1`: exit 1 with `[M1]`. `--base phase-0 --head phase-0`: exit 0 | Step 4 CLI; vault/plans/EZD-023b.md Step 6 step 8 |
| T15 Tag fetch: CI fails closed, local run fetches new tags | AC-EZD-023a-1 | unit (git) | (a)–(c), (e): a clone whose `origin` URL points to a missing path, no local tags. (a) `GITHUB_ACTIONS=true`; (b) none; (c) none, `--no-fetch`; (e) `GITHUB_ACTIONS=true`, `--no-fetch`. (d): bare `origin` with `FIX` on `main`; full clone (`git clone --no-tags`) made before `phase-0` exists; then `phase-0` created and pushed **in `origin` only**; the clone adds T1's drop migration; no `GITHUB_ACTIONS`. (f): (d)'s setup, full clone, `GITHUB_ACTIONS=true`, then `git rev-parse --is-shallow-repository` in the clone | (a) Exit 1 with `[M0]`. (b) Exit 0; output contains `tags_not_fetched` and `no release tag yet`. (c) Exit 0; contains `tags_not_fetched (--no-fetch)` and `no release tag yet`. (d) Exit 1 with `[M1]` naming `public.fixture_item.legacy_note` and `phase-0`; afterwards `git tag --list phase-0` in the clone prints `phase-0`. (e) Exit 1 with `[M0]`. (f) Exit 1 with `[M1]`; the shallow check prints `false` | Step 1 (tags made on GitHub, Q-0106); Step 4 tag fetch; vault/plans/EZD-023b.md Step 3 step 1 (`fetch-depth: 0`) |
| T16 Real repo passes | AC-EZD-023a-1 | unit | `runCheck(<repo root from the test file's path>, ['--no-fetch'], {})` (no `GITHUB_ACTIONS`; never reaches GitHub). Develop has 14 migrations and no `phase-*` tag | Exit 0 | Step 5 (the check must not fail the clean repo); Step 1 Today; Q-0113 |
| T17 Docs | AC-EZD-023a-1 | unit | `docs/architecture.md`; `supabase/retired.json`; `node scripts/conventions/check.mjs .` | A `### Release safety (EZD-023a)` heading sits between `## Migrations` and the next `##` and its text contains `supabase/retired.json`, `phase-`, `tags_not_fetched`, `M0`, `M1`, `M2`, `M3`, `M4`, `M5`. A Machine checks table row before `### CI` has last cell `EZD-023a` and contains `scripts/release/check-migrations.mjs`. `validateRetired(<file text>).errors` is `[]`. The conventions check exits 0 | Step 5; EZD-000 T5; C1–C10 |
| T18 Gate (orchestrator) | — | gate | `node scripts/gate.mjs .claude/worktrees/EZD-023a` | Exit 0: `typecheck`, `lint`, `test`, `build` pass | CLAUDE.md rule 12 |

## 5. Visual checklist
None (no screen).

## 6. Proposed wording
Developer-facing script output only (no product screen; tests do not assert it). Josh approves at Stage 2.
| Where | Text |
| --- | --- |
| check-migrations, no tag | `no release tag yet: nothing is released` |
| check-migrations, local fetch failed | `tags_not_fetched: could not fetch release tags from origin; checking against local tags` |
| check-migrations, `--no-fetch` | `tags_not_fetched (--no-fetch)` |
| M0 | `[M0] origin: release tags could not be fetched` |
| M1 | `[M1] <file>: <object> is dropped or renamed but <base tag> still reads it (retire it in supabase/retired.json and release that first)` |
| M2 | `[M2] <file>: released migration changed` / `[M2] <file>: released migration removed` |
| M3 | `[M3] <file>: version is not newer than the newest released migration <version>` |
| M4 | `[M4] <file>: cannot be checked: drop with cascade` / `[M4] <file>: cannot be checked: drop or rename inside a string or function body` |
| M5 | `[M5] supabase/retired.json: <missing \| not valid JSON \| entry <n>: <reason>>` |
| Summary | `migration check passed against <base tag>` / `migration check failed against <base tag>: <n> violation(s)` |

## 7. Security review
security-review: yes. Areas: migrations (production release safety) and API (the gate now fetches from GitHub). The gate flags `scripts/release/` and `package.json` as production-sensitive paths (`scripts/gate.mjs` SECURITY_PATHS; vault/PROCESS-EZDRAFT.md section 7; Q-0112), so the review runs either way. Points to check: fail-closed M0 in Actions; the fetch never pushes, needs no credentials, uses `GIT_TERMINAL_PROMPT=0` and a timeout; tests never reach the network; `drop policy` passes on purpose (policy changes are reviewed per ticket). *Re-validation change:* was "no".
Reviewers needed: code-reviewer always · calc-auditor no (no calculations) · ui-verifier no (no screen) · security-reviewer yes.

## 8. Complexity and model recommendation
**high** (was medium): a new pattern (a SQL tokenizer that must respect quotes and dollar bodies, plus a git fixture harness with bare origins and shallow clones that EZD-023b reuses) on a production-sensitive path, where a mistake either breaks every gate's `lint` or lets a destructive migration reach production. Suggested test-author Fable 5.1, builder Fable 5.1; code-reviewer and security-reviewer Fable 5.1 (PROCESS.md section 4); Opus 5.5 when Fable is unavailable.

## 9. Dependencies
- **EZD-002** (row): CI runs only on the PR to `main` and by hand; a later check joins through a script the gate already runs (docs/architecture.md `### CI`). ci.yml and `scripts/gate.mjs` are Josh's (`.claude/hooks/guard-paths.mjs`).
- **EZD-004a, EZD-004b, EZD-004c** (row says EZD-004; R26 R33, Q-0148): `supabase/migrations/` and its naming (EZD-004a; check C5), the `supabase` CLI, the 14 migrations T16 runs against; EZD-004c's `supabase-dev.yml` applies migrations to the cloud dev project on develop pushes (Q-0107), which this check does not cover (it guards releases, not dev). EZD-004b adds nothing this plan uses.
- **EZD-000, EZD-001** (transitive, not in the row; used directly): the root `lint` script this ticket extends; `## Migrations` and Machine checks text; REQUIRED_HEADINGS (EZD-000 T5); checks C1, C5; repo-script tests never filtered and run 4 files at a time (EZD-001).
- **Dependent:** EZD-023b reads `tags.mjs`, the `--base`/`--head` CLI and `git-fixture.mjs` (vault/plans/EZD-023b.md Depends on).
- **Precondition:** the `scripts/release/` builder exception (section 1; Q-0125 (a)).
- **Ticket size.** 10 files (6 builder, 4 test) and 17 test rows, above the size rule's "about 10 tests" (PROCESS.md section 6). Kept as one ticket, as EZD-006 was: the rows are small case tables over three short scripts, and the tests share one fixture. If the orchestrator splits it: part 1 = `tags.mjs`, `sql-scan.mjs`, the `checkMigrations` / `validateRetired` core (T4–T10, T13); part 2 = CLI, tag fetch, wiring, docs, `retired.json` (T1–T3, T11, T12, T14–T17).
- Risks:
  - **Static scan limits.** Column type changes, `truncate`, and view or function changes that alter the result shape are not checked; the code-reviewer watches for them.
  - **The retired list is a claim.** That nothing at the tag still reads a retired object is checked by the code-reviewer, not a machine.
  - **Local tags.** An offline gate warns `tags_not_fetched` and checks against local tags: less strict, never stricter. CI on the phase PR fails closed (M0) and the release workflow re-runs the check on the merge commit.
  - **The gate talks to GitHub.** Each local gate run makes one `git fetch` of `phase-*` tags from the public repo (`https://github.com/IronFrame414/EZ-Draft.git`), bounded by the 30 s timeout; it writes only `refs/tags/phase-*`.
  - **Agents cannot run the check by hand.** `.claude/hooks/guard-bash.mjs` line 23 denies any agent command matching `node …scripts/release/…`; the builder and test-author run it through `node --test` (child processes) and the gate's `lint`, which the hook does not see.
  - **Tag whose build never went live** (`promote_failed` / `verify_failed`): its migrations count as released, which is correct because production has them (vault/plans/EZD-023b.md Risks).
  - **Run time.** About 35 short git processes per run; root repo tests run on every ticket, 4 files at a time on the Mac mini (Q-0114; vault/PROCESS-EZDRAFT.md section 8). Fixtures stay small.
  - **First real use.** No tag exists until the first real release (Q-0113), so until then only `retired.json` is checked; pre-launch migrations may drop and rename freely, which is correct because no live build reads them.
  - **Tag creation is not restricted.** The ruleset blocks updating and deleting `phase-*` tags, not creating them; an agent with the Write role (Q-0108) could push a new one, which would stop the next release at `not_newer` (vault/plans/EZD-023b.md Step 6 step 7) and could make this check less strict. The code-reviewer and the phase gate's "Production-sensitive changes" section watch for tag pushes.

## 10. Open questions
None. Level 1 answers recorded in the plan: the `scripts/release/` builder exception (Q-0125 (a), section 1 Precondition); the `EZD-004` row means all three parts (R26 R33, Q-0148).
