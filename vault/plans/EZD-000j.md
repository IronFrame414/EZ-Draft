# EZD-000j · OAuth usage fallback reads `utilization` (Q-0138)

- **ACs:** AC-EZD-000j-1, AC-EZD-000j-2, AC-EZD-000j-3 (`vault/spec/acceptance-criteria.md` lines 129–131, generated from the Done-when text; KNOWN-LIMITS.md "Acceptance criteria for Phase 0"). AC-2 is a report recorded in the STATUS note; AC-3 is the gate. Neither is a test.
- **Complexity:** medium (reasoning in section 8).
- **User-visible result:** when the status line is stale (headless runs), the launcher reads Josh's real five-hour and weekly usage percentages from Claude's usage endpoint. Before this ticket, every real reply was read as unreadable and the launcher fell back to the dollar estimate.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 44):
- **Scope:** `parseUsage` in `scripts/oauth-usage.mjs` reads the `utilization` value of the live usage reply's `five_hour` and `seven_day` windows instead of the statusline's `used_percentage` (Q-0134 (a)), converting to the percent the gates use. The builder runs one live probe of the endpoint (PA3-MECHANISMS.md Item 1b; the token rules of rule 8 apply) to confirm whether `utilization` is 0–1 or 0–100, and records the result in the STATUS note. Tests use a fixture in the probed shape and never the live endpoint (CLAUDE.md rule 6). Builder write grant per PA3-MECHANISMS.md rule 7 and Q-0128.
- **Done when:** A fixture usage reply in the probed shape gives the expected five-hour and seven-day percentages from `parseUsage`. The live probe's scale is recorded in the STATUS note. The gate is green.
- **Depends on:** EZD-000i · **Spec ref:** Q-0138; Q-0134; PA3-MECHANISMS.md Item 1b, rule 8

**The ordering problem, and how this plan settles it.** Tests are written before the builder runs (PROCESS.md section 8 steps 4–6), but the scale is confirmed only by the builder's live probe (ticket Scope). The plan follows the EZD-000i precedent for `KEYCHAIN_SERVICE` (EZD-000i plan H1: "the builder replaces it with the name it confirms; tests import it and never hard-code it"):
- the scale is one exported constant, `UTILIZATION_MAX`;
- its default is 100, from the best source available before the probe (R-002: "utilization is 0–100 (a percent), not 0–1", from three open-source readers of this reply);
- the tests build their fixture from the constant, so they hold for either scale;
- the field names and `resets_at` form of the fixture come from R-002 and the EZD-000i probe (STATUS EZD-000i note: "response five_hour/seven_day values use `utilization` (and dollar fields)").

If the probe shows other names, the builder stops and raises a question (step 5).

Steps:
1. **`UTILIZATION_MAX`** (J1). Add the exported constant `UTILIZATION_MAX = 100` to `scripts/oauth-usage.mjs` (R-002 item 1). The builder changes it to `1` only under the rule in step 5.
2. **`parseUsage(body, max = UTILIZATION_MAX)`** (J2). Change the window reader `win()` (`scripts/oauth-usage.mjs` lines 57–63) to read `w.utilization` instead of `w.used_percentage` (ticket Scope; Q-0138 (a)).
   - `used_percentage` is no longer read. A reply with only `used_percentage` gives `null` (Scope: "instead of").
   - The percent the gates use is 0–100: `scripts/budget.mjs` line 14 `GATE_DEFAULTS` (90, 70, 80, 90) and lines 66–71 compare `pct` with those numbers; PROCESS.md section 11 (`usage.json` `pct`). The window's `pct` is `Math.round(utilization * 100 / max * 100) / 100`, a percent rounded to two decimals.
   - The rounding is a how-to-build choice: in Node, `0.29 * 100` is `28.999999999999996` (run in this session), and an unrounded value next to a threshold could flip a gate. With `max = 100` the formula returns the value as received for any value with at most two decimals.
   - `resets_at` handling is unchanged: a number is Unix seconds and a string goes to `Date.parse` (EZD-000i H4). R-002 item 2 says the reply uses an ISO string with an offset; `Date.parse('2030-01-07T07:00:00.528743+00:00')` reads it (checked in this session: `2030-01-07T07:00:00.528Z`).
   - The rest of H4 is unchanged:
     - either window missing, not an object, with a non-finite `utilization` or an unreadable `resets_at` → `null`;
     - `fable_seven_day` stays `null`, because no source gives a Fable window in this reply (R-002 item 3 lists `seven_day_opus` and `seven_day_sonnet` only; PA3 Findings row 1a);
     - the return shape is unchanged.
   - `createOAuthFallback` calls `parseUsage(body)` with the default, so `usage.json` (EZD-000h C2) and the returned meters carry the converted percent with no other change.
3. **Probe line** (J3). `probe()` (lines 160–208) gains one line, placed just before the `token found in files …` line: `utilization: five_hour <v>, seven_day <v>`.
   - `<v>` is `String(body.<window>.utilization)` when that is a finite number, else `none`.
   - It prints only these two numbers. Every other key stays names only (EZD-000i step 7).
   - The two numbers are the same usage percentages that `vault/PROGRESS.md` already publishes in the repo (PROCESS.md section 11: "`PROGRESS.md` shows the three percentages and their reset times"), so printing them adds no exposure. The builder needs them to settle the scale (step 5).
   - The line is printed only when the body is a JSON object, like the key lines.
4. **No other change.** These stay exactly as they are: request headers (the EZD-000i probe got HTTP 200 with the bearer alone, STATUS EZD-000i note, so R-002 item 4's extra headers are not needed), `readToken`, the pacing, `run.mjs`, `budget.mjs` and `.gitignore` (CLAUDE.md rule 4).
5. **Live probe and scale** (AC-2; Scope; PA3 Item 1b and rule 8). After steps 1–3, the builder runs `node scripts/oauth-usage.mjs --probe` **once** from the worktree. guard-bash allows this command (EZD-000i T11 A5). There is no other access to the token: never `cat`, `Read`, `grep` or `security … -w` (PA3 rule 8; EZD-000i H12).
   - **Names.** If the `window keys` line shows that `five_hour` or `seven_day` lacks `utilization` or `resets_at`, the probed shape differs from the fixture. The builder stops and raises a question (PROCESS.md section 8 step 6: a dispute about behavior is a question). It does not patch the names.
   - **Scale,** in this order:
     1. Either printed value is above 1 → **0–100**. `UTILIZATION_MAX` stays 100.
     2. Otherwise, read `/Users/josh/Projects/ezdraft/vault/cost/usage.json` (the main checkout's meter file, which holds percentages only). If its `source` is `statusline` and `read_at` is within 20 minutes of the probe (PROCESS.md section 11, the 20-minute freshness), compare each value with that window's `pct`:
        - within 1 of `pct` → **0–100**;
        - within 0.01 of `pct / 100` → **0–1**, and the builder sets `UTILIZATION_MAX = 1`.
     3. Otherwise → **not settled** (all values ≤ 1 and no fresh status-line reading). `UTILIZATION_MAX` stays 100 (R-002). The orchestrator adds the re-check to `vault/handoff/PILOT.md` (Q-0126 (c) pattern).
   - Before copying the probe lines into the report, the builder checks the `window keys` line for anything that looks like an account ID or email (EZD-000i security minor: "probe prints nested key names"). It replaces any such key with `<redacted key>`.
   - **Report** (builder → orchestrator, who writes the STATUS note, AC-2): the probe lines, the scale verdict (`0–100`, `0–1` or `not settled`) with the rule that decided it, and the final `UTILIZATION_MAX`. If the network or the Keychain is blocked, it reports exactly that (EZD-000i step 11) and the scale is `not settled`.
6. **Tests** (section 4). The test-author adds T1–T4 to `scripts/budget/oauth.test.mjs`. It also moves the EZD-000i fixtures in that file to the probed shape:
   - `OK_BODY` (line 17, used by EZD-000i T1, T4, T5, T7, T8) becomes the J4 fixture;
   - the EZD-000i T8 bad body (line 203) becomes `{"five_hour":{"utilization":"x","resets_at":1}}`;
   - EZD-000i T10's expected lines gain `utilization: five_hour none, seven_day none` before the last line.
   - The input stays as is. No other assertion, expected value or test count in the EZD-000i tests changes. The pct values 42 and 63 and the ISO times in EZD-000i T7 stay as they are.
   - These edits follow from this ticket's change of contract (H4 → J2, H8 → J3). Each is recorded as a plan item so the code-reviewer can check it, as Q-0142 (a) did for EZD-001's fixture edits.
7. **Gate:** `node scripts/gate.mjs .claude/worktrees/EZD-000j` (CLAUDE.md rule 12; AC-3).

| Path | New / change | Why | Writer (guard-paths.mjs check) |
| --- | --- | --- | --- |
| `scripts/oauth-usage.mjs` | change | Steps 1–3, 5 | builder: `pa3Grant()` (`.claude/hooks/guard-paths.mjs` lines 43–51; worktree regex `EZD-000[b-j]` line 46 already includes EZD-000j, Q-0138 (a)) |
| `scripts/budget/oauth.test.mjs` | change | Step 6: T1–T4 and the EZD-000i fixture moves | test-author: `isTest` (guard-paths.mjs line 15) |

Not touched: `scripts/run.mjs`, `scripts/budget.mjs`, `scripts/statusline.mjs`, `.gitignore`, `.claude/`, `vault/budget.json` (Josh-only, guard-paths.mjs line 25).

Data: none. No tables, migrations, money or `schema_version`.

## 2. Sources

- **Q-0138** (`vault/questions/QUESTIONS.md` line 147; answered by Josh 2026-10-19): (a) adds this ticket so that the OAuth fallback reads `utilization` and the launcher gates on real percentages.
- **Q-0134** (line 143; answered-agent (a)): `parseUsage` was built to the statusline names. The probe reports the real names, and a mismatch goes to a follow-up ticket. This ticket is that follow-up.
- **`vault/handoff/PA3-MECHANISMS.md`:**
  - rule 7: the write grant;
  - rule 8: the token is read at run time only and never written to any file, log, output, commit or report;
  - Item 1b: the endpoint, the bearer token and the polling rules;
  - Findings rows 1a and 1b: the statusline names, no Fable window, and "the builder tests it at run time and reports".
- **`vault/PROCESS.md` section 11 "The budget":** the `usage.json` shape (`pct`, `resets_at`); the 20-minute freshness; the thresholds; "PROGRESS.md shows the three percentages".
- **`vault/plans/EZD-000i.md`:** H1 (the `KEYCHAIN_SERVICE` builder-confirmed constant pattern), H4 (the `parseUsage` contract this ticket changes), H8 and step 7 (the probe, names only), step 11 (the token-safe verification commands), T1–T11.
- **STATUS.md EZD-000i note** (line 64): the live probe got HTTP 200 from the Keychain source, and the `five_hour`/`seven_day` values use `utilization` and dollar fields. Security minor: the probe prints nested key names.
- **Code:** `scripts/oauth-usage.mjs` (read in full this session); `scripts/budget.mjs` lines 14, 25, 66–71 (gates compare `pct` 0–100; `valid()` needs `resets_at` in the future); `scripts/budget/oauth.test.mjs` lines 17, 203, 238–256; `.claude/hooks/guard-paths.mjs` lines 43–51.
- **Q-0126 (c):** an item reported "not testable here" goes to PILOT.md. **Q-0142 (a):** precedent for editing an earlier ticket's fixtures, recorded and reviewer-checked.
- **Research:** **R-002** (2026-10-19, retriever-web, for this ticket): `utilization` is 0–100, from three open-source readers; `resets_at` is an ISO 8601 string with an offset; a whole window can be `null`; the top-level keys; a newer `limits` array shape.
- Spec sections, decisions, mockups, non-goals and glossary: none apply. This is process tooling and changes no product behavior (PA3-MECHANISMS.md intro: "No app code. No change to the product spec"). `docs/architecture.md`: no new dependency (CLAUDE.md rule 7). The module uses Node built-ins only.

## 3. Interface contract

Everything in EZD-000i H1–H14 not listed here is unchanged.

| # | Kind | Name or path | Details |
| --- | --- | --- | --- |
| J1 | export (constant) | `UTILIZATION_MAX` in `scripts/oauth-usage.mjs` | Number, `100` (R-002) or `1`. The builder sets it from the probe (step 5). Tests import it and never hard-code the scale. |
| J2 | export | `parseUsage(body, max = UTILIZATION_MAX) → { five_hour: Window, seven_day: Window, fable_seven_day: null } \| null` | Pure. Reads `body.five_hour.utilization` and `body.seven_day.utilization`.<br>`Window = { pct: Math.round(utilization * 100 / max * 100) / 100, resets_at: <ISO string, as EZD-000i H4> }`.<br>`null` when: `body` is not an object; either window is missing or not an object; its `utilization` is not a finite number; or its `resets_at` is unreadable.<br>`used_percentage` is ignored. Other keys (`seven_day_opus`, `extra_usage`, …) are ignored. |
| J3 | probe line | `probe()` output | A new line just before `token found in files under vault/, scripts/, .run/: …`: `utilization: five_hour <v>, seven_day <v>`. `<v>` = `String(n)` for a finite number `n`, else `none`. Printed only when the body is a JSON object (the same condition as the `response keys` line). |
| J4 | test fixture | `OK_BODY` in `scripts/budget/oauth.test.mjs` | `JSON.stringify({ five_hour: { utilization: 42 * UTILIZATION_MAX / 100, resets_at: '2030-01-07T07:00:00+00:00' }, seven_day: { utilization: 63 * UTILIZATION_MAX / 100, resets_at: '2030-01-10T06:00:00+00:00' }, seven_day_opus: null, seven_day_sonnet: null, extra_usage: { is_enabled: false, monthly_limit: null, used_credits: null, utilization: null } })`. Keys and value forms from R-002 items 2–3; times as in EZD-000i T7. |

Test titles start `EZD-000j T<n>`, like the EZD-000i tests in the same `node:test` file (the root `test` script runs `scripts/**/*.test.mjs`; C9 covers only `app/`, `packages/`, `worker/`, docs/architecture.md Machine checks).

## 4. Tests

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 AC-1 done when: a fixture usage reply gives the expected five-hour and seven-day percentages | AC-EZD-000j-1 (title contains "done when") | unit | `parseUsage(JSON.parse(OK_BODY))` (J4) | Deep-equals `{ five_hour: { pct: 42, resets_at: '2030-01-07T07:00:00.000Z' }, seven_day: { pct: 63, resets_at: '2030-01-10T06:00:00.000Z' }, fable_seven_day: null }` | Fixture shape from R-002 (items 1–3) and the STATUS EZD-000i note; pct 42/63 and ISO times as in EZD-000i T7; conversion J2 (`42 * M / 100 * 100 / M` = 42 for M ∈ {1, 100}); no Fable window (PA3 Findings row 1a; R-002 item 3) |
| T2 AC-1: utilization converts to a percent on either scale, rounded to two decimals | AC-EZD-000j-1 | unit | (a) `UTILIZATION_MAX`. (b) `parseUsage(b, 1)` where `b` has five_hour `utilization` 0.29 and seven_day 0.9, both `resets_at` `'2030-01-07T07:00:00+00:00'`. (c) `parseUsage(b2, 100)` with 33 and 89.99. (d) `parseUsage(b3, 100)` with 0.5 and 0, where five_hour `resets_at` is the number 1893999600 | (a) `[1, 100].includes(UTILIZATION_MAX)` is true. (b) pct 29 and 90. (c) pct 33 and 89.99. (d) pct 0.5 and 0, and five_hour `resets_at` is `'2030-01-07T07:00:00.000Z'` | J1 (two allowed scales, Q-0138 "0–1 or 0–100"); J2 formula with two-decimal rounding (step 2: 0.29 × 100 = 29, not 28.999999999999996); Unix seconds 1893999600 = 2030-01-07T07:00:00Z (EZD-000h T8, EZD-000i T7) |
| T3 AC-1: a reply without readable utilization or resets_at gives null | AC-EZD-000j-1 | unit | `parseUsage` of: (a) the old statusline shape `{"five_hour":{"used_percentage":42,"resets_at":1893999600},"seven_day":{"used_percentage":63,"resets_at":1894255200}}`; (b) J4 with seven_day `utilization` removed; (c) J4 with five_hour `utilization: "x"`; (d) J4 with seven_day `resets_at: null`; (e) J4 with `five_hour: null`; (f) `null` | All `null` | Scope ("instead of `used_percentage`"); J2 null rules (EZD-000i H4: a wrong shape falls back to the proxy, never a false reading); R-002 item 2 (a window or its `resets_at` may be null) |
| T4 AC-2: probe prints the two window values and nothing else numeric | AC-EZD-000j-2 (the probe line the builder reads) | unit | `probe({ root: <tmp>, platform: 'linux', readToken: okTok, fetch: <stub 200 with body> })`, where body = `{"five_hour":{"utilization":33,"resets_at":"2030-01-07T07:00:00+00:00"},"seven_day":{"utilization":13,"resets_at":"2030-01-10T06:00:00+00:00"},"extra_usage":{"utilization":5,"monthly_limit":999},"email":"x@y"}` | The line before the last equals `utilization: five_hour 33, seven_day 13`. The last line is `token found in files under vault/, scripts/, .run/: none`. No line contains `999`, `x@y`, `: 5` or the token. `fetch` is called once. No file is written under `<tmp>` | J3; step 3 (only the two window values, everything else names only, EZD-000i step 7); PA3 rule 8 |
| EZD-000i T1, T4, T5, T7, T8 rerun with the J4 usage reply | (unchanged ACs of EZD-000i) | unit | `OK_BODY` replaced by J4; T8's bad body becomes `{"five_hour":{"utilization":"x","resets_at":1}}` | Unchanged. EZD-000i T7 still deep-equals `pct` 42 and 63 with `'2030-01-07T07:00:00.000Z'` and `'2030-01-10T06:00:00.000Z'`, which covers the end-to-end path (fallback → `usage.json` → `readMeters`) for AC-EZD-000j-1 | J2 and J4 (same conversion as T1); EZD-000h C2 |
| EZD-000i T10 probe output gains the utilization line | (unchanged) | unit | Unchanged input | The expected lines gain `utilization: five_hour none, seven_day none` as the sixth of seven, just before the `token found …` line. All other assertions are unchanged (no `: 1`, no `x@y`) | J3 (`none` when there is no numeric `utilization`) |

Smoke: no (these are root `node:test` files, never filtered; docs/architecture.md Test scope).

## 5. Visual checklist

None. No screen changes.

## 6. Proposed wording

| Where | Text |
| --- | --- |
| `node scripts/oauth-usage.mjs --probe` output (J3), new line | `utilization: five_hour <v>, seven_day <v>` (`<v>` is a number or `none`) |

All other log, notify and probe text is unchanged from EZD-000i section 6.

## 7. Security review

security-review: yes. Areas: auth (the sign-in token in the module that reads it, and a live probe run with that token), plus output exposure (the probe now prints two numeric values; step 3 gives the reasoning).

The security-reviewer checks five things:
- the token path is unchanged;
- the builder ran exactly one probe, with the allowed command only;
- the report and the STATUS note carry no token and no account identifier;
- J3 prints only the two `utilization` numbers;
- the EZD-000i T5 token scan still passes with the new fixture.

Reviewers needed: code-reviewer always (it also checks that the EZD-000i test edits are only those in step 6) · calc-auditor no (a unit conversion, not a building or electrical calculation) · ui-verifier no · security-reviewer yes.

## 8. Complexity and model recommendation

**Medium.** The code change is small: one constant, one field read, one probe line. Two things keep it from low:
- the ticket edits the module that handles the sign-in token, and the builder runs a live probe under PA3 rule 8;
- the builder applies the step 5 scale rule and must not patch around a shape mismatch, and the test-author edits merged EZD-000i fixtures under a strict "no assertion changes" limit.

The low-complexity skip of the step-5 test review (PROCESS.md section 8 step 5) would remove the check on those fixture edits.

Models: test-author Sonnet 5.5 (medium), builder Sonnet 5.5 (medium), code-reviewer Opus 5.5 (high), security-reviewer Opus 5.5 (high). This matches EZD-000i (STATUS line 64) and PA3 rule 5.

## 9. Dependencies

- **EZD-000i** (done, 883a54f): `scripts/oauth-usage.mjs` and `scripts/budget/oauth.test.mjs` (ticket row).
- **EZD-000h** (done): not in the ticket row. EZD-000i T7, whose fixture this ticket changes, calls `readMeters` from `scripts/budget.mjs`, and the gates in that file define "the percent the gates use". It is reached through EZD-000i, so nothing waits.
- **EZD-016a:** not a dependency (no visual checklist).
- The grant: `.claude/hooks/guard-paths.mjs` line 46 already matches `EZD-000[b-j]` (Q-0138 (a)). The orchestrator removes the `pa3Grant` exception when this ticket merges (guard-paths.mjs line 45; Q-0128 (a)). Only Josh can do that edit (orchestrator rule, guard-paths.mjs `rules.orchestrator`), so it goes in the handoff as a proposal.

Risks:
- R-002 is third-party evidence for an undocumented endpoint. If the probe shows other names, step 5 stops the build with a question rather than shipping a wrong reader.
- If the scale stays "not settled" and the reply were really 0–1, the gates would under-read by 100× until the PILOT re-check. Step 5's status-line comparison is the guard against that.
- R-002 item 3 reports a newer reply shape with a `limits` array and no flat keys. If Anthropic moves to it, `parseUsage` returns `null` and the launcher falls back to the dollar proxy, safely (J2), and the probe shows it.
- A window whose `resets_at` is `null` (R-002 item 2) makes the whole reading `null`, so it falls to the proxy. `budget.mjs` `valid()` (line 25) would reject such a window anyway.

## 10. Open questions

None. Two points were settled at Level 1:
- **The order of tests and probe:** the J1 constant, following the EZD-000i H1 precedent, with its default from R-002.
- **Whether the probe may print the two values:** yes. They are the same percentages `PROGRESS.md` publishes (PROCESS.md section 11).
