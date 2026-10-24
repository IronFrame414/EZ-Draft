# EZD-023b · Release guards and naming

- **ACs:** AC-EZD-023b-1, AC-EZD-023b-2, AC-EZD-023b-3 (`vault/spec/acceptance-criteria.md` lines 76–78, generated from Done-when).
- **Complexity:** high (reasoning in section 8).
- **User-visible result:** nothing Josh can see yet. The release script exists and refuses every unsafe start, but no workflow runs it until EZD-023e adds `.github/workflows/release.yml`.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

Part 1 of 4 of the EZD-023b split (Q-0157). The split proposal, re-validation findings V1–V15 and the full re-validated release design were in this file. They are kept at commit `70cf5a5` (`git show 70cf5a5:vault/plans/EZD-023b.md`), and this plan calls that text **"the archived plan"**. Parts EZD-023c, EZD-023d and EZD-023e are planned from it. The orchestrator may archive it under `vault/handoff/log/` as it did for EZD-000b; the planner writes only this file. The findings that apply to this part are V2, V12, V13, V14 and V15.

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 49):
- **Scope:** Release script guards and naming (plan Step 5; Step 6 steps 1–8): context guards; the presence check with `not_configured` / `env_missing` and the masking of derived values; `not_latest`; `no_merged_pr`; `environment_unprotected`; the release name; EZD-023a's migration check. The CLI wrapper: exit code, the `release <code>` last line, the job summary. `createGitHubApi` (`mergedPullsFor`, `environmentBranchRule`, `createTag`; part e makes the first `createTag` call) and the pure `evaluateEnvironmentRule`. Split from EZD-023b (Q-0157); plan Part EZD-023b.
- **Done when:** The release script refuses anything but the newest merged pull request on `main`: another branch or event, a direct push with no merged pull request, a commit that is no longer the tip of `main`, or a run outside GitHub Actions. It refuses before it uses any secret. It ends green with "production not configured — nothing released" when the `release` environment holds no release secret.
- **Depends on:** EZD-023a, EZD-001.
- **Spec ref:** Non-functional · Operations; R26 R12.

### Steps

**Step 1. `scripts/release/context.mjs`: guards, presence, masking (all pure).**
- `checkReleaseContext(env)` runs first. It reads only `CLAUDECODE`, `GITHUB_ACTIONS`, `GITHUB_EVENT_NAME` and `GITHUB_REF`, and refuses in this order (archived plan Step 5):
  1. `agent_refused` when `CLAUDECODE` is defined, whatever its value. Claude Code sets `CLAUDECODE=1` in the shells it starts (R-004 item 6).
  2. `not_in_actions` when `GITHUB_ACTIONS !== 'true'`. Nobody releases from a PC (Q-0106).
  3. `wrong_event` when `GITHUB_EVENT_NAME !== 'push'`. Josh's merge is the only approval (Q-0106).
  4. `not_main` when `GITHUB_REF !== 'refs/heads/main'` (Q-0106: production only from `main`; non-goals "No production deploy except from `main`").
- `RELEASE_SECRET_NAMES`: the 10 release names, in the archived plan's Step 4 order. They are `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `TENANT1_OWNER_EMAIL`, `BACKUP_SOURCE_DB_URL`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `RELEASE_S3_ACCESS_KEY_ID`, `RELEASE_S3_SECRET_ACCESS_KEY`.
- `ENV_REQUIRED_NAMES`: `GITHUB_TOKEN` plus the 9 release names other than `TENANT1_OWNER_EMAIL`, in the archived plan's Step 6 step 2 order. They are `GITHUB_TOKEN`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `BACKUP_SOURCE_DB_URL`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`, `RELEASE_S3_ACCESS_KEY_ID`, `RELEASE_S3_SECRET_ACCESS_KEY`. Part d checks `TENANT1_OWNER_EMAIL` only when it is needed.
- `checkPresence(env)` looks only at whether each name is empty (Q-0113; archived plan Step 6 step 2). A name counts as missing when it is undefined or its trimmed value is `''` (*planner's choice*: whitespace counts as empty, which fails closed).
  - If every `RELEASE_SECRET_NAMES` entry is missing, the result is `not_configured`.
  - Otherwise, if any `ENV_REQUIRED_NAMES` entry is missing, the result is `missing` with those names in list order. The backup key `BACKUP_S3_*_KEY*` never stands in for the release key (Q-0112 finding 10).
  - Otherwise the result is `complete`.
- `valuesToMask(env)` returns the derived values GitHub cannot mask, because it masks secrets only exactly as entered (Q-0112 finding 7; archived plan Step 4 "Masking"). There are up to three, deduplicated and never empty:
  - the password of `BACKUP_SOURCE_DB_URL` as written (WHATWG `URL.password`, which keeps percent-encoding);
  - the same password after `decodeURIComponent`. If decoding throws, only the raw form is returned;
  - `TENANT1_OWNER_EMAIL.trim()` when it is non-empty.

  If the URL does not parse, no password is returned (*planner's choice*). GitHub still masks the whole value, and nothing in this part prints any part of the URL.
- `maskCommands(value)` returns one `::add-mask::<line>` string for each non-empty line of `value`, splitting on `\r?\n` (*planner's choice*). Without the split, a value with a line break would print everything after the break in clear text.

**Step 2. `scripts/release/release-name.mjs`: `releaseTagFor` (pure).** It uses EZD-023a's tag format and order (`scripts/release/tags.mjs`: `parseReleaseTag`, `compareReleaseTags`) and the phase PR title `Phase N: <name>` (vault/PROCESS.md line 264). Rules (archived plan Step 6 step 7):
- First, ignore every name in `tags` and `tagsOnSha` that `parseReleaseTag` rejects. `compareReleaseTags` throws on such names (finding V2).
- If `tagsOnSha` holds a release tag, return the highest one with `resume: true`. This is a re-run.
- Else, if `prTitle` matches `^Phase (0|[1-9]\d*):` and `phase-N` is not in `tags`:
  - return `phase-N` when it is newer than every tag;
  - otherwise return the code `not_newer`.
- Else, if any release tag exists, return the next patch of the highest tag: `phase-M` → `phase-M.1`, `phase-M.k` → `phase-M.(k+1)`.
- Else return the code `no_release_name`: the first release must come from a `Phase N:` pull request.

**Step 3. `scripts/release/github-api.mjs`: `createGitHubApi` and `evaluateEnvironmentRule`.** Endpoints and headers come from GitHub's REST docs (R-004 items 1–5). The rule's field shape matches a read-only `gh api` of this repo's environments on 2026-10-19:
  - `release` had `deployment_branch_policy {custom_branch_policies: true, protected_branches: false}`, `can_admins_bypass: false` and one policy `{name: 'main', type: 'branch'}`;
  - `Production` and `Preview` had `deployment_branch_policy: null` and `can_admins_bypass: true`.

  So `can_admins_bypass` is returned and can be false with a branch rule alone, even though R-004 did not find it in the docs.
- `createGitHubApi({ token, repo, fetch })`. Every request:
  - goes to `https://api.github.com/repos/${repo}/…`;
  - sends `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28` and `Authorization: Bearer ${token}`;
  - throws on a non-2xx status. The error message names the method, path and status and never the token (Q-0112 finding 7).

  The methods:
  - `mergedPullsFor(sha)` sends GET `/commits/{sha}/pulls` and returns the parsed array as GitHub sends it.
  - `environmentBranchRule(name)` sends GET `/environments/{name}`. When `deployment_branch_policy?.custom_branch_policies === true`, it also sends GET `/environments/{name}/deployment-branch-policies?per_page=100`. It returns `{ deployment_branch_policy, can_admins_bypass, branch_policies }`, where `branch_policies` is `[{ name, type }]` and is `[]` when the second call is not made. A second page is never fetched, because a rule with more than 100 entries fails the one-policy rule anyway.
  - `createTag(name, sha, message)` sends POST `/git/tags` with `{ tag: name, message, object: sha, type: 'commit' }`, then POST `/git/refs` with `{ ref: 'refs/tags/' + name, sha: <the tag object's sha> }`. GitHub needs both calls: "creating a tag object does not create the reference" (R-004 item 4). Nothing calls it until EZD-023e.
- `evaluateEnvironmentRule(rule)` returns `{ ok, reason }` and fails closed (Q-0106: limited to `main`; Q-0112 finding 2: no admin bypass). It checks in this order and stops at the first failure:
  1. `no_rule` when `rule` is null or undefined.
  2. `all_branches` when `deployment_branch_policy === null`.
  3. `not_selected_branches` when `protected_branches !== false` or `custom_branch_policies !== true`.
  4. `not_main_only` unless `branch_policies` is exactly one entry with `name === 'main'` and `type === 'branch'`.
  5. `admin_bypass` unless `can_admins_bypass === false`. A missing field counts as bypass allowed.

  When every check passes, it returns `{ ok: true, reason: null }`. The reason strings are *planner's choice*. EZD-025 reuses this function (vault/plans/EZD-025.md lines 30, 184).

**Step 4. `scripts/release/release.mjs`: `runRelease` steps 1–8, `createGit`, CLI.** Steps follow the archived plan's Step 6 steps 1–8.
- `runRelease(opts, deps)` reads `processEnv` one name at a time. It reads no release name and not `GITHUB_TOKEN` before `checkReleaseContext` passes, and it never spreads or enumerates `processEnv` (AC-EZD-023b-2).
- It writes no `log` line before step 2's masking, except the refusal lines of steps 1–2. So the first log line of any run that gets past step 2 comes after every `mask` call (archived plan Step 4 "Masking"; finding V15).

The steps:
1. **Context.** On failure, return `{ ok: false, code }`.
2. **Presence.**
   - `not_configured`: return `{ ok: true, code: 'not_configured' }` and write the summary line `production not configured — nothing released` (AC-EZD-023b-3). It makes 0 `git`, `github`, `mask` or other external calls.
   - `missing`: return `{ ok: false, code: 'env_missing', missing }`, log `env_missing: <names joined by ', '>`, and write the summary lines from section 6. It makes 0 `mask` calls: no value is used.
   - `complete`: call `deps.mask(v)` for each value from `valuesToMask(processEnv)`.
3. **`sha` = `GITHUB_SHA`.**
4. **`not_latest`.** Run `git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main +refs/tags/phase-*:refs/tags/phase-*` (*planner's choice*: EZD-023a's tag refspec plus `main`), then compare `git rev-parse refs/remotes/origin/main` with `sha`. They must be equal. If git throws, the result is `not_latest` too (fail closed, the same pattern as finding V2) and the log says `git fetch failed`. An old run re-run after a newer merge is refused, because going back is a rollback, not a release (archived plan Step 7).
5. **`no_merged_pr`.** Look for an item of `github.mergedPullsFor(sha)` with `merged_at` set, `base.ref === 'main'` and `merge_commit_sha === sha` (Q-0106: a direct push is refused). If none matches, or the call throws, the result is `no_merged_pr`, and the log line carries the HTTP status only. The matched item gives `prNumber` and `prTitle`.
6. **`environment_unprotected`.** Refuse when `evaluateEnvironmentRule(await github.environmentBranchRule('release'))` returns `ok: false`, or when the call throws. The log line holds the `reason`.
7. **Release name.** Call `releaseTagFor({ sha, prTitle, tags: listReleaseTags(git), tagsOnSha })`, where `tagsOnSha` comes from `git tag --points-at <sha>`. A refusal returns its code (`not_newer`, `no_release_name`).
8. **`migration_check_failed`.** Call EZD-023a's `main(argv, out)` from `scripts/release/check-migrations.mjs` in-process, with `out` writing to `deps.log` unchanged (finding V2).
   - `argv` is `['--root', opts.root, '--head', sha]`, plus `['--base', previousReleaseTag(tags, tag)]` when that is not null.
   - A return of 1, or a throw, gives `migration_check_failed`.
   - With no `--base`, `main` picks the highest tag itself (check-migrations.mjs line 314). That is "no release tag yet" on a first release; on a re-run of the lowest tag it compares the commit with itself, which passes.
9. **Interim until EZD-023e** (Q-0157; *planner's choice*, which the code-reviewer confirms at plan review). After step 8, return `{ ok: false, code: 'not_built', prNumber, tag, resume, notices: [] }`. No test asserts it, and nothing runs the script until part e adds the workflow (archived plan "Split proposal"). Parts c and d move this return past their own steps, and part e removes it.

Every result carries `notices: []`; part c adds the token notices. For every code other than `not_configured`, write the summary line `release stopped: <code> — nothing changed` (section 6). In this part every refusal happens before any write outside the runner, so the line is true for all of them.

**CLI.** The CLI runs only when the file is started directly, with the same `import.meta.url` check as check-migrations.mjs line 345. It calls `runRelease({ root: process.cwd() }, deps)` with these deps:
- `processEnv: process.env`;
- `git: createGit(process.cwd())`;
- `github: createGitHubApi({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY, fetch: globalThis.fetch })`. Building the client sends nothing;
- `log` writes the line to stdout;
- `summary` appends the line plus `\n` to the file named by `GITHUB_STEP_SUMMARY` when it is set, and does nothing when it is not;
- `mask(v)` writes each `maskCommands(v)` line to stdout.

Its last stdout line is `release <code>`. It exits 0 only when `ok` is true. If `runRelease` throws, it prints `release internal_error`, without the error text (Q-0112 finding 7: no raw error output), and exits 1. `createGit(root)` returns `(args) => stdout`: it runs `git -C <root> …` with `GIT_TERMINAL_PROMPT=0`, works synchronously, and throws on a non-zero exit. This is the `git(args)` shape that `tags.mjs` `listReleaseTags` takes.

### Files

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `scripts/release/context.mjs` | New | builder | Step 1 |
| `scripts/release/release-name.mjs` | New | builder | Step 2 |
| `scripts/release/github-api.mjs` | New | builder | Step 3 (EZD-025 imports it) |
| `scripts/release/release.mjs` | New | builder | Step 4 |
| `scripts/release/__tests__/release.test.mjs` | New | test-author | T1, T3, T4 (git cases), T5. Holds fixture `R` and the `CLEAN` fakes, which parts c–e extend in this file (archived plan "Split proposal") |
| `scripts/release/__tests__/release-name.test.mjs` | New | test-author | T2 |
| `scripts/release/__tests__/github-api.test.mjs` | New | test-author | T4 pure cases, T22 |

The builder may write `scripts/release/` (`.claude/hooks/guard-paths.mjs` line 84; Q-0125 (a)), and the test-author writes `__tests__/` (finding V13). This part does not touch the following:
- `scripts/release/check-migrations.mjs`, `tags.mjs` and `__tests__/git-fixture.mjs`: imported only, never edited;
- `docs/architecture.md` and `docs/runbook.md`: part e writes the docs and the Machine checks row for `release.test.mjs` (archived plan T18);
- `package.json`, the lockfile and `.github/`.

There is no new dependency: Node 22 built-ins and global `fetch` only (CLAUDE.md rule 7).

**Data:** none. No migration, table, policy, `schema_version` or money field.

## 2. Sources

- `vault/spec/sections/11-non-functional-requirements.md` Operations: "production is updated only by promoting a tagged build at a phase gate or on Josh's approval"; "Migrations add before they remove". Read with Performance: no effect, because nothing here runs in the app or the browser.
- `03-data-model.md` Architecture rules and `04-app-shell-and-global-ui.md`: read, not affected (no table, no screen).
- `vault/spec/non-goals.md`: "No production deploy except from `main`, which only Josh merges". Glossary: no entry for release terms.
- Decisions:
  - R26 R12 (`decisions/13b-round-26.md`);
  - Q-0106 (`decisions/11-non-functional-requirements.md`: automatic release on Josh's merge into `main`, secrets only in a main-only GitHub environment, his merge the only approval);
  - Q-0113 (`decisions/02-product-overview.md`: nothing live until launch; a merge releases nothing until then);
  - Q-0112 findings 2, 7 and 10 (QUESTIONS.md row, confirmed by Josh 2026-10-18);
  - Q-0157 (the split; the interim `not_built` return is a planner's choice for plan review);
  - Q-0125 (a) (the builder writes `scripts/release/`).
- The archived plan (`70cf5a5:vault/plans/EZD-023b.md`):
  - Step 4 (release names, masking);
  - Step 5 (guards);
  - Step 6 steps 1–8 and the result shape;
  - findings V2, V12, V13, V14, V15;
  - tests T1–T5 with their values;
  - the "Environment name" note: `release`, not Vercel's `Production`.
- Code:
  - `scripts/release/tags.mjs` (`parseReleaseTag`, `compareReleaseTags`, `listReleaseTags(git)`, `previousReleaseTag(tags, below)`);
  - `scripts/release/check-migrations.mjs` (`main(argv, out)` lines 287–343, its output lines, its own tag fetch);
  - `scripts/release/__tests__/git-fixture.mjs` (exports listed in finding V2);
  - root `package.json` `test` (`node --test … "scripts/**/*.test.mjs"`, EZD-001);
  - `.claude/hooks/guard-bash.mjs` line 23 (agents never run `node scripts/release/…`; tests start node through `process.execPath`).
- `vault/PROCESS.md` line 264 (phase PR title `Phase N: <name>`); section 3a (wording); section 4 (models).
- Research: **R-004** (GitHub REST endpoints, fields and headers; `actions: read` and `pull-requests: read` categories; `CLAUDECODE=1`). Live read on 2026-10-19 (`gh api repos/IronFrame414/EZ-Draft/environments` and `…/environments/release/deployment-branch-policies`): the values quoted in Step 3. Gap: R-004 did not find `merge_commit_sha` in the commit-pulls schema (section 9 Risks).
- Mockup: none (`tickets.json` `mockups: []`).

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| file / export | `scripts/release/context.mjs` `checkReleaseContext(env)` | → `{ ok: true }` or `{ ok: false, code }`, with `code` one of `agent_refused`, `not_in_actions`, `wrong_event`, `not_main` (checked in that order). Reads only `CLAUDECODE`, `GITHUB_ACTIONS`, `GITHUB_EVENT_NAME`, `GITHUB_REF` |
| export | `RELEASE_SECRET_NAMES` | frozen array of the 10 names, in Step 1 order (part e's T16 compares its workflow secrets with it) |
| export | `ENV_REQUIRED_NAMES` | frozen array of the 10 names, in Step 1 order |
| export | `checkPresence(env)` | → `{ state: 'not_configured' }`, `{ state: 'missing', missing: string[] }` or `{ state: 'complete' }` |
| export | `valuesToMask(env)` | → `string[]` (deduplicated, never empty strings) |
| export | `maskCommands(value)` | → `string[]`: one `::add-mask::<line>` for each non-empty line |
| file / export | `scripts/release/release-name.mjs` `releaseTagFor({ sha, prTitle, tags, tagsOnSha })` | → `{ tag, resume }` or `{ code: 'not_newer' \| 'no_release_name' }` |
| file / export | `scripts/release/github-api.mjs` `createGitHubApi({ token, repo, fetch })` | → `{ mergedPullsFor(sha), environmentBranchRule(name), createTag(name, sha, message) }`, all async. `fetch(url, init)` is called with `init.method` (`GET` by default), `init.headers` (plain object holding the 3 headers of Step 3) and, for POST, `init.body` (JSON string) |
| export | `evaluateEnvironmentRule(rule)` | → `{ ok: true, reason: null }` or `{ ok: false, reason }`, with `reason` one of `no_rule`, `all_branches`, `not_selected_branches`, `not_main_only`, `admin_bypass` |
| type | environment rule | `{ deployment_branch_policy: null \| { protected_branches: boolean, custom_branch_policies: boolean }, can_admins_bypass?: boolean, branch_policies: { name: string, type?: string }[] }` |
| type | pull item (from `mergedPullsFor`) | GitHub's shape: `{ number, title, merged_at: string \| null, base: { ref }, merge_commit_sha }` |
| file / export | `scripts/release/release.mjs` `runRelease(opts, deps)` | async. `opts = { root }` (repo root; the CLI passes `process.cwd()`) |
| deps (read in this part) | `processEnv`, `git`, `github`, `log(line)`, `summary(line)`, `mask(value)` | `git(args: string[]) → string` (sync stdout, throws on a non-zero exit). `github` is a `createGitHubApi` object or a fake |
| deps (later parts) | `vercel`, `supabase`, `sql`, `offsite`, `fetch`, `sleep`, `now`, `checkLive` | named by the archived plan Step 6; parts c–e define them. This part neither requires nor calls them. Tests pass call-recording fakes to prove 0 calls |
| result | `runRelease` resolves to | `{ ok, code, notices: string[], missing?, prNumber?, tag?, resume? }`. Codes in this part: `not_configured` (`ok: true`), `agent_refused`, `not_in_actions`, `wrong_event`, `not_main`, `env_missing`, `not_latest`, `no_merged_pr`, `environment_unprotected`, `not_newer`, `no_release_name`, `migration_check_failed`, `not_built` (interim) |
| export | `createGit(root)` | → `git(args)` as above |
| CLI | `node scripts/release/release.mjs` | last stdout line `release <code>`; exit 0 only when `ok`; summary lines appended to `$GITHUB_STEP_SUMMARY` when set; mask lines on stdout |
| log line | presence | `env_missing: <A>, <B>` |
| summary lines | section 6 | exact texts tests check: `production not configured — nothing released`; `release stopped: <code> — nothing changed`; `missing in the release environment: <A>, <B>` |

## 4. Tests

All tests use `node:test`. Each file has a top-level `describe` whose title starts with `EZD-023b` (finding V14; docs/architecture.md Test scope). No test reaches the network (CLAUDE.md rule 6). `git` is real, run against fixture repos with a bare `origin` over `file://` (EZD-023a `git-fixture.mjs`). The CLI is started with `process.execPath` (finding V13).

**Fixture `R`** (the archived plan's fixture, unchanged so parts c–e can reuse it), made with `makeRepo` and `commitFiles`, then pushed to `origin main`:
- **C1** adds:
  - `supabase/migrations/20261101000000_create_fixture.sql` = `create table public.fixture_item (id uuid primary key, legacy_note text);`;
  - `supabase/retired.json` = `{"retired":[]}`;
  - `.env.example` with `NEXT_PUBLIC_SUPABASE_URL=`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` and `SUPABASE_SECRET_KEY=`, one per line;
  - `supabase/bootstrap/tenant-1.sql` = `do $$ declare owner_email text := 'PASTE-YOUR-EMAIL-HERE'; begin raise notice 'ezd_bootstrap_done'; end $$;`.
- **C2** adds `supabase/migrations/20261102000000_add_note.sql` = `alter table public.fixture_item add column new_note text;`. C2 is the tip of `origin/main`.
- **`DROP`** = `supabase/migrations/20261103000000_drop_legacy_note.sql` = `alter table public.fixture_item drop column legacy_note;`. Do not use the helper's `DROP_NAME`, which has C2's version (finding V2).

**`CLEAN`:**
- `processEnv`:
  - GitHub context: `GITHUB_ACTIONS: 'true'`, `GITHUB_EVENT_NAME: 'push'`, `GITHUB_REF: 'refs/heads/main'`, `GITHUB_SHA` = the tip, `GITHUB_TOKEN: 'ghs_TEST'`;
  - Vercel: `VERCEL_TOKEN: 'tok_TEST'`, `VERCEL_PROJECT_ID: 'prj_TEST'`, `VERCEL_TEAM_ID: 'team_TEST'`;
  - database: `BACKUP_SOURCE_DB_URL: 'postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres'`;
  - bucket: `BACKUP_S3_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com'`, `BACKUP_S3_REGION: 'us-west-004'`, `BACKUP_S3_BUCKET: 'ezd-test'`, `RELEASE_S3_ACCESS_KEY_ID: 'relkey_TEST'`, `RELEASE_S3_SECRET_ACCESS_KEY: 'rel-secret-TEST'`;
  - `TENANT1_OWNER_EMAIL: 'owner.test@example.com'`;
  - not set: `CLAUDECODE`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`.
- `github`:
  - `mergedPullsFor` → `[{ number: 7, title: 'Phase 0: Setup', merged_at: '2026-10-19T12:00:00Z', base: { ref: 'main' }, merge_commit_sha: <tip> }]`;
  - `environmentBranchRule` → `{ deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, can_admins_bypass: false, branch_policies: [{ name: 'main', type: 'branch' }] }`, the live `release` rule (section 2);
  - `createTag` records its calls.
- `git` = `createGit(<R work dir>)`, wrapped to record calls.
- `vercel`, `supabase`, `sql`, `offsite`, `checkLive`, `fetch`: recorders whose every method or call is logged.
- `log`, `summary` and `mask` write into one shared, ordered journal, so tests can check "before the first log line".
- "**Output**" means every `log` and `summary` line. "**No external effect**" means 0 calls to `vercel`, `supabase`, `sql`, `offsite`, `checkLive`, `fetch` and `github.createTag`.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 **`EZD-023b done when: the release refuses anything but the newest merged pull request on main`** (release.test.mjs) | AC-EZD-023b-1, AC-EZD-023b-2 | unit (git) | `runRelease({ root: R }, CLEAN)` with one change per case:<br>(a) `GITHUB_REF: 'refs/heads/develop'`<br>(b) `GITHUB_EVENT_NAME: 'workflow_dispatch'`<br>(c) `GITHUB_EVENT_NAME: 'pull_request'`<br>(d) `GITHUB_ACTIONS` removed<br>(e) `CLAUDECODE: '1'`<br>(f) `GITHUB_SHA` = C1 while the tip is C2<br>(g) `mergedPullsFor` returns `[]` (direct push)<br>(h) the only pull request has `merged_at: null`<br>(i) the only pull request has `base.ref: 'develop'`<br>(j) `mergedPullsFor` rejects with `Error('GET /commits/x/pulls failed: 502')`<br>(k) `origin` set to a missing `file://` path<br>In (a)–(e), `processEnv` is a Proxy that records every key read through `get`, `has` and `getOwnPropertyDescriptor`; any `ownKeys` call counts as reading every key.<br>Then the CLI: `node <REPO_ROOT>/scripts/release/release.mjs` with cwd `R` and every `GITHUB_*`, `CI` and `CLAUDECODE` removed from its env | Codes:<br>(a) `not_main`<br>(b), (c) `wrong_event`<br>(d) `not_in_actions`<br>(e) `agent_refused`<br>(f), (k) `not_latest`<br>(g)–(j) `no_merged_pr`<br>Every case: `ok === false` and no external effect.<br>(a)–(e): 0 `git`, `github` and `mask` calls; the recorded keys hold none of the 10 `RELEASE_SECRET_NAMES` and not `GITHUB_TOKEN`; `ownKeys` was never called.<br>(f), (k): 0 `github` calls.<br>(a): the summary holds exactly `release stopped: not_main — nothing changed`.<br>CLI: exit 1; the last stdout line is `release not_in_actions` | Ticket Done when (AC-EZD-023b-1, -2); Q-0106; archived plan Steps 5 and 6 (steps 1–5) and T1; Step 4 (fail closed on a git or GitHub error, *planner's choice*); section 6 wording |
| T2 Release names (release-name.test.mjs) | AC-EZD-023b-1 (support) | unit (pure) | `releaseTagFor` with (title, tags):<br>(a) `Phase 0: Setup`, `[]`<br>(b) `Phase 1: Projects`, `[phase-0]`<br>(c) `Fix sign-in`, `[phase-0, phase-1]`<br>(d) `Fix again`, `[phase-1, phase-1.1]`<br>(e) `Phase 1: Projects`, `[phase-0, phase-1]`<br>(f) `Phase 1: x`, `[phase-2]`<br>(g) `Fix`, `[]`<br>(h) `Phase 2: x`, `[phase-0]`<br>(i) `Phase 1: x`, `[phase-0, phase-1]` with `tagsOnSha: ['phase-1']`<br>(j) `phase 1: lower case`, `[phase-0]`<br>(k) `Fix`, `['v1', 'phase-0']`<br>`tagsOnSha` is `[]` unless stated | (a) `phase-0`<br>(b) `phase-1`<br>(c) `phase-1.1`<br>(d) `phase-1.2`<br>(e) `phase-1.1`<br>(f) `{ code: 'not_newer' }`<br>(g) `{ code: 'no_release_name' }`<br>(h) `phase-2`<br>(i) `phase-1` with `resume: true`<br>(j) `phase-0.1`<br>(k) `phase-0.1`<br>(a)–(e), (h), (j), (k) have `resume: false` | Step 2; archived plan T2 (a)–(j); finding V2 (non-release names ignored) for (k); tags.mjs (format and order); PROCESS.md line 264 |
| T3 Unsafe migration (release.test.mjs) | AC-EZD-023b-1 (support) | unit (git) | Tag `phase-0` (annotated) on C1, pushed to `origin`. A new tip C3 adds `DROP` and is pushed. The pull request for C3 has title `Phase 1: x` | `code === 'migration_check_failed'`; no external effect; a log line starts with `[M1]` and one equals `migration check failed against phase-0: 1 violation(s)` | Step 4 step 8; finding V2; check-migrations.mjs lines 284, 338 (output lines; printViolations at 283); archived plan T3 |
| T4 Environment rule (git cases in release.test.mjs, pure cases in github-api.test.mjs) | AC-EZD-023b-1 (support) | unit (git + pure) | Rules:<br>(a) `deployment_branch_policy: null`<br>(b) `{ protected_branches: true, custom_branch_policies: false }`, no policies<br>(c) selected branches `main` and `develop`<br>(d) selected `main` plus `{ name: 'phase-*', type: 'tag' }`<br>(e) exactly `main`, `can_admins_bypass: true`<br>(f) exactly `main`, no `can_admins_bypass` field<br>Git cases: `CLEAN` with each rule (a)–(f), and (g) `environmentBranchRule` rejects. Pure: `evaluateEnvironmentRule` on (a)–(f), on `null`, and on the `CLEAN` rule | Git: (a)–(g) each `environment_unprotected`, no external effect.<br>Pure reasons:<br>(a) `all_branches`<br>(b) `not_selected_branches`<br>(c), (d) `not_main_only`<br>(e), (f) `admin_bypass`<br>`null` → `no_rule`<br>`CLEAN` → `{ ok: true, reason: null }` | Step 3; Q-0106 (main only); Q-0112 finding 2 (no admin bypass, fail closed); live `release` rule (section 2); reason strings *planner's choice* |
| T5 Not configured, missing secrets, masking (release.test.mjs) | AC-EZD-023b-2, AC-EZD-023b-3 | unit (git) | (a) `CLEAN` with all 10 `RELEASE_SECRET_NAMES` removed (`GITHUB_TOKEN` kept)<br>(b) the same names set to `''`<br>(c) `CLEAN` with `VERCEL_TEAM_ID: ''`<br>(d) `CLEAN` with every release name removed except `TENANT1_OWNER_EMAIL`<br>(e) `CLEAN` with `BACKUP_S3_ACCESS_KEY_ID: 'key_TEST'` and `BACKUP_S3_SECRET_ACCESS_KEY: 'b2-secret-TEST'` instead of the two `RELEASE_S3_*` names<br>(f) case (a) through the CLI, with `GITHUB_ACTIONS`, `GITHUB_EVENT_NAME`, `GITHUB_REF`, `GITHUB_SHA` and `GITHUB_TOKEN` as in `CLEAN`, `CLAUDECODE` and `CI` removed, and a temporary `GITHUB_STEP_SUMMARY` file<br>(g) `CLEAN` with `BACKUP_SOURCE_DB_URL` = `postgresql://postgres.prodref123:p%40ss%2Fx@aws-0-us-east-1.pooler.supabase.com:5432/postgres` and the rule of T4 (a)<br>(h) pure: `maskCommands('a@b.com\nselect 1')` | (a), (b): `ok === true`, `code === 'not_configured'`; the summary holds exactly `production not configured — nothing released`; 0 `git`, `github` and `mask` calls; no external effect.<br>(c): `env_missing`, `missing` deep-equals `['VERCEL_TEAM_ID']`.<br>(d): `missing` deep-equals the 9 `ENV_REQUIRED_NAMES` after `GITHUB_TOKEN`, in order, without `TENANT1_OWNER_EMAIL`.<br>(e): `missing` deep-equals `['RELEASE_S3_ACCESS_KEY_ID', 'RELEASE_S3_SECRET_ACCESS_KEY']`.<br>(c)–(e): `ok === false`; 0 `git`, `github` and `mask` calls; no external effect.<br>(c): the summary also holds `missing in the release environment: VERCEL_TEAM_ID`.<br>(f): exit 0; the last stdout line is `release not_configured`; the summary file holds `production not configured — nothing released`.<br>(g): `environment_unprotected`; `mask` was called with exactly the set `{'p%40ss%2Fx', 'p@ss/x', 'owner.test@example.com'}`, all before the first `log` entry in the journal; no output contains any of the three.<br>(h): `['::add-mask::a@b.com', '::add-mask::select 1']` | Ticket Done when (AC-EZD-023b-2, -3); Q-0113; Q-0112 findings 7, 10; archived plan T5 (a)–(g) and Step 4 "Masking"; finding V15; Step 1 (`maskCommands`, *planner's choice*); section 6 wording |
| T22 GitHub client requests (github-api.test.mjs) | AC-EZD-023b-1 (support) | unit (pure, fake `fetch`) | `createGitHubApi({ token: 'ghs_TEST', repo: 'IronFrame414/EZ-Draft', fetch })`, with sha `S` = 40 × `a`:<br>(a) `mergedPullsFor(S)`<br>(b) `environmentBranchRule('release')`; the fake answers the environment with `{ name: 'release', can_admins_bypass: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }` and the policies with `{ total_count: 1, branch_policies: [{ id: 1, name: 'main', type: 'branch' }] }`<br>(c) the same with `deployment_branch_policy: null`, `can_admins_bypass: true`<br>(d) `createTag('phase-0', S, 'Release phase-0 (#7)')`; the fake answers the first POST with `{ sha: 'b'.repeat(40) }`<br>(e) each of (a), (b), (d) with a fake that answers status 403 | (a) one GET `https://api.github.com/repos/IronFrame414/EZ-Draft/commits/<S>/pulls` with headers `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `Authorization: Bearer ghs_TEST`.<br>(b) GETs, in order, `…/environments/release` and `…/environments/release/deployment-branch-policies?per_page=100`; the result deep-equals `{ deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, can_admins_bypass: false, branch_policies: [{ name: 'main', type: 'branch' }] }`, and `evaluateEnvironmentRule` of it is `ok: true`.<br>(c) exactly 1 fetch; `branch_policies` deep-equals `[]`; `evaluateEnvironmentRule` gives `all_branches`.<br>(d) POST `…/git/tags` with JSON body `{ tag: 'phase-0', message: 'Release phase-0 (#7)', object: S, type: 'commit' }`, then POST `…/git/refs` with `{ ref: 'refs/tags/phase-0', sha: 'b'.repeat(40) }`.<br>(e) each rejects; the message contains `403` and not `ghs_TEST` | R-004 items 1–5 (paths, fields, headers, two-step tag); live `release` rule (section 2); Q-0112 finding 7 (no token in output) |
| T19 Gate (orchestrator) | all | gate | `node scripts/gate.mjs .claude/worktrees/EZD-023b` | exit 0 | CLAUDE.md rule 12 |

AC map: AC-EZD-023b-1 → T1 (T2–T4 and T22 support it); AC-EZD-023b-2 → T1 (a)–(e) and T5 (c)–(e); AC-EZD-023b-3 → T5 (a), (b), (f). Smoke: none (node tests under `scripts/` always run, docs/architecture.md Test scope).

## 5. Visual checklist

None. No screen changes (`tickets.json` `mockups: []`).

## 6. Proposed wording

These are GitHub Actions job summary lines Josh can read on the run page. Josh approves them at Stage 2.

| Where | Text |
| --- | --- |
| Job summary, `not_configured` | `production not configured — nothing released` (already in the Done-when, AC-EZD-023b-3) |
| Job summary, any other refusal in steps 1–8 | `release stopped: <code> — nothing changed` |
| Job summary, `env_missing` (second line) | `missing in the release environment: <NAME>, <NAME>` |

## 7. Security review

**security-review: yes.** Areas: API and auth.
- The GitHub job token: `createGitHubApi`, its error text, and the environment-rule check that stands in front of every production secret (Q-0106; Q-0112 finding 2).
- The presence check and `not_configured`: no value is used, nothing is called, and a partly configured environment fails.
- Refusing before any secret is read, proved by the Proxy in T1.
- Masking of derived values, including line-split mask commands (Q-0112 finding 7).
- The release key never replaced by the backup key (finding 10).

Reviewers needed: code-reviewer always · calc-auditor no (no calculations) · ui-verifier no (section 5 is empty) · security-reviewer **yes**.

The code-reviewer confirms these *planner's choices*: the interim `not_built`; whitespace counting as empty; `not_latest` and `no_merged_pr` on a git or GitHub error; `maskCommands`; the reason strings; and the step-4 fetch refspec.

## 8. Complexity and model recommendation

**High.** This is a new pattern: a release orchestrator run against real git fixtures, whose guards stand in front of production secrets in a public repo (PROCESS.md section 4 row "high": new pattern, auth). Test-author and builder: Fable 5.1, or Opus 5.5 when Fable is past its fallback share. Code-reviewer and security-reviewer: Fable 5.1 (PROCESS.md section 4).

## 9. Dependencies

- **EZD-023a** (row, done): `scripts/release/tags.mjs`, `check-migrations.mjs` `main(argv, out)` and `__tests__/git-fixture.mjs`, as merged (finding V2).
- **EZD-001** (row, done): the root `node --test "scripts/**/*.test.mjs"` run.
- Missing from the row: none. The `scripts/release/` builder exception is already in place (Q-0125 (a)).
- **Dependents:** EZD-023c, EZD-023d and EZD-023e extend `release.mjs` and `release.test.mjs`. EZD-025 imports `createGitHubApi`, `environmentBranchRule` and `evaluateEnvironmentRule` (vault/plans/EZD-025.md lines 30, 184; it calls `environmentBranchRule`, which is async, so it must `await` it).

Risks:
- **`merge_commit_sha`.** R-004 did not find `merge_commit_sha` in the documented commit-pulls item; GitHub's pull-request objects normally carry it. If it is missing, step 5 refuses every real release with `no_merged_pr`, which is safe. Until launch every run ends `not_configured` before step 5 (Q-0113). The first chance to check it is a read-only `gh api repos/IronFrame414/EZ-Draft/commits/<sha>/pulls` after the Phase 0 merge (no merged pull request existed on 2026-10-19). The orchestrator runs it, and if the field is absent, raises a question before EZD-023e.
- **check-migrations reads `process.env.GITHUB_ACTIONS` itself** (finding V2). In tests the fixture's `origin` is a `file://` repo, so its tag fetch succeeds either way.
- **The interim `not_built`** has no runtime effect: nothing calls the script before EZD-023e. If part e were dropped, the script would stay unreachable.
- **Test time:** small fixtures (two or three commits); root node tests run on every gate (EZD-001).

## 10. Open questions

None.
