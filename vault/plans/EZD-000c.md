# EZD-000c · Whole-read guard and outline tool (Item 3)

- **ACs:** AC-EZD-000c-1 to AC-EZD-000c-6 (`vault/spec/acceptance-criteria.md` lines 83–88, generated from Done-when).
- **Complexity:** medium (reasoning in section 8).
- **User-visible result:** any Claude session in this repo that tries to load a file over 20,000 characters in one go gets the file's outline back instead and reads only the parts it needs. This saves Josh's usage.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: ready

Part B of the EZD-000b split (proposal archived at `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md`).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 34):
- **Scope:** New `.claude/hooks/guard-reads.mjs`, a PreToolUse hook on Read and Bash. New `vault/tools/outline.mjs <path>`. In `.claude/settings.json`: register the hook, and add env `GUARD_WHOLE_READ_CHARS: "20000"` and an exempt list that is empty by default. Add the v2.3 template's sentence to CLAUDE.md rule 10: "A file over 20,000 characters is read by range after `node vault/tools/outline.mjs <path>`" (PROCESS.md section 14 CLAUDE.md template; PROCESS.md wins over the handoff, PA3-MECHANISMS.md rule 1). Builder write grant per PA3-MECHANISMS.md rule 7 and Q-0128.
- **Done when:** a Read with no offset or limit of a 25,000-character text file is denied with the file's outline ending "Read the ranges you need with offset and limit."; the same Read with a range, a Read of a 5,000-character file and grep on the large file all pass; cat, head, tail, sed -n and less on the large file without a range are denied and ranged `sed -n 'a,bp'` passes; `vault/tools/outline.mjs` prints the expected outline for a sample .mjs and a sample .md (Markdown headings to depth 2 with line numbers; code: top comment block then each exported function, class or constant with its line; at most 60 lines); the threshold is read from `GUARD_WHOLE_READ_CHARS`, default 20000. Verification item 7 is reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000b · **Spec ref:** PA3-MECHANISMS.md Item 3; PROCESS.md v2.3 sections 10, 13, 14.

Steps:
1. **Outline tool** `vault/tools/outline.mjs`. It holds an exported `outline(text, filePath)` and a CLI (contract C1–C3). Rules: Markdown gives headings to depth 2 with line numbers. Code gives the top-of-file comment block, then each exported function, class or constant with its line number. The output is capped at 60 lines. (PA3-MECHANISMS.md Item 3; PROCESS.md section 13 `outline.mjs`; Done-when.) Plain Node, no dependencies (PA3-MECHANISMS.md rule 4).
2. **Hook** `.claude/hooks/guard-reads.mjs` (contract C4–C9). It follows the existing hook layout: reads stdin through `readInput()`, denies through `deny()` from `.claude/hooks/lib.mjs`, and imports `outline` from `../../vault/tools/outline.mjs` (PA3-MECHANISMS.md rule 4).
   - **Read:** with no `offset` and no `limit`, a text file over the threshold is denied.
   - **Bash:** `cat`, `head`, `tail`, `sed -n` or `less` on such a file without a narrowing range is denied. `grep`, `wc` and ranged `sed -n 'a,bp'` pass.
   - **Denial:** the message carries the outline and ends "Read the ranges you need with offset and limit." (Item 3; PROCESS.md section 14 Hooks, guard-reads.)
   - It applies to every agent and the main session: PROCESS.md section 10 says it "stops any agent".
3. **Settings** `.claude/settings.json` (contract C10):
   - Add one `PreToolUse` entry with matcher `Read|Bash` that runs the hook. It goes after the existing Bash entry, in the same form as the guard-bash entry.
   - Add env `GUARD_WHOLE_READ_CHARS: "20000"` and `GUARD_WHOLE_READ_EXEMPT: ""` at the end of `env`.
   - Nothing else changes. That includes the keys EZD-000b adds and the spawn depth `"1"`, which EZD-000f changes (phase-00.md line 37).
   - Sources: Item 3 ("threshold in `.claude/settings.json` env … Exempt list in the same place, default empty"); PROCESS.md section 14 Settings (`GUARD_WHOLE_READ_CHARS=20000`).
4. **CLAUDE.md rule 10.** Append one sentence to the end of the rule 10 line (today line 15): ` A file over 20,000 characters is read by range after \`node vault/tools/outline.mjs <path>\`.` (PROCESS.md section 14 CLAUDE.md template rule 10; ticket Scope). Same line, so the line count does not change: 52 after EZD-000b (EZD-000b plan step 3). The rest of rule 10 stays as it is. This repo's wording differs from the template and keeps its own text (EZD-000b plan, section 2, difference 2).
5. **Verification item 7** (AC-EZD-000c-6; PA3-MECHANISMS.md rule 6). The builder reports item 7 in two parts:
   - **Hook level: verified**, backed by T5, T6 and T9. These run the worktree's hook directly.
   - **Live session: "not testable here".** A running session loads hooks from the main checkout's `.claude/settings.json`, so the worktree's new registration is not active for the builder.
   - Under Q-0126 (c), the orchestrator adds the live check to `vault/handoff/PILOT.md` when this ticket merges.
   - The builder also runs the gate: `node scripts/gate.mjs <worktree>` (CLAUDE.md rule 12).

| Path | New / change | Why |
| --- | --- | --- |
| `vault/tools/outline.mjs` | new | Step 1 |
| `.claude/hooks/guard-reads.mjs` | new | Step 2 |
| `.claude/settings.json` | change | Step 3 |
| `CLAUDE.md` | change | Step 4 |
| `scripts/tools/outline.test.mjs` | new (test-author) | T1–T4 |
| `scripts/hooks/guard-reads.test.mjs` | new (test-author) | T5–T10 |

Write rights (L-002):
- **Builder:** writes the four non-test paths through the PA3 grant, `.claude/hooks/guard-paths.mjs` `pa3Grant()`. That grant covers `.claude/`, `CLAUDE.md` and `vault/tools/` in a worktree that matches `EZD-000[b-i]` (Q-0128 (a)). `scripts/hooks/guard-paths.test.mjs` already asserts that the builder may write `.claude/hooks/guard-reads.mjs` and `vault/tools/outline.mjs` there.
- **test-author:** writes both test files. `*.test.mjs` matches `isTest` in guard-paths.mjs, and the test-author rule allows any test path.
- **Test runner:** the root `test` script runs `node --test "scripts/**/*.test.mjs"` (root `package.json`), so the gate runs both files. Fixtures are written to a temp directory at run time, so the plan has no fixture files.

Data: none. No tables, migrations, money or `schema_version`.

**Build choices** (how, not what; the code-reviewer checks them against PA3-MECHANISMS.md rule 5):
- **Text files only.** The guard ignores binary files: `.png .jpg .jpeg .gif .webp .bmp .ico .pdf`, or a NUL byte in the first 8,000 bytes. Reason: the sources speak of "characters" and the Done-when says "text file". The planner reads mockup PNGs whole (plan-ticket skill step 1), and Read shows images and PDFs as images and pages, not as text.
- **Piped or redirected output passes.** A `cat`, `head`, `tail`, `sed` or `less` whose stdout is piped to another command or redirected to a file is not checked. Its output does not reach the agent whole; the purpose is to stop "loading a file … without a range" (PROCESS.md section 10, Dispatch rule). Examples: `cat big | grep x`, `cat a b > c`.
- **Bare `head` / `tail` are unranged.** With no count option they count as unranged, following the Done-when literally ("head, tail … without a range are denied").
- **Fail open.** Any internal error in the hook exits 0 with no output, so the tool call goes ahead. A broken guard must not block a run (PA3-MECHANISMS.md rule 5).
- **Commands not covered.** Only the five commands the sources name are checked. `awk`, `nl`, `more`, `sed` without `-n`, and script one-liners are not checked (rule 4: no extras).

## 2. Sources

- `vault/handoff/PA3-MECHANISMS.md`:
  - Rules 1, 4, 5, 6, 7.
  - Item 3: hook, denial message, Bash commands, threshold, exempt list, `outline.mjs`, tests.
  - Verification list item 7.
- `vault/PROCESS.md`:
  - Section 10, Dispatch rule (last sentence).
  - Section 13 (`vault/tools/outline.mjs`).
  - Section 14: repo layout, CLAUDE.md template rule 10, Hooks (guard-reads), Settings.
- `vault/tickets/phases/phase-00.md` lines 34 and 37. `vault/spec/acceptance-criteria.md` lines 83–88.
- Questions:
  - Q-0126 (c): an item reported "not testable here" goes to PILOT.md.
  - Q-0128 (a): the builder write grant.
- Plan `vault/plans/EZD-000b.md`: its settings contract, which this plan keeps unchanged, and its CLAUDE.md line count of 52.
- Code at develop `fec74e1`:
  - `.claude/settings.json`.
  - `.claude/hooks/lib.mjs` (`readInput`, `deny`, `repoRelative`, `norm`, `projectDir`).
  - `.claude/hooks/guard-paths.mjs` (`pa3Grant`).
  - `.claude/hooks/guard-bash.mjs`, for the hook layout.
  - `scripts/hooks/guard-paths.test.mjs`, for the spawn-the-hook test pattern.
  - `CLAUDE.md` (rule 10 at line 15).
  - Root `package.json`.
- Product spec sections 03, 04, 11, non-goals, glossary, decisions and mockups: not applicable. This is process tooling, with "No app code. No change to the product spec" (PA3-MECHANISMS.md header).
- Research reports: none exist (`vault/research/` is absent), so no R-NNN covers this ticket.

**Differences between the handoff and PROCESS.md** (handoff rule 1; the builder repeats them in its report):
1. **Hook file name.** The handoff names the hook `.claude/hooks/guard-reads` with no extension. The ticket row and the existing hook layout use `.mjs`.
2. **CLAUDE.md sentence.** It comes from the PROCESS.md section 14 template. Item 3 does not mention CLAUDE.md.

No other differences were found. Both name the same threshold, exempt rule, commands and message.

## 3. Interface contract

| # | Kind | Name or path | Details |
| --- | --- | --- | --- |
| C1 | export | `outline(text: string, filePath: string): string[]` in `vault/tools/outline.mjs` | Returns the outline as lines, at most 60. **Kind** comes from the lowercased extension of `filePath`: `.md` is markdown; `.mjs .cjs .js .jsx .ts .tsx .mts .cts` is code; anything else is other. **Line numbers** are 1-based (`text.split('\n')`). **Every returned line** is cut to 120 characters: a longer line becomes its first 119 characters plus `…`. |
| C2 | rules | `outline` per kind | **Markdown:** each line matching `^#{1,2}\s+\S` outside a fenced block, as `` `${n}: ${line.trimEnd()}` ``. A line matching `` ^\s{0,3}(`{3,}\|~{3,}) `` opens a fence, and the next such line made of the same character closes it. **Code:** a first line starting `#!` is skipped. Then the top comment block is printed verbatim (`trimEnd`, no line numbers): from the first non-blank line, either the consecutive lines whose trimmed start is `//`, or a block from a line starting `/*` through the first line containing `*/`. Then each line matching `^export\s+(default\s+)?(async\s+)?(function\b\|class\b\|const\b)` or `^export\s+(default\s+)?abstract\s+class\b`, as `` `${n}: ${line.trim()}` ``. **Other kinds, or nothing found:** the single line `` `${L} lines; nothing to outline.` ``, where L is the line count (`split('\n').length`, minus 1 when the text ends in `\n`). **Cap:** with more than 60 entries, the first 59 entries and then `` `… ${count - 59} more not shown` ``. |
| C3 | CLI | `node vault/tools/outline.mjs <path>` | Reads the file as UTF-8 and prints `outline(text, path).join('\n') + '\n'` to stdout, then exits 0. With no argument it prints `usage: node vault/tools/outline.mjs <path>` to stderr and exits 2. If the file cannot be read it prints one line to stderr and exits 1. The CLI runs only when the file is the entry point (`import.meta.url === pathToFileURL(process.argv[1]).href`), so importing it has no side effects. |
| C4 | hook | `.claude/hooks/guard-reads.mjs` | **Stdin:** the PreToolUse JSON `{ tool_name, tool_input, cwd, agent_type }`. **Pass:** exit 0 with empty stdout. **Deny:** the `deny(reason)` JSON from `lib.mjs` (`permissionDecision: "deny"`). It never exits 2. Any thrown error, including bad stdin JSON, means pass. Any `tool_name` other than `Read` or `Bash` passes. |
| C5 | config | threshold `T` | `process.env.GUARD_WHOLE_READ_CHARS` when it matches `^\d+$` and is > 0. Otherwise `20000` (unset, empty or invalid). |
| C6 | rule | "large file" | Path resolved against `cwd`, or `CLAUDE_PROJECT_DIR` when `cwd` is missing. It is large when all of these hold: it is an existing regular file; it is not binary (section 1 build choices); it is not exempt; and its character count (the JS `.length` of the UTF-8 text) is greater than `T`. A file whose byte size is ≤ `T` is never read for counting. **Exempt:** `GUARD_WHOLE_READ_EXEMPT` split on `,`, entries trimmed, empty entries dropped. A file is exempt when an entry equals its `repoRelative()` path (`lib.mjs`; worktree paths map to repo paths) or, for a file outside the repo, its absolute normalized path. |
| C7 | rule | Read | Deny when `tool_input.file_path` is a large file **and** `tool_input.offset` and `tool_input.limit` are both absent (`undefined` or `null`) **and** `tool_input.pages` is absent. |
| C8 | rule | Bash | **Heredoc bodies** are dropped first: after a line holding `<<-?\s*['"]?(\w+)['"]?`, every line up to and including the line whose trimmed text equals that word. **Tokenize:** shell-style words, with `'…'` literal, `"…"` literal except `\"` and `\\`, and a backslash escaping outside quotes; no expansion. Segments are separated by `\|\|`, `&&`, `\|`, `;`, `&` and newline. Redirects (`>` `>>` `&>` `1>` `2>` `2>>` `<`, alone or joined to their target, plus `2>&1`) take the next word as their target. **Per segment:** skip leading `NAME=value` words. The command is the basename of the first word; only `cat`, `head`, `tail`, `sed` and `less` are checked. Skip the segment when its stdout is redirected (`>`, `>>`, `&>`, `1>`) or it is followed by `\|`. **Operands** are the words that do not start with `-`, plus a `<` target; `--` ends the options. **Ranged:** `cat` and `less` never are. `head` / `tail` are ranged when they have a count option: `-n K`, `-nK`, `-K`, `--lines=K`, `--lines K`, `-c K`, `-cK`, `--bytes=K` or `--bytes K`, with K matching `^\+?\d+$`. Option arguments are not operands. `sed` is checked only when an option word starting with a single `-` contains `n`, or is `--quiet` or `--silent`. A segment with `-i` or `--in-place` is skipped. The script is each `-e` argument, or else the first non-option word. A `-f` script means unranged. A script is ranged when each of its `;`- or newline-separated non-empty parts matches `^\s*\d+(\s*,\s*\d+)?\s*p\s*$`. **Decision:** deny on the first unranged segment that has a large operand. |
| C9 | text | denial reason | Three parts joined by `\n`. Line 1: `` `Whole read blocked: ${pathAsGiven} has ${chars} characters (limit ${T}, GUARD_WHOLE_READ_CHARS).` ``, with plain integers and no separators. Then the `outline(text, path)` lines. The last line is exactly `Read the ranges you need with offset and limit.` |
| C10 | file | `.claude/settings.json` | Valid JSON. `hooks.PreToolUse` has exactly one entry whose `hooks[].args` contains a string ending `/.claude/hooks/guard-reads.mjs`. That entry is `{ "matcher": "Read\|Bash", "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-reads.mjs"] }] }`. The existing entries `Edit\|Write\|NotebookEdit` → guard-paths.mjs and `Bash` → guard-bash.mjs are unchanged. `env.GUARD_WHOLE_READ_CHARS === "20000"` and `env.GUARD_WHOLE_READ_EXEMPT === ""`. These stay unchanged: `env.CLAUDE_CODE_SUBAGENT_MODEL` `"claude-sonnet-5-5"`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` `"3"`, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` `"1"`, `CLAUDE_CODE_TOTAL_TOKENS_REMINDER` `"off"`, `CLAUDE_CODE_GOAL_CHECKIN_MINUTES` `"0"`, and top-level `todoFeatureEnabled`, `promptSuggestionEnabled` and `autoCompactEnabled` `false` (EZD-000b contract). |
| C11 | file | `CLAUDE.md` | The one line starting `10. ` starts with `10. Read only what your dispatch names plus what this directory points you to.` and ends with `` A file over 20,000 characters is read by range after `node vault/tools/outline.mjs <path>`. `` The line count is ≤ 60, counted as in the EZD-000b contract. |
| C12 | test files | `scripts/tools/outline.test.mjs`, `scripts/hooks/guard-reads.test.mjs` | Use only `node:test`, `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:url` and `node:child_process`. Root is `path.resolve(dirname(fileURLToPath(import.meta.url)), '../..')`. The hook is spawned with `spawnSync('node', [hook], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: root, <overrides> } })`, as in `scripts/hooks/guard-paths.test.mjs`. Each test deletes `GUARD_WHOLE_READ_CHARS` and `GUARD_WHOLE_READ_EXEMPT` from the child env unless it sets them. Fixtures go in `fs.mkdtempSync(os.tmpdir())`. Every test title starts `EZD-000c`. |

**Samples the tests use** (the test file holds these exactly; lines are joined with `\n` and end in `\n`):

`sample.md` (outer fence `~~~` so the inner fences show):
~~~
# Title
intro
## First
### Deep
text
```js
## not a heading
```
## Second
#NoSpace
~~~

`sample.mjs`:
```
#!/usr/bin/env node
// Sample tool: does a thing.
// Second comment line.
import fs from 'node:fs';

export function alpha(a, b) {
  return a + b;
}
function hidden() {}
export const LIMIT = 60;
export class Beta {}
export default async function main() {}
const notExported = 1;
export { hidden };
```

`L` is a large file of exactly 25,000 characters. Its first two lines are `# Big` and `## Part A`, and the rest are lines of `x` with no `#`. `S` is 5,000 characters of `x` lines, `B20000` is exactly 20,000 characters and `B20001` is exactly 20,001, all `.md` files in the temp directory. `P` is a `.png` of 30,000 bytes whose first bytes are the PNG signature `89 50 4E 47 0D 0A 1A 0A`.

## 4. Tests

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 | AC-EZD-000c-4 | unit (node:test) | `outline(sample.md, 'sample.md')` | `['1: # Title', '3: ## First', '9: ## Second']`. Depth 3, the fenced line 7 and `#NoSpace` are excluded | Item 3 / Done-when "headings to depth 2 with line numbers"; format C1–C2 |
| T2 | AC-EZD-000c-4 | unit | `outline(sample.mjs, 'sample.mjs')` | `['// Sample tool: does a thing.', '// Second comment line.', '6: export function alpha(a, b) {', '10: export const LIMIT = 60;', '11: export class Beta {}', '12: export default async function main() {}']` | Item 3 / Done-when "top comment block then each exported function, class or constant with its line"; C2 |
| T3 | AC-EZD-000c-4 | unit | (a) markdown of 100 lines `## H1`…`## H100`. (b) `'{\n "a": 1\n}\n'` as `x.json`. (c) a 200-character `## ` heading | (a) length 60: `[0] === '1: ## H1'`, `[58] === '59: ## H59'`, `[59] === '… 41 more not shown'`. (b) `['3 lines; nothing to outline.']`. (c) the line has 120 characters and ends `…` | Item 3 "capped at 60 lines"; Done-when "at most 60 lines"; 100 − 59 = 41; C1–C2 |
| T4 | AC-EZD-000c-4 | unit | spawn `node vault/tools/outline.mjs <tmp>/sample.md`; then with no argument | stdout `'1: # Title\n3: ## First\n9: ## Second\n'`, exit 0. With no argument: exit 2 and stderr starts `usage:` | PROCESS.md section 13 (agents call it directly); C3 |
| T5 | AC-EZD-000c-1 | unit (hook) | Read `{ file_path: L }` for agent_type unset (main session) and for `builder` | Both deny. The reason's line 1 is `Whole read blocked: <L> has 25000 characters (limit 20000, GUARD_WHOLE_READ_CHARS).`. It contains the lines `1: # Big` and `2: ## Part A`. Its last line is `Read the ranges you need with offset and limit.` | Done-when (25,000; the sentence); Item 3 (outline); PROCESS.md section 10 ("any agent"); C9 |
| T6 | AC-EZD-000c-2 | unit (hook) | Read L with `{offset:1, limit:50}`, `{limit:50}`, `{offset:100}`. Read S, B20000, P. Read a missing path | All pass. Then B20001 → deny | Done-when (range passes; 5,000 passes; "text file"); Item 3 "over 20,000" (20,000 passes, 20,001 is denied); C6–C7 |
| T7 | AC-EZD-000c-5 | unit (hook) | (a) `GUARD_WHOLE_READ_CHARS=4000`, Read S. (b) `="abc"`, Read S and L. (c) `GUARD_WHOLE_READ_EXEMPT` = L's absolute path, Read L. (d) `GUARD_WHOLE_READ_EXEMPT="vault/PROCESS.md"`, Read `<root>/vault/PROCESS.md`, and the same Read with the variable unset. (e) stdin `not json` | (a) deny, line 1 has `(limit 4000,`. (b) S passes; L is denied with `(limit 20000,`. (c) pass. (d) pass, then deny when unset. (e) exit 0, empty stdout | Done-when "read from GUARD_WHOLE_READ_CHARS, default 20000"; Item 3 (exempt list); C4–C6. `vault/PROCESS.md` is 69,514 bytes at `fec74e1`, over 20,000 |
| T8 | AC-EZD-000c-3 | unit (hook) | Bash on L: `cat L`; `head L`; `tail L`; `sed -n p L`; `sed -n '1,$p' L`; `less L`; `cat S L`; `cat < L`; `git status; cat L` | each deny with the C9 reason (last line the sentence) | Done-when "cat, head, tail, sed -n and less … without a range are denied"; Item 3 "the same message"; C8 |
| T9 | AC-EZD-000c-2, -3 | unit (hook) | Bash: `grep -n Part L`; `wc -c L`; `sed -n '1,40p' L`; `sed -n 1,40p L`; `head -n 40 L`; `head -40 L`; `tail -n 40 L`; `cat S`; `cat L \| grep Part`; `cat L > <tmp>/copy.md`; `echo "cat L"`; `cat <<'EOF'\ncat L\nEOF` | each pass | Done-when ("grep on the large file … pass"; "ranged `sed -n 'a,bp'` passes"); Item 3 ("grep, wc and ranged sed -n 'a,bp' are allowed"); PROCESS.md section 10 (pipes, redirects and heredocs do not load the file); C8 |
| T10 | AC-EZD-000c-5, -6 | unit | parse `.claude/settings.json`; read `CLAUDE.md` | C10 holds: one guard-reads entry whose matcher, as `new RegExp('^(?:' + m + ')$')`, matches `Read` and `Bash` and not `Write` or `Edit`; the other two PreToolUse entries are unchanged; the env and top-level values are as in C10. C11 holds: the rule 10 line has the sentence and the line count is ≤ 60 | Ticket Scope; Item 3; PROCESS.md section 14 Settings and the CLAUDE.md template; EZD-000b plan contract (unchanged values) |

Notes:
- **Before the build,** T1–T10 fail for the right reason: the module, hook, entry, env keys and sentence are missing.
- **AC-EZD-000c-6** is a report line plus the gate, not a test (KNOWN-LIMITS.md, Phase 0 ACs generated from Done-when). The report is step 5; T5, T6 and T9 back the "verified" part.
- **Earlier tests stay green:**
  - EZD-000b's `scripts/process/hidden-token-honesty.test.mjs` checks specific env keys and CLAUDE.md rules 14–16 plus the line count, and none of them change.
  - `scripts/hooks/guard-paths.test.mjs` is unaffected.

## 5. Visual checklist
None (no screen changes).

## 6. Proposed wording
None. No app or user-interface text is added.
- The final sentence of the denial is Josh's, verbatim from Item 3.
- The other hook and CLI lines in C2, C3 and C9 are messages for agents, not product text (PROCESS.md section 3a covers user-visible app text).

## 7. Security review
security-review: no. This is a read guard on agent tool calls, used to save context. It touches no auth, permissions on data, data access, money, API or migrations. The `.env` read denials in `settings.json` and guard-bash.mjs are unchanged.

Reviewers needed:
- **code-reviewer:** yes, Opus 5.5 high (PA3-MECHANISMS.md rule 5). It checks the hook for any way it blocks a legitimate run: fail-open on errors, binary files, piped and redirected output, heredocs, quoted strings, and the default when the env is missing.
- **calc-auditor:** no.
- **ui-verifier:** no.
- **security-reviewer:** no.

## 8. Complexity and model recommendation
Medium. The hook needs a small shell tokenizer and per-command range rules, and a mistake can deny legitimate tool calls in every session (PA3-MECHANISMS.md rule 5). That is more than a config edit, but it is still two small, dependency-free scripts with direct unit tests. It is also the STATUS.md rating. Test-author: Sonnet 5.5, medium effort. Builder: Sonnet 5.5, medium effort (PA3-MECHANISMS.md rule 5; STATUS.md row notes).

## 9. Dependencies
- **EZD-000b** (planned). It changes `settings.json` and `CLAUDE.md` first. C10 and C11 keep its values and its 52-line count.
- **EZD-000** (done), through EZD-000b.
- No missing dependency. There is no screen, so EZD-016a is not needed.
- The builder write grant, Q-0128 (a), is already in guard-paths.mjs.

Risks:
- **Whole-file reads now get outlines.** Every agent's whole Read of a large file returns an outline instead. Many files are over 20,000 characters (`find … -size +20k` at `fec74e1`): most Phase 0 plans (for example `vault/plans/EZD-007.md`, 91,717 bytes), `QUESTIONS.md`, `acceptance-criteria.md`, `tickets.json` and `PROCESS.md`. Builders, test-authors and reviewers will read their plan by range. That is intended (PROCESS.md section 10; exempt list empty by default per Item 3), but it adds turns.
- **Env reaching the hook.** If Claude Code does not pass settings `env` to hook processes, the hook falls back to 20000 and an empty exempt list. Behaviour is the same at the default. The PILOT.md live check (step 5) confirms it.
- **EZD-000d** adds a CLAUDE.md row: 53 lines expected, within the 60-line limit.

## 10. Open questions
None.
