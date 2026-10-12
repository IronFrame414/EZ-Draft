# EZD-023a · Release safety: migration check

Phase: 0 · Planned by: planner · Date: 2026-10-11 · Status: planned

## Ticket (copied from the phase file)
Scope: A CI check (run through the gate's lint step) that refuses a migration which drops or renames something the previous tag still reads, plus edited or deleted released migrations. Split from EZD-023 (Q-0042); plan Part A.
Done when: CI fails a fixture migration that drops a column the previous tag reads.
Depends on: EZD-002, EZD-004. Also, not in the ticket row:
- **EZD-002** (the row). Its rule for later tickets: add a CI check by putting it in a script the gate already runs, never by editing `.github/workflows/ci.yml` (vault/plans/EZD-002.md Step 4). CI runs only on the phase PR to `main` and by manual dispatch (commit aad5540; ci.yml `on:`). Only Josh edits `ci.yml` and `scripts/gate.mjs` (`.claude/hooks/guard-paths.mjs`).
- **EZD-004** (the row). `supabase/migrations/` and its timestamp naming, and the `supabase` CLI (vault/plans/EZD-004.md Steps 1–2). EZD-004's plan also says "Prod receives migrations only through EZD-023's promote script". That promote script is EZD-023b, which re-runs this check.
- **EZD-000 and EZD-001** (transitive, used directly):
  - the root `lint` script that this ticket extends (EZD-000 Step 1);
  - the `## Migrations` rule "Add before remove … check by EZD-023";
  - the Machine checks row "destructive migrations (EZD-023)";
  - the rule "no new `##` heading" (EZD-000 T5), and checks C1 and C5;
  - EZD-001 Step 6: root `scripts/**/*.test.mjs` tests always run in full on every ticket (Q-0006);
  - EZD-001 Step 6.4: Josh's gate change adds a one-gate-at-a-time lock (Q-0019).
- **EZD-023b depends on this ticket.** It reads `scripts/release/tags.mjs`, the `--base`/`--head` mode of the check, and `scripts/release/__tests__/git-fixture.mjs`.
Spec ref: Non-functional · Operations; R26 R12

## Sources read
- Spec:
  - `vault/spec/sections/11-non-functional-requirements.md`. Operations: "Releases: production is updated only by promoting a tagged build at a phase gate or on Josh's approval"; "Migrations add before they remove: a release never drops or renames something the previous release still reads, so the previous deploy can be restored at any time". Also Performance.
  - `02-product-overview.md`. Named tools: "Database migrations: Supabase CLI migrations, timestamp-named"; "CI and repository: GitHub with GitHub Actions".
  - `03-data-model.md`: intro and Architecture rule 5.
  - `04-app-shell-and-global-ui.md`: read; no screen here.
- Decisions: R26 R11, R12; R33. Q-0006, Q-0019 (decisions.md · Build answers (Josh)). Q-0007, Q-0010, Q-0042 (QUESTIONS.md).
- Process and kit: `vault/PROCESS.md`, `vault/KNOWN-LIMITS.md`, `vault/tickets/README.md`, `CLAUDE.md`, `scripts/gate.mjs` (`required` includes `lint`; sets `CI=1`), `.github/workflows/ci.yml` (`actions/checkout@v4` with defaults, then `node scripts/gate.mjs .`), `.claude/hooks/guard-paths.mjs`, `.gitattributes` (`eol=lf`).
- Earlier plans:
  - `vault/plans/EZD-000.md`, `EZD-001.md`, `EZD-002.md`, `EZD-004.md`.
  - `EZD-005.md`. Its Risks ask that a widened check constraint be treated as non-destructive.
  - This plan extends their files and replaces nothing.
- Mockup: none (no screen; `tickets.json` `mockups: []`).

Technical choices that no source makes are marked *planner's choice (CLAUDE.md rule 4)*. The code-reviewer confirms them at plan review. Tool behaviour that comes from the planner's knowledge (October 2026), not from a vault source, is marked *(builder confirms)*.

## Approach

### Step 1: Release tags (`scripts/release/tags.mjs`)
- **Format** *(planner's choice)*:
  - `phase-<N>` for the release at the end of phase N.
  - `phase-<N>.<k>` (k ≥ 1) for a release Josh approves between phase gates. This follows 11 Operations: "at a phase gate or on Josh's approval".
  - Regex: `^phase-(0|[1-9]\d*)(?:\.([1-9]\d*))?$`.
  - Order: by N, then by k. A plain `phase-N` counts as k = 0.
- **Exports:**
  - `RELEASE_TAG_RE`;
  - `parseReleaseTag(name)`, which returns `{ phase, patch }` or `null`;
  - `compareReleaseTags(a, b)`;
  - `listReleaseTags(git)`: every local tag that parses, sorted ascending (`git tag --list 'phase-*'`);
  - `previousReleaseTag(tags, below?)`: the highest tag, or the highest tag lower than `below`.
- **No ancestry check.** Release tags sit on `main`'s merge commits, and those are not ancestors of `develop` (Q-0007 flow). So "previous tag" means the highest release tag that exists.
- Tags are created only by Josh, through EZD-023b's `release:tag`.

### Step 2: What "still reads" means (*planner's choice*; the code-reviewer confirms)
A static check cannot see what the app reads. The rule is:
- **Reads** means the object exists in the previous release tag and is **not** listed in that tag's `supabase/retired.json`.
- **Removal takes two releases:**
  1. Release N stops reading the object and lists it in `supabase/retired.json`. The code-reviewer checks that no code at that commit reads it.
  2. Release N+1 may drop or rename the object.
- An object created after the previous tag may be dropped or renamed freely, because the previous release never had it. "Created after the tag" means created in a migration that tag does not have.
- Without the retired list, nothing released could ever be removed, which would contradict "add before they remove".

**`supabase/retired.json` format:** `{ "retired": [ { "kind": "<kind>", "name": "<name>", "ticket": "EZD-xxx", "reason": "<text>" } ] }`.
- `kind` is one of `table`, `view`, `materialized_view`, `function`, `procedure`, `type`, `domain`, `schema`, `sequence`, `extension`, `column`.
- `name` is lower case, unquoted and includes the schema. A `column` name has 3 segments, a `schema` name has 1, and every other kind has 2. Function names carry no argument list.
- A retired table also covers its columns.
- This ticket creates the file as `{ "retired": [] }`.

### Step 3: SQL scan (`scripts/release/sql-scan.mjs`; Node 22 built-ins only)
- **`stripComments(sql)`** removes `-- …` and `/* … */`. It keeps string literals and dollar-quoted bodies.
- **`splitStatements(sql)`** splits on `;` outside quotes, double-quoted identifiers and dollar-quoted bodies (`$$…$$` and `$tag$…$tag$`).
- **Names are normalized:**
  - unquoted identifiers are lower-cased;
  - `"Quoted"` identifiers are kept as written;
  - a missing schema is `public`;
  - `if exists`, `if not exists` and `only` are skipped.
- **`findDestructive(statement)`** returns fully qualified `{ kind, name }` items:
  - `drop (table|view|materialized view|function|procedure|type|domain|schema|sequence|extension) [if exists] n1[, n2…]` gives one item per name. A function's argument list is ignored.
  - In `alter table <t> …`, each top-level comma-separated action is read on its own:
    - `drop [column] [if exists] <c>` gives `column t.c`. The word `column` is optional in Postgres.
    - `drop constraint …` is ignored.
    - `alter column <c> drop default|not null|identity|expression` is ignored.
    - `rename [column] <c> to <d>` gives `column t.c`.
    - `rename constraint …` is ignored.
    - `rename to <u>` gives `table t`.
    - `set schema <s>` gives `table t`.
  - `alter (view|materialized view|function|procedure|type|domain|sequence|schema) <n> … rename to | set schema` gives that object.
  - `alter type <n> rename value | rename attribute` gives `type n`.
  - **Not destructive**, because the app does not read these: `drop index`, `drop trigger`, `drop policy`, `drop constraint`, `alter index … rename`. So a widened check constraint (drop, then add) passes (vault/plans/EZD-005.md Risks).
  - **Not checked:** `truncate` and `alter column … type`. They are outside the ticket's "drops or renames" (Risks).
- **`findCreated(statement)`** finds:
  - `create [or replace] (table|view|materialized view|function|procedure|type|domain|schema|sequence|extension) [if not exists] <n>`;
  - `alter table <t> add [column] [if not exists] <c>`, which gives `column t.c`;
  - a table created after the tag covers all of its columns.
- **`findUnverifiable(statement)`** flags:
  - any drop that ends in `cascade`, because its dependents cannot be checked statically;
  - any `drop <kind>`, `drop column`, `rename to`, `rename column`, `rename value` or `set schema` text inside a string literal or a dollar-quoted body. Examples: `do $$ … execute 'drop table x' … $$`, or a function body.

### Step 4: The check (`scripts/release/check-migrations.mjs`)
- **Pure core:** `checkMigrations({ baseTag, released, retired, current })` returns `{ ok, notes, violations: [{ id, file, object, detail }] }`.
  - `released` is the migration files at the base tag (name → text).
  - `retired` is the base tag's retired list.
  - `current` is the head's migration files.
- **New migrations** are the files in `current` that are not in `released`.
- **Violations:**

| ID | Fails when |
| --- | --- |
| M0 | In CI, the release tags cannot be fetched (the check fails closed) |
| M1 | A new migration drops or renames an object, and that object is (1) not created by a new migration with a version ≤ its own and (2) not retired in the **base tag's** `retired.json`, nor inside a retired table there |
| M2 | A released migration is changed at the head (text compared after normalizing line endings to LF) or removed |
| M3 | A new migration's 14-digit version is ≤ the newest released version. `supabase db push` refuses out-of-order files without `--include-all` *(builder confirms)* |
| M4 | `findUnverifiable` matches in a new migration |
| M5 | The head's `supabase/retired.json` is missing, is not JSON, or has a wrong shape, kind or segment count. This is checked even when no tag exists |

- **No release tag yet.** The check prints `no release tag yet: nothing is released` and checks M5 only. This is the state through Phase 0 until Josh's first `release:tag` (EZD-023b).
- **CLI:** `node scripts/release/check-migrations.mjs [--root <dir>] [--base <tag>] [--head <git ref>]`.
  - `--root` defaults to the current folder.
  - `--base` defaults to `previousReleaseTag(listReleaseTags())`.
  - `--head` defaults to the working tree: `<root>/supabase/migrations/*.sql` and `<root>/supabase/retired.json`.
  - With a ref, `--head` reads the files with `git ls-tree` and `git show <ref>:<path>`. EZD-023b uses this to compare a tag being promoted with the tag before it.
  - Base files are always read from git.
  - Output: one line per violation, `[Mn] <file>: <object> <detail>`, then a summary naming the base tag.
  - Exit code 1 if there is any violation, otherwise 0.
- **CI tag fetch.**
  - `actions/checkout@v4` fetches with depth 1 and no tags by default *(builder confirms)*, and ci.yml uses those defaults.
  - So when `GITHUB_ACTIONS === 'true'`, the CLI first runs `git fetch --no-tags --depth=1 origin "+refs/tags/phase-*:refs/tags/phase-*"`. A failed fetch gives M0.
  - Locally the CLI fetches nothing. The build PC is the checkout where Josh tags, and worktrees share its tags.
  - Tests use a local bare repository as `origin` and never touch the network.

### Step 5: Wiring and docs
- **Root `package.json` `lint`** (extend; do not replace). Insert `node scripts/release/check-migrations.mjs` right after EZD-000's `node scripts/conventions/check.mjs` and before the fan-out.
- **Chain of failure:** `scripts/gate.mjs` runs `lint` (gate.mjs `required`), and `.github/workflows/ci.yml` runs `node scripts/gate.mjs .`. So a destructive migration fails the phase PR. No ci.yml edit is needed (EZD-002 Step 4).
- **`supabase/retired.json`:** new, `{ "retired": [] }`.
- **`docs/architecture.md`**, under existing headings only (EZD-000 T5):
  - `## Migrations` gets a new `### Release safety (EZD-023a)`. It covers the tag format, "reads" as defined in Step 2, the two-step removal, M0–M5, what is not checked (indexes, triggers, policies, constraints, `truncate`, column type changes), and "never edit a released migration".
  - Fill in EZD-000's Machine checks row "destructive migrations" with `scripts/release/check-migrations.mjs (root lint) | EZD-023a`.
- No new dependency (CLAUDE.md rule 11).

## Files
| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `scripts/release/tags.mjs` | New | builder | Step 1 |
| `scripts/release/sql-scan.mjs` | New | builder | Step 3 |
| `scripts/release/check-migrations.mjs` | New | builder | Step 4 |
| `supabase/retired.json` | New | builder | Step 2 |
| `package.json` (root) | Change (extend `lint`) | builder | Step 5 |
| `docs/architecture.md` | Change | builder | Step 5 |
| `scripts/release/__tests__/git-fixture.mjs` | New | test-author | Builds temp repos in `os.tmpdir()` with a bare `origin`, tags and shallow clones. Git identity via `-c user.name`/`-c user.email`; branch `main`. EZD-023b reuses it |
| `scripts/release/__tests__/sql-scan.test.mjs`, `tags.test.mjs`, `check-migrations.test.mjs` | New | test-author | Tests below. node:test, found by the root `node --test "scripts/**/*.test.mjs"` |
| `scripts/gate.mjs`, `.github/workflows/ci.yml`, `CLAUDE.md`, `vault/**`, `.claude/**` | Not touched | — | Owned by Josh or the orchestrator |

## Data
None. No table, column, policy or schema_version change. `supabase/retired.json` is a repo file, not a migration. No money fields.

## Tests (written by test-author before any code)
- All tests are `node:test`, with a top-level `describe('EZD-023a …')`.
- **`FIX`** is the base migration `20261101000000_create_fixture.sql`:

  ```sql
  create table public.fixture_item (id uuid primary key, legacy_note text);
  create view public.fixture_view as select id from public.fixture_item;
  create type public.fixture_kind as enum ('a','b');
  create schema extra;
  create function public.health() returns text language sql as $$ select 'ok' $$;
  ```

  It is released as tag `phase-0`, with `supabase/retired.json` = `{"retired":[]}`.
- New migrations use versions `20261102000000` and later.
- Unit rows call `checkMigrations` directly. Git rows use `git-fixture.mjs`.
- Tests match exit codes, violation IDs, file names and object names, not message wording.

| Test | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- |
| T1 **Done when**: `EZD-023a done when: CI fails a fixture migration that drops a column the previous tag reads` | unit (git, no network) | A bare `origin` in a temp folder. Commit `FIX` on `main`, add annotated tag `phase-0`, push both. Commit `20261102000000_drop_legacy_note.sql` = `alter table public.fixture_item drop column legacy_note;` and push. Clone with `git clone --depth 1 --no-tags file://<origin>`. In the clone, run `node <repo>/scripts/release/check-migrations.mjs` with env `GITHUB_ACTIONS=true`, `CI=1` | Exit 1. Output contains `[M1]`, `supabase/migrations/20261102000000_drop_legacy_note.sql`, `public.fixture_item.legacy_note` and `phase-0` | Ticket Done when; 11 Operations (add before remove); ci.yml (`actions/checkout@v4` with defaults, then the gate); Step 4 CI tag fetch |
| T2 Additive change passes in CI | unit (git) | As T1, but the new migration is `alter table public.fixture_item add column new_note text;` | Exit 0. Output names the base `phase-0` | 11 Operations ("add before they remove") |
| T3 The gate runs the check | unit | Root `package.json`; `scripts/gate.mjs` and ci.yml read as text | `scripts.lint` contains, in this order: `node scripts/conventions/check.mjs`, then `node scripts/release/check-migrations.mjs`, then EZD-000's fan-out. gate.mjs `required` includes `lint`. ci.yml contains `run: node scripts/gate.mjs .` | Step 5; gate.mjs; ci.yml; EZD-000 Step 1 (extend, not replace). This test does **not** run gate.mjs, because Josh's gate lock refuses a gate run inside another gate (EZD-001 Step 6.4) |
| T4 Drops and renames refused | unit | `FIX` released at `phase-0`. One new migration per case: (a) `alter table fixture_item drop column legacy_note`; (b) `ALTER TABLE "public"."fixture_item" DROP "legacy_note"`; (c) `alter table if exists only public.fixture_item drop column if exists legacy_note`; (d) `alter table fixture_item rename column legacy_note to note`; (e) `alter table fixture_item rename legacy_note to note`; (f) `alter table fixture_item rename to item`; (g) `drop table public.fixture_item`; (h) `drop view fixture_view`; (i) `drop function public.health()`; (j) `alter type fixture_kind rename value 'a' to 'c'`; (k) `alter table fixture_item set schema extra`; (l) `drop schema extra`; (m) `drop table fixture_item, other_table` | Each case: `ok === false`, and every violation is `M1`. Objects: (a)–(e) `public.fixture_item.legacy_note`; (f), (g), (k) `public.fixture_item`; (h) `public.fixture_view`; (i) `public.health`; (j) `public.fixture_kind`; (l) `extra`; (m) both `public.fixture_item` and `public.other_table` | Steps 2–3; 11 Operations ("never drops or renames") |
| T5 Non-destructive changes pass | unit | New migrations: `drop index fixture_item_idx`; `drop policy p on fixture_item`; `alter table fixture_item drop constraint fixture_item_check, add constraint fixture_item_check check (true)`; `alter table fixture_item alter column legacy_note drop not null`; `… alter column legacy_note drop default`; `drop trigger t on fixture_item`; `alter index a rename to b`; `alter table fixture_item rename constraint a to b`; `create or replace function public.health() returns text language sql as $$ select 'ok' $$`; `alter table fixture_item add column extra text`; and a file holding only `-- drop column legacy_note` and `/* drop table fixture_item */` | `ok === true`, 0 violations | Step 3 "Not destructive"; vault/plans/EZD-005.md Risks (widened check constraint) |
| T6 Created after the tag | unit | New migration `…02…`: `create table public.tmp_x (a int, b int); alter table fixture_item add column temp_c text;`. New migration `…03…`: `alter table tmp_x drop column b; drop table tmp_x; alter table fixture_item drop column temp_c;` | `ok === true` | Step 2 (the previous release never had them) |
| T7 Retired objects | unit | (a) The base tag's `retired.json` lists `{kind:'column', name:'public.fixture_item.legacy_note'}`, and the new migration drops that column. (b) The same entry exists only at the head, not at the tag. (c) The base tag retires `{kind:'table', name:'public.fixture_item'}`, and the new migration drops column `legacy_note` and then the table | (a) ok. (b) `M1` on `public.fixture_item.legacy_note`. (c) ok | Step 2 (a retirement must be released first) |
| T8 Released migrations are frozen | unit | (a) The head changes one character in `20261101000000_create_fixture.sql`. (b) The head removes it. (c) The head has the same text with CRLF line endings | (a) and (b): `M2` naming that file. (c) ok | Step 4 M2; `.gitattributes` `eol=lf` |
| T9 Out-of-order version | unit | New migration `20261031000000_late.sql` with additive SQL | `M3` naming that file | Step 4 M3 |
| T10 Unverifiable | unit | (a) `create table public.tmp_y (a int); drop table tmp_y cascade;`; (b) `do $$ begin execute 'drop table fixture_item'; end $$;`; (c) `create function f() returns void language plpgsql as $$ begin alter table fixture_item drop column legacy_note; end $$;` | Each: `ok === false` with an `M4` violation for that file | Step 3 `findUnverifiable` |
| T11 No tag yet | unit (git) | A fixture repo with no tags. The working tree adds a migration that drops `legacy_note` | Exit 0. Output contains `no release tag yet` | Step 4 (state until the first release) |
| T12 retired.json shape | unit (git, no tags) | The head's `supabase/retired.json`, one case at a time: `not json`; `{"retired":[{"kind":"index","name":"public.x"}]}`; `{"retired":[{"kind":"column","name":"public.fixture_item"}]}`; file deleted | Each: exit 1 with `[M5]` | Step 2 format; Step 4 M5 |
| T13 Tag order | unit | Tags `phase-0`, `phase-1`, `phase-1.2`, `phase-10`, `phase-2`, `v3`, `phase-01`, `phase-1.0` | `listReleaseTags` gives `phase-0, phase-1, phase-1.2, phase-2, phase-10`, ignoring `v3`, `phase-01` and `phase-1.0`. `previousReleaseTag(tags, 'phase-2')` = `phase-1.2`. `previousReleaseTag(tags)` = `phase-10` | Step 1 |
| T14 Ref mode (used by EZD-023b) | unit (git) | Tag `phase-0` = `FIX`. Tag `phase-1` adds T1's drop migration. Working tree is clean at `phase-0` | `--base phase-0 --head phase-1`: exit 1 with `[M1]`. `--base phase-0 --head phase-0`: exit 0 | Step 4 CLI |
| T15 CI fetch fails closed; local run does not fetch | unit (git) | A clone whose `origin` URL points to a missing path, with no local tags: (a) `GITHUB_ACTIONS=true`; (b) no `GITHUB_ACTIONS` | (a) Exit 1 with `[M0]`. (b) Exit 0 with `no release tag yet`; no fetch is attempted | Step 4 CI tag fetch |
| T16 Real repo passes | unit | `node scripts/release/check-migrations.mjs` at the repo root | Exit 0 | Step 5 (the check must not fail the clean repo) |
| T17 Docs | unit | `docs/architecture.md`; `supabase/retired.json` | A `### Release safety (EZD-023a)` heading sits under `## Migrations` and contains `supabase/retired.json`, `phase-`, `M1`, `M2`, `M3`, `M4`, `M5`. A Machine checks row ends in `EZD-023a` and contains `scripts/release/check-migrations.mjs`. `retired.json` passes the M5 shape rules. `node scripts/conventions/check.mjs .` exits 0 | Step 5; EZD-000 T5, C1 |
| T18 Gate (orchestrator) | gate | `node scripts/gate.mjs <worktree>` | Exit 0: `typecheck`, `lint`, `test`, `build` pass | CLAUDE.md rule 9 |

## Reviewers needed
code-reviewer always · calc-auditor no (no calculations) · ui-verifier no (no screen) · security-reviewer no (no tables, auth, money or secrets). Note for security: `drop policy` passes this check on purpose, because policy changes are reviewed per ticket.

## Risks
- **Static SQL scan limits.** The scan covers drops and renames of tables, columns, views, functions, types and schemas. It does not cover column **type** changes, `truncate`, or view and function changes that alter the result shape. The ticket covers only "drops or renames", so the code-reviewer watches for the rest.
- **The retired list is a claim.** That nothing at the tag still reads a retired object is checked by the code-reviewer, not by a machine.
- **Local tags.** The local gate sees only local tags. The build PC is where Josh tags (EZD-023b), so they match. A clone without tags passes locally and is stricter in CI, which fetches tags. That is the safe direction.
- **Tagged but never promoted.** A tag that was never promoted only makes the check stricter.
- **Gate inside a gate.** Josh's gate lock (EZD-001 Step 6.4) refuses a gate started inside another gate. EZD-002's T3 runs `scripts/gate.mjs` on fixtures from inside a test that itself runs under the gate, so it would fail once the lock is applied. For the orchestrator (Level 2): this is EZD-002's issue, and T3 here avoids it.
- **Every ticket runs these tests.** Root node tests run on every ticket (EZD-001 Step 6.1). This ticket spawns about 30 short git processes. The test-author keeps each fixture small so the run stays within seconds on the 16 GB PC (Q-0019).
- **First real use.** No tag exists until the Phase 0 release, so in Phase 0 the check only validates `retired.json`. Its first real comparison happens in Phase 1.

## Open questions
None.
