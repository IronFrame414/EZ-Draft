# EZD-023d · Dump, migrations and tenant 1

- **ACs:** AC-EZD-023d-1, AC-EZD-023d-2, AC-EZD-023d-3 (`vault/spec/acceptance-criteria.md` lines 81–83, generated from Done-when).
- **Complexity:** high (reasoning in section 8).
- **User-visible result:** nothing Josh can see yet. The release script now backs up the production database off-site, applies the migrations and sets up tenant 1 on the first release, but no workflow runs it until EZD-023e adds `.github/workflows/release.yml`.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

Part 3 of 4 of the EZD-023b split (Q-0157). It is planned from the archived plan, `git show 70cf5a5:vault/plans/EZD-023b.md` (called **"the archived plan"**, as in vault/plans/EZD-023b.md line 8): its "Part EZD-023d" (lines 74–94), Step 4 (release key, masking), Step 6 steps 11–15 and "Other rules", Step 9, and tests T7 (call order, values), T9, T10, T11 (a), (b), (e), T21. Findings V1, V2, V6, V12, V13, V14 apply. Parts EZD-023b (238bd8c) and EZD-023c (bc1d307) are built; this plan was re-validated against their merged code in `scripts/release/` and `scripts/release/__tests__/release.test.mjs` on 2026-10-19 (structure-only edits; STATUS.md rows EZD-023b, EZD-023c).

## 1. What to build

Ticket row (vault/tickets/phases/phase-00.md line 51):
- **Scope:** Plan Step 6 steps 11–15: pending migrations from the commit's worktree; the tenant 1 check and the owner email; the dump with the auth exclusions and the role-password guard; the off-site upload with `manifest.json`; the migrations with timeouts; the tenant 1 bootstrap. Step 9. The child-process output rule (Step 6 Other rules). The `@aws-sdk/client-s3` dependency and its row. Split from EZD-023b (Q-0157); plan Part EZD-023d.
- **Done when:** Before any migration runs, the release writes a database dump off-site under `releases/`, using the release key only, without auth session tables or role passwords. A failed dump, upload, migration or tenant 1 setup stops it before anything goes live. No secret or owner email appears in its output.
- **Depends on:** EZD-023c, EZD-004a, EZD-005a, EZD-005b.
- **Spec ref:** Non-functional · Operations; R26 R12.

### Steps

**Step 1. `scripts/release/dump.mjs`: child processes, the dump invocation, `dumpDatabase`, the Supabase CLI runner.**
- `runChild(command, args, { cwd, env, input })` → `Promise<{ code, stdout, stderr }>`. It spawns without a shell, with stdio `['pipe', 'pipe', 'pipe']`, writes `input` (or nothing) to stdin and closes it, and captures both streams as UTF-8. It never inherits stdio, so no child output reaches the log raw (archived plan Step 6 "Other rules"; Q-0112: "never pass child stderr through"). A spawn error resolves `{ code: null, stdout: '', stderr: <error.message> }` (*planner's choice*). Closing stdin also covers the CLI hang without a TTY (R-007: supabase/cli issue #2238).
- `childEnv(env)` → a copy of `env` without the 10 `RELEASE_SECRET_NAMES` (part b), `GITHUB_TOKEN`, `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY`. Every child gets this env, so the CLI and psql never hold the Vercel token, the bucket keys or the owner email (*planner's choice*, least privilege under Q-0112 finding 10; the database URL reaches them only as an argument).
- `AUTH_DATA_EXCLUDES`: frozen `['auth.sessions', 'auth.refresh_tokens', 'auth.one_time_tokens', 'auth.flow_state']` (Q-0112: "dumps exclude auth.sessions, auth.refresh_tokens, auth.one_time_tokens, auth.flow_state").
- `DUMP_EXCLUDE_FLAG = '--exclude'`. Settled by the planner from the pinned CLI: `supabase db dump --help` on 2.121.0 prints `--exclude, -x string  List of schema.tables to exclude from data-only dump`, and its `--dry-run` script turns each into `--exclude-table "auth"."sessions"` (run 2026-10-19).
- `DUMP_FILES`: frozen `['roles.sql', 'schema.sql', 'data.sql']` (archived plan Step 6 step 13; EZD-025 Step 4 uses the same files).
- `buildDumpInvocation(kind, { dbUrl, local, file, exclude })` (pure) → `{ args }`, with `kind` one of `roles`, `schema`, `data`; anything else throws `Error('dump_kind_invalid')`.
  - `args` starts `['db', 'dump']`, then `['--local']` when `local === true`, else `['--db-url', dbUrl]` (EZD-025 needs `{ local: true }`, vault/plans/EZD-025.md line 253).
  - `roles`: `['--role-only']`. `schema`: nothing more. `data`: `['--data-only', '--use-copy']`, then `['--exclude', name]` for each name of `exclude` (default `AUTH_DATA_EXCLUDES`), in order. `exclude` with a kind other than `data` throws `Error('dump_exclude_data_only')` (the CLI flag is data-only).
  - Then `['--file', file]` when `file` is given.
  - The pinned CLI's `--role-only` script runs `pg_dumpall --roles-only … --no-role-passwords` (planner's `--dry-run` read, 2026-10-19). The guard below stays as the second line of defence (Done when: "without … role passwords").
- `ROLE_PASSWORD_RE = /\bPASSWORD\s+'|SCRAM-SHA-256\$|\bmd5[0-9a-f]{32}\b/i` (archived plan Step 6 step 13, *planner's choice of pattern*).
- `dumpDatabase({ dbUrl, local, outDir, supabase })` → `Promise<{ files: [{ name, path, size, sha256 }] }>`. `supabase` defaults to `createSupabaseCli()`, so EZD-025's call `dumpDatabase({ dbUrl | local, outDir })` works unchanged (vault/plans/EZD-025.md line 253). For `roles`, `schema`, `data`, in that order:
  1. `await supabase.dump(kind, { dbUrl, local, file: <outDir>/<kind>.sql })`, with `exclude: AUTH_DATA_EXCLUDES` added for `data` only. A rejection throws detail `<kind>_failed`.
  2. The file must exist and be larger than 0 bytes, else detail `<kind>_empty`.
  3. After `roles` only: if `roles.sql` matches `ROLE_PASSWORD_RE`, detail `role_passwords`. This runs before the other dumps and before any upload.

  Every failure rejects with an `Error` whose `code` is `dump_failed`, `detail` is the detail and `message` is `dump_failed: <detail>`. The child's text is kept on `error.stderr` only. `sha256` is the lower-case hex SHA-256 of the file (EZD-025 manifest format).
- `createSupabaseCli({ root, run })` → `{ dump(kind, opts), pushDryRun({ dbUrl, workdir }), push({ dbUrl, workdir, lockTimeout, statementTimeout }) }`. `root` defaults to the repository root (two folders above this file); `run` defaults to `runChild`. Each method calls `run('<root>/node_modules/.bin/supabase', args, { cwd: root, env: childEnv(process.env) })`, with `args` from `buildDumpInvocation` or `buildPushInvocation` (Step 2). Exit code 0 resolves `stdout`. Any other code rejects with an `Error` whose message is `supabase db dump exited <code>` or `supabase db push exited <code>` (no arguments, so never the URL), with `exitCode`, `stdout` and `stderr` attached.

**Step 2. `scripts/release/push.mjs`: the migration invocation and its timeouts (pure).**
- `MIGRATION_TIMEOUTS`: frozen `{ lockTimeout: '5s', statementTimeout: '300s' }`. 5 s is from Q-0112 (finding 13, "lock and statement timeouts on migrations"); 300 s is the archived plan's *planner's choice* (Step 6 step 14).
- `withTimeouts(dbUrl, { lockTimeout, statementTimeout } = MIGRATION_TIMEOUTS)` appends `options=` + `encodeURIComponent('-c lock_timeout=<l> -c statement_timeout=<s>')` to the URL, with `?` when the URL has no query and `&` otherwise. The default gives `options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s`. `%20`, not `+`, because libpq does not decode `+` as a space. If the URL already has an `options` key, it throws `Error('db_url_has_options')`, which fails closed.
  - **Why the URL form** (the archived plan let the builder pick the URL or `PGOPTIONS`). pgx sends an unknown URL key such as `options` as a startup parameter, and a URL value overrides `PGOPTIONS` (R-007, pgconn config.go). The planner ran psql 17.11 on the local stack with this exact `options` query and got `lock_timeout` 5000 and `statement_timeout` 300000 back.
  - Not settled (R-007): whether the CLI passes `--db-url` through pgx's ParseConfig, and whether the Session pooler forwards `options`. The pooler half is checked on every run by the tenant check (Step 4), which runs on this same URL. The CLI half is in section 9 Risks.
- `buildPushInvocation({ dbUrl, workdir, dryRun, lockTimeout, statementTimeout })` → `{ args }`:
  - dry run: `['db', 'push', '--db-url', dbUrl, '--workdir', workdir, '--yes', '--dry-run']`;
  - real push: `['db', 'push', '--db-url', withTimeouts(dbUrl, { lockTimeout, statementTimeout }), '--workdir', workdir, '--yes']`, with the timeouts defaulting to `MIGRATION_TIMEOUTS`.
  - Sources: `--db-url` and `--dry-run` from the CLI reference (R-007); `--workdir` ("used exactly as given, with no ancestor directory search") and `--yes` ("answer yes to all prompts") from the pinned CLI's global flags (`supabase db dump --help`, 2.121.0). `--yes` is *planner's choice*, so a prompt can never hang the job (R-007, issue #2238). There is no `--include-all`: EZD-023a's M3 already refuses an out-of-order version, so a CLI refusal fails closed.
- `parsePendingMigrations(text)` → the distinct matches of `/\b\d{14}_[a-z0-9_]+\.sql\b/g` in `text`, in order. The release logs file names only (archived plan Step 6 step 11: "The pending list is printed (file names only)"), so nothing else from the dry-run output is printed.

**Step 3. `scripts/release/offsite-upload.mjs`: `createOffsiteUploader` over `@aws-sdk/client-s3`.**
- `createOffsiteUploader(cfg, sdk = { S3Client, PutObjectCommand })`, where `cfg = { endpoint, region, bucket, accessKeyId, secretAccessKey }`, returns a frozen object with exactly two methods, `putFile` and `putJson`. There is no read, list or delete method (archived plan Step 6 deps; Q-0112: "separate release key limited to releases/ with write only").
- Client: `new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })`. The option names and values come from R-006 (aws-sdk-js-v3 issue #6810; AWS SDK data-integrity guide); `forcePathStyle` is EZD-025's setting (vault/plans/EZD-025.md line 228). The region is the string in the endpoint host, for example `us-west-004` (R-006, Backblaze JS v3 guide).
- `putFile(key, path, { contentType })` reads the file into a Buffer and sends `PutObjectCommand({ Bucket: bucket, Key: key, Body, ContentType: contentType, ContentMD5: <base64 MD5 of Body> })`.
  - `ContentMD5` is *planner's choice*. AWS requires Content-MD5 or a checksum on a PutObject that sets an Object Lock retention, and Backblaze says its Object Lock "works the same way as it does with AWS" (R-006). The bucket is under Object Lock (Q-0111), and `WHEN_REQUIRED` stops the SDK from adding its own CRC32. So the MD5 covers the case either way.
- `putJson(key, value)` does the same with `Body = JSON.stringify(value, null, 2) + '\n'` and `ContentType: 'application/json'`.
- A rejected `send` rejects with `Error('offsite put failed: <key> (<status>)')`, where `<status>` is `error.$metadata?.httpStatusCode` or `network`. It never carries the SDK's message, which can name the endpoint or the key id (Q-0112: mask and never pass raw output through).

**Step 4. `scripts/release/bootstrap.mjs`: the SQL runner, the tenant check, `renderBootstrap` (archived plan Step 9).**
- `buildPsqlInvocation({ dbUrl })` (pure) → `{ command: 'psql', args: ['--dbname', dbUrl, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'] }`. These are the archived plan's flags (Step 6 deps `sql`) and the ones `scripts/db/sql.mjs` uses on the local stack.
- `createSql({ run })` → `sql(text, { dbUrl })`. It calls `run(command, args, { input: text, env: childEnv(process.env) })`: the SQL goes on stdin, never in an argument or a file (archived plan Step 6 deps; Step 9). Exit 0 resolves `{ stdout, stderr }`. Any other code rejects with `Error('psql exited <code>')`, with `exitCode`, `stdout` and `stderr` attached. On the local stack the planner saw psql write `NOTICE:  …` to stderr with exit 0, and `ERROR:  …` to stderr with exit 3 under `ON_ERROR_STOP=1` (2026-10-19). That matches finding V6.
- `TENANT_CHECK_SQL` (exported; fakes compare against it). It is one psql script that prints one line, `<0|1> <lock_timeout ms> <statement_timeout ms>`:
  ```
  select to_regclass('public.tenant') is not null as has_tenant \gset
  \if :has_tenant
  select (select count(*) from public.tenant where id = '00000000-0000-4000-8000-000000000001') || ' ' || (select setting from pg_catalog.pg_settings where name = 'lock_timeout') || ' ' || (select setting from pg_catalog.pg_settings where name = 'statement_timeout');
  \else
  select '0 ' || (select setting from pg_catalog.pg_settings where name = 'lock_timeout') || ' ' || (select setting from pg_catalog.pg_settings where name = 'statement_timeout');
  \endif
  ```
  - It reads the tenant table only when the table exists, because a missing table fails at parse time (archived plan Step 6 step 12: `to_regclass`; tenant 1 id from docs/architecture.md `### Tenancy tables (EZD-005)` and supabase/bootstrap/tenant-1.sql line 13).
  - Lesson L-009 (SQL fixed as contract text is run on the pinned stack). On the local stack (psql and PostgreSQL 17.11, 2026-10-19), the script printed:
    - `1 5000 300000` over the `withTimeouts` URL;
    - `1 0 0` without the options;
    - `0 0 0` with the table name changed to a missing table.
- `OWNER_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/` is EZD-005b T18's pattern, anchored (vault/plans/EZD-005b.md line 95; archived plan Step 6 step 12). It allows no quote, space or line break, so the rendered value cannot leave the SQL string. STATUS.md row EZD-005b asks that the review verify `renderBootstrap` forbids quotes.
- `BOOTSTRAP_PATH = 'supabase/bootstrap/tenant-1.sql'`.
- `renderBootstrap(fileText, email)` (pure) checks in this order:
  1. It trims `email`. If the result does not match `OWNER_EMAIL_RE`, it throws `code` `owner_email_missing`.
  2. It counts `PASTE-YOUR-EMAIL-HERE` case-sensitively. If the count is not exactly 1, it throws `code` `bootstrap_file_invalid`. The merged file's own guard holds the lower-case `'paste-your-email-here'` (line 9), which stays (finding V6).
  3. It returns the text with that one occurrence replaced by the trimmed email.

  Errors are `Error(<code>)` with `.code`; they never hold the email.

**Step 5. `scripts/release/release.mjs`: steps 11–15 (extend part c's `runRelease`).** This builds the archived plan's Step 6 steps 11–15. The order below runs the step 12 tenant check before the step 11 dry run. That is the order the archived T7 records (`vercel.listEnv` …, `sql` tenant check, `supabase.pushDryRun`, `supabase.dump(roles)` …), and Q-0157 keeps T7's values unchanged for part e. *Planner's choice*: both steps only read, so the order changes no outcome. New deps: `supabase`, `sql`, `offsite` (a factory `(cfg) → uploader`), named in vault/plans/EZD-023b.md section 3 "deps (later parts)". `dbUrl` is `processEnv.BACKUP_SOURCE_DB_URL`. `masked` is `valuesToMask(processEnv)` (part b) plus every non-empty `RELEASE_SECRET_NAMES` value and `GITHUB_TOKEN`; this is the list passed to `safeLines` (part c) (*planner's choice*: raw secrets are dropped too, not only the derived ones). When part c's `alreadyLive` is true, A–F are skipped, as the archived Step 6 step 9 says ("skip steps 10–16 and go to step 17"). That run promotes nothing, so no promotion happens without a dump.

- **A. Worktree** (archived step 11). `tmp = mkdtemp(<os.tmpdir()>/ezd-release-)`, then `git(['worktree', 'add', '--detach', <tmp>/wt, sha])`. Migrations and the bootstrap file come only from the commit, never from a working tree (archived plan Step 6 step 11; Step 9). A throw gives **`pending_check_failed`**.
- **B. Tenant 1 check and the owner email** (archived step 12, Step 9).
  - The step calls `sql(TENANT_CHECK_SQL, { dbUrl: withTimeouts(dbUrl) })`. A rejection, or trimmed `stdout` that does not match `^([01]) (\d+) (\d+)$`, gives **`tenant_check_failed`** (*planner's choice of code*; fails closed, lesson L-006).
  - If the two numbers are not `5000` and `300000`, the result is **`migrate_timeouts_not_applied`** (*planner's choice*). This proves on every run that the server applies the migration timeouts through the pooler, before anything changes (Q-0112 finding 13).
  - **Tenant missing (`0`).** `TENANT1_OWNER_EMAIL` is required. The step reads `<tmp>/wt/supabase/bootstrap/tenant-1.sql` and calls `renderBootstrap` on it, then keeps the rendered SQL in memory only.
    - An email that is unset, empty or fails the pattern gives **`owner_email_missing`**.
    - A missing file or a wrong placeholder count gives **`bootstrap_file_invalid`**.

    Both stop the run before anything changes (archived step 12: "so a missing secret stops the release before anything changes"; rendering this early is *planner's choice*, so a bad file also stops it before the dump).
  - **Tenant present (`1`).** If `TENANT1_OWNER_EMAIL` is still set, the step adds the notice `owner_email_secret_unused` and its summary line (section 6). The run goes on, and F is skipped (archived step 12; Q-0112: "delete TENANT1_OWNER_EMAIL after the first release").
- **C. Pending migrations** (archived step 11). `out = await supabase.pushDryRun({ dbUrl, workdir: <tmp>/wt })`. The step logs `pending migration: <name>` for each `parsePendingMigrations(out)` name, or `pending migrations: none`. A rejection gives **`pending_check_failed`**.
- **D. Dump, off-site** (archived step 13; 11 Operations: "A script takes a database dump before each promotion"; Q-0106; Q-0074 (a) B2).
  1. `prefix = 'releases/' + tag + '-' + <new Date(Number(now())) as UTC yyyyMMdd'T'HHmmss'Z'> + '/'` (`Number(now())` is the built runner's clock form: part b's test default `now` returns a `Date`, part c's `makeC` a number; `release.mjs` step 9).
  2. `dumpDatabase({ dbUrl, outDir: <tmp>/dump, supabase })`. A rejection gives **`dump_failed`**, with the log line `dump_failed: <detail>`.
  3. `uploader = offsite({ endpoint: BACKUP_S3_ENDPOINT, region: BACKUP_S3_REGION, bucket: BACKUP_S3_BUCKET, accessKeyId: RELEASE_S3_ACCESS_KEY_ID, secretAccessKey: RELEASE_S3_SECRET_ACCESS_KEY })`, using the release key only and never `BACKUP_S3_*_KEY*` (Q-0112 finding 10; Done when).
  4. `putFile(prefix + name, path, { contentType: 'application/sql' })` for `roles.sql`, `schema.sql`, `data.sql`, in that order.
  5. **Last**, `putJson(prefix + 'manifest.json', manifest)` with `manifest = { format: 1, created_at: new Date(Number(now())).toISOString(), source_ref: supabaseRefFromDbUrl(dbUrl), newest_migration, files: [{ name, size, sha256 }] }`. This is EZD-025's format (vault/plans/EZD-025.md line 260). `newest_migration` is the largest 14-digit prefix among `<tmp>/wt/supabase/migrations/` names matching `^\d{14}_[a-z0-9_]+\.sql$` (C5's pattern), or `null` when there is none.
  6. Any put that rejects gives **`dump_upload_failed`**. After the manifest, the step writes the summary line `database dump saved: <prefix>` (section 6). The result carries `dumpPrefix` and `dumpFiles` (`[{ name, size, sha256 }]`, for part e's `release.json`, archived step 18).
- **E. Migrations** (archived step 14). `supabase.push({ dbUrl, workdir: <tmp>/wt, lockTimeout: '5s', statementTimeout: '300s' })`. A rejection, a lock timeout included, gives **`migrate_failed`** (Q-0112 finding 13; Q-0106: the live site stays on the previous version).
- **F. Tenant 1** (archived step 15; Step 9). This runs only when B found tenant 1 missing: `sql(<rendered SQL>, { dbUrl })`.
  - It is done when it resolves and `stdout + stderr` contains `ezd_bootstrap_done`.
  - It is also done when it rejects and `message + stdout + stderr` contains `ezd_bootstrap_already_done` (finding V6).
  - Anything else gives **`bootstrap_failed`**.

  The rendered SQL is never logged, written to disk, uploaded or returned.
- **Child output** (archived "Other rules"). For a failure in A–F that carries `stderr`, the release logs at most 20 lines of `safeLines(stderr.split(/\r?\n/), masked)`, each as `  | <line>`. It logs no other child text and no `error.message`, so a message that names the URL or the email is never printed.
- **Cleanup.** `finally` runs `git(['worktree', 'remove', '--force', <tmp>/wt])` and `git(['worktree', 'prune'])`, ignoring their errors, then `rmSync(tmp, { recursive: true, force: true })` (archived "Other rules").
- **Summary lines.** Part b writes `release stopped: <code> — nothing changed` for every code other than `not_configured`. That line is still true for every code of A–D2. `dump_upload_failed`, `migrate_failed` and `bootstrap_failed` get the section 6 lines instead, because something outside the runner may have changed. In the built runner the `stop(code, extra)` closure always writes the "nothing changed" line and `stopV` adds `prNumber`, `tag`, `resume`, `notices` (`release.mjs`); so A–D2 refusals return through `stopV(code, { ...built, … })`, and these three codes write their section 6 line instead of `stop`'s (how is the builder's; each case has exactly one `release stopped:` line). The notice is added through the runner's `notice(code)` helper, with `owner_email_secret_unused` added to `NOTICE_LINES`.
- **Interim return** (Q-0157; vault/plans/EZD-023b.md Step 4 step 9: "Parts c and d move this return past their own steps"). After F, or after E when F is skipped, the step returns `{ ok: false, code: 'not_built', prNumber, tag, resume, deploymentId, previousDeploymentId, alreadyLive, dumpPrefix, dumpFiles, notices }`. No test asserts it, and nothing runs the script until part e. When A–F ran, its summary line is `release stopped: not_built — the dump and migrations ran; nothing went live` (section 6); when `alreadyLive` skipped A–F, it keeps part c's built line `release stopped: not_built — nothing changed` (Q-0162 (a)). The log line stays as built. Built form today (part c, `release.mjs` end of `runRelease`): the log line `not_built: the release steps after the migration check are added by EZD-023c, EZD-023d and EZD-023e`, then `stopV('not_built', built)` with `built = { deploymentId, previousDeploymentId, alreadyLive }`; this part moves it past F and adds `dumpPrefix`, `dumpFiles`. The `alreadyLive` path's summary line is settled by Q-0162 (a) above.
- **CLI.** It adds the deps `supabase: createSupabaseCli({ root: process.cwd() })`, `sql: createSql({ run: runChild })` and `offsite: createOffsiteUploader`. None of them reads `process.env` until it is called (part c's lazy-dep rule).

**Step 6. Dependency `@aws-sdk/client-s3`.**
- Install it with `pnpm add -D -w @aws-sdk/client-s3@3.1153.0`, a root devDependency, exact (`saveExact`).
  - 3.1153.0 is the npm `latest` dist-tag, read by the planner on 2026-10-19 (`npm view`).
  - Its `engines.node` is `>=20.0.0`, which fits Node 22 (docs/architecture.md Runtime).
- In the same commit, add a `docs/architecture.md` `## Dependencies` row (CLAUDE.md rule 7; check C1): `| \`@aws-sdk/client-s3\` | \`3.1153.0\` | root | Off-site bucket, S3-compatible API (release dumps EZD-023d; backups EZD-025) | EZD-023d |`. These are the archived plan's Step 11 cells; "ends in `EZD-023d`" is part e's T18.
- If the install reports a build script, the builder stops and raises a question (docs/architecture.md "Adding a dependency"; Q-0140 (a)). `pnpm-workspace.yaml` is not in this plan's files.

### Files

| Path | New / change | Written by | Why |
| --- | --- | --- | --- |
| `scripts/release/dump.mjs` | New | builder | Step 1 (EZD-025 imports `dumpDatabase`) |
| `scripts/release/push.mjs` | New | builder | Step 2 |
| `scripts/release/offsite-upload.mjs` | New | builder | Step 3 |
| `scripts/release/bootstrap.mjs` | New | builder | Step 4 |
| `scripts/release/release.mjs` | Change (parts b–c's file) | builder | Step 5 |
| `package.json` (root) | Change | builder (`pnpm add`) | Step 6 |
| `pnpm-lock.yaml` | Change | builder (`pnpm add`) | Step 6; the gate installs with `--frozen-lockfile` |
| `docs/architecture.md` | Change (one Dependencies row) | builder | Step 6 |
| `scripts/release/__tests__/release.test.mjs` | Change (parts b–c's file; extends `CLEAN`) | test-author | T9 (a)–(g), T10, T11, T25, T27 |
| `scripts/release/__tests__/bootstrap.test.mjs` | New | test-author | T9 pure cases, (h), (i) |
| `scripts/release/__tests__/invocations.test.mjs` | New | test-author | T21, T26 |

These are 8 builder files, two of them written by `pnpm add`, plus 3 test files: the count of the approved proposal (archived plan Part EZD-023d; Q-0157). Write rules (lesson L-002; finding V13): `.claude/hooks/guard-paths.mjs` lets the builder write `scripts/release/`, the root `package.json`, `pnpm-lock.yaml` and `docs/architecture.md`, and lets the test-author write `__tests__/`.

This part does not touch:
- `context.mjs`, `release-name.mjs`, `github-api.mjs` (part b), `vercel-api.mjs`, `env-check.mjs`, `redact.mjs` (part c), which it only imports;
- `check-migrations.mjs`, `tags.mjs` and `__tests__/git-fixture.mjs` (EZD-023a);
- `supabase/bootstrap/tenant-1.sql`, which is read at the commit;
- `.env.example`, `docs/runbook.md`, `.github/` and `pnpm-workspace.yaml`.

**Data:**
- No migration, table, policy, `schema_version` or money field.
- At run time (from part e on), on the first release only, the bootstrap inserts tenant 1, Josh's `app_user` and his membership through EZD-005b's file (archived plan "Data").
- Release dumps (client data, without the four auth session tables) go only to the B2 bucket under `releases/`. Object Lock keeps them at least 91 days (Q-0111), and the 13-week rule is EZD-025's lifecycle setting (Q-0075). They never go to the repo, an artifact or a log.

## 2. Sources

- `vault/spec/sections/11-non-functional-requirements.md` Operations (lines 59–61): "A script takes a database dump before each promotion"; "Migrations add before they remove … so the previous deploy can be restored at any time". Read with Performance: no effect, because nothing runs in the app or the browser.
- `03-data-model.md` Architecture rules and `04-app-shell-and-global-ui.md`: read, not affected (no table, no screen). `vault/spec/non-goals.md` line 33 ("No production deploy except from `main`") and line 23 (no point-in-time recovery). Glossary: no release or backup entry.
- Decisions:
  - R26 R12 (`decisions/13b-round-26.md`);
  - in `decisions/11-non-functional-requirements.md`: Q-0106 (the workflow backs up the production database, applies migrations, makes the build live, and stops with the live site unchanged on any failure), Q-0074 (a) (B2), Q-0075 (13 weeks), Q-0111 (Object Lock, at least 91 days);
  - Q-0112 (QUESTIONS.md row, confirmed by Josh 2026-10-18): mask derived secrets and never pass child stderr through; the separate release key, `releases/` only, write only; the four auth exclusions; lock and statement timeouts on migrations; delete `TENANT1_OWNER_EMAIL` after the first release;
  - Q-0033 (a) (`decisions/02-product-overview.md`: no personal data committed);
  - Q-0157 (the split); Q-0140 (a) (build scripts denied); Q-0125 (a) (`scripts/release/` is the builder's).
- The archived plan (`70cf5a5:vault/plans/EZD-023b.md`): Part EZD-023d (lines 74–94); Step 4 (secret table, masking); Step 6 deps, result, steps 11–15, "Other rules"; Step 9; "Data"; T7, T9, T10, T11, T21; findings V2, V6, V12–V14.
- vault/plans/EZD-023b.md sections 1, 3, 4 (`RELEASE_SECRET_NAMES`, `valuesToMask`, deps names, summary rule, fixture `R`, `CLEAN`). vault/plans/EZD-023c.md sections 1, 3, 4 (`safeLines`, `redactUrl`, `supabaseRefFromDbUrl`, the fake clock `T0`, the `alreadyLive` skip, the lazy CLI deps).
- vault/plans/EZD-025.md lines 28–38, 228, 253, 260 (`dumpDatabase`, the manifest format, `forcePathStyle`, the `@aws-sdk/client-s3` row). vault/plans/EZD-005b.md line 95 (email pattern).
- Code:
  - `supabase/bootstrap/tenant-1.sql` (EZD-005b: placeholder line 5, guard line 9, tenant id line 13, `raise exception` / `raise notice` codes);
  - `scripts/db/sql.mjs` (psql flags);
  - `.claude/hooks/guard-paths.mjs` lines 15–17, 77–84;
  - `.claude/hooks/guard-bash.mjs` line 20 (agents never run `supabase … db push`), line 23 (never `node scripts/release/…`);
  - root `package.json` `test`;
  - built parts b and c (re-validation 2026-10-19): `scripts/release/context.mjs` (`RELEASE_SECRET_NAMES`, `valuesToMask`, `maskCommands` with the Q-0161 `%25` escape, used only by the CLI's `mask`), `redact.mjs` (`redactUrl`, `safeLines`), `env-check.mjs` (`supabaseRefFromDbUrl`), `release.mjs` (`runRelease`, `stop`, `stopV`, `notice`, `NOTICE_LINES`, `alreadyLive`, the interim `not_built`, `createGit`, the CLI deps), `__tests__/release.test.mjs` (fixtures, section 4);
  - `docs/architecture.md` `## Dependencies`, "Adding a dependency", `### Tenancy tables (EZD-005)`.
- Planner's checks on 2026-10-19: `supabase db dump --help` and `--dry-run` scripts on the pinned CLI 2.121.0 (no connection made); the SQL of Step 4 on the local stack (PostgreSQL 17.11, read-only queries); `npm view @aws-sdk/client-s3` (version 3.1153.0, engines).
- Lessons: L-002, L-004, L-006, L-009, L-012 (vault/lessons/planner.md).
- Research: **R-006** (B2 PutObject and Object Lock checksums, SDK v3 checksum options, B2 key capabilities, region form). **R-007** (whether the timeouts reach the server through `--db-url` `options` or `PGOPTIONS`, the Supavisor gap, `--yes` and the no-TTY hang, psql on `ubuntu-latest`). R-001 (supabase db push from Actions) belongs to EZD-004c and is not used here.
- Mockup: none (`tickets.json` `mockups: []`).

## 3. Interface contract

The contracts of part b (vault/plans/EZD-023b.md section 3) and part c (vault/plans/EZD-023c.md section 3) stand; this table adds to them.

| Kind | Name or path | Details |
| --- | --- | --- |
| file / export | `scripts/release/dump.mjs` `runChild(command, args, { cwd, env, input })` | → `Promise<{ code: number \| null, stdout, stderr }>`; never rejects; never inherits stdio |
| export | `childEnv(env)` | → copy without the 10 `RELEASE_SECRET_NAMES`, `GITHUB_TOKEN`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` |
| export | `AUTH_DATA_EXCLUDES`, `DUMP_EXCLUDE_FLAG`, `DUMP_FILES`, `ROLE_PASSWORD_RE` | Step 1 values; `DUMP_EXCLUDE_FLAG === '--exclude'` |
| export | `buildDumpInvocation(kind, { dbUrl, local, file, exclude })` | → `{ args: string[] }` (Step 1); throws `dump_kind_invalid`, `dump_exclude_data_only` |
| export | `dumpDatabase({ dbUrl, local, outDir, supabase })` | → `Promise<{ files: [{ name, path, size, sha256 }] }>`; rejects `Error` with `code: 'dump_failed'`, `detail` ∈ `roles_failed`, `schema_failed`, `data_failed`, `roles_empty`, `schema_empty`, `data_empty`, `role_passwords` |
| export | `createSupabaseCli({ root, run })` | → `{ dump(kind, { dbUrl, local, file, exclude }), pushDryRun({ dbUrl, workdir }) → stdout, push({ dbUrl, workdir, lockTimeout, statementTimeout }) → stdout }`; non-zero exit rejects `Error('supabase db dump\|push exited <code>')` with `exitCode`, `stdout`, `stderr` |
| file / export | `scripts/release/push.mjs` `MIGRATION_TIMEOUTS` | frozen `{ lockTimeout: '5s', statementTimeout: '300s' }` |
| export | `withTimeouts(dbUrl, timeouts?)` | → string; throws `db_url_has_options` |
| export | `buildPushInvocation({ dbUrl, workdir, dryRun, lockTimeout, statementTimeout })` | → `{ args }` (Step 2) |
| export | `parsePendingMigrations(text)` | → `string[]` |
| file / export | `scripts/release/offsite-upload.mjs` `createOffsiteUploader(cfg, sdk?)` | `cfg = { endpoint, region, bucket, accessKeyId, secretAccessKey }`; `sdk = { S3Client, PutObjectCommand }` (tests pass fakes) → frozen `{ putFile(key, path, { contentType }), putJson(key, value) }`; rejects `Error('offsite put failed: <key> (<status \| network>)')` |
| file / export | `scripts/release/bootstrap.mjs` `buildPsqlInvocation({ dbUrl })` | → `{ command: 'psql', args }` (Step 4) |
| export | `createSql({ run })` | → `sql(text, { dbUrl }) → Promise<{ stdout, stderr }>`; non-zero rejects `Error('psql exited <code>')` with `exitCode`, `stdout`, `stderr` |
| export | `TENANT_CHECK_SQL`, `OWNER_EMAIL_RE`, `BOOTSTRAP_PATH` | Step 4 text and values |
| export | `renderBootstrap(fileText, email)` | → string; throws `Error` with `.code` `owner_email_missing` or `bootstrap_file_invalid` |
| deps (added) | `supabase`, `sql`, `offsite` | `supabase`: a `createSupabaseCli` object or fake with `dump`, `pushDryRun`, `push`; `sql(text, { dbUrl })`; `offsite(cfg)` → uploader |
| result (added) | `runRelease` | codes `pending_check_failed`, `tenant_check_failed`, `migrate_timeouts_not_applied`, `owner_email_missing`, `bootstrap_file_invalid`, `dump_failed`, `dump_upload_failed`, `migrate_failed`, `bootstrap_failed`; fields `dumpPrefix?`, `dumpFiles?`; notice `owner_email_secret_unused` |
| log lines | Step 5 | `pending migration: <name>`; `pending migrations: none`; `dump_failed: <detail>`; child lines `  \| <line>` (≤ 20, through `safeLines`) |
| summary lines | section 6 | `database dump saved: <prefix>`; the `dump_upload_failed`, `migrate_failed`, `bootstrap_failed`, `not_built` lines; `notice owner_email_secret_unused: …`; every other code keeps part b's `release stopped: <code> — nothing changed` |
| key layout | off-site | `releases/<tag>-<yyyyMMdd>T<HHmmss>Z/{roles.sql, schema.sql, data.sql, manifest.json}`; manifest last |

## 4. Tests

All tests use `node:test`. Each file's top-level `describe` title starts with `EZD-023d` (finding V14); in `release.test.mjs` this is a new top-level `describe`. No test reaches the network or a database (CLAUDE.md rule 6): `supabase`, `sql` and `offsite` are fakes, and `git` is real on part b's fixture `R` (C1, C2; tip C2). Part c's `CLEAN` and fake clock (`T0` = 2026-10-19T12:00:00Z) are extended, not replaced.

Built fixture names (`scripts/release/__tests__/release.test.mjs`, re-validated 2026-10-19):
- `makeR(t)` → `R = { work, c1, c2, tip, … }`; `C1_FILES`, `C2_FILES`, `CLEAN_DB_URL`, `cleanEnv(tip)`, `cleanPull(tip)` (title `Phase 0: Setup`, tag `phase-0`).
- `makeClean(mod, R, opts)` (part b) → `h` with `deps`, `journal` (`{ kind: 'log' | 'summary' | 'mask', value }`), `external` (the shared ordered list of `{ target, args }` for `vercel.promote`, `supabase`, `sql`, `offsite`, `checkLive`, `fetch`, `github.createTag`), `logs()`, `summaries()`, `masks()`, `output()` (log and summary lines), `run()`; helpers `assertNoExternalEffect(h)`, `assertNoText(h, texts, id)`.
- `makeC(mod, R, o)` (part c) → `{ h, f }`: `makeClean(mod, R)` plus the passing Vercel fake (`currentProductionDeployment` → `null`, so `alreadyLive` is false) and `now()` = `T0` as a number. It passes no `env` to `makeClean`, so a case changes `h.deps.processEnv` (the plain `cleanEnv(R.tip)` object) after `makeC` and before `h.run()`.
- Part d's tests start from `makeC` and replace `h.deps.supabase`, `h.deps.sql`, `h.deps.offsite` (part b's defaults are recording Proxies that resolve `undefined`) with the fakes below, which push into `h.external` with targets `sql`, `supabase.dump`, `supabase.pushDryRun`, `supabase.push`, `offsite`, `offsite.putFile`, `offsite.putJson`. T27 (a) replaces `h.deps.git` with a wrapper over the recorded one. T27 (h) commits C3 with `commitFiles(R.work, …)`, pushes `origin main` and sets `R.tip = c3` before `makeC` (`cleanEnv` and `cleanPull` read `repo.tip`).
- `bootstrap.test.mjs` keeps its own copy of `C1_FILES['supabase/bootstrap/tenant-1.sql']` for "fixture `R`'s file" (importing `release.test.mjs` would run its tests).
- The existing part b and c cases all stop before A, so their `assertNoExternalEffect` checks and expected codes are unchanged by this part.

The part d fakes:
- **`sql`** records `{ text, dbUrl }`. For `text === TENANT_CHECK_SQL` it resolves `{ stdout: '0 5000 300000\n', stderr: '' }` (tenant missing). For any other text it resolves `{ stdout: '', stderr: 'NOTICE:  ezd_bootstrap_done\n' }`.
- **`supabase`**:
  - `dump(kind, opts)` records `opts` and writes `-- <kind>\n` to `opts.file` (9, 10 and 8 bytes for `roles`, `schema`, `data`);
  - `pushDryRun(opts)` and `push(opts)` record `opts` plus the sorted `readdirSync(<workdir>/supabase/migrations)` at call time;
  - `pushDryRun` resolves `'Would push these migrations:\n • 20261101000000_create_fixture.sql\n • 20261102000000_add_note.sql\n'`; `push` resolves `''`.
- **`offsite`** is a factory that records each `cfg`. Its uploader records `putFile(key, path, opts)` with the file's bytes read at call time, and `putJson(key, value)`.
- `sql`, `supabase.*`, the `offsite` factory and its puts go into part b's shared ordered list `h.external`.
- "No external effect" (parts b, c) keeps its meaning for their cases, which all stop before A; part d's refusals in A–C call `sql` or `supabase.pushDryRun` and are checked with the call counts below instead. "**Nothing live**" means no `h.external` entry with target `github.createTag`, `vercel.promote` or `checkLive`.
- "**Output**" is every `log` and `summary` line (part b).

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T25 **`EZD-023d done when: the release writes the dump off-site under releases/ with the release key before any migration`** (release.test.mjs) | AC-EZD-023d-1 | unit (git) | `runRelease({ root: R }, CLEAN)` with `processEnv` also holding `BACKUP_S3_ACCESS_KEY_ID: 'key_TEST'` and `BACKUP_S3_SECRET_ACCESS_KEY: 'b2-secret-TEST'`; `R`'s working tree holds an **uncommitted** `supabase/migrations/20261201000000_wip.sql` | Journal order of `sql`, `supabase`, `offsite`: `sql` (`TENANT_CHECK_SQL`), `pushDryRun`, `dump('roles')`, `dump('schema')`, `dump('data')`, `putFile` `roles.sql`, `schema.sql`, `data.sql`, `putJson` `manifest.json`, `push`, `sql` (bootstrap).<br>`offsite` called once, `cfg` deep-equals `{ endpoint: 'https://s3.us-west-004.backblazeb2.com', region: 'us-west-004', bucket: 'ezd-test', accessKeyId: 'relkey_TEST', secretAccessKey: 'rel-secret-TEST' }`.<br>The 4 keys are exactly `releases/phase-0-20261019T120000Z/` + `roles.sql`, `schema.sql`, `data.sql`, `manifest.json`; the 3 `putFile` calls have `contentType: 'application/sql'`; `result.dumpPrefix === 'releases/phase-0-20261019T120000Z/'`.<br>Manifest deep-equals `{ format: 1, created_at: '2026-10-19T12:00:00.000Z', source_ref: 'prodref123', newest_migration: '20261102000000', files: [roles.sql 9, schema.sql 10, data.sql 8, each with the SHA-256 hex of its bytes] }`; `result.dumpFiles` deep-equals `files`.<br>`dump('data')` `exclude` deep-equals `['auth.sessions', 'auth.refresh_tokens', 'auth.one_time_tokens', 'auth.flow_state']`; `roles` and `schema` have no `exclude`.<br>Tenant check `dbUrl` = `CLEAN`'s URL + `?options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s`; dumps, `pushDryRun`, `push` and the bootstrap get `CLEAN`'s URL unchanged; `push` has `lockTimeout: '5s'`, `statementTimeout: '300s'`.<br>`pushDryRun` and `push` share one `workdir`, whose migrations are exactly `['20261101000000_create_fixture.sql', '20261102000000_add_note.sql']`.<br>Log holds `pending migration: 20261101000000_create_fixture.sql` and `… 20261102000000_add_note.sql`; summary holds `database dump saved: releases/phase-0-20261019T120000Z/`.<br>Bootstrap text contains `owner.test@example.com` exactly once and no `PASTE-YOUR-EMAIL-HERE`.<br>Nothing live; `notices` `[]`. After the run the `workdir` and every dump `file`'s folder no longer exist, and `git worktree list --porcelain` in `R` lists one worktree.<br>No output contains `S3cret`, `rel-secret-TEST`, `relkey_TEST`, `b2-secret-TEST`, `key_TEST` or `owner.test@example.com` | Ticket Done when (AC-EZD-023d-1); 11 Operations; Q-0106 (backup, then migrations); Q-0112 (release key, auth exclusions, timeouts); archived plan T7 (order, prefix regex, manifest, workdir, exclude, timeouts, factory cfg), Step 6 step 13; EZD-025 manifest format; part c fake clock `T0` (prefix and `created_at`); fixture sizes from the fake (`-- roles\n` …); Step 4 SQL run on the local stack |
| T10 **`EZD-023d done when: a failed dump or upload stops the release before anything goes live`** (release.test.mjs) | AC-EZD-023d-2 | unit (git) | `CLEAN` with one change each: (a) `dump('schema')` writes a 0-byte file; (b) `dump('data')` rejects with an `Error` whose `exitCode` is 1; (c) `putFile` of `data.sql` rejects; (d) `dump('roles')` writes `ALTER ROLE "x" WITH LOGIN PASSWORD 'SCRAM-SHA-256$4096:abc';`; (e) `dump('roles')` writes no file | (a), (b), (d), (e) `dump_failed`, with log lines `dump_failed: schema_empty`, `dump_failed: data_failed`, `dump_failed: role_passwords`, `dump_failed: roles_empty`, and the summary `release stopped: dump_failed — nothing changed`; (d), (e) also 0 `dump('schema')` and 0 `offsite` puts. (c) `dump_upload_failed`, with summary exactly `release stopped: dump_upload_failed — the database and the live site are unchanged; an incomplete dump may be in releases/phase-0-20261019T120000Z/`. All: `ok === false`, 0 `putJson`, 0 `push`, 0 bootstrap `sql` calls, nothing live; the dump folder no longer exists | 11 Operations (dump first); Q-0106 (any failure stops it); Q-0112 (no raw output); archived plan T10 (a)–(d), Step 6 step 13 (role-password guard); (e) and the detail strings *planner's choice* (lesson L-012); section 6 wording |
| T11 **`EZD-023d done when: a failed migration or tenant 1 setup stops the release before anything goes live`** (release.test.mjs) | AC-EZD-023d-2 | unit (git) | `CLEAN` with one change each: (a) `push` rejects (`exitCode` 1, `stderr` `'ERROR: x'`); (b) bootstrap `sql` resolves with `stderr` `'ERROR:  ezd_bootstrap_email_missing'`; (e) `push` rejects with `stderr` `'ERROR: canceling statement due to lock timeout'`; (g) bootstrap `sql` resolves `{ stdout: '', stderr: '' }`; (h) bootstrap `sql` rejects with `stderr` `'ERROR:  ezd_bootstrap_already_done'` | (a), (e) `migrate_failed`, summary exactly `release stopped: migrate_failed — the live site is unchanged; the database may be partly updated; the dump from before this release is in releases/phase-0-20261019T120000Z/`, 0 bootstrap `sql` calls; (e) a log line contains `canceling statement due to lock timeout`. (b), (g) `bootstrap_failed`, summary `release stopped: bootstrap_failed — the live site is unchanged; the database may be partly updated; the dump from before this release is in releases/phase-0-20261019T120000Z/`. (a), (b), (e), (g): `ok === false`, nothing live. (h) `code !== 'bootstrap_failed'`, no summary line starts `release stopped: bootstrap_failed`, nothing live | Q-0106 ("stopping with the live site unchanged"); archived plan T11 (a), (b), (e), Step 6 steps 14–15; Q-0112 finding 13; finding V6 (already done counts as done; T11 (f) in part e asserts `released`); (g) lesson L-012; section 6 wording |
| T9 **`EZD-023d done when: no secret or owner email appears in the output`** (release.test.mjs) | AC-EZD-023d-3 | unit (git) | Tenant missing and `TENANT1_OWNER_EMAIL`: (a) removed; (b) `josh'@example.com`; (c) `not-an-email`; (d) `a@b.com\nselect 1`. (e) `TENANT1_OWNER_EMAIL: ' owner.test@example.com '`; bootstrap `sql` rejects with an `Error` whose `message` and `stderr` are `ERROR: duplicate key for owner.test@example.com at postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres`. (f) `push` rejects with that same text. (g) `BACKUP_SOURCE_DB_URL` = `postgresql://postgres.prodref123:p%40ss%2Fx@aws-0-us-east-1.pooler.supabase.com:5432/postgres`; `push` rejects with `stderr` `'auth p%40ss%2Fx\nauth p@ss/x\nERROR: y'` | (a)–(d) `owner_email_missing`; 0 `pushDryRun`, `dump`, `push`, nothing live. (e) `bootstrap_failed`; `mask` received `owner.test@example.com` (trimmed) and `S3cret` before the first `log` line; the bootstrap text contains `owner.test@example.com` once. (f), (g) `migrate_failed`; (g) `mask` received `p%40ss%2Fx` and `p@ss/x`, and a log line `  \| ERROR: y`. (e)–(g): no output contains `owner.test@example.com`, `S3cret`, `p%40ss%2Fx` or `p@ss/x` | Ticket Done when (AC-EZD-023d-3); archived plan T9 (a)–(g); Step 4 "Masking"; Step 6 "Other rules"; Q-0112 finding 7; part b `valuesToMask`; part c `safeLines` |
| T9 pure, (h), (i) (bootstrap.test.mjs) | AC-EZD-023d-3 (support) | unit (pure) | `renderBootstrap` of: fixture `R`'s file with `' Owner@Example.com '`; a file with no placeholder and `'a@b.com'`; a file with the placeholder twice and `'a@b.com'`; (h) the committed `supabase/bootstrap/tenant-1.sql` (read from `REPO_ROOT`) with `'owner.test@example.com'`; (i) fixture `R`'s file with `"josh'@example.com"` | First: contains `'Owner@Example.com'` exactly once and no placeholder. Second and third throw `.code` `bootstrap_file_invalid`. (h) contains `owner.test@example.com` exactly once, no `PASTE-YOUR-EMAIL-HERE`, still contains `'paste-your-email-here'`. (i) throws `.code` `owner_email_missing` | Step 4; archived plan T9 pure, T9 (h), (i); tenant-1.sql lines 5, 9 (finding V6); vault/plans/EZD-005b.md line 95; STATUS.md row EZD-005b (quotes refused) |
| T27 Checks before the dump (release.test.mjs) | AC-EZD-023d-2 (support) | unit (git) | `CLEAN` with one change each: (a) the recording `git` throws for `args[0] === 'worktree' && args[1] === 'add'`; (b) the tenant check `sql` rejects; (c) it resolves `'tenant ok'`; (d) it resolves `'0 0 0'`; (e) it resolves `'1 5000 300000'` (tenant present); (f) as (e) with `TENANT1_OWNER_EMAIL` removed; (g) `pushDryRun` rejects with `stderr` `'at postgresql://postgres.prodref123:S3cret@aws-0-us-east-1.pooler.supabase.com:5432/postgres'`; (h) a fixture commit C3 on `R`, pushed as the tip with its own merged pull request (title `Phase 0: Setup`), replaces `supabase/bootstrap/tenant-1.sql` with `do $$ begin raise notice 'ezd_bootstrap_done'; end $$;`; (i) `R`'s working tree (uncommitted) replaces that file the same way | (a) `pending_check_failed`, 0 `sql` calls. (b), (c) `tenant_check_failed`. (d) `migrate_timeouts_not_applied`. (h) `bootstrap_file_invalid`. (a)–(d), (g), (h): `ok === false`, 0 `dump` and `push` calls, nothing live, summary `release stopped: <code> — nothing changed`. (g) `pending_check_failed`; log holds `  \| at postgresql://postgres.prodref123:***@aws-0-us-east-1.pooler.supabase.com:5432/postgres` and no output contains `S3cret`. (e) `notices` deep-equals `['owner_email_secret_unused']`, the summary holds exactly the section 6 notice line, 0 bootstrap `sql` calls, 1 `push` call. (f) `notices` `[]`, 0 bootstrap `sql` calls, 1 `push` call. (i) as T25: 1 bootstrap `sql` call whose text contains `owner.test@example.com` once | Step 5 A–C (codes *planner's choice*; lesson L-012, every refusal has a case); archived plan Step 6 steps 11–12 (from the commit; `owner_email_secret_unused`), Step 9; Q-0112 findings 13, 16; Step 4 SQL output form (local stack run); part c `redactUrl` form `***` |
| T21 Child-process invocations (invocations.test.mjs) | AC-EZD-023d-1 (support) | unit (pure, plus `process.execPath` children) | `U` = `CLEAN`'s `BACKUP_SOURCE_DB_URL`. (a) `buildDumpInvocation('data', { dbUrl: U })`; (b) `('roles', { dbUrl: U, file: '/tmp/d/roles.sql' })`; (c) `('schema', { local: true })`; (d) `('roles', { dbUrl: U, exclude: ['x.y'] })` and `('logs', { dbUrl: U })`; (e) `buildPushInvocation({ dbUrl: U, workdir: '/tmp/w', dryRun: false })`; (f) the same with `dryRun: true`; (g) `withTimeouts(U + '?sslmode=require')` and `withTimeouts(U + '?options=x')`; (h) `buildPsqlInvocation({ dbUrl: U })`; (i) `childEnv({ PATH: '/bin', HOME: '/h', GITHUB_TOKEN: 'g', VERCEL_TOKEN: 'v', TENANT1_OWNER_EMAIL: 'e', RELEASE_S3_SECRET_ACCESS_KEY: 'r', BACKUP_S3_SECRET_ACCESS_KEY: 'b', BACKUP_S3_ACCESS_KEY_ID: 'k' })`; (j) `parsePendingMigrations('x 20261101000000_a.sql\n • 20261101000000_a.sql postgresql://u:p@h/d 20261102000000_b_c.sql')`; (k) `runChild(process.execPath, ['-e', <reads stdin, writes it to stdout, writes 'e' to stderr, exits 2>], { input: 'in' })`; (l) `createSupabaseCli({ root: '/r', run })` and `createSql({ run })` with a recording `run` answering `{ code: 1, stdout: 'o', stderr: 'e' }`, calling `dump('data', { dbUrl: U, file: '/tmp/d/data.sql', exclude: AUTH_DATA_EXCLUDES })` and `sql('select 1;', { dbUrl: U })` | (a) `args` deep-equals `['db', 'dump', '--db-url', U, '--data-only', '--use-copy', '--exclude', 'auth.sessions', '--exclude', 'auth.refresh_tokens', '--exclude', 'auth.one_time_tokens', '--exclude', 'auth.flow_state']`; `DUMP_EXCLUDE_FLAG === '--exclude'`. (b) `['db', 'dump', '--db-url', U, '--role-only', '--file', '/tmp/d/roles.sql']`. (c) `['db', 'dump', '--local']`. (d) throw `dump_exclude_data_only`, `dump_kind_invalid`. (e) `['db', 'push', '--db-url', U + '?options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s', '--workdir', '/tmp/w', '--yes']`. (f) `['db', 'push', '--db-url', U, '--workdir', '/tmp/w', '--yes', '--dry-run']`. (g) `U + '?sslmode=require&options=-c%20lock_timeout%3D5s%20-c%20statement_timeout%3D300s'`; throws `db_url_has_options`. (h) `{ command: 'psql', args: ['--dbname', U, '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A'] }`. (i) `{ PATH: '/bin', HOME: '/h' }`. (j) `['20261101000000_a.sql', '20261102000000_b_c.sql']`. (k) `{ code: 2, stdout: 'in', stderr: 'e' }`. (l) `run` got command `/r/node_modules/.bin/supabase` with (a)'s args plus `--file /tmp/d/data.sql`, and `psql` with (h)'s args and `input: 'select 1;'`; neither `env` holds `GITHUB_TOKEN` or any `RELEASE_SECRET_NAMES` key; the rejections have messages exactly `supabase db dump exited 1` and `psql exited 1`, with `stderr` `'e'` | Steps 1, 2, 4; Q-0112 (auth exclusions, timeouts, no raw output); archived plan T21, Step 6 deps and steps 11, 13, 14; pinned CLI 2.121.0 `db dump --help` (flag name); R-007 (`--yes`, `--dry-run`, `--db-url`); `scripts/db/sql.mjs` (psql flags); `%20` form and the rest *planner's choice* |
| T26 Off-site uploader (invocations.test.mjs) | AC-EZD-023d-1 (support) | unit (pure, fake SDK) | `createOffsiteUploader({ endpoint: 'https://s3.us-west-004.backblazeb2.com', region: 'us-west-004', bucket: 'ezd-test', accessKeyId: 'relkey_TEST', secretAccessKey: 'rel-secret-TEST' }, { S3Client: Fake, PutObjectCommand: FakeCmd })`. (a) `putFile('releases/x/roles.sql', <temp file holding abc>, { contentType: 'application/sql' })`; (b) `putJson('releases/x/manifest.json', { a: 1 })`; (c) `send` rejects with `Object.assign(new Error('denied rel-secret-TEST relkey_TEST'), { $metadata: { httpStatusCode: 403 } })`; (d) `send` rejects with `new Error('getaddrinfo ENOTFOUND')` | The client config deep-equals `{ endpoint: 'https://s3.us-west-004.backblazeb2.com', region: 'us-west-004', forcePathStyle: true, credentials: { accessKeyId: 'relkey_TEST', secretAccessKey: 'rel-secret-TEST' }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' }`. The uploader is frozen, and `Object.keys` deep-equals `['putFile', 'putJson']`. (a) one command input deep-equals `{ Bucket: 'ezd-test', Key: 'releases/x/roles.sql', Body: Buffer 'abc', ContentType: 'application/sql', ContentMD5: 'kAFQmDzST7DWlj99KOF/cg==' }`. (b) `Body` is `'{\n  "a": 1\n}\n'`, `ContentType: 'application/json'`, `ContentMD5` = base64 MD5 of that body. (c) rejects with message exactly `offsite put failed: releases/x/roles.sql (403)`. (d) `… (network)` | Step 3; R-006 (option names and values; Object Lock checksum rule); vault/plans/EZD-025.md line 228 (`forcePathStyle`); Q-0112 (write only, no raw output); MD5 of `abc` (RFC 1321 test suite, `900150983cd24fb0d6963f7d28e17f72`, base64 computed by the planner) |
| T19 Gate (orchestrator) | all | gate | `node scripts/gate.mjs .claude/worktrees/EZD-023d` | exit 0; check C1 passes with the new row | CLAUDE.md rules 7, 12 |

AC map:
- AC-EZD-023d-1 → T25, supported by T21 and T26.
- AC-EZD-023d-2 → T10 and T11, supported by T27.
- AC-EZD-023d-3 → T9, supported by the T9 pure cases and by T25's and T27 (g)'s no-leak checks.

Smoke: none (node tests under `scripts/` always run; docs/architecture.md Test scope). No test asserts `not_built` (Q-0157).

Refusal coverage (lesson L-012):

| Rule | Covered by |
| --- | --- |
| `pending_check_failed` | T27 (a), (g) |
| `tenant_check_failed` | T27 (b), (c) |
| `migrate_timeouts_not_applied` | T27 (d) |
| `owner_email_missing` | T9 (a)–(d), (i) |
| `bootstrap_file_invalid` | T27 (h), T9 pure |
| `dump_failed`, each detail | T10 (a), (b), (d), (e); `data_empty` and `schema_failed` are untested variants of the same branch |
| `dump_upload_failed` | T10 (c) |
| `migrate_failed` | T11 (a), (e) |
| `bootstrap_failed` | T11 (b), (g) |
| Already done counts as done | T11 (h) here; T11 (f) in part e |
| `db_url_has_options`, `dump_kind_invalid`, `dump_exclude_data_only` | T21 |

## 5. Visual checklist

None. No screen changes (`tickets.json` `mockups: []`).

## 6. Proposed wording

GitHub Actions job summary lines Josh reads on the run page, in the style of part b's lines (`release stopped: <code> — nothing changed`) and part c's notices. Josh approves them at Stage 2.

| Where | Text |
| --- | --- |
| Job summary, after the manifest upload | `database dump saved: <prefix>` (for example `database dump saved: releases/phase-1-20261102T140000Z/`) |
| Job summary, `dump_upload_failed` | `release stopped: dump_upload_failed — the database and the live site are unchanged; an incomplete dump may be in <prefix>` |
| Job summary, `migrate_failed` | `release stopped: migrate_failed — the live site is unchanged; the database may be partly updated; the dump from before this release is in <prefix>` |
| Job summary, `bootstrap_failed` | `release stopped: bootstrap_failed — the live site is unchanged; the database may be partly updated; the dump from before this release is in <prefix>` |
| Job summary, notice | `notice owner_email_secret_unused: tenant 1 already exists; delete TENANT1_OWNER_EMAIL from the release environment` |
| Job summary, interim `not_built` after A–F ran (unreachable until part e removes it) | `release stopped: not_built — the dump and migrations ran; nothing went live` |
| Job summary, interim `not_built` when `alreadyLive` skipped A–F | `release stopped: not_built — nothing changed` (part c's built line, unchanged; Q-0162 (a)) |

Every other refusal in this part (`pending_check_failed`, `tenant_check_failed`, `migrate_timeouts_not_applied`, `owner_email_missing`, `bootstrap_file_invalid`, `dump_failed`) uses part b's `release stopped: <code> — nothing changed`, which is true for them. The log lines (`pending migration: …`, `dump_failed: <detail>`) are codes and file names, not prose.

## 7. Security review

**security-review: yes.** Areas: data access, migrations, auth, API.
- **The production dump of client data.** It is written only to the B2 bucket under `releases/` with the release key, never the backup key. It has no read, list or delete path, and it keeps out the four auth session tables and role passwords: the pinned CLI's `--no-role-passwords` plus `ROLE_PASSWORD_RE`. The temporary folder is removed (Q-0111, Q-0112; Steps 1, 3, 5 D).
- **Migrations against production.** They come from the commit's worktree only, carry `lock_timeout` 5 s and `statement_timeout` 300 s, and a probe on the same URL proves the server applies them before anything changes (Q-0112 finding 13; Steps 2, 4).
- **The owner email going into SQL.** It is validated by a pattern with no quote, space or line break, sent on stdin only, never logged, stored or uploaded, and masked trimmed (part b). The release says when the secret should be deleted (Q-0033 (a); Q-0112 finding 16; Step 4).
- **Child processes.** Output is captured, never inherited, and at most 20 lines go through `redactUrl`/`safeLines`, with raw secrets added to the mask list. Children get an env without the release secrets, the job token or the backup key (Step 1 `childEnv`; Q-0112 finding 7).
- **The SDK error text** is never passed through (Step 3).
- **New dependency** `@aws-sdk/client-s3` 3.1153.0 (root devDependency; any build script is denied, Q-0140 (a)).

Reviewers needed: code-reviewer always · calc-auditor no (no calculations) · ui-verifier no (section 5 is empty) · security-reviewer **yes**.

The code-reviewer confirms these *planner's choices*:
- the A/B/C order against the archived step numbers;
- the timeout probe inside the tenant check and its code;
- the codes `pending_check_failed` and `tenant_check_failed`;
- rendering the bootstrap before the dump;
- `ContentMD5`;
- `childEnv`;
- `--yes`;
- the `%20` options form and `db_url_has_options`;
- the detail strings;
- the extended mask list;
- `dumpFiles`;
- `newest_migration: null` when there is none.

## 8. Complexity and model recommendation

**High.** This part dumps a production database of client data off-site, runs migrations against production, and handles the owner email and secret masking through child processes (PROCESS.md section 4 row "high": data access, security; archived plan Part EZD-023d). Test-author and builder: Fable 5.1, or Opus 5.5 when Fable is past its fallback share. Code-reviewer and security-reviewer: Fable 5.1.

## 9. Dependencies

**From the row:**
- **EZD-023c** (done, bc1d307): `safeLines`, `redactUrl`, `supabaseRefFromDbUrl`, the fake clock, `alreadyLive`, the interim return this part moves (vault/plans/EZD-023c.md sections 1, 3, 4). Q-0159 and Q-0160 change only part c's env rules, not this plan. Its recorded deviations (vercel-api.mjs error endings, non-JSON 2xx as null) and Q-0161 (`maskCommands` `%25`) change nothing here; re-validated 2026-10-19.
- **EZD-004a** (done): the pinned `supabase` CLI 2.121.0 at `node_modules/.bin/supabase`.
- **EZD-005a** (done): `public.tenant`.
- **EZD-005b** (done): `supabase/bootstrap/tenant-1.sql` and its result codes (finding V6).

**Missing from the row** (used directly):
- **EZD-023b** (done, 238bd8c): `RELEASE_SECRET_NAMES`, `valuesToMask`, the deps and summary rules, fixture `R`, `CLEAN` (`makeClean`), the journal and `external` list. It is transitive through EZD-023c. Its recorded deviations (github-api null policy, any non-zero migration check) change nothing here; its EZD-005b follow-up (quotes in the owner email) is met by Step 4 `OWNER_EMAIL_RE` and T9 (b), (i).
- **EZD-023a** (done): `__tests__/git-fixture.mjs` (`REPO_ROOT`, `makeRepo`, `commitFiles`). Transitive.
- **EZD-001** (done): the root `node --test "scripts/**/*.test.mjs"` run.

**Dependents:**
- **EZD-023e:**
  - T7 checks this part's order and values;
  - T11 (f), T13 (re-run: new dump, nothing applied twice);
  - `release.json` uses `dumpPrefix` and `dumpFiles`;
  - it removes `not_built`.
  - Notes for its planner:
    - (1) **psql on the runner.** R-007 found PostgreSQL 16 listed on `ubuntu-latest`, but not the `psql` client by name. A step `psql --version` before the release step, or an install of `postgresql-client`, is part e's call. Without psql every run ends `tenant_check_failed`, which is safe.
    - (2) **B2 release key capabilities.** B2 says bucket-restricted keys need `listAllBucketNames` "for compatibility with SDKs", and the capability is named `listAllBucketNames`, not `listBuckets` (R-006). The runbook's release-key line (archived Step 4) should say so. The uploader itself calls only PutObject.
- **EZD-025:**
  - It imports `dumpDatabase` (signature compatible; `supabase` optional) and `AUTH_DATA_EXCLUDES`.
  - Its own `s3-store.mjs` should use the same client options and `ContentMD5` (R-006).
  - New fact for its restore planner: the pinned CLI's data dump script excludes the data of the `vault` and `supabase_migrations` schemas (`--dry-run` read, 2026-10-19). So a restored dump has no gate-hash secret, which `docs/runbook.md` step 10 re-enters, and no migration history rows.

**Risks:**
- **The CLI half of the timeouts (R-007 gap).** The tenant check proves the pooler applies `options`; pgx forwards it (R-007). Whether the CLI's `db push` reads `--db-url` through pgx's ParseConfig is not confirmed, and agents may not run `supabase … db push` (`.claude/hooks/guard-bash.mjs` line 20). If the CLI dropped the query, migrations would run without the timeouts and nothing would stop them. The first real release is where it shows: under Q-0113 every run before launch ends `not_configured`. Josh, or a hook exception for the local `--db-url`, could check it once by running `pnpm supabase db push --db-url "<local url>?options=…" --dry-run --debug` on the local stack.
- **Object Lock and checksums (R-006 gap).** Whether B2 requires a checksum on default-retention uploads, and whether it accepts `Content-MD5`, is not documented. If it refuses, the run ends `dump_upload_failed` before any migration, which is safe. The first real release shows it.
- **Partial migrations.** `migrate_failed` after some files applied leaves production with part of the schema. The old build keeps working (add-before-remove, EZD-023a), and the summary says the database may be partly updated (archived Risks).
- **Docker on the runner.** `db dump` runs pg_dump in Docker (the CLI's script). `ubuntu-latest` has Docker; the archived plan's "builder confirms" stays, and part e's workflow is where it runs.
- **Test time.** Fixtures are small; T27 (h) adds one commit to `R`.
- **`redactUrl` and an un-encoded `@` (EZD-023c security follow-up 1).** It stops the password at the first `@`. A child line holding the URL as passed is percent-encoded (a valid URL cannot hold a raw `@` in its password), and a line holding the decoded password is dropped by the mask list, so this part's output is covered; the fix stays with EZD-025.

## 10. Open questions

The points no source settled are decided as how-to-build choices with sources (Steps 2–5) or listed under Risks; Q-0159 and Q-0160 belong to EZD-023c.

- **Q-0162 (a)** (was QP-1; answered by the orchestrator, level 2, 2026-10-19): the interim `not_built` summary is `release stopped: not_built — the dump and migrations ran; nothing went live` only when A–F ran; the `alreadyLive` path keeps part c's built `release stopped: not_built — nothing changed`; the log line stays as built (part e removes all of it). Applied in Step 5 and section 6. No test value changes (Q-0157).

No open question remains.
