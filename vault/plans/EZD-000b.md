# EZD-000b · Hidden-token settings and honesty rules (Items 2, 5)

- **ACs:** AC-EZD-000b-1, AC-EZD-000b-2, AC-EZD-000b-3, AC-EZD-000b-4, AC-EZD-000b-5 (`vault/spec/acceptance-criteria.md` lines 55–59, generated from Done-when).
- **Complexity:** medium (reasoning in section 8).
- **User-visible result:** Claude sessions in this repo stop spending Josh's usage on the task list, prompt suggestions, token reminders and goal check-ins, and every agent plus the three reviewers carry the three honesty rules.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: ready

Part A of the EZD-000b split. The split proposal that was in this file is archived at `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md`. Its notes 1–9 are for the later parts; none changes this part.

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 33):
- **Scope:** `.claude/settings.json`: add `todoFeatureEnabled: false`, `promptSuggestionEnabled: false`, `autoCompactEnabled: false`, plus env `CLAUDE_CODE_TOTAL_TOKENS_REMINDER: "off"` and `CLAUDE_CODE_GOAL_CHECKIN_MINUTES: "0"`, merged into the existing `env` block (Item 2; PROCESS.md section 14 Settings). Before that, grep `.claude/skills/` and `.claude/agents/` for `TaskCreate`, `TaskUpdate` and `TaskList`, and remove any reliance on them (Item 2). Append rules 14–16 to `CLAUDE.md` under "Rules (every agent)" (Item 5; numbering is Josh's, 2026-10-18). Add the same three rules under `## Honesty` in `code-reviewer.md`, `security-reviewer.md` and `phase-auditor.md` (Item 5). Report verification item 12. Builder write grant per PA3-MECHANISMS.md rule 7 and Q-0128.
- **Done when:** the settings keys and env values above, with every existing env key unchanged; no file under `.claude/skills/` or `.claude/agents/` names TaskCreate, TaskUpdate or TaskList; `CLAUDE.md` holds rules 14 to 16 under "Rules (every agent)" and is at most 60 lines; the three reviewer files each hold the same three rules under "## Honesty". Verification items 6 and 12 of `vault/handoff/PA3-MECHANISMS.md` are reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000 · **Spec ref:** vault/handoff/PA3-MECHANISMS.md Items 2, 5; PROCESS.md v2.3 sections 3, 11, 14.

Steps:
1. **Task-list grep (Item 2).** Run `grep -rn "TaskCreate\|TaskUpdate\|TaskList" .claude/skills .claude/agents`. At plan time (develop `e04d605`) this finds nothing, so there is no reliance to remove. If the builder's grep finds a hit, it stops and reports it as a question; it does not invent a replacement (CLAUDE.md rule 1). PROCESS.md section 14 Settings: "No skill may rely on the task-list tools; the ledgers are files."
2. **Settings (Item 2; PROCESS.md section 14 Settings).** In `.claude/settings.json`, add three top-level keys with the JSON boolean `false`: `todoFeatureEnabled`, `promptSuggestionEnabled`, `autoCompactEnabled`. Place them after `"model"`. Add two keys at the end of the existing `env` object: `"CLAUDE_CODE_TOTAL_TOKENS_REMINDER": "off"` and `"CLAUDE_CODE_GOAL_CHECKIN_MINUTES": "0"`, both strings. The three existing env keys keep their values. `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` stays `"1"`: PROCESS.md section 14 lists `2`, but the change to 2 belongs to EZD-000f (phase-00.md line 37, and the EZD-000e row: "Spawn depth stays at 1 in this part"). Nothing else in the file changes: permissions, hooks and `worktree` stay as they are. The key names and the value `off` are confirmed in the installed CLI (PA3-MECHANISMS.md Findings, rows for Item 2).
3. **CLAUDE.md (Item 5).** Insert three lines directly after rule 13 (today line 18) and before the blank line and `## Directory`. The text is verbatim from PA3-MECHANISMS.md Item 5. See the contract (section 3) for the exact lines. CLAUDE.md goes from 49 lines to 52 (`wc -l` at plan time), within the limit of 60 (Item 5; Done-when).
4. **Reviewer agents (Item 5).** At the end of `.claude/agents/code-reviewer.md`, `security-reviewer.md` and `phase-auditor.md`, append a blank line, the heading `## Honesty`, and the same three lines with the same numbers 14–16. The files have no `##` headings today, so putting the heading last leaves the existing body outside the new section. Keeping the numbers 14–16 means "rule 15" refers to the same rule in CLAUDE.md and in the agent files. That is a build choice, not a wording change. The frontmatter does not change.
5. **Verification report (AC-EZD-000b-5; PA3-MECHANISMS.md rule 6).** In the builder's final report:
   - **Item 12:** verified. Test T8 backs it: the `### The budget` subsection of `vault/PROCESS.md` starts "The launcher gates on the plan's **real usage percentages**" (line 354 at plan time).
   - **Item 6:** "not testable here". A subagent cannot start an interactive session: settings deny `Bash(claude *)`, and guard-bash blocks running `claude` from inside a session (PROCESS.md section 14 Hooks). T1 and T2 back the configuration side. Under Q-0126 (c), the orchestrator adds item 6 to `vault/handoff/PILOT.md` when this ticket merges, so EZD-001 checks it end to end.

| Path | New / change | Why |
| --- | --- | --- |
| `.claude/settings.json` | change | Step 2 (Item 2; PROCESS.md section 14 Settings) |
| `CLAUDE.md` | change | Step 3 (Item 5) |
| `.claude/agents/code-reviewer.md` | change | Step 4 (Item 5) |
| `.claude/agents/security-reviewer.md` | change | Step 4 (Item 5) |
| `.claude/agents/phase-auditor.md` | change | Step 4 (Item 5) |
| `scripts/process/hidden-token-honesty.test.mjs` | new (test-author) | Tests T1–T8 |

Write rights, per L-002:
- **Builder:** writes the five non-test paths through the PA3 grant in `.claude/hooks/guard-paths.mjs` lines 43–51 (`.claude/` and `CLAUDE.md` in a worktree matching `EZD-000[b-i]`; Q-0128 (a)).
- **test-author:** writes the test file. `*.test.mjs` matches `isTest` (guard-paths.mjs line 16), and the test-author rule (line 68) allows any test path.
- **Test runner:** the root `test` script runs `node --test "scripts/**/*.test.mjs"` (root `package.json`), so the gate runs the new file.

Data: none. No tables, migrations, money or `schema_version`.

## 2. Sources

- `vault/handoff/PA3-MECHANISMS.md`:
  - Rules 1, 5, 6 and 7.
  - Item 2 (settings block, the grep instruction, "merge into the existing env block").
  - Item 5 (the three rules verbatim, the 14–16 numbering, the ~60-line limit).
  - Verification list items 6 and 12.
  - Findings rows for Item 2.
- `vault/PROCESS.md`:
  - Section 3, rules 16–18. These are the same three rules. Item 5 is the CLAUDE.md text; see the note below.
  - Section 4, "How the orchestrator picks models".
  - Section 11, "The budget" (item 12).
  - Section 14: Settings, Hooks (guard-bash), and the CLAUDE.md template ("under about 60 lines").
- `vault/tickets/phases/phase-00.md` lines 33 and 37; `vault/tickets/README.md` section 5 (EZD-001 pilot; Q-0126 (c)).
- Questions: Q-0126 (c) (items "not testable here" go to PILOT.md); Q-0128 (a) (builder write grant); Q-0125 (a) (fix mode, which made the grant).
- Code at develop `e04d605`: `.claude/settings.json`, `CLAUDE.md`, the three agent files, `.claude/hooks/guard-paths.mjs`, `package.json`, `scripts/ledger/questions-flow.test.mjs` (the node:test pattern).
- Product spec sections 03, 04, 11, non-goals, glossary and mockups: not applicable. This ticket is process tooling with no app code (PA3-MECHANISMS.md header: "No app code. No change to the product spec").
- Research reports: none exist (`vault/research/` is absent), so no R-NNN covers this ticket.

**Differences between the handoff and PROCESS.md** (handoff rule 1 asks for them; the builder repeats them in its report):
1. **Numbering.** PROCESS.md section 3 numbers these rules 16–18, and the section 14 template numbers them 11–13. CLAUDE.md uses 14–16 by Josh's decision (Item 5, 2026-10-18: "the existing numbers win").
2. **Template wording.** The template's rules 12–13 are shorter than Item 5. The template drops "(the file, the diff, the output)" and "report failures as failures, with the output". Section 3 rules 17–18, the binding rule list, carry Item 5's full content, so Item 5's text is used. This repo's CLAUDE.md already departs from the generic template in rules 3, 5, 6 and 10–13.
3. **Spawn depth.** Section 14 lists `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`. That change is EZD-000f's, so it stays 1 here.

## 3. Interface contract

| Kind | Name or path | Details |
| --- | --- | --- |
| file | `.claude/settings.json` | Valid JSON. Top-level `todoFeatureEnabled`, `promptSuggestionEnabled` and `autoCompactEnabled` are boolean `false`. `env.CLAUDE_CODE_TOTAL_TOKENS_REMINDER === "off"`. `env.CLAUDE_CODE_GOAL_CHECKIN_MINUTES === "0"`. Unchanged: `env.CLAUDE_CODE_SUBAGENT_MODEL === "claude-sonnet-5-5"`, `env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS === "3"`, `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH === "1"` |
| text constant (tests) | `R14` | `Report only what a tool result in this session backs. A claim about our code is verified by reading it in the same action.` |
| text constant (tests) | `R15` | `Another agent's report, a test runner's summary, a profiler, a metric or a past log is a claim until checked against the primary artifact (the file, the diff, the output).` |
| text constant (tests) | `R16` | `A result that looks too good is a bug until proven otherwise. Prove a fix with a re-run. Never redefine a term, weaken a check or narrow a test to make a failure pass; report failures as failures, with the output.` |
| file | `CLAUDE.md` | In the section from the line `## Rules (every agent)` to the next line starting `## `, the lines that match `^\d+\. ` are numbered 1 to 16 in order. Lines 14, 15 and 16 are exactly `14. ` + R14, `15. ` + R15 and `16. ` + R16. Line count ≤ 60: `content.split('\n')` with one trailing empty string dropped, the same as `wc -l` on a file that ends in a newline. |
| file | `.claude/agents/{code-reviewer,security-reviewer,phase-auditor}.md` | Each has exactly one line equal to `## Honesty`. Its section runs to the next `## ` line or the end of the file and contains, in order, the lines `14. ` + R14, `15. ` + R15 and `16. ` + R16. |
| file | `vault/PROCESS.md` (read only) | The first non-empty line after `### The budget`, with `**` removed, starts with `The launcher gates on the plan's real usage percentages` |
| test file | `scripts/process/hidden-token-honesty.test.mjs` | `node:test` and `node:assert/strict` only. The repo root is resolved from `import.meta.url` (`../..`), as in `scripts/ledger/questions-flow.test.mjs`, so the tests run against the worktree. Every test title starts `EZD-000b`. |

## 4. Tests

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 | AC-EZD-000b-1 | unit (node:test) | parse `.claude/settings.json` | `todoFeatureEnabled`, `promptSuggestionEnabled` and `autoCompactEnabled` each `=== false` (a missing key fails) | PA3-MECHANISMS.md Item 2; PROCESS.md section 14 Settings |
| T2 | AC-EZD-000b-1 | unit | same | `env.CLAUDE_CODE_TOTAL_TOKENS_REMINDER === "off"`; `env.CLAUDE_CODE_GOAL_CHECKIN_MINUTES === "0"` (strings) | Item 2; Findings (`off` valid, `0` turns it off) |
| T3 | AC-EZD-000b-1 | unit | same | `env.CLAUDE_CODE_SUBAGENT_MODEL === "claude-sonnet-5-5"`, `env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS === "3"`, `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH === "1"` | `.claude/settings.json` at develop `e04d605` (existing values); Item 2 "do not replace it"; phase-00.md line 36 (depth stays 1 until EZD-000f) |
| T4 | AC-EZD-000b-2 | unit | read every file under `.claude/skills/` and `.claude/agents/` recursively | no file content matches `/TaskCreate\|TaskUpdate\|TaskList/`; on failure, names the file | Item 2; PROCESS.md section 14 Settings. Already true at plan time, so this test passes before the build and guards against regressions |
| T5 | AC-EZD-000b-3 | unit | `CLAUDE.md` Rules section | numbered lines are 1..16 in order; the lines for 14, 15 and 16 equal the contract strings | Item 5 (text and numbering) |
| T6 | AC-EZD-000b-3 | unit | `CLAUDE.md` | line count ≤ 60 (52 expected after the build: 49 at plan time + 3) | Item 5 "under about 60 lines"; Done-when "at most 60 lines" |
| T7 | AC-EZD-000b-4 | unit | each of the three agent files | exactly one `## Honesty` line; its section holds the three contract lines in order | Item 5 "the same three … under a heading `## Honesty`" |
| T8 | AC-EZD-000b-5 | unit | `vault/PROCESS.md` | first non-empty line after `### The budget`, with `**` removed, starts with "The launcher gates on the plan's real usage percentages" | PA3-MECHANISMS.md verification item 12; ticket row. Already true, so it passes before the build |

AC-EZD-000b-5 (item 6 and the gate):
- Item 6 is a report line, not a test (KNOWN-LIMITS.md, Phase 0 ACs generated from Done-when). It is reported "not testable here" with the reason in step 5.
- "The gate is green" is `node scripts/gate.mjs <worktree>` (CLAUDE.md rule 12).

T1–T3 and T5–T7 fail before the build for the right reason: the keys and lines are missing.

## 5. Visual checklist
None (no screen changes).

## 6. Proposed wording
None. No app text is added. The three rules are Josh's text, verbatim from PA3-MECHANISMS.md Item 5.

## 7. Security review
security-review: no. Settings and instruction text only. No auth, permissions, data access, money or API. The permission lists and hooks in `settings.json` do not change.
Reviewers needed:
- code-reviewer: yes (always). Opus 5.5 high (PA3-MECHANISMS.md rule 5). It also confirms the diff leaves the permissions, hooks and the existing env values in `settings.json` byte-for-byte unchanged.
- calc-auditor: no.
- ui-verifier: no.
- security-reviewer: no.

## 8. Complexity and model recommendation
Medium. On its own the work fits "low" (five config and text files, no logic). Josh's handoff fixes this ticket's complexity at medium and its models at Sonnet 5.5 (PA3-MECHANISMS.md header and rule 5; STATUS.md row). Test-author: Sonnet 5.5, medium effort. Builder: Sonnet 5.5, medium effort.

## 9. Dependencies
- EZD-000 (done). The ticket row misses no dependency: no screen, so EZD-016a is not needed.
- Builder write grant: Q-0128 (a), already in `guard-paths.mjs`.

Risks:
- **Auto-compaction off.** `autoCompactEnabled: false` makes a unit whose context fills end instead of compacting. PROCESS.md section 14 accepts this: per-unit design, work-in-progress commits. The orchestrator's session is affected as well.
- **T3 changes at EZD-000f.** T3 pins spawn depth `"1"`. EZD-000f sets it to `"2"` by design (phase-00.md line 37), so EZD-000f's plan must have its test-author change T3's expected value. That is a planned value change, not a structural repair.
- **CLAUDE.md line budget.** EZD-000c adds a sentence to rule 10 on the same line, and EZD-000d adds one directory row. Expected 53 lines after both, so the 60-line limit holds.

## 10. Open questions
None.
