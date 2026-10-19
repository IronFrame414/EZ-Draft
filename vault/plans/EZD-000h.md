# EZD-000h · Usage meters, five-hour pause and weekly gate (Item 1a and the gates)

- **ACs:** AC-EZD-000h-1 to AC-EZD-000h-6 (`vault/spec/acceptance-criteria.md` lines 110–115). They were generated from the Done-when text and match it clause by clause. AC-6 is a report plus the gate, not a test (KNOWN-LIMITS.md, Phase 0 ACs).
- **Complexity:** medium (reasoning in section 8).
- **User-visible result:** the launcher pauses and holds on Josh's real Claude usage percentages instead of estimated dollars. It waits out a full five-hour window by itself, warns him once at 70% of the week, holds at 80% after the current ticket finishes, and the status line and `PROGRESS.md` show the percentages and reset times.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

This is Part G of the EZD-000b split. The proposal is archived at `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md` (Part G, notes 3–5, 7).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 39):
- **Scope:** New `scripts/statusline.mjs`. It prints a short status line and writes the windows it receives to `vault/cost/usage.json` as `{five_hour, seven_day, fable_seven_day: {pct, resets_at}, read_at, source: "statusline"}`. It logs one raw payload to `vault/cost/usage-raw-sample.json`, which is deleted after the field names are recorded. It is configured in `.claude/settings.json` `statusLine`. `scripts/budget.mjs` exports the gate decisions and keeps its CLI. Source order: `usage.json` when fresher than 20 minutes, else the fallback (Part H; until then none), else the dollar proxy with a warning in the log. Five-hour window ≥ 90%: write `WINDOW_PAUSE.md` and start nothing until `resets_at` + 2 minutes, then delete the file. Weekly window: warn once at 70%; at ≥ 80%, hold, and an in-progress ticket finishes. Fable window ≥ 90%: use Opus instead. A unit already running is never interrupted. `--raise` becomes `--hold-at <pct>`. `scripts/run.mjs` uses these decisions. `next_ticket.mjs --report` shows the three percentages and their reset times in `PROGRESS.md`. `.gitignore`: the usage files. Split of EZD-000b (Q-0010 flow). Builder write grant per PA3-MECHANISMS.md rule 7 and Q-0128.
- **Done when:** gate decisions from a fixture `usage.json` at 69, 70, 79, 80, 89 and 90% for each window match PROCESS.md section 11 (five-hour pause at 90; weekly warn at 70 and hold at 80; Fable fallback at 90); a `usage.json` older than 20 minutes falls back to the next source and, with none, to the dollar proxy with a warning; the pause writes `vault/handoff/WINDOW_PAUSE.md` with the percent and reset time and the launcher resumes after `resets_at` plus 2 minutes; the weekly warning fires once and the hold lets an in-progress ticket finish; `statusline.mjs` writes `usage.json` from a fixture payload. Verification items 1, 3, 4 and the statusline half of 2 are reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000g · **Spec ref:** PA3-MECHANISMS.md Item 1a and Findings; PROCESS.md v2.3 sections 10, 11, 13, 14.

Steps:
1. **Status line script** (C1, C2). New `scripts/statusline.mjs`, plain Node with `node:fs`, `node:path` and `node:url` only. It must stay fast and must never fail the session.
   - It reads the JSON payload from stdin and takes `rate_limits.five_hour` and `rate_limits.seven_day`, each with `used_percentage` (0–100) and `resets_at` (Unix seconds). Source: PA3 Findings row 1a.
   - It writes `fable_seven_day: null`. The payload has no per-model window (Findings row 1a: "the statusline cannot supply `fable_seven_day`"). Fable then gates on the dollar proxy, which is unset, so Fable stays allowed (split note 4).
   - It writes `<root>/vault/cost/usage.json` in the shape of C2, where `<root>` is the folder above the script's own folder. The write goes to a temporary file in the same folder and is then renamed, so the launcher never reads a half-written file.
   - It writes `usage.json` only when both `five_hour` and `seven_day` are present and valid. Otherwise it leaves `usage.json` alone, so a payload without meters cannot look like a fresh reading.
   - **Raw sample.** When neither `usage.json` nor `usage-raw-sample.json` exists, it writes the stdin text, unchanged, to `vault/cost/usage-raw-sample.json`. This makes it a first-run sample (PA3 Item 1a: "logging one raw payload … during the first run, then delete that file"). It is deleted at verification item 1, after the field names are recorded (step 8).
   - It prints one line (section 6 wording) and exits 0 on every input, including invalid JSON (PROCESS.md section 10: a unit is never interrupted).
2. **Settings** (C3). `.claude/settings.json` gains the `statusLine` entry: `{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR:-.}/scripts/statusline.mjs\"" }`. Source: PROCESS.md section 14 Settings ("`statusLine` → `scripts/statusline.mjs`"). The `${CLAUDE_PROJECT_DIR:-.}` falls back to the session folder if the variable is not set for status-line commands. The builder checks the `statusLine` keys against the docs for the installed version (PROCESS.md section 15, "confirms it against … the docs") and reports what it found. No other settings key changes.
3. **Gate decisions in `scripts/budget.mjs`** (C4–C10). The file becomes a module that exports the decisions. Its CLI runs only when it is the entry script, using the same `isMain` test as `next_ticket.mjs` line 381. That means the top-level reads of `budget.json` move inside the CLI branch.
   - **Thresholds** (C4): `budget.json` keys `five_hour_pause_pct`, `warn_at_pct`, `hold_at_pct`, `fable_fallback_pct`, `meter_source`, each falling back to the PROCESS.md section 11 default (90, 70, 80, 90, `auto`).
     - The old `*_fraction` keys are not read. Split note 3: Part G reads the v2.3 keys with the section 11 defaults, which equal today's fractions.
     - No agent edits `budget.json`: it is Josh-only (guard-paths.mjs line 25).
   - **Source order** (C5 `readMeters`):
     1. `usage.json`, when its `read_at` is less than 20 minutes old and `seven_day` is present.
     2. Else the `fallback` option. Part H plugs in here; until then there is none.
     3. Else the dollar proxy, with a warning (PA3 Item 1 Gates; PROCESS.md section 11 "The budget" items 1–3).
     - The proxy is the weekly percent from `weekSpend()` (`next_ticket.mjs` lines 362–378) against `weekly_ceiling_usd_est`. Fable is the same against `fable_ceiling_usd_est`, and is null when that is unset. Both reset at `weekStart() + 7 days`. The proxy has no five-hour reading.
     - `meter_source` (PROCESS.md section 11) narrows the order: `statusline` skips step 2, `oauth` skips step 1, and `proxy` goes straight to the proxy with no warning, because Josh chose it.
   - **Decisions** (C6 `gateDecision`). All comparisons are "at or above", per PROCESS.md section 11:
     - five-hour pct ≥ `five_hour_pause_pct` → pause until `resets_at` + 2 minutes;
     - weekly pct ≥ `warn_at_pct` → warn;
     - weekly pct ≥ `hold_at_pct` → hold;
     - Fable pct ≥ `fable_fallback_pct` → `opus`.
     - A window whose `resets_at` is already past counts as no reading, because that window has reset. Without this, a reading taken before the reset would pause the launcher again straight after it resumed. This is the failure mode where tooling blocks a legitimate run (PA3 rule 5).
     - No five-hour reading means no pause. The launcher's plan-limit handling stays as the backstop (PROCESS.md section 11 "When the plan's own limit is hit"; `run.mjs` lines 330–338, unchanged).
   - **Launcher side effects** (C7 `applyGates`). This moves today's `budgetGate()` and `writeHold()` (`run.mjs` lines 90–114) into `budget.mjs`, rebased on the meters. Sources: PROCESS.md section 11 "When the weekly hold is reached" steps 1–4; PA3 Item 1 Gates.
     - **Warn:** one notify per weekly window. The marker is `vault/handoff/.budget-warned-<YYYY-MM-DD of seven_day.resets_at>`, which is already gitignored.
     - **Hold:** write `BUDGET_HOLD.md` (C8) and notify once, while the file is absent. The unit may start only if it is the in-progress build.
     - **Existing hold:** a `BUDGET_HOLD.md` already in place (for example from a plan-limit error) blocks everything except the in-progress build, as `run.mjs` line 321 does today.
     - **Overrides:** an active `--until-reset` or `--api-until-reset` override (`overrideActive`, moved from `run.mjs` lines 78–83) turns off warn and hold.
     - **Proxy with no ceiling:** proxy mode with no `weekly_ceiling_usd_est` refuses to run unattended. The reason text is unchanged from `run.mjs` line 99 (PROCESS.md section 11 "Proxy mode only").
   - **Five-hour pause** (C9 `waitForWindow`). Sources: PROCESS.md section 10 launcher step 1 and section 11 "The five-hour pause".
     - If `vault/handoff/WINDOW_PAUSE.md` exists (the launcher restarted mid-pause), wait until its `Resume at:` time.
     - Otherwise, if the decision says pause, write the file (C8) and wait until `resets_at` + 2 minutes.
     - Then delete the file. No notification and no override.
   - **CLI** (C10). Keeps its flags:
     - `--set-ceiling`, `--set-cap`, `--set-fable`, `--until-reset`, `--api-until-reset`, `--clear-override`: unchanged (PA3 Item 1 "The existing overrides … stay").
     - `--raise` is replaced by `--hold-at <pct>`, which sets `hold_at_pct`, logs `{date, hold_at: {from, to}}` in `history` and releases the hold. The release is the same as today's `--raise` (`budget.mjs` line 36), so the launcher can start again (PROCESS.md section 11 Override).
     - `--raise` now exits 1 and names `--hold-at`.
     - The no-flag report prints the meters as well as the existing spend and override lines (section 6).
4. **Launcher** (`scripts/run.mjs`). It imports `readMeters`, `gateDecision`, `applyGates`, `waitForWindow`, `writeHold` and `overrideActive` from `./budget.mjs`. Each pass, in order (PROCESS.md section 10 "The launcher" step 1):
   1. STOP.
   2. `waitForWindow` for an existing pause file. If it waited, start the pass again.
   3. `--next-unit`.
   4. `readMeters`, and log `meters.warning` when set ("a warning in the log").
   5. `gateDecision`. If it says pause, `waitForWindow` and start the pass again.
   6. `applyGates`. When `start` is false, log the reason and stop. Only the no-ceiling reason notifies, as today (line 319).
   7. `EZD_FABLE_ALLOWED = decision.fable === 'fable' ? '1' : '0'`. The build-ticket skill step 3 already reads this and records the fallback in STATUS Notes (PROCESS.md section 11 `fable_fallback_pct`), so the skill needs no change.
   8. Run the unit.

   Other changes:
   - The plan-limit hold (lines 334–338) calls the exported `writeHold`.
   - `--status` prints the meter line.
   - `authMode()` uses the exported `overrideActive`.
   - Gates are checked only between units, so a running unit is never interrupted (PROCESS.md section 11).
   - The old `budgetGate`, `fableAllowed` and `writeHold` are removed from `run.mjs`.
5. **Progress report** (C11). `report()` in `next_ticket.mjs` (lines 316–331) reads `vault/cost/usage.json` itself, using the same freshness rule as C5. It does not import `budget.mjs`, which imports `next_ticket.mjs`; that would be a cycle, and the temp-vault ledger tests copy `vault/` only.
   - **Fresh reading:** the "This week's estimated spend" section is replaced by a `## Usage` table with the three windows and their reset times.
   - **Otherwise:** the spend section stays as it is (split note 5; PROCESS.md section 11 "`PROGRESS.md` shows the three percentages and their reset times").
6. **`.gitignore`**: add `vault/cost/usage.json` and `vault/cost/usage-raw-sample.json` (Scope). The session-end hook commits `vault/` (PROCESS.md section 14 Hooks), so without these lines every session would commit the meter.
7. **Tests** (section 4): `scripts/budget/gates.test.mjs`, `scripts/budget/statusline.test.mjs`, `scripts/budget/cli.test.mjs`. The root `test` script runs `node --test "scripts/**/*.test.mjs"` (root `package.json` line 11), which picks them up.
8. **Verification report** (AC-6; PA3 rule 6; Q-0126 (c)):
   - **Item 3 (five-hour pause):** verified if T5 passes. PA3 asks to "simulate with a fixture and a short reset time", which T5 does with an injected clock.
   - **Item 4 (warn once; hold lets the in-progress ticket finish):** verified if T6 and T7 pass.
   - **Item 1 (live payload) and the statusline half of item 2 (`claude -p`):** need a Claude Code session, which the builder cannot start (`.claude/settings.json` denies `Bash(claude *)`; guard-bash blocks `claude` inside a session). The builder reports them "not testable here", and the orchestrator adds them to `vault/handoff/PILOT.md` when this ticket merges (Q-0126 (c)). The PILOT row says: record the `rate_limits` keys from `vault/cost/usage-raw-sample.json`, check `resets_at` is Unix seconds, then delete the sample.
9. **Gate:** `node scripts/gate.mjs <worktree>` (CLAUDE.md rule 12).

| Path | New / change | Why | Writer (L-002 check against guard-paths.mjs) |
| --- | --- | --- | --- |
| `scripts/statusline.mjs` | new | Step 1 | builder: `pa3Grant()` (`scripts/`, not `gate.mjs`; guard-paths.mjs lines 43–51) |
| `scripts/budget.mjs` | change | Step 3 | builder: `pa3Grant()` |
| `scripts/run.mjs` | change | Step 4 | builder: `pa3Grant()` |
| `vault/tools/next_ticket.mjs` | change | Step 5 | builder: `pa3Grant()` (`vault/tools/` is in `pa3Vault`) |
| `.claude/settings.json` | change | Step 2 | builder: `pa3Grant()` (`.claude/`) |
| `.gitignore` | change | Step 6 | builder: allowed by default (not test, not vault, not in the builder's denied list, guard-paths.mjs lines 72–78) |
| `scripts/budget/gates.test.mjs` | new | T1–T7 | test-author: `isTest` (`.test.mjs`, guard-paths.mjs line 16) |
| `scripts/budget/statusline.test.mjs` | new | T8 | test-author: `isTest` |
| `scripts/budget/cli.test.mjs` | new | T9, T10 | test-author: `isTest` |

Not touched:
- `vault/budget.json`: Josh-only (guard-paths.mjs line 25; split note 3).
- `vault/PROCESS.md`: rule 7.
- `vault/cost/README.md`: not in the builder's grant (`pa3Vault`). The orchestrator may add a `usage.json` line after the merge.
- `.claude/skills/build-ticket/SKILL.md`: it already reads `EZD_FABLE_ALLOWED`.
- `.claude/hooks/*`.

`run.mjs` (22,713 characters) and `next_ticket.mjs` (25,719) are over the whole-read threshold, so the builder reads them by range (split note 7).

Data: none. No tables, migrations, money or `schema_version`.

## 2. Sources

- `vault/handoff/PA3-MECHANISMS.md`, the handoff:
  - header ("No app code");
  - rules 1, 2, 5, 6, 7;
  - Item 1 (source a; Gates; `budget.json` changes; `PROGRESS.md`; Tests);
  - Findings rows 1a (statusline `rate_limits`: `five_hour`, `seven_day`, `used_percentage`, `resets_at` in Unix seconds, no per-model window) and 1a under `claude -p`;
  - verification items 1–4.
- `vault/PROCESS.md` v2.3:
  - section 10: "The launcher" step 1, and "Units";
  - section 11: "The budget" (sources 1–3, `budget.json` keys and defaults, `PROGRESS.md`), "The five-hour pause", "When the weekly hold is reached" (steps 1–4 and Override), "When the plan's own limit is hit";
  - section 13: `vault/cost/`, and the `PROGRESS.md` bullet;
  - section 14: repo tree (`scripts/statusline.mjs`), Hooks (session-end), Settings (`statusLine`);
  - section 15: confirm flags and formats against the docs; pilot list 1, 11, 13.
- `vault/PROCESS-EZDRAFT.md` section 8 (budget line, Q-0127 (a): proxy mode on 300 / 40 until EZD-000h merges).
- Questions:
  - Q-0119: v2.3 meters supersede the ceilings;
  - Q-0126 (c): "not testable here" items go to PILOT.md;
  - Q-0127 (a);
  - Q-0128 (a): the builder grant;
  - Q-0125 (a).
  - `vault/spec/decisions/process.md` holds Q-0119 and Q-0125.
- Split proposal notes:
  - 3: `*_pct` keys with defaults, `budget.json` untouched;
  - 4: Fable stays allowed with no Fable meter or ceiling;
  - 5: `PROGRESS.md` shows the percentages when fresh, the spend line otherwise;
  - 7: range reads.
- Plans: `vault/plans/EZD-000g.md` (the dependency; it changes `lessons()` and `check()` in `next_ticket.mjs`, not `report()`).
- Code at develop `4856da0`:
  - `scripts/budget.mjs` (whole);
  - `scripts/run.mjs` lines 1–25, 33–41, 54–60, 77–118, 288–372;
  - `vault/tools/next_ticket.mjs` lines 209–216, 283–378, 380–384;
  - `.claude/hooks/guard-paths.mjs` lines 16, 24–26, 43–51, 72–78;
  - `.claude/hooks/guard-bash.mjs` line 24;
  - `.claude/settings.json`;
  - `.gitignore`;
  - `.claude/skills/build-ticket/SKILL.md` step 3;
  - `scripts/ledger/questions-flow.test.mjs` (temp-vault pattern);
  - root `package.json` line 11.
- `vault/tickets/phases/phase-00.md` line 39. `vault/spec/acceptance-criteria.md` lines 110–115.
- Not applicable: product spec sections 03, 04 and 11, non-goals, glossary, product decisions and mockups. This is process tooling only (PA3 header).
- Research reports: none (`vault/research/` does not exist at `4856da0`).

**Differences between the handoff and PROCESS.md** (handoff rule 1; the builder repeats them in its report):
1. PROCESS.md section 11 source 1 says the statusline carries "model-scoped entries for Fable". The Findings (row 1a) say it does not. The plan follows the Findings: `fable_seven_day: null` from the statusline (split note 8).
2. PROCESS.md section 13 says `PROGRESS.md` shows "this week's estimated spend against the ceiling", while section 11 says "the three percentages". The plan follows split note 5.
3. PA3 Item 1 names `budget.json` keys `*_pct`. The file today holds `*_fraction` keys, and agents may not edit it. The plan reads the `*_pct` keys with the section 11 defaults (split note 3).

## 3. Interface contract

| # | Kind | Name or path | Details |
| --- | --- | --- | --- |
| C1 | CLI | `node scripts/statusline.mjs` (stdin: payload JSON) | `root` = `path.resolve(<script dir>, '..')`.<br>**Valid input** (`rate_limits.five_hour` and `rate_limits.seven_day` each have a numeric `used_percentage` and a `resets_at`): writes C2 to `<root>/vault/cost/usage.json` by temp file + rename, and prints `5h <round(five_hour pct)>% · week <round(seven_day pct)>%`.<br>**Any other input** (no `rate_limits`, a missing window, invalid JSON, empty stdin): `usage.json` is left untouched and it prints `usage: no data`.<br>**Raw sample:** before anything else, if neither `<root>/vault/cost/usage.json` nor `<root>/vault/cost/usage-raw-sample.json` exists, it writes the raw stdin text to `usage-raw-sample.json`.<br>Creates `vault/cost/` if missing. Always exits 0 and writes nothing to stderr. Imports only `node:fs`, `node:path`, `node:url`. |
| C2 | file | `vault/cost/usage.json` | `{ "five_hour": Window, "seven_day": Window, "fable_seven_day": Window \| null, "read_at": "<ISO 8601 UTC>", "source": "statusline" \| "oauth" }`.<br>`Window = { "pct": <number 0–100, as received>, "resets_at": "<ISO 8601 UTC, from new Date(x).toISOString()>" }`.<br>A numeric `resets_at` is Unix seconds (×1000); a string is passed to `Date.parse`. The statusline always writes `fable_seven_day: null` and `source: "statusline"`.<br>Part H (EZD-000i) writes the same shape with `source: "oauth"`. JSON with 2-space indent and a trailing newline. |
| C3 | setting | `.claude/settings.json` `statusLine` | `{ "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR:-.}/scripts/statusline.mjs\"" }`. Every other key unchanged. |
| C4 | export | `scripts/budget.mjs` | `export const GATE_DEFAULTS = { five_hour_pause_pct: 90, warn_at_pct: 70, hold_at_pct: 80, fable_fallback_pct: 90, meter_source: 'auto' }`<br>`export const METER_FRESH_MS = 1_200_000`<br>`export const RESUME_AFTER_RESET_MS = 120_000`<br>`export const ROOT` (the repo root from the module's location).<br>Thresholds: `budget[key] ?? GATE_DEFAULTS[key]`; `*_fraction` keys are ignored. Importing the module runs no CLI code and writes nothing. |
| C5 | export | `readMeters(opts) → Promise<Meters>` | `opts = { root = ROOT, now = new Date(), budget, fallback = null, spend }`.<br>`budget` defaults to `<root>/vault/budget.json` parsed (`{}` if absent). `spend` defaults to `weekSpend(budget, now)` from `<root>/vault/tools/next_ticket.mjs`.<br>`Meters = { source: 'statusline' \| 'oauth' \| 'proxy', read_at: string \| null, five_hour: Window \| null, seven_day: Window \| null, fable_seven_day: Window \| null, warning: string \| null }`.<br>**Order for `meter_source` `auto`:**<br>(1) `<root>/vault/cost/usage.json` if it parses, `now − Date.parse(read_at) < METER_FRESH_MS`, and `seven_day` is non-null → returned with its own `source`, `warning: null`.<br>(2) else, if `fallback` is a function, `await fallback({ root, now, budget })`; a non-null result is returned as is.<br>(3) else proxy: `five_hour: null`, `seven_day: { pct: spend.pct, resets_at: weekStart + 7 d }` or `null` when `spend.pct` is null, `fable_seven_day: { pct: Math.round(spend.fable / fable_ceiling_usd_est * 100), resets_at }` or `null` when that ceiling is unset, `read_at: now`, `warning: 'no usage meter reading fresher than 20 minutes; gating on the dollar proxy (PROCESS.md section 11)'`.<br>**Other `meter_source` values:** `statusline` skips (2); `oauth` skips (1); `proxy` returns (3) with `warning: null`. |
| C6 | export | `gateDecision(meters, budget, now = new Date()) → Decision` | Pure.<br>A window counts only when `pct` is a number and `Date.parse(resets_at) > now`.<br>`Decision = { pause: { pct, resets_at, resume_at } \| null, warn: boolean, hold: boolean, fable: 'fable' \| 'opus', thresholds: { five_hour_pause_pct, warn_at_pct, hold_at_pct, fable_fallback_pct } }`.<br>`pause` is set when five_hour pct ≥ `five_hour_pause_pct`; `resume_at` is the ISO of `Date.parse(resets_at) + RESUME_AFTER_RESET_MS`.<br>`warn` = seven_day pct ≥ `warn_at_pct`. `hold` = seven_day pct ≥ `hold_at_pct`. `fable` = `'opus'` when fable_seven_day pct ≥ `fable_fallback_pct`, else `'fable'`. A window that does not count gives no pause, `false` or `'fable'`. |
| C7 | export | `applyGates(opts) → { start: boolean, reason: string \| null, decision: Decision }` | `opts = { root = ROOT, now = new Date(), budget, meters, nextUnit, inProgressBuild, notify }`. Steps in order:<br>(a) proxy source and no `weekly_ceiling_usd_est` → `start: false`, the reason text of `run.mjs` line 99.<br>(b) `overrideActive(budget, now)` → `start: true`, no warn or hold.<br>(c) `warn` and no marker `<root>/vault/handoff/.budget-warned-<seven_day.resets_at[0..10]>` → write the marker, then call `notify(<warn text>)`.<br>(d) `hold` → if `<root>/vault/handoff/BUDGET_HOLD.md` is absent, `writeHold(...)` then `notify(<hold text>)`; `start = inProgressBuild`, `reason = 'budget hold'` when `start` is false.<br>(e) no `hold`, but `BUDGET_HOLD.md` exists and `!inProgressBuild` → `start: false`, `reason: 'budget hold in place; nothing new starts.'`.<br>(f) otherwise `start: true`.<br>Never sleeps and never handles the pause. |
| C8 | export / files | `writeHold({ root, now, reason, meters, budget, nextUnit })`; `vault/handoff/BUDGET_HOLD.md`; `vault/handoff/WINDOW_PAUSE.md` | Text as in section 6. `WINDOW_PAUSE.md` carries one machine-read line, `- Resume at: <ISO>`, read back by C9. `BUDGET_HOLD.md` contains the weekly percent as `<pct>%`, the reset time, the next unit and the three override commands. |
| C9 | export | `waitForWindow({ root = ROOT, now = new Date(), pause, sleep }) → Promise<number>` | (1) If `<root>/vault/handoff/WINDOW_PAUSE.md` exists: `ms = max(0, Date.parse(<Resume at>) − now)`. If the line is missing or unreadable, `ms = 0`.<br>(2) Else, if `pause` is set, write the file (section 6) and `ms = max(0, Date.parse(pause.resume_at) − now)`.<br>(3) Else return 0 without calling `sleep`.<br>For (1) and (2): `await sleep(ms)` exactly once, delete the file, and return `ms`. No notify. |
| C10 | CLI | `node scripts/budget.mjs [flags]` | Runs only when it is the entry script (`process.argv[1]` resolves to the module file).<br>`--hold-at <pct>` (integer 1–100): sets `budget.hold_at_pct`, pushes `{ date: <UTC YYYY-MM-DD>, hold_at: { from: <previous hold_at_pct ?? 80>, to: <pct> } }` to `history`, saves, deletes `BUDGET_HOLD.md` if present, and exits 0. A missing or out-of-range value exits 1 with the section 6 error, `budget.json` unchanged.<br>`--raise …` exits 1 with the section 6 message on stderr, `budget.json` unchanged.<br>The other flags are as today. The no-flag report adds the meter line from `readMeters` (section 6). |
| C11 | CLI | `node vault/tools/next_ticket.mjs --report` → `vault/PROGRESS.md` | **Fresh reading** (`<vault>/cost/usage.json` parses, `read_at` under 20 minutes old, `seven_day` non-null): the file ends with the `## Usage` section of section 6, rows `Five-hour`, `Weekly`, `Fable weekly`. Times are `YYYY-MM-DD HH:MM UTC`; percentages are rounded to integers; a null window shows `no meter` and `—`. There is no `## This week's estimated spend` section.<br>**Otherwise:** the `## This week's estimated spend` section exactly as today, and no `## Usage`.<br>The rest of the file is unchanged. |
| C12 | run.mjs wiring | `scripts/run.mjs` | Imports C5–C9 and `overrideActive` from `./budget.mjs`. Per-pass order as in section 1 step 4. Sets `process.env.EZD_FABLE_ALLOWED` from `decision.fable`. No exports (code-review only; it runs `main()` on import). |
| C13 | test files | `scripts/budget/*.test.mjs` | **Imports:** only `node:test`, `node:assert/strict`, `node:fs`, `node:child_process`, `node:os`, `node:path`, `node:url`, plus `../budget.mjs` (gates test only). **Temp roots:** `realpathSync(mkdtempSync(...))`. The gates test passes `root`, `now`, `budget`, `spend`, `notify` and `sleep` explicitly and never touches the real `vault/`. The statusline test copies `scripts/statusline.mjs` to `<tmp>/scripts/`. The CLI test copies `scripts/budget.mjs` to `<tmp>/scripts/`, and `vault/` to `<tmp>/vault/` with the mockups/archive filter of `questions-flow.test.mjs`. **Titles:** every test title starts `EZD-000h`. |

## 4. Tests

The fixed clock is `NOW = new Date('2026-10-19T12:00:00Z')`. `W(pct, mins)` is a window `{ pct, resets_at: ISO(NOW + mins minutes) }`. The meters fixture is `{ source: 'statusline', read_at: ISO(NOW), five_hour: W(0, 60), seven_day: W(0, 3000), fable_seven_day: W(0, 3000), warning: null }`, with one window varied per case. `budget = {}` (defaults) unless stated.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 | AC-EZD-000h-1 | unit | `gateDecision` with five_hour pct 69, 70, 79, 80, 89, 90; then 95 with `resets_at` NOW − 1 min | `pause` is null for 69–89. At 90 it equals `{ pct: 90, resets_at: ISO(NOW+60m), resume_at: ISO(NOW+62m) }`. Null for the past reset | PROCESS.md section 11 (`five_hour_pause_pct` 90, "at or above", "two minutes after the reset"); C6 (a past reset is no reading) |
| T2 | AC-EZD-000h-1 | unit | `gateDecision` with seven_day pct 69, 70, 79, 80, 89, 90; then 85 with `resets_at` NOW − 1 min | `warn`: F, T, T, T, T, T. `hold`: F, F, F, T, T, T. Past reset: `warn` F, `hold` F | PROCESS.md section 11 (`warn_at_pct` 70, `hold_at_pct` 80, "at or above"); C6 |
| T3 | AC-EZD-000h-1 | unit | `gateDecision` with fable_seven_day pct 69, 70, 79, 80, 89, 90; then `fable_seven_day: null` | `fable`: `'fable'` ×5, then `'opus'` at 90. Null → `'fable'` | PROCESS.md section 11 (`fable_fallback_pct` 90); split note 4; Findings row 1a |
| T4 | AC-EZD-000h-2 | unit | `readMeters` in a temp root, `budget = { weekly_ceiling_usd_est: 300 }`, `spend = { main: 150, fable: 0, pct: 50, start: NOW−1d }`. `usage.json` = the meters fixture as C2 with seven_day pct 63 and `read_at`: (a) NOW − 19 min; (b) NOW − 21 min, with `fallback` returning `{ source: 'oauth', … }`; (c) NOW − 21 min, no fallback; (d) as (a) with `budget.meter_source = 'proxy'` | (a) `source` `'statusline'`, `seven_day.pct` 63, `warning` null. (b) `source` `'oauth'`. (c) `source` `'proxy'`, `seven_day.pct` 50, `five_hour` null, `warning` contains `dollar proxy`. (d) `source` `'proxy'`, `warning` null | Done-when clause 2; PA3 Item 1 Gates ("fresher than 20 minutes, otherwise from the fallback poll, otherwise from the dollar proxy with a warning"); PROCESS.md section 11 sources 1–3 and `meter_source`; 150 / 300 = 50% (`weekSpend` arithmetic, `next_ticket.mjs` line 375) |
| T5 | AC-EZD-000h-3 | unit | `waitForWindow` in a temp root, `now` NOW, `sleep` stub recording its argument and the file contents at call time. (a) `pause = gateDecision(five_hour 92, resets in 10 min).pause`; (b) no pause, with a pre-written `WINDOW_PAUSE.md` holding `- Resume at: ISO(NOW+5m)`; (c) no pause, no file | (a) `sleep` called once with `720000`. At call time the file contains `92%`, `ISO(NOW+10m)` and `- Resume at: ISO(NOW+12m)`. After return the file is gone; returns 720000. (b) `sleep(300000)`, file gone. (c) `sleep` not called; returns 0 | Done-when clause 3; PROCESS.md section 10 launcher step 1 and section 11 "The five-hour pause" (+2 minutes, delete the file); PA3 verification item 3 ("fixture and a short reset time") |
| T6 | AC-EZD-000h-4 | unit | `applyGates` twice in a temp root, meters with seven_day pct 75, `budget = { weekly_ceiling_usd_est: 300 }`, `inProgressBuild: false`, `notify` stub | Both calls `start: true`. `notify` is called exactly once, and its message contains `75%`. `<root>/vault/handoff/.budget-warned-<seven_day.resets_at[0..10]>` exists. No `BUDGET_HOLD.md` | Done-when clause 4 ("warning fires once"); PROCESS.md section 11 ("notifies Josh once"); C7 (c) |
| T7 | AC-EZD-000h-4 | unit | `applyGates`, fresh temp root, seven_day pct 85, `nextUnit` `'build EZD-999'`. (a) `inProgressBuild: true`; (b) then `inProgressBuild: false` | (a) `start: true`. `BUDGET_HOLD.md` exists and contains `85%` and `build EZD-999`. `notify` called twice (warn, then a message containing `budget hold`). (b) `start: false`, `reason` contains `budget hold`, no new `notify` call | Done-when clause 4 ("the hold lets an in-progress ticket finish"); PROCESS.md section 11 "When the weekly hold is reached" steps 1–4; C7 (c), (d) |
| T8 | AC-EZD-000h-5 | unit (CLI) | Temp root with a copy of `statusline.mjs`. (a) stdin `{"session_id":"fixture","rate_limits":{"five_hour":{"used_percentage":42,"resets_at":1893999600},"seven_day":{"used_percentage":63,"resets_at":1894255200}}}`; (b) delete the sample, run (a) again; (c) a new temp root, stdin `{"session_id":"x"}`, then stdin `not json`. Then read the repo's `.claude/settings.json` and `.gitignore` | (a) exit 0. stdout trimmed `5h 42% · week 63%`. `usage.json` deep-equals `{ five_hour: { pct: 42, resets_at: '2030-01-07T07:00:00.000Z' }, seven_day: { pct: 63, resets_at: '2030-01-10T06:00:00.000Z' }, fable_seven_day: null, read_at, source: 'statusline' }`, with `read_at` an ISO time between the test's start and end. `usage-raw-sample.json` equals stdin. (b) no sample written. (c) exit 0, stdout `usage: no data` both times, stderr empty, no `usage.json`. `statusLine.type` is `command` and `statusLine.command` contains `scripts/statusline.mjs`. `.gitignore` has the lines `vault/cost/usage.json` and `vault/cost/usage-raw-sample.json` | Done-when clause 5; PA3 Item 1a (shape, raw sample); Findings row 1a (field names; Unix seconds; 1893999600 = 2030-01-07T07:00:00Z and 1894255200 = 2030-01-10T06:00:00Z by `new Date(s*1000).toISOString()`); PROCESS.md section 14 Settings; Scope (`.gitignore`); C1–C3 |
| T9 | Scope (`--raise` → `--hold-at`; no AC ID) | unit (CLI) | Temp root (C13). Write `<tmp>/vault/handoff/BUDGET_HOLD.md`. Run (a) `--hold-at 85`; (b) `--hold-at 0`; (c) `--raise 400` | (a) exit 0. `budget.json` `hold_at_pct` is 85, and the last `history` entry deep-equals `{ date: <UTC today>, hold_at: { from: 80, to: 85 } }`. `BUDGET_HOLD.md` is gone. (b) exit 1, `budget.json` unchanged. (c) exit 1, stderr contains `--hold-at`, `budget.json` unchanged | PA3 Item 1 ("`--raise` becomes `--hold-at <pct>`"); PROCESS.md section 11 Override ("the raised hold is logged with the date"); `from` 80 = the `hold_at_pct` default (section 11), since the copied `budget.json` has no `hold_at_pct`; C10 |
| T10 | Scope (`--report`; no AC ID) | unit (CLI) | Temp vault copy (C13). Write `usage.json` with five_hour 42 / `2030-01-07T07:00:00.000Z`, seven_day 63 / `2030-01-10T06:00:00.000Z`, `fable_seven_day` null, `source` `statusline`. (a) `read_at` = the current time; (b) `read_at` 21 minutes ago. Run `next_ticket.mjs --report` | (a) `PROGRESS.md` contains `## Usage`, `\| Five-hour \| 42% \| 2030-01-07 07:00 UTC \|`, `\| Weekly \| 63% \| 2030-01-10 06:00 UTC \|` and `\| Fable weekly \| no meter \| — \|`, and not `## This week's estimated spend`. (b) contains `## This week's estimated spend`, and not `## Usage` | PROCESS.md section 11 ("`PROGRESS.md` shows the three percentages and their reset times"); split note 5; C11; section 6 wording |

Notes:
- **Before the build,** every test fails for the right reason: `budget.mjs` has no exports and runs its CLI on import, `statusline.mjs` does not exist, `--hold-at` is unknown, and `--report` prints only spend.
- **AC-6** is the builder's report of verification items 1, 2 (statusline half), 3 and 4 (section 1 step 8), plus the gate. T5–T7 are the evidence for items 3 and 4.
- **Not unit-tested, by design:** the `run.mjs` wiring (C12). It runs `main()` and spawns `claude` on import. The code-reviewer checks it against C12, and the pilot exercises it end to end (PROCESS.md section 15 items 11, 13).
- **Existing tests** need no change. `scripts/ledger/questions-flow.test.mjs` and `lesson-ratification.test.mjs` copy `vault/` without `usage.json` (it is gitignored, but a local copy would be copied too). The `--report` change touches no path those tests check.

## 5. Visual checklist
None (no screen changes).

## 6. Proposed wording

No app text. These are the texts Josh sees from the tooling: terminal, ntfy and vault files. They follow the style of the existing launcher texts (`run.mjs` lines 91, 107, 110). Josh approves them at Stage 2.

| Where | Text |
| --- | --- |
| Status line (C1), meters present | `5h 42% · week 63%` |
| Status line (C1), no meters | `usage: no data` |
| `WINDOW_PAUSE.md` (C8) | `# Five-hour window pause` / blank / `Written by scripts/run.mjs on <ISO>.` / blank / `- Five-hour window: <pct>% used (pause at <five_hour_pause_pct>%)` / `- Resets at: <ISO resets_at>` / `- Resume at: <ISO resume_at>` / blank / `The launcher starts no unit until the resume time, then deletes this file and continues (PROCESS.md section 11). A unit already running is not interrupted. Nothing is needed from Josh.` |
| `BUDGET_HOLD.md` (C8) | `# Budget hold` / blank / `Written by scripts/run.mjs on <ISO>.` / blank / `- Reason: <reason>` / `- Weekly window: <pct>% used (hold at <hold_at_pct>%), resets <ISO>; source: <source>` / `- Five-hour window: <pct>% · Fable weekly: <pct>% or no meter` / `- Next unit when released: <nextUnit>` / blank / `No new ticket starts while this file exists; a ticket already in progress finishes. To continue (PROCESS.md section 11):` / ``- `node scripts/budget.mjs --hold-at <pct>` `` / ``- `node scripts/budget.mjs --until-reset` `` / ``- `node scripts/budget.mjs --api-until-reset` `` / ``Each removes this file. Then start `node scripts/run.mjs` again.`` |
| Hold reasons (C7, `writeHold`) | `weekly usage reached the hold (<pct>%)` · plan limit: unchanged `plan limit error (<note>)` |
| ntfy, weekly warning (C7 c) | `weekly usage at <pct>% (<source>); hold at <hold_at_pct>%. Resets <YYYY-MM-DD HH:MM UTC>.` |
| ntfy, hold (C7 d) | `budget hold: weekly usage at <pct>% (hold at <hold_at_pct>%). In-progress ticket finishes; nothing new starts. See vault/handoff/BUDGET_HOLD.md.` |
| Launcher log, proxy (C5) | `no usage meter reading fresher than 20 minutes; gating on the dollar proxy (PROCESS.md section 11)` |
| Launcher log, pause | `five-hour window at <pct>%; paused until <ISO resume_at> (vault/handoff/WINDOW_PAUSE.md)` |
| Launcher log, Fable | `Fable weekly window at <pct>%: Fable dispatches use Opus 5.5 until <YYYY-MM-DD HH:MM UTC>` |
| `PROGRESS.md` (C11) | `## Usage` / blank / `Source: <source>, read <YYYY-MM-DD HH:MM> UTC.` / blank / `\| Window \| Used \| Resets \|` / `\| --- \| --- \| --- \|` / `\| Five-hour \| 42% \| 2030-01-07 07:00 UTC \|` / `\| Weekly \| 63% \| … \|` / `\| Fable weekly \| no meter \| — \|` |
| `budget.mjs` report line (C10) | `Meters (<source>, read <YYYY-MM-DD HH:MM> UTC): five-hour <pct>% (resets <time>) · weekly <pct>% (resets <time>) · Fable <pct>% or no meter` and `Thresholds: pause <n>% · warn <n>% · hold <n>% · Fable fallback <n>%` |
| `budget.mjs --hold-at` bad value | `--hold-at needs a whole percent from 1 to 100` |
| `budget.mjs --raise` | `--raise was replaced by --hold-at <pct> (PROCESS.md section 11)` |
| `budget.mjs --hold-at` success | `hold set at <pct>% (was <from>%)`, followed by the existing `hold released (BUDGET_HOLD.md removed)` when a hold file was present |

## 7. Security review
security-review: no. No app auth, permissions, data access, money, API or migrations.
- The statusline payload carries no credential (Findings row 1a lists its fields).
- The sign-in token belongs to Part H (EZD-000i, security-review: yes).
- The usage files are gitignored.

Reviewers needed:
- **code-reviewer:** yes, Opus 5.5 high (PA3-MECHANISMS.md rule 5). Failure-mode check, because this changes the launcher (rule 5; split proposal "Reviewers and models"). Confirm:
  - a past `resets_at` never re-pauses (T1);
  - a stale or unreadable `usage.json` falls through and never throws;
  - `statusline.mjs` exits 0 on every input;
  - importing `budget.mjs` runs no CLI;
  - the C12 pass order matches PROCESS.md section 10 step 1;
  - an in-progress build still starts under a hold;
  - `waitForWindow` cannot loop on an old `WINDOW_PAUSE.md`.
- **calc-auditor:** no.
- **ui-verifier:** no.
- **security-reviewer:** no.

## 8. Complexity and model recommendation
Medium. The contract is complete and the logic is threshold arithmetic. But the change rewires the launcher's gate, which every unattended run passes through: a wrong comparison or a re-pause loop stops the build or overspends the week. It touches 6 code files and 3 test files with 10 tests, at the size limit. Test-author: Sonnet 5.5, medium effort. Builder: Sonnet 5.5, medium effort (PA3-MECHANISMS.md rule 5; split proposal "Reviewers and models").

## 9. Dependencies

From the ticket row:
- **EZD-000g** (planned). An ordering dependency from the split chain (PA3 "Order of work and commits": Item 1 last). It changes `lessons()` and `check()` in `next_ticket.mjs`; this ticket changes `report()`. No shared contract, but a textual merge in the same file.

Not in the ticket row, reached through the chain:
- **EZD-000c** (planned). The whole-read guard makes the builder read `run.mjs` and `next_ticket.mjs` by range. That is a working constraint, not a contract.
- **EZD-000b** (planned). It also edits `.claude/settings.json`, adding the hidden-token keys and env. This ticket adds only `statusLine`, so both merge.
- **EZD-000f.** It also edits `.claude/settings.json`; same as above.
- **EZD-000** (done).

No missing dependency. There is no screen, so EZD-016a is not needed.

Dependents:
- **EZD-000i** (Part H) plugs its poller into `readMeters` as `fallback` (C5) and writes `usage.json` with `source: "oauth"` (C2). Its plan must match C2 and C5.
- **EZD-001** (the pilot) re-checks verification items 1 and 2 when they are reported "not testable here" (Q-0126 (c)).

Risks:
- **Wrong statusline field names:** the live payload may use other names than the Findings say. Then `usage.json` is never written, the launcher stays in proxy mode (with the warning), and nothing breaks; item 1 at the pilot finds it.
- **Statusline under `claude -p`:** it may never fire in headless runs (Findings). Then unattended runs use the proxy until EZD-000i adds the fallback.
- **Merge conflicts:** `next_ticket.mjs` is changed by EZD-000g and this ticket, and `settings.json` by EZD-000b, EZD-000f and this ticket. One ticket in progress at a time keeps these sequential (PROCESS-EZDRAFT.md section 8).

## 10. Open questions
None.
