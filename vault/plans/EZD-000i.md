# EZD-000i · OAuth usage fallback (Item 1b)

- **ACs:** AC-EZD-000i-1 to AC-EZD-000i-5 (`vault/spec/acceptance-criteria.md` lines 115–119). They were generated from the Done-when text and match it clause by clause. AC-5 is a report plus the gate, not a test (KNOWN-LIMITS.md, Phase 0 ACs).
- **Complexity:** medium (reasoning in section 8).
- **User-visible result:** when the status line has not refreshed for 20 minutes (headless runs), the launcher reads Josh's real usage percentages from Claude's usage endpoint instead of falling back to estimated dollars. It asks at most every 15 minutes, backs off when it is told to slow down, stops for an hour and pings Josh's phone if the sign-in is refused, and never writes the sign-in token anywhere. Agents' shell commands that would print the token are blocked.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 (re-validated after Q-0133, Q-0134, Q-0135; re-validated 2026-10-19 against EZD-000h as merged, 4296a46, develop d4aefef: references only, QP-1 raised and answered as Q-0137 (a)) · Status: ready

This is Part H of the EZD-000b split, the last part. The proposal is archived at `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md` (Part H; "Reviewers and models"). It plugs into the `fallback` slot that EZD-000h leaves in `readMeters` (`vault/plans/EZD-000h.md` C5, step 3 "Source order" item 2).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 40):
- **Scope:** The fallback poll of `GET https://api.anthropic.com/api/oauth/usage` with the bearer token, read at run time only: Linux and Windows: `claudeAiOauth.accessToken` in `~/.claude/.credentials.json`. Mac: if that file is absent, the Keychain item. Confirm the service name with `security find-generic-password -s "<name>"` without `-w`, per the Findings row for 1b. Poll at most every 15 minutes. On 429, wait `max(Retry-After, 120) + 30` seconds. On 401 or 403, stop polling for an hour and notify Josh. The token is never written to any file, log, output, commit or report (PA3-MECHANISMS.md rule 8; PROCESS.md section 11). If neither credential source works on this Mac, say so and leave the proxy as the trigger. Tests stub the network (CLAUDE.md rule 6). Split of EZD-000b (Q-0010 flow). Builder write grant per PA3-MECHANISMS.md rule 7 and Q-0128.
- **Done when:** the poller makes no second request within 15 minutes; after a 429 with Retry-After 60 it waits 150 seconds and with Retry-After 300 it waits 330 seconds (`max(Retry-After, 120) + 30`); after a 401 or 403 it stops polling for one hour and calls the notify command; after a poll with a fixture token, no file under the output directories contains the token. Verification item 5 and the OAuth half of item 2 are reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000h · **Spec ref:** PA3-MECHANISMS.md Item 1b, rule 8 and Findings; PROCESS.md v2.3 section 11 · security-review: yes

Steps:
1. **New module `scripts/oauth-usage.mjs`** (H1–H8). Plain Node 22: `node:fs`, `node:path`, `node:url`, `node:os`, `node:child_process` and the global `fetch` only (PA3 rule 4: scripts are Node `.mjs`). Importing it runs nothing; the CLI runs only when it is the entry script (the `isMain` test of `vault/tools/next_ticket.mjs` line 410, as EZD-000h C10 does in `scripts/budget.mjs` line 172).
2. **Token reading** (H3). Sources, in order (PA3 Item 1b; PROCESS.md section 11 source 2; Findings row 1b):
   1. `<home>/.claude/.credentials.json`, field `claudeAiOauth.accessToken`, on every platform.
   2. Only on macOS (`platform === 'darwin'`) and only when step 1 gave no token: the Keychain, through `security find-generic-password -s <KEYCHAIN_SERVICE> -w`, run with `spawnSync` so the value goes into the script's memory and is never printed (Findings row 1b: "then reads it only inside the script"). The value is parsed as the same JSON as the file (`claudeAiOauth.accessToken`); a value that is not that JSON gives no token. That is a fail-safe choice, because no source says what the Keychain value looks like; the probe (step 7) reports which form it found.
   - `spawnSync` gets a 10-second `timeout` and `stdio: ['ignore', 'pipe', 'ignore']`. A Keychain access dialog on an unattended Mac would otherwise hang the launcher. That is the "tooling blocks a legitimate run" failure mode (PA3 rule 5).
   - Using the file when it holds a token, and trying the Keychain otherwise, covers the Scope's "if that file is absent" case and also a file without a token. That is a how-to-build choice; both readings agree when the file is absent.
   - **No error text from parsing a credential source is ever logged or returned.** V8's `JSON.parse` error message quotes part of its input, which could be part of the token (PA3 rule 8). Failures give `{ token: null, source: null }` and nothing else.
   - The token is read only when a request is about to be sent (H5 step 3). It is held in a local variable for that one request and is not cached (PA3 rule 8: "held in memory").
3. **Poll pacing** (H2, H5, H6). Every result sets `next_allowed_at` in a small state file, `vault/cost/oauth-poll.json`. No request and no token read happen before that time. The file survives a launcher restart, so a restart cannot cause an early request (AC-1).
   - 200 with readable windows: write `usage.json` and return the meters; next request in 15 minutes (PA3 Item 1b; PROCESS.md section 11).
   - 429: next request after `max(Retry-After, 120) + 30` seconds (PA3 Item 1b; AC-2). The 429 wait replaces the 15-minute spacing for the retry, so the AC-2 waits of 150 and 330 seconds are observable; the 15-minute spacing governs every other result (Q-0133 (a)). `Retry-After` is read as whole seconds, or as an HTTP date converted to seconds from now (RFC 9110 section 10.2.3). If it is missing or unreadable it counts as 0, so the 120-second floor in the formula applies (150 seconds in total).
   - 401 or 403: next request in one hour, and `notify` is called once with the section 6 text (PA3 Item 1b; PROCESS.md section 11; AC-3).
   - Any other status, a network error or timeout (`AbortSignal.timeout(10000)`), a 200 whose body has no readable windows, or no token: return `null` and wait 15 minutes, so a broken endpoint is asked no more often than a working one ("poll at most every 15 minutes").
   - The fallback never throws. Anything unexpected is caught and logged with the error's `name` only, never its message, and returns `null`. `readMeters` then goes on to the dollar proxy (EZD-000h C5 step 3), and the launcher is never blocked (PA3 rule 5).
4. **Response to meters** (H4, H7). `parseUsage` maps the body to the EZD-000h C2 windows. The field names, units and any needed request header are not in any source (Findings row 1b: "Behaviour … not testable without the token"). Per Q-0134 (a), `parseUsage` uses the statusline names of Findings row 1a: `five_hour` and `seven_day`, each with `used_percentage` and `resets_at`, and no Fable window. A numeric `resets_at` is Unix seconds and a string goes to `Date.parse`, exactly as EZD-000h C2. If either window is missing or its pct is not a number, the result is `null`, so a wrong guess about the shape falls back to the proxy and never produces a false reading. On success the module writes `<root>/vault/cost/usage.json` in the C2 shape with `source: "oauth"` (EZD-000h C2: "Part H (EZD-000i) writes the same shape with `source: "oauth"`"), using a temp file and rename like the statusline does. It returns the same object as `Meters` with `warning: null` (EZD-000h C5 (2): "a non-null result is returned as is").
5. **No token found** (H5). Return `null` with no request. Log the section 6 line once for each fallback instance, so the log says so without repeating every pass. That leaves the proxy as the trigger, as the Scope asks ("If neither credential source works … leave the proxy as the trigger").
6. **Launcher wiring** (H9). `scripts/run.mjs` creates one fallback at start-up with `createOAuthFallback({ notify, log })`, using its existing `notify` (run.mjs lines 56–61, which posts through `launcher.config.json` `notify_cmd`) and `log` (line 55). It passes the fallback as `fallback` in the per-pass `readMeters` call that EZD-000h adds (EZD-000h step 4.4 and C12; `run.mjs` line 284, `const meters = await readMeters({ budget: b })`). The `--status` call (`run.mjs` line 255) is not the step 4.4 call and stays without a fallback. Nothing else in `run.mjs` changes. `meter_source` `statusline` already skips the fallback and `oauth` skips the statusline (EZD-000h C5). The `budget.mjs` no-flag report does not pass a fallback: Josh's report must not spend a poll, and a fresh OAuth reading is already in `usage.json` for it (EZD-000h C5 (1)).
7. **Probe CLI** (H8). Findings row 1b says "the builder tests it at run time and reports". `node scripts/oauth-usage.mjs --probe` makes one real request and prints the section 6 lines, with exactly one request per run:
   - the credential source (`file`, `keychain` or `none`) and, on macOS, the Keychain service name and whether its value was the credentials JSON;
   - the HTTP status;
   - the response's top-level key names and, for each object value, its key names. **Names only, never values**, because the body may carry account details;
   - whether a model-scoped weekly window exists and under which key (Findings row 1a: `seven_day_opus`, `seven_day_sonnet`);
   - the paths of any file under `<root>/vault/`, `<root>/scripts/` and `<root>/.run/` that contains the token (verification item 5), or `none`.
   The probe ignores and does not write `oauth-poll.json` or `usage.json`. It never prints the token.
8. **`.gitignore`**: add `vault/cost/oauth-poll.json`. The session-end hook commits `vault/` (PROCESS.md section 14 Hooks; EZD-000h step 6 adds the two usage files the same way).
9. **Shell guard for the token** (H12, H13; Q-0135 (a) as narrowed by the security-reviewer). Printed, the token would land in the session transcript, which is a file (PA3 rule 8). The guard is an accident guard, not a hard wall (Q-0135).
   - **`.claude/hooks/guard-bash.mjs`:** add the three deny rules of H12. They apply to every agent, the main session included, and are matched on the raw command (`raw`, guard-bash line 7: whitespace collapsed, quotes kept), not on the quote-stripped `c`. That is how the `.env` rule already works (line 27), so a quoted path cannot slip past. They go after the `always` loop (line 27) and before the agent-specific checks (line 29). Nothing else in the file changes.
   - **`.claude/settings.json`:** append the five entries of H13 to `permissions.deny`. Nothing else in the file changes.
   - Both files are inside the builder's grant (`pa3Grant()`: `.claude/`, guard-paths.mjs lines 43–51; Q-0128 (a); `scripts/hooks/guard-paths.test.mjs` line 26 allows `.claude/settings.json` in the EZD-000i worktree).
   - **Earlier tests:** no existing or planned test pins `permissions.deny` or guard-bash decisions, so the test-author updates no earlier test. Checked: `scripts/hooks/guard-paths.test.mjs` (guard-paths only); EZD-000b T1–T2 (top-level switches and env); EZD-000c T8 (guard-reads, not guard-bash) and T10 (PreToolUse entries, env, top-level keys); EZD-000f T7 (env and the guard-agents entry); EZD-000h T8 (`statusLine`). None of those values changes here. Re-checked on develop d4aefef against the merged files `scripts/hooks/guard-reads.test.mjs` (T10), `scripts/hooks/spawn-limits.test.mjs` (T7), `scripts/budget/statusline.test.mjs` (T8) and `scripts/process/hidden-token-honesty.test.mjs`: none reads `permissions.deny` or a guard-bash decision.
10. **Tests** (section 4): `scripts/budget/oauth.test.mjs` (T1–T10) and `scripts/hooks/guard-bash.test.mjs` (T11), both run by the root `test` script (`node --test "scripts/**/*.test.mjs"`, root `package.json` line 11).
11. **Verification report** (AC-5; PA3 rule 6; Q-0126 (c)):
    - **Item 5 (no token in any file):** verified if T5 passes and the live probe's scan line reads `none`. With no live probe, T5 alone: report "verified with a fixture token; live scan not testable here".
    - **OAuth half of item 2:** the builder confirms the sources **without reading any secret**:
      - `test -f ~/.claude/.credentials.json` (exists or not; never `cat`, `Read` or `grep` it);
      - on the Mac, `security find-generic-password -s "<name>"` **without `-w` or `-g`**, first with `Claude Code-credentials` (PA3 Item 1b), recording the service name that is found (Findings row 1b);
      - it sets `KEYCHAIN_SERVICE` to that name;
      - then it runs `node scripts/oauth-usage.mjs --probe` once and copies its lines into the report.
      These three commands are the ones H12 leaves allowed (T11). If the sandbox blocks the Keychain or the network, or neither source works, it reports exactly that ("If neither credential source works on this Mac, say so"). The orchestrator then adds the item to `vault/handoff/PILOT.md` when this ticket merges (Q-0126 (c)), and the proxy stays the trigger.
    - The report says whether the real field names matched `parseUsage`. A mismatch is reported as failed, for a follow-up ticket, and is not patched in this ticket (Q-0134 (a)).
12. **Gate:** `node scripts/gate.mjs <worktree>` (CLAUDE.md rule 12).

| Path | New / change | Why | Writer (L-002 check against guard-paths.mjs) |
| --- | --- | --- | --- |
| `scripts/oauth-usage.mjs` | new | Steps 1–5, 7 | builder: `pa3Grant()` (`scripts/`, not `gate.mjs`; worktree matches `EZD-000[b-i]`; guard-paths.mjs lines 43–51) |
| `scripts/run.mjs` | change | Step 6 | builder: `pa3Grant()` |
| `.gitignore` | change | Step 8 | builder: allowed by default (not test, vault, `.claude/`, `CLAUDE.md`, `scripts/` or `ci.yml`; guard-paths.mjs lines 77–83) |
| `scripts/budget/oauth.test.mjs` | new | T1–T10 | test-author: `isTest` (`.test.mjs`, guard-paths.mjs line 16) |
| `.claude/hooks/guard-bash.mjs` | change | Step 9, H12 (Q-0135 (a)) | builder: `pa3Grant()` (`.claude/`) |
| `.claude/settings.json` | change | Step 9, H13 (Q-0135 (a)) | builder: `pa3Grant()` (`.claude/`; guard-paths.test.mjs line 26) |
| `scripts/hooks/guard-bash.test.mjs` | new | T11 | test-author: `isTest` (pattern: `scripts/hooks/guard-paths.test.mjs`) |

Runtime files the module writes (not agent edits): `vault/cost/oauth-poll.json` (gitignored, step 8) and `vault/cost/usage.json` (gitignored by EZD-000h step 6).

Not touched:
- `scripts/budget.mjs`: its EZD-000h `readMeters` already takes `fallback`.
- `vault/budget.json`: Josh-only (guard-paths.mjs line 25). `meter_source` keeps its default `auto`.
- `scripts/launcher.config.json`: gitignored and unreadable by agents (run.mjs line 10). No new key.
- `vault/PROCESS.md`, `vault/spec/`, tests: PA3 rule 7.
- `vault/cost/README.md`: not in `pa3Vault`. The orchestrator may add an `oauth-poll.json` line after the merge.

`run.mjs` (21,101 characters) is over the whole-read threshold, so the builder reads it by range (split note 7). This ticket is the last of the EZD-000b–EZD-000i grant. The orchestrator removes the `pa3Grant` exception when it merges (Q-0128 (a); guard-paths.mjs lines 43–51).

Data: none. No tables, migrations, money or `schema_version`.

## 2. Sources

- `vault/handoff/PA3-MECHANISMS.md`:
  - header ("tooling and configuration only. No app code");
  - rules 1, 4, 5, 6, 7, 8;
  - Item 1 source b (the endpoint, the bearer header, 15 minutes, `max(Retry-After, 120) + 30`, 401/403 one hour plus notify, token locations, the Keychain command, "If neither source works … leave the dollar proxy in place");
  - Item 1 Tests ("the 429 backoff arithmetic; the token never appearing in any written file (grep the output directory for the fixture token after a run)");
  - verification items 2 and 5;
  - Findings rows 1a (statusline `rate_limits`; `seven_day_opus` and `seven_day_sonnet` in the API's rate-limit types) and 1b (`api/oauth/usage`; Keychain service name `<prefix>-credentials`, confirmed without `-w`, then "reads it only inside the script"; "the builder tests it at run time and reports").
- `vault/PROCESS.md` v2.3:
  - section 11 "The budget" source 2 (fallback after 20 minutes without a statusline refresh; pacing; "never written to any file, log or output") and `meter_source`;
  - "Notification channel" (the notify command in the untracked config);
  - section 14 Hooks (session-end commits `vault/`; guard-bash; "Deny rules in settings") and Settings.
- `vault/plans/EZD-000h.md`:
  - C2 (`usage.json` shape; Part H writes `source: "oauth"`);
  - C5 (`readMeters` `fallback({ root, now, budget })`, non-null returned as is; `meter_source` narrowing);
  - C12 and step 4 (where `run.mjs` calls `readMeters`);
  - T8 (the Unix-second fixture times and their ISO values);
  - section 9 ("EZD-000i … must match C2 and C5").
- Questions:
  - Q-0133 (a): after a 429 the retry waits `max(Retry-After, 120) + 30` seconds; the 15-minute spacing governs every other request;
  - Q-0134 (a): `parseUsage` uses the statusline names; the probe reports the real names and a mismatch is reported as failed for a follow-up ticket;
  - Q-0135 (a), narrowed by the security-reviewer: the guard-bash deny and allow lists and the settings deny entries (step 9);
  - Q-0126 (c): "not testable here" items go to PILOT.md;
  - Q-0128 (a): the builder grant, removed after EZD-000i;
  - Q-0125 (a); Q-0119.
  - `vault/spec/decisions/process.md` holds Q-0119, Q-0124 and Q-0125.
- Split proposal: Part H; "Reviewers and models" (security-reviewer on Part H only; code-reviewer checks the launcher-gate failure mode for G and H); note 7 (range reads).
- Code at develop `d4aefef` (EZD-000h merged as 4296a46; first planned at `289f6c7`):
  - `scripts/run.mjs` lines 1–61 (config, `log`, `notify`) and 253–342 (`main`: `--status` `readMeters` at line 255, per-pass `readMeters` at line 284);
  - `scripts/budget.mjs` (whole; `readMeters` lines 33–58, the no-flag report's `readMeters` without a fallback at line 177);
  - `.claude/hooks/guard-paths.mjs` lines 1–100;
  - `.claude/hooks/guard-bash.mjs` (whole) and `.claude/hooks/lib.mjs` (`deny` output shape);
  - `.claude/settings.json` (whole);
  - `scripts/hooks/guard-paths.test.mjs` (spawn-the-hook pattern);
  - `.gitignore`;
  - root `package.json`;
  - `vault/tools/next_ticket.mjs` line 410.
- RFC 9110 section 10.2.3 (`Retry-After` is delay-seconds or an HTTP-date). Used only to parse the header.
- `vault/tickets/phases/phase-00.md` line 40. `vault/spec/acceptance-criteria.md` lines 115–119.
- Not applicable: product spec sections 03, 04 and 11 (Performance), non-goals, glossary, product decisions and mockups. This is process tooling only (PA3 header). Research reports: none.

**Differences between the handoff and PROCESS.md** (handoff rule 1; the builder repeats them in its report):
1. PROCESS.md section 11 says the token is never written "to any file, log or output". PA3 rule 8 adds "commit or report". The plan applies the longer list.
2. PROCESS.md section 11 does not mention confirming the Keychain service name. PA3 Findings row 1b requires it. These do not conflict, so the plan follows the Findings.
3. PROCESS.md section 14 Hooks says guard-bash "strips quoted text before matching" and lists what it blocks; "Deny rules in settings" lists `.env` reads and the guard-bash commands. The new token rules match the raw command (Q-0135), as the existing `.env` rule already does (guard-bash.mjs line 27), and neither list names them. These do not conflict: the lists describe, they do not limit. PROCESS.md is outside the builder's grant (PA3 rule 7), so the orchestrator may add the token rules to section 14 after the merge.

## 3. Interface contract

| # | Kind | Name or path | Details |
| --- | --- | --- | --- |
| H1 | exports (constants) | `scripts/oauth-usage.mjs` | `USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'`<br>`POLL_INTERVAL_MS = 900_000`<br>`AUTH_STOP_MS = 3_600_000`<br>`RETRY_FLOOR_S = 120`<br>`RETRY_PAD_S = 30`<br>`KEYCHAIN_SERVICE`: a string. It defaults to `'Claude Code-credentials'` (PA3 Item 1b); the builder replaces it with the name it confirms (step 11). Tests import it and never hard-code it.<br>`STATE_FILE = 'vault/cost/oauth-poll.json'`, relative to root.<br>`ROOT` = `path.resolve(<module dir>, '..')`.<br>Importing the module runs nothing and writes nothing. |
| H2 | export | `retryWaitMs(retryAfter, now = new Date()) → number` | Pure. `retryAfter` is the raw header value (`string \| null`).<br>`s` = the integer when the value is all digits; else, if `Date.parse` reads it, `max(0, ceil((date − now) / 1000))`; else 0.<br>Returns `(max(s, RETRY_FLOOR_S) + RETRY_PAD_S) * 1000`. |
| H3 | export | `readToken({ home = os.homedir(), platform = process.platform, exec = spawnSync } = {}) → { token: string \| null, source: 'file' \| 'keychain' \| null }` | (1) Read `<home>/.claude/.credentials.json` and take `claudeAiOauth.accessToken` if it is a non-empty string → `source: 'file'`.<br>(2) Else, if `platform === 'darwin'`, call `exec('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'ignore'] })`. If `status === 0`, parse `stdout.trim()` as JSON and take `claudeAiOauth.accessToken` → `source: 'keychain'`.<br>(3) Else `{ token: null, source: null }`.<br>Never throws, never logs, and never returns error text. `exec` is not called on other platforms or when (1) succeeds. |
| H4 | export | `parseUsage(body) → { five_hour: Window, seven_day: Window, fable_seven_day: Window \| null } \| null` | Pure. Field names per Q-0134 (a): `body.five_hour` and `body.seven_day`, each `{ used_percentage: number, resets_at: number \| string }`; `fable_seven_day: null`.<br>`Window` = EZD-000h C2: `{ pct: used_percentage as received, resets_at: new Date(n * 1000 \| Date.parse(s)).toISOString() }`.<br>Returns `null` if either window is missing, its `used_percentage` is not a finite number, or its `resets_at` cannot be read. |
| H5 | export | `createOAuthFallback({ notify = () => {}, log = () => {}, fetch = globalThis.fetch, readToken = <H3> } = {}) → fallback` | `fallback({ root = ROOT, now = new Date() } = {}) → Promise<Meters \| null>`. Same call shape as EZD-000h C5 (2); extra keys such as `budget` are ignored. Steps:<br>(1) Read `<root>/STATE_FILE`. If it is missing or unreadable, there is no state.<br>(2) If `now < Date.parse(state.next_allowed_at)` → return `null`. No `readToken` call, no `fetch` call.<br>(3) `readToken()`. No token → write state (`next = now + POLL_INTERVAL_MS`, `last_result: 'no-token'`) and log the no-token line once per instance; return `null`.<br>(4) `res = await fetch(USAGE_URL, { method: 'GET', headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) })`.<br>(5) **200:** `parseUsage(JSON.parse(await res.text()))`. Readable → write `usage.json` (H7), state `next = now + POLL_INTERVAL_MS`, `last_result: 200`, and return `{ source: 'oauth', read_at: now.toISOString(), five_hour, seven_day, fable_seven_day, warning: null }`. Unreadable → state `+POLL_INTERVAL_MS`, `last_result: 'unreadable'`, log, return `null`.<br>**429:** state `next = now + retryWaitMs(res.headers.get('retry-after'), now)`, `last_result: 429`; log; return `null`.<br>**401 / 403:** state `next = now + AUTH_STOP_MS`, `last_result: <status>`; `notify(<section 6 text>)` exactly once; log; return `null`.<br>**Other status, or `fetch` rejects:** state `+POLL_INTERVAL_MS`, `last_result: <status>` or `'error'`; log; return `null`.<br>(6) Any throw in (1)–(5) → log `OAuth usage poll error (<err.name>)` and return `null`. Never rejects.<br>No string passed to `log` or `notify`, and no file written, contains the token. |
| H6 | file | `vault/cost/oauth-poll.json` | `{ "next_allowed_at": "<ISO>", "last_result": 200 \| 401 \| 403 \| 429 \| <number> \| "error" \| "unreadable" \| "no-token", "updated_at": "<ISO>" }`. 2-space JSON with a trailing newline, written by temp file + rename; creates `vault/cost/` if missing. Never holds the token or any response value. Gitignored. |
| H7 | file | `vault/cost/usage.json` | EZD-000h C2 exactly, with `source: "oauth"` and `read_at` = `now.toISOString()`. Temp file + rename. |
| H8 | export / CLI | `probe({ root = ROOT, fetch, readToken, platform = process.platform, exec = spawnSync } = {}) → Promise<string[]>`; `node scripts/oauth-usage.mjs --probe` | Makes at most one `fetch` (none when there is no token). It ignores H6 and writes no file. Returns the section 6 probe lines in order. Response keys are listed by name only. The token scan reads every file under `<root>/vault/`, `<root>/scripts/` and `<root>/.run/` (those that exist) and lists the relative paths of files containing the token, or `none`.<br>The CLI prints the lines to stdout and exits 0; the CLI branch runs only when the module is the entry script. No line contains the token or any response value. |
| H9 | run.mjs wiring | `scripts/run.mjs` | `import { createOAuthFallback } from './oauth-usage.mjs'`. One instance, created once with `{ notify, log }`, passed as `fallback` to the EZD-000h per-pass `readMeters` call (`run.mjs` line 284); the `--status` call (line 255) gets none. A `--dry-run` pass goes through the same per-pass call and polls like a real pass, paced by `oauth-poll.json` (Q-0137 (a)). No other change (code review only; `run.mjs` runs `main()` on import, as EZD-000h section 4 notes). |
| H10 | file | `.gitignore` | Gains the line `vault/cost/oauth-poll.json`. |
| H11 | test file | `scripts/budget/oauth.test.mjs` | **Imports:** only `node:test`, `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:url`, plus `../oauth-usage.mjs` and `../budget.mjs` (T7 only).<br>**Temp roots:** `realpathSync(mkdtempSync(...))`. The fake home (`<tmp>/home`) is outside the scanned root (`<tmp>/root`).<br>**Network:** `fetch` is always a stub returning `new Response(...)`. No test reaches the network (CLAUDE.md rule 6), and `exec` is always a stub.<br>**Fixture token:** `ezd000i-fixture-token-7f3a9c41`. It deliberately does not start with `sk-ant-`, so GitHub push protection on the public repo (PA3 rule 8) cannot match it.<br>**Clock:** `NOW = new Date('2026-10-19T12:00:00Z')`, passed as `now`.<br>**Titles:** every test title starts `EZD-000i`. |
| H12 | hook rules | `.claude/hooks/guard-bash.mjs` | Q-0135 (a), narrowed. Three new deny rules, checked for **every** agent (main session included), matched on `raw` (line 7), placed after line 27 and before line 29. A "word" is a run of non-space characters; a "segment" is text with no `;`, `&` or `\|` in it.<br>**K1 Keychain read:** in one segment, `security find-generic-password` or `security find-internet-password` followed by an option word: `-` then only ASCII letters, at least one of them lowercase `w` or `g` (`-w`, `-g`, `-gw`, `-wg`). → deny with the section 6 Keychain reason.<br>**K2 Keychain dump:** in one segment, `security dump-keychain` followed by an option word (`-` then only ASCII letters) containing `d`. → deny with the same Keychain reason.<br>**K3 credentials file:** take `raw` and remove every `test -f <T>` (with `test` at the start of a word) and every `[ -f <T> ]`, where `<T>` is one double-quoted string, one single-quoted string or one word. If what remains contains `.credentials.json` or `.claude/.cred`, deny with the section 6 credentials reason. So a `test -f` or `[ -f … ]` check passes, but any other use of the path in the same command is still denied.<br>Still allowed (Q-0135): `security find-generic-password -s <name>` without `-w` or `-g`, and `node scripts/oauth-usage.mjs --probe`.<br>Nothing else in the file changes: existing rules, their order, the quote stripping for them, and the agent-specific checks stay as they are. |
| H13 | settings | `.claude/settings.json` | Q-0135 (a). `permissions.deny` gains five strings, appended after `"Bash(claude *)"` in this order:<br>`"Read(~/.claude/.credentials.json)"`<br>`"Bash(security find-generic-password *-w*)"`<br>`"Bash(security find-generic-password *-g*)"`<br>`"Bash(security find-internet-password *-w*)"`<br>`"Bash(security find-internet-password *-g*)"`<br>A grouped flag such as `-gw` or `-wg` matches one of the patterns. Every existing entry, key, value and hook stays as it is (so EZD-000b, c and f's settings contracts still hold). |
| H14 | test file | `scripts/hooks/guard-bash.test.mjs` | **Imports:** only `node:test`, `node:assert/strict`, `node:child_process`, `node:fs`, `node:path`, `node:url`.<br>**Harness:** spawns `node .claude/hooks/guard-bash.mjs` with stdin `JSON.stringify({ agent_type, tool_input: { command } })` (no `agent_type` key for the main session) and `CLAUDE_PROJECT_DIR` = repo root, in the spawn pattern of `decide` in `scripts/hooks/guard-paths.test.mjs` (that file now passes a fixed fake root; guard-bash reads no project directory, so the value does not change a decision). Denied = stdout contains `"deny"`. The reason is `hookSpecificOutput.permissionDecisionReason` from the parsed stdout (`.claude/hooks/lib.mjs` `deny`).<br>**No real secret:** commands are only passed as text to the hook; nothing is run, and no real credentials file or Keychain item is touched.<br>**Titles:** start `EZD-000i`. |

## 4. Tests

`at(ms)` = `new Date(NOW.getTime() + ms)`. `OK_BODY` = `{"five_hour":{"used_percentage":42,"resets_at":1893999600},"seven_day":{"used_percentage":63,"resets_at":1894255200}}` (the EZD-000h T8 values; shape per Q-0134 (a)). The stub `fetch` records each `(url, init)` and answers from a queue.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 | AC-EZD-000i-1 | unit | Temp root. Fallback A with a stub token and fetch answering 200 `OK_BODY`. Call at `at(0)`, then `at(899_999)`. Then a new fallback B on the same root (a restart) at `at(600_000)`, then B at `at(900_000)` | `fetch` call counts after each call: 1, 1, 1, 2. The second and third calls return `null` and make no `readToken` call. The first and fourth return meters with `source: 'oauth'`. The first request's `url` is `USAGE_URL` and `init.headers.Authorization` is `'Bearer <token>'` | PA3 Item 1b ("poll at most every 15 minutes"; endpoint and bearer); PROCESS.md section 11 source 2; 15 min = 900,000 ms; H5 (2), H6 (state survives a restart) |
| T2 | AC-EZD-000i-2 | unit | `retryWaitMs` with `'60'`, `'300'`, `'120'`, `null`, `'abc'`, and `new Date(NOW + 200 s).toUTCString()` with `now` NOW | 150000, 330000, 150000, 150000, 150000, 230000 | AC-2 (60 → 150 s, 300 → 330 s); PA3 Item 1b formula `max(Retry-After, 120) + 30`; missing or unreadable counts as 0, so the 120 floor applies (step 3); HTTP-date per RFC 9110 section 10.2.3: max(200, 120) + 30 = 230 s |
| T3 | AC-EZD-000i-2 | unit | Temp root. (a) First fetch answers 429 with `Retry-After: 60` at `at(0)`; calls at `at(149_999)` and `at(150_000)`. (b) New root: 429 with `Retry-After: 300`; calls at `at(329_999)` and `at(330_000)` | (a) counts 1, 1, 2. (b) counts 1, 1, 2. Every 429 call returns `null`. `notify` is never called | AC-2; PA3 Item 1b; H5 (5); Q-0133 (a) (the 429 wait replaces the 15-minute spacing for the retry) |
| T4 | AC-EZD-000i-3 | unit | For each status 401 and 403, a new temp root: first fetch answers that status at `at(0)`; then calls at `at(1_800_000)`, `at(3_599_999)` and `at(3_600_000)` (the last answering 200 `OK_BODY`) | counts 1, 1, 1, 2. `notify` is called exactly once, after the first call. Its message contains the status (`401` or `403`) and does not contain the token. The last call returns meters | AC-3; PA3 Item 1b ("stop polling for an hour and notify Josh"); 1 h = 3,600,000 ms; section 6 text |
| T5 | AC-EZD-000i-4 | unit | `<tmp>/home/.claude/.credentials.json` = `{"claudeAiOauth":{"accessToken":"<fixture token>"}}`. `<tmp>/root` has `vault/`, `scripts/` and `.run/`. A fallback using the real `readToken` bound to `home: <tmp>/home, platform: 'linux'`, with `log` and `notify` recording strings. Fetch answers, one per allowed time: 200 `OK_BODY`, 429 (no header), 401, 500, then a rejected promise (`TypeError`), then 200 `'not json'`. Each call is at the earliest allowed time. Then `probe` with the same token and fetch 200 `OK_BODY`, root `<tmp>/root` | Each request carried `Bearer <fixture token>` (the token was really used). No file under `<tmp>/root` (walked recursively, every file read as UTF-8) contains the token. No recorded `log` or `notify` string contains it. No `probe` line contains it. The probe's scan line reads `none`. `usage.json` and `oauth-poll.json` exist under `<tmp>/root/vault/cost/` | AC-4; PA3 rule 8 and Item 1 Tests ("grep the output directory for the fixture token after a run"); verification item 5 (`vault/`, `scripts/`, `.run/`, logs) |
| T6 | — (Scope: credential sources) | unit | `readToken` with a temp home: (a) linux, file present; (b) darwin, no file, `exec` stub status 0 with stdout `{"claudeAiOauth":{"accessToken":"K"}}\n`; (c) darwin, no file, `exec` status 44; (d) darwin, no file, `exec` stdout `raw-not-json`; (e) linux, no file; (f) linux, file text `{"claudeAiOauth":{"accessToken":"<fixture token>"` (truncated JSON) | (a) `{ token: <fixture token>, source: 'file' }`, `exec` not called. (b) `{ token: 'K', source: 'keychain' }`; `exec` called once with `'security'` and `['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w']`, and options with `timeout` 10000. (c), (d), (e) `{ token: null, source: null }`; (e) `exec` not called. (f) `{ token: null, source: null }`, and `JSON.stringify` of the result does not contain the token | PA3 Item 1b (file field; Mac Keychain when the file is absent; the `-s … -w` command); Findings row 1b (service name, read only inside the script); H3; step 2 (no error text) |
| T7 | — (Scope; EZD-000h C2/C5 contract) | unit | Temp root. A fallback with a stub token, fetch 200 `OK_BODY` at NOW. Then a stale `usage.json` (`read_at` NOW − 21 min, `source: 'statusline'`), a new root, and `readMeters({ root, now: NOW, budget: {}, spend: { main: 0, fable: 0, pct: null, start: NOW }, fallback })` from `../budget.mjs` | `usage.json` deep-equals `{ five_hour: { pct: 42, resets_at: '2030-01-07T07:00:00.000Z' }, seven_day: { pct: 63, resets_at: '2030-01-10T06:00:00.000Z' }, fable_seven_day: null, read_at: '2026-10-19T12:00:00.000Z', source: 'oauth' }`. `readMeters` returns `source: 'oauth'`, `seven_day.pct` 63, `warning: null` | EZD-000h C2 (shape, `source: "oauth"`; Unix seconds → ISO: 1893999600 = 2030-01-07T07:00:00Z, 1894255200 = 2030-01-10T06:00:00Z, EZD-000h T8) and C5 (2). Field names per Q-0134 (a) |
| T8 | — (PA3 rule 5: never blocks a run) | unit | Temp root, one call each on new roots: fetch 500; fetch rejects; fetch 200 `'not json'`; fetch 200 `{"five_hour":{"used_percentage":"x","resets_at":1}}`; `readToken` stub that throws; a state file containing `not json` with fetch 200 `OK_BODY` | The first five resolve to `null` and never reject. For the first four, the state file's `next_allowed_at` is `at(900_000)`. The throwing `readToken` makes no request. The corrupt state file counts as no state: one request, and meters are returned | H5 (5), (6); PA3 Item 1b ("at most every 15 minutes"); PA3 rule 5 |
| T9 | — (Scope: "neither credential source works") | unit | Temp root, `readToken` stub returning no token, `log` recording. Calls at `at(0)` and `at(900_000)` | Both return `null`. `fetch` is never called. `log` received the section 6 no-token line exactly once. `notify` is never called | Scope ("say so and leave the proxy as the trigger"); PA3 Item 1b; H5 (3) |
| T10 | — (probe; `.gitignore`) | unit | `probe` with root `<tmp>/root`, `platform: 'linux'`, a `readToken` stub `{ token: <fixture token>, source: 'file' }`, and fetch 200 with `{"five_hour":{"used_percentage":1,"resets_at":2},"seven_day":{},"seven_day_opus":{"used_percentage":3},"email":"x@y"}`. Then read the repo's `.gitignore` | Lines equal, in order: `credential source: file`, `HTTP status: 200`, `response keys: five_hour, seven_day, seven_day_opus, email`, `window keys: five_hour{used_percentage, resets_at}; seven_day{}; seven_day_opus{used_percentage}`, `model-scoped weekly window: seven_day_opus`, `token found in files under vault/, scripts/, .run/: none`. No line contains `x@y`, `: 1` or the token. `fetch` called once; no file written under `<tmp>/root`. `.gitignore` has the line `vault/cost/oauth-poll.json` | H8; section 6 probe text; Findings row 1a (`seven_day_opus` naming); Findings row 1b ("the builder tests it at run time"); H10 |
| T11 | — (Q-0135 (a): shell guard for the token) | unit (hook + repo file) | (a) H14 harness, each command run twice: once as the main session (no `agent_type`) and once as `builder`. **Deny cases:** D1 `security find-generic-password -s "Claude Code-credentials" -w`; D2 the same with `-g`; D3 `security find-generic-password -gw -s "Claude Code-credentials"`; D4 `security find-internet-password -s example.com -w`; D5 `security dump-keychain -d`; D6 `cat ~/.claude/.credentials.json`; D7 `cat "$HOME/.claude/.credentials.json"` (quoted path); D8 `jq . ~/.claude/.credentials.json`; D9 `cp ~/.claude/.credentials.json /tmp/x`; D10 `test -f ~/.claude/.credentials.json && cat ~/.claude/.credentials.json`. **Allow cases:** A1 `security find-generic-password -s "Claude Code-credentials"`; A2 `test -f ~/.claude/.credentials.json`; A3 `[ -f ~/.claude/.credentials.json ]`; A4 `test -f "$HOME/.claude/.credentials.json" && echo found`; A5 `node scripts/oauth-usage.mjs --probe`; A6 `git status`. (b) Parse the repo's `.claude/settings.json` | (a) D1–D10 denied for both callers. D1–D5 reasons contain `Keychain` and `PA3 rule 8`; D6–D10 reasons contain `sign-in file` and `PA3 rule 8`. A1–A6 allowed for both callers (empty stdout). (b) `permissions.deny` contains each of the five H13 strings, and still contains `"Read(./.env)"` and `"Bash(claude *)"` | Q-0135 (a) (deny list: `-w`/`-g` groups incl. `-gw`, `find-internet-password`, `dump-keychain -d`, any naming of `.credentials.json` except `test -f`/`[ -f ]`, matched on the raw command so D7's quotes do not hide it; allow list: A1, A2/A3, the probe; settings entries); PA3 rule 8; Findings row 1b ("without `-w` (so the secret is never printed)"); H12, H13; section 6 reasons. A4: the `test -f` exception (H12 K3); D10: the exception covers only the test itself. A6: existing behaviour unchanged |

Notes:
- **Before the build,** every test fails for the right reason: `scripts/oauth-usage.mjs` does not exist, `.gitignore` lacks the line, guard-bash allows D1–D10 and `settings.json` lacks the H13 entries. (A1–A6 already pass before the build; they guard against over-blocking.)
- **No earlier test changes** (step 9): none pins `permissions.deny` or guard-bash decisions.
- **AC-5** is the builder's report of item 5 and the OAuth half of item 2 (step 11), plus the gate. T5 is the fixture evidence for item 5; the live probe adds the real-token scan.
- **Not unit-tested, by design:** the `run.mjs` wiring (H9). The code-reviewer checks it against H9, and the pilot exercises it (EZD-000h section 4 notes).

## 5. Visual checklist
None (no screen changes).

## 6. Proposed wording

No app text. These are the texts Josh sees from the tooling: terminal, ntfy and the builder's report. They follow the style of the EZD-000h texts (EZD-000h section 6) and `run.mjs`. `run.mjs` `notify` adds the `EZ Draft: ` prefix (line 59). Josh approves them at Stage 2.

| Where | Text |
| --- | --- |
| ntfy, 401 or 403 (H5) | `usage endpoint refused the sign-in (<status>); usage polling paused until <YYYY-MM-DD HH:MM UTC>. Gating uses the statusline or the dollar proxy meanwhile. Check that Claude Code is signed in on this machine.` |
| Launcher log, 401 or 403 | `OAuth usage poll: <status>; no poll until <ISO>` |
| Launcher log, 429 | `OAuth usage poll: rate-limited (429, Retry-After <value or none>); next poll after <ISO>` |
| Launcher log, other failure | `OAuth usage poll failed (<status or network error>); next poll after <ISO>` |
| Launcher log, unreadable body | `OAuth usage poll: response had no readable five-hour and weekly windows; next poll after <ISO>` |
| Launcher log, no token (once) | `OAuth usage fallback off: no sign-in token in ~/.claude/.credentials.json or the Keychain; gating stays on the next source` |
| Launcher log, unexpected error | `OAuth usage poll error (<error name>)` |
| Probe line 1 | `credential source: file` · `credential source: keychain` · `credential source: none` |
| Probe line, macOS only (after line 1) | `keychain service: <KEYCHAIN_SERVICE> (<found, credentials JSON> \| <found, not the credentials JSON> \| <not found>)` |
| Probe line 2 | `HTTP status: <n>` · `HTTP status: not requested (no token)` · `HTTP status: network error (<error name>)` |
| Probe line 3 | `response keys: <comma-separated top-level keys>` (omitted when there is no JSON body) |
| Probe line 4 | `window keys: <key>{<its keys>}; …` (object values only) |
| Probe line 5 | `model-scoped weekly window: <key>` · `model-scoped weekly window: none found` (a top-level key starting `seven_day_`) |
| Probe line 6 | `token found in files under vault/, scripts/, .run/: none` · `token found in files under vault/, scripts/, .run/: <relative paths>` |
| guard-bash deny, K1 and K2 (H12; added at re-validation, not yet seen by Josh) | `Printing a Keychain secret is not allowed (security with -w or -g, or dump-keychain -d). To check that an item exists, run security find-generic-password -s "<name>" without -w or -g (PA3 rule 8).` |
| guard-bash deny, K3 (H12; added at re-validation, not yet seen by Josh) | `The Claude sign-in file is never read from the shell. Only test -f <path> or [ -f <path> ] may name it (PA3 rule 8).` |

T11 checks only the substrings `Keychain`, `sign-in file` and `PA3 rule 8`, so Josh can reword the rest without a test change. The style follows the existing guard-bash reasons (guard-bash.mjs lines 12–25: one sentence saying what is not allowed, then what to do).

## 7. Security review
security-review: yes. Areas:
- **auth:** Josh's Claude sign-in token is read from `~/.claude/.credentials.json` or the macOS Keychain.
- **API:** an outside, undocumented endpoint (split proposal Part H).
- **Agent permissions (tooling):** new guard-bash deny rules and `settings.json` deny entries that keep agents' shells from printing the token (Q-0135 (a)).
No app auth, app permissions, data access, money or migrations.

The security-reviewer checks:
- The token appears in no file, log line, notify text, probe line, error text, state file, `usage.json`, commit or report (PA3 rule 8). That includes V8 `JSON.parse` messages and `fetch` error messages, which are never logged (H3, H5 (6)).
- The token is read only when a request is due, held for that one request, and sent only to `USAGE_URL` over HTTPS. The URL is a constant, with no environment or config override that could send it elsewhere.
- `security` is called only with `-s <KEYCHAIN_SERVICE> -w`, with stdout captured, stderr ignored and a timeout. That call runs inside the script through `spawnSync`, not through an agent's Bash tool, so H12 and H13 do not apply to it. The builder's own checks use no `-w` or `-g` (step 11).
- The test fixture token cannot be mistaken for a real one (H11). No real credential is read in tests (`home` and `exec` are always stubs or a temp folder; T11 passes commands to the hook as text only).
- **Shell guard (Q-0135 (a), narrowed):** H12 denies exactly K1–K3 on the raw command for every agent and allows exactly the Q-0135 allow list (T11); H13 adds the five settings entries and changes nothing else in `settings.json`. It is an accident guard, not a hard wall (Q-0135): a determined command can still get around a text match, and the review does not treat it as one.

Reviewers needed:
- **code-reviewer:** yes, Opus 5.5 high (PA3 rule 5). Failure-mode check: a launcher gate must not block a legitimate run (rule 5; split proposal "Reviewers and models"). Confirm:
  - the fallback never rejects (T8);
  - a Keychain dialog cannot hang the launcher (`timeout`);
  - a stale or corrupt `oauth-poll.json` cannot stop polling for good, because the state is overwritten on every request and a corrupt file counts as no state;
  - a wrong response shape gives `null`, not a false reading (H4).
- **security-reviewer:** yes, Opus 5.5 high (PA3 rule 8; split proposal).
- **calc-auditor:** no.
- **ui-verifier:** no.

## 8. Complexity and model recommendation
Medium. The logic is small and fully specified pacing arithmetic and three text-match deny rules, and it touches 5 code and config files (`scripts/oauth-usage.mjs`, `scripts/run.mjs`, `.gitignore`, `.claude/hooks/guard-bash.mjs`, `.claude/settings.json`) plus 2 test files with 11 tests (7 files, within the split limit of about 8; one test over about 10, added by Q-0135 (a)). But it handles the sign-in token and sits in the launcher's gate path, so a leak or a hang matters more than the size suggests. Test-author: Sonnet 5.5, medium effort. Builder: Sonnet 5.5, medium effort. These are the models PA3-MECHANISMS.md rule 5 and the STATUS row prescribe, not the "auth → high" default of PROCESS.md section 4, because this is the account's own login token for a tooling script, not app auth.

## 9. Dependencies

From the ticket row:
- **EZD-000h** (done, 4296a46). This plan uses its C2 (`usage.json` shape), C5 (`readMeters` `fallback`) and C12 (the per-pass `readMeters` call in `run.mjs`). Re-validated 2026-10-19 against its STATUS note (`vault/tickets/STATUS.md` line 60) and the merged code: C2 matches `scripts/statusline.mjs` (keys, Unix seconds × 1000, `fable_seven_day: null`, temp file + rename); C5 matches `scripts/budget.mjs` lines 33–58 (`fallback({ root, now, budget })`, non-null returned as is, `statusline` skips it, `oauth` skips `usage.json`); the T8 fixture values match `scripts/budget/statusline.test.mjs` lines 18 and 32–33. Deviations (1), (2) and (4) do not touch this plan (T7 passes `spend`, so (2) does not apply). Deviation (3) raised QP-1, answered as Q-0137 (a).

Not in the ticket row, reached through the chain:
- **EZD-000c** (done, 3b7c7c1): range reads of `run.mjs` (a working constraint, not a contract).
- **EZD-000b–EZD-000g** (all done) and **EZD-000** (done): the chain order (PA3 "Order of work and commits": Item 1 last).

No missing dependency. There is no screen, so EZD-016a is not needed.

Dependents:
- **EZD-001** (the pilot) re-checks item 2 if it is reported "not testable here" (Q-0126 (c)).
- The orchestrator removes the `pa3Grant` exception from guard-paths.mjs after this merges (Q-0128 (a)).

Risks:
- **The endpoint is undocumented.** Its field names, units (0–100 or 0–1) and required headers are unknown (Q-0134). The installed Claude Code 2.1.303 binary's string table also holds `utilization`, `seven_day_opus`, `seven_day_sonnet`, `seven_day_oauth_apps` and `extra_usage`, so the real names may differ from `five_hour`/`seven_day` with `used_percentage` (Q-0134 answer). A mismatch is reported as failed, for a follow-up ticket (step 11). Wrong names fail safe to the proxy (H4). A 0–1 unit would pass validation and under-read usage by 100×. Only the live probe catches that.
- **The shell guard can block innocent commands.** K3 matches the raw command, so any Bash command naming `.credentials.json` is denied, including a commit message, `grep` pattern or heredoc that mentions the file name (PROCESS.md section 14: guard-bash runs for the main session too). The builder's and the orchestrator's commit messages for this ticket must not name the file. The H13 patterns `*-w*` and `*-g*` would also deny a Keychain lookup whose service name contains `-w` or `-g`; the expected name `Claude Code-credentials` does not, and step 11 reports the confirmed one.
- **Expired access token.** If no Claude Code session has refreshed the token in the file, every hour brings a 401 and an ntfy message.
- **The Keychain probe may show a macOS access dialog** on Josh's screen when the builder runs it.

## 10. Open questions

- **Q-0137 (was QP-1): answered (a)** by the orchestrator: keep H9 as written; a dry run polls like a real pass, paced by `oauth-poll.json` (H9). Question as raised: EZD-000h deviation (3) means `run.mjs --dry-run` goes through the per-pass `readMeters` call (line 284) before it stops at line 219, so with H9 as written a dry run makes one real OAuth request when one is due and writes `vault/cost/usage.json` and `oauth-poll.json`; no source says whether a dry run may do that. Options: (a) keep H9 as written (a dry run polls like a real pass, paced by `oauth-poll.json`); (b) pass no fallback when `--dry-run` is set, so a dry run makes no request and writes no OAuth file. No test value changes either way (H9 is code-review only).

- **Q-0133 (was QP-1): answered (a)** by the orchestrator: after a 429 the retry waits `max(Retry-After, 120) + 30` seconds and the 15-minute spacing governs every other request (step 3, H5, T3).
- **Q-0134 (was QP-2): answered (a)** by the orchestrator: `parseUsage` uses the statusline names, and the live probe reports the real names, with a mismatch reported as failed for a follow-up ticket (step 4, step 11, H4, T7, risks).
- **Q-0135 (was QP-3): answered (a), narrowed** by the security-reviewer: guard-bash denies the Keychain `-w`/`-g`/`dump-keychain -d` reads and any naming of `.credentials.json` except `test -f`/`[ -f ]`, on the raw command, and `settings.json` gains the five deny entries (step 9, H12–H14, T11).
