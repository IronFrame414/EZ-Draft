# EZD-000g · Lesson ratification (Item 7)

- **ACs:** AC-EZD-000g-1 to AC-EZD-000g-4 (`vault/spec/acceptance-criteria.md` lines 106–109). They were generated from the Done-when text and match it clause by clause, so the Q-0130 / Q-0131 defect does not apply. The wrap-skill sentence of the Scope has no AC ID; T7 covers it and maps to the Scope.
- **Complexity:** medium (reasoning in section 8).
- **User-visible result:** a lesson's rule reaches an agent only after Josh says yes. The questions file for each phase gets a fourth list, "Rule candidates", where he ratifies or rejects each proposed rule by number. The ledger check fails if a lesson has no status.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: planned

This is Part F of the EZD-000b split. The proposal is archived at `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md` (Part F).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 38):
- **Scope:** `next_ticket.mjs --lessons` prints only `ratified` entries. `--check` fails on any lessons entry without `status:`. `.claude/skills/questions/SKILL.md` adds a fourth section, "Rule candidates", to `phase-NN-for-josh.md`: L-number, the rule in one sentence, the source ticket, and a recommendation. It sets each entry's status from Josh's answer and records it in QUESTIONS.md with the Q-ID (PROCESS.md section 7). `.claude/skills/wrap/SKILL.md`: the "seen ≥ 2 becomes a gate check" rule applies to ratified entries only (PROCESS.md section 13). Effect today: both existing lessons (L-001 in reviewer.md, L-002 in planner.md) are `candidate`, so after this part no lesson reaches a dispatch until Josh ratifies them at the next Stage 2. This is intended (PROCESS.md section 13). Split of EZD-000b (Q-0010 flow). Builder write grant per PA3-MECHANISMS.md rule 7 and Q-0128.
- **Done when:** `--lessons` run on a fixture with candidate, ratified and rejected entries prints only the ratified ones; `--check` fails, naming the entry, when a lessons entry has no `status:` field; the questions skill writes a fourth section "Rule candidates" and records Josh's ratify or reject answer as the entry's status. Verification item 10 is reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000f · **Spec ref:** PA3-MECHANISMS.md Item 7; PROCESS.md v2.3 sections 7, 13.

Steps:
1. **Where the status lives** (C1). The entry format puts `status:` in the heading line: `## L-007  areas: auth, api  seen: 1  status: candidate` (PROCESS.md section 13, entry format block). Both existing entries follow it (`vault/lessons/planner.md` L-002, `vault/lessons/reviewer.md` L-001).
   - An entry is a block starting with a line `## L-<digits>`. This is how `lessons()` splits files today (`vault/tools/next_ticket.mjs` line 272).
   - Its status is the token after `status:` in that heading line only. A `status:` that appears only in the body does not count.
   - Allowed values: `candidate`, `ratified`, `rejected` (PROCESS.md section 13 Status bullet). The heading may carry more fields after the status, such as `automated: <name>` (section 13 Wrap step), and these are ignored.
2. **`--lessons` prints ratified only** (C2). `lessons(role, areas)` in `next_ticket.mjs` (lines 267–281) keeps its area filter and its two "no …" messages. It also skips every entry whose status is not `ratified`. Sources: PA3-MECHANISMS.md Item 7 ("prints only `ratified` entries. Candidates never reach a dispatch"); PROCESS.md section 13 (`--lessons` flag; Status bullet). The header comment on line 8 becomes `-> prints the ratified lessons a dispatch carries`.
3. **`--check` fails on a missing status** (C3). `check()` (lines 144–168) gains one pass over every `*.md` file in `vault/lessons/` except `INDEX.md`, sorted by name. It adds one problem line per entry whose heading has no `status:` or a value outside the three allowed ones.
   - Every path through `check()` gets it: the `--check` flag, the default command, which refuses to pick a ticket on an invalid ledger (line 406), and `--next-unit`, which returns `none: ledger check failed` (line 211), so the launcher stops (`scripts/run.mjs` lines 231, 339–343).
   - Missing `vault/lessons/` → no problem lines.
   - Sources: PA3-MECHANISMS.md Item 7 ("fails if any lessons entry lacks a `status:` field"); PROCESS.md section 13 ("`next_ticket.mjs --check` fails on an entry without a status"; "every entry carries `status: candidate | ratified | rejected`").
4. **Questions skill** (C4). In `.claude/skills/questions/SKILL.md`:
   - **Step 3:** the file for Josh has four sections, not three. A new item 4, **Rule candidates**, lists every lessons entry with `status: candidate`.
   - **Step 4:** records his answer. Ratify → `status: ratified`; reject → `status: rejected`. The status is changed in every role file that carries that L-number (PROCESS.md section 13: "A lesson that applies to two roles is written in both files with the same L-number"), and in the entry's mention in `vault/lessons/INDEX.md` (that file shows each entry's status, e.g. "(L-002, candidate)"). Each answer gets one `answered-josh` row in QUESTIONS.md with the next free Q-ID.
   - **Unattended:** candidates stay `candidate`, and no row is written.
   - **Front-matter description:** adds "rule candidates".
   - The row is written when Josh answers, not when the candidate is listed. PA3-MECHANISMS.md Item 7 orders it that way ("the orchestrator sets each entry's status from his answer and records it in `QUESTIONS.md` with the question ID"), and PROCESS.md section 7 puts it with the `answered-josh` rows ("recorded in `QUESTIONS.md` the same way").
   - The Phase / ticket cell is `<N> / L-nnn`, with no ticket ID. `rowTickets` (line 82) therefore ties the row to no ticket, so it cannot hold a ticket in `questions` (lines 99–105).
   - Item 7 names QUESTIONS.md only, so nothing is written to `vault/spec/decisions/`. Lessons are not a spec area.
   - Sources: PROCESS.md section 7 (sections list item 4; the last bullet); PA3-MECHANISMS.md Item 7; the existing heading style `## 4. Rule candidates` in `vault/questions/phase-00-for-josh.md` line 256.
5. **Wrap skill** (C5). In `.claude/skills/wrap/SKILL.md` step 2, both triggers for automation apply to ratified lessons only: `seen` of 2 or more, and "one a script could check". Sources: PA3-MECHANISMS.md Item 7 ("applies only to ratified entries"); PROCESS.md section 13 Wrap step ("A ratified lesson with `seen` of 2 or more, or one a script could check"); ticket Scope sentence 4. The rest of step 2 stays as it is, including the gate-phase lesson listing, which stays informational ("as now", Item 7).
6. **New test file** `scripts/ledger/lesson-ratification.test.mjs` (C6; T1–T7). It copies `vault/` to a temp dir with the filter of `scripts/ledger/questions-flow.test.mjs`, so tests never touch the real lessons.
7. **Verification item 10** (AC-4; PA3-MECHANISMS.md rule 6). The builder reports item 10 as **verified** if T1–T5 pass and one live run in the worktree agrees: `node vault/tools/next_ticket.mjs --lessons planner tooling` prints `(no lessons for planner in areas tooling)`, because L-002 is a candidate (Scope "Effect today"). That holds while L-002 is still a candidate when the build runs; if Josh has ratified it by then, the builder runs `--lessons reviewer auth` instead and reports what printed. The item is testable here, so it does not go to PILOT.md (Q-0126 (c)).
   - The skill steps (AC-3) are text an orchestrator follows. T6 checks the text. The first live use is the next `questions` unit, which the orchestrator runs anyway (PROCESS.md section 7, Q-0129), so it is not a pilot item.
8. **Gate:** `node scripts/gate.mjs <worktree>` (CLAUDE.md rule 12). The root `test` script runs `node --test "scripts/**/*.test.mjs"` (root `package.json`), which picks up the new file.

| Path | New / change | Why | Writer (L-002 check against guard-paths.mjs) |
| --- | --- | --- | --- |
| `vault/tools/next_ticket.mjs` | change | Steps 1–3 | builder: `pa3Grant()` (`vault/tools/` is in `pa3Vault`; worktree `EZD-000g` matches `EZD-000[b-i]`, guard-paths.mjs lines 46–51) |
| `.claude/skills/questions/SKILL.md` | change | Step 4 | builder: `pa3Grant()` (`.claude/`) |
| `.claude/skills/wrap/SKILL.md` | change | Step 5 | builder: `pa3Grant()` (`.claude/`) |
| `scripts/ledger/lesson-ratification.test.mjs` | new | T1–T7 | test-author: `isTest` (`.test.mjs`, guard-paths.mjs line 16) |

Not touched:
- `vault/PROCESS.md`: already v2.3, and denied to the builder (rule 7).
- `vault/lessons/*`: the orchestrator's files (PROCESS.md section 13 "Who writes"), already carrying `status:`.
- `.claude/skills/build-ticket/dispatch.md`: it pastes the `--lessons` output, so it needs no change.
- `.claude/skills/gate-phase/SKILL.md`: "as now" (Item 7).

`next_ticket.mjs` is about 21,700 characters, so after EZD-000c the builder reads it by range (split proposal note 7).

Data: none. No tables, migrations, money or `schema_version`.

## 2. Sources

- `vault/handoff/PA3-MECHANISMS.md`, the handoff:
  - rules 1, 2, 5, 6, 7;
  - Item 7 (every bullet and the Tests line);
  - verification item 10.
- `vault/PROCESS.md` v2.3:
  - section 7: the sections list including item 4 "Rule candidates", and the last bullet ("Rule candidates get status `ratified` or `rejected` from his answer, recorded in `QUESTIONS.md` the same way");
  - section 13: the `next_ticket.mjs` flags (`--check`, `--lessons`), the `vault/lessons/` entry format, and the Status, Who writes, Wrap step and Josh sees bullets.
- `vault/tickets/phases/phase-00.md` line 38. `vault/spec/acceptance-criteria.md` lines 106–109. Split proposal Part F and note 7.
- Questions:
  - Q-0126 (c): only "not testable here" items go to PILOT.md.
  - Q-0128 (a): the builder grant.
  - Q-0129: the questions unit runs unattended.
- Plans: `vault/plans/EZD-000f.md` (the dependency; no shared contract, see section 9) and `vault/plans/EZD-000c.md` (read by range).
- Code at develop `b2ddea9`:
  - `vault/tools/next_ticket.mjs` lines 8, 82–105, 144–168, 209–212, 267–281, 385, 391–396, 406;
  - `.claude/hooks/guard-paths.mjs` lines 16, 43–51, 72–80;
  - `.claude/skills/questions/SKILL.md` steps 3–4;
  - `.claude/skills/wrap/SKILL.md` step 2;
  - `scripts/ledger/questions-flow.test.mjs` (temp-vault test pattern);
  - root `package.json` (`test` script).
- Vault files:
  - `vault/lessons/*.md` (the entry headings);
  - `vault/lessons/INDEX.md` (status shown per entry);
  - `vault/questions/phase-00-for-josh.md` line 256 (`## 4. Rule candidates` heading style);
  - `vault/questions/QUESTIONS.md` header (columns).
- Lessons: L-002 (Files table checked against guard-paths.mjs; see the Writer column).
- Not applicable: product spec sections 03, 04 and 11, non-goals, glossary, decisions and mockups. This is process tooling only ("No app code. No change to the product spec", PA3-MECHANISMS.md header).
- Research reports: none (`vault/research/` does not exist at `b2ddea9`).

**Differences between the handoff and PROCESS.md** (handoff rule 1; the builder repeats them in its report):
1. PROCESS.md section 7 still says "with three sections:" above a list of four items. The list and Item 7 govern: four sections. PROCESS.md is not edited here, because it is off limits under rule 7.
2. Item 7 says the wrap rule "applies only to ratified entries". Section 13 attaches "ratified" to the `seen ≥ 2` clause and leaves it unclear for "one a script could check". This plan applies "ratified" to both, following Item 7 and the ticket Scope.

## 3. Interface contract

| # | Kind | Name or path | Details |
| --- | --- | --- | --- |
| C1 | parse rule | `vault/tools/next_ticket.mjs` | **Entry:** a block that starts at a line matching `^## L-\d+`. Its L-number is that match without `## `. **Status:** the first match of `/\sstatus:\s*(\S+)/` on the heading line only, or none. **Valid statuses:** exactly `candidate`, `ratified`, `rejected` (case-sensitive). Any text after the status on the heading is ignored. |
| C2 | CLI | `node vault/tools/next_ticket.mjs --lessons <role> [<area>...]` | Exit 0. Prints, joined by one blank line, the trimmed text of each entry in `vault/lessons/<role>.md` (file order) whose status is `ratified` and that passes the existing area filter. With no areas the filter is `all`; an entry with no areas matches every area. The other two outputs are unchanged: `(no lessons file for role <role>)` when the file is missing, and `(no lessons for <role> in areas <a>, <b>)` when no entry passes (the areas in the order given, lower-cased, joined by `, `). |
| C3 | CLI | `node vault/tools/next_ticket.mjs --check` | **Files:** every `*.md` in `vault/lessons/` except `INDEX.md`, by file name, entries in file order. **Problem lines,** as `- <text>` under `LEDGER INVALID (<n>)`, exit 1: L1 no status → `vault/lessons/<file>: <L-nnn> has no status (candidate, ratified or rejected; PROCESS.md section 13)`. L2 other value → `vault/lessons/<file>: <L-nnn> has unknown status "<value>" (candidate, ratified or rejected; PROCESS.md section 13)`. Valid entries add no line. No `vault/lessons/` folder adds no line. Every other check is unchanged. |
| C4 | skill text | `.claude/skills/questions/SKILL.md` | **Description:** the front-matter `description` names `rule candidates` in its list of what the unit writes. **Step 3:** says `with four sections` (no longer `three sections`), and has a list item starting `4. **Rule candidates** - ` that names `status: candidate`, `vault/lessons/`, the L-number, the rule in one sentence, the ticket it came from, and a recommendation `ratify` or `reject` with the reason. **Step 4:** contains `status: ratified`, `status: rejected`, `vault/lessons/INDEX.md`, `QUESTIONS.md`, `answered-josh`, `Q-ID` and `<N> / L-nnn`. It says that unattended, candidates stay `candidate`. Other steps unchanged. |
| C5 | skill text | `.claude/skills/wrap/SKILL.md` | **Step 2** (the line starting `2. **Lessons**`) contains `Any ratified lesson with \`seen\` of 2 or more, or any ratified lesson a script could check,` in place of `Any lesson with \`seen\` of 2 or more, or one a script could check,`. Other text unchanged. |
| C6 | test file | `scripts/ledger/lesson-ratification.test.mjs` | **Imports:** only `node:test`, `node:assert/strict`, `node:fs`, `node:child_process`, `node:os`, `node:path`, `node:url`. **Setup:** in `before`, `realpathSync(mkdtempSync(...))`, then `cpSync(<root>/vault, <tmp>/vault, { recursive: true, filter })` with the mockups/archive filter of `questions-flow.test.mjs`. **Runs:** the tool as `spawnSync(process.execPath, [<tmp>/vault/tools/next_ticket.mjs, ...args], { encoding: 'utf8' })`. Fixture files are written to `<tmp>/vault/lessons/`, and each test deletes the files it wrote before it ends. Tests run in the order T1–T7. Every test title starts `EZD-000g`. |

Fixture entries (C6). Each is a heading line, then `Ticket EZD-000g, 2026-10-19`, then `Rule: fixture <L-number>.`:
- `fixture.md`:
  - `## L-901  areas: tooling  seen: 1  status: candidate`
  - `## L-902  areas: tooling  seen: 1  status: ratified`
  - `## L-903  areas: tooling  seen: 1  status: rejected`
  - `## L-904  areas: auth  seen: 2  status: ratified  automated: x`
- `fixture-none.md`: L-901 and L-903 as above.
- `fixture-check.md`:
  - `## L-905  areas: tooling  seen: 1`, with body line `Rule: keep status: ratified out of the heading.`
  - `## L-906  areas: tooling  seen: 1  status: maybe`
  - L-902 as above.

## 4. Tests

All tests are in `scripts/ledger/lesson-ratification.test.mjs` (C6).

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 | AC-EZD-000g-4 (control) | unit (CLI) | `--check` on the unchanged temp copy | stdout has no line containing `vault/lessons/` | C3. The real entries L-001 and L-002 carry `status: candidate` (`vault/lessons/reviewer.md`, `planner.md`); PROCESS.md section 13 |
| T2 | AC-EZD-000g-1 | unit (CLI) | `fixture.md`; (a) `--lessons fixture tooling`; (b) `--lessons fixture` (no areas) | exit 0. (a) stdout contains `## L-902` and none of `L-901`, `L-903`, `L-904`. (b) stdout contains `## L-902` and `## L-904  areas: auth  seen: 2  status: ratified  automated: x`, and neither `L-901` nor `L-903` | Done-when clause 1; PA3 Item 7 ("prints only `ratified` entries"); PROCESS.md section 13; C1 (extra heading fields ignored), C2 (area filter kept, no areas = all) |
| T3 | AC-EZD-000g-1 | unit (CLI) | `fixture-none.md`; `--lessons fixture-none tooling` | stdout trimmed equals `(no lessons for fixture-none in areas tooling)` | PA3 Item 7 ("Candidates never reach a dispatch"); message text from `next_ticket.mjs` line 280, kept by C2 |
| T4 | AC-EZD-000g-2 | unit (CLI) | `fixture-check.md`; `--check` | exit 1. First line starts `LEDGER INVALID (`. stdout has the line `- vault/lessons/fixture-check.md: L-905 has no status (candidate, ratified or rejected; PROCESS.md section 13)` and the line `- vault/lessons/fixture-check.md: L-906 has unknown status "maybe" (candidate, ratified or rejected; PROCESS.md section 13)`, and no line naming `L-902` | Done-when clause 2 ("naming the entry"); PA3 Item 7; PROCESS.md section 13 Status bullet (three values; status in the heading per the entry format); C1, C3 |
| T5 | AC-EZD-000g-2 | unit (CLI) | `fixture-check.md`; `--lessons fixture-check tooling` | stdout contains `## L-902`, and neither `L-905` (status only in the body) nor `L-906` | C1 (heading only); PA3 Item 7 |
| T6 | AC-EZD-000g-3 | unit (repo file) | read `.claude/skills/questions/SKILL.md` | front matter contains `rule candidates`. Step 3 line contains `with four sections` and not `three sections`. A line starts `   4. **Rule candidates** - ` and contains `status: candidate`, `vault/lessons/`, `ratify` and `reject`. The line starting `4. ` contains `status: ratified`, `status: rejected`, `vault/lessons/INDEX.md`, `QUESTIONS.md`, `answered-josh`, `Q-ID` and `<N> / L-nnn` | Done-when clause 3; PROCESS.md section 7 (item 4; last bullet); PA3 Item 7; C4 (list indentation as the existing step 3 items, three spaces) |
| T7 | Scope sentence 4 (no AC ID) | unit (repo file) | read `.claude/skills/wrap/SKILL.md` | the line starting `2. **Lessons**` contains `Any ratified lesson with \`seen\` of 2 or more, or any ratified lesson a script could check,`; the file does not contain `Any lesson with \`seen\`` | PA3 Item 7; PROCESS.md section 13 Wrap step; C5 |

Notes:
- **Before the build,** the tests fail for the right reason:
  - T2 (a), (b) and T3 fail because candidates and rejected entries are printed.
  - T4 fails because `--check` ignores lessons.
  - T5 fails because L-905 and L-906 are printed.
  - T6 and T7 fail on the old text.
  - T1 passes before and after. It guards that the real lessons stay valid.
- **AC-4** is the builder's report of verification item 10 (section 1 step 7) plus the gate. T2–T5 are the local evidence.
- **Not tested, by design:** the live behaviour of the questions skill. It is text the orchestrator follows, and the next `questions` unit is its first live use (section 1 step 7).
- **Existing tests** need no change:
  - `scripts/ledger/questions-flow.test.mjs` copies the real vault, whose lessons are valid, so its `--next-unit` paths keep passing.
  - `scripts/hooks/guard-paths.test.mjs` is untouched.

## 5. Visual checklist
None (no screen changes).

## 6. Proposed wording
None. The C3 problem lines are ledger messages to the orchestrator, not app text (PROCESS.md section 3a covers user-visible app text). They follow the style of the existing `check()` messages. Josh can still change them at Stage 2.

## 7. Security review
security-review: no. This is ledger and skill tooling: no app auth, permissions, data access, money, API or migrations, and no secrets are read (split proposal Part F).

Reviewers needed:
- **code-reviewer:** yes, Opus 5.5 high (PA3-MECHANISMS.md rule 5). Failure-mode check: `--next-unit` and the default command both stop on an invalid ledger (lines 211, 406), so the C3 pass must flag only entries that really lack a valid heading status. Confirm:
  - `INDEX.md` is skipped;
  - a missing `vault/lessons/` folder is allowed;
  - the real lessons pass (T1).
- **calc-auditor:** no.
- **ui-verifier:** no.
- **security-reviewer:** no.

## 8. Complexity and model recommendation
Medium. The change is small (3 files, 7 tests) and the contract is complete. But `check()` runs before every ticket pick in every later unit, so a wrong parse would stop the launcher, and a wrong filter would leak unratified rules into every dispatch. Test-author: Sonnet 5.5, medium effort. Builder: Sonnet 5.5, medium effort (PA3-MECHANISMS.md rule 5; STATUS.md row notes).

## 9. Dependencies

From the ticket row:
- **EZD-000f** (questions, Q-0132). An ordering dependency only, from the split chain (PA3-MECHANISMS.md "Order of work and commits": Item 7 after Item 4). No code or contract is shared: EZD-000f touches the spawn hook, settings and guard-paths.mjs, and none of this ticket's files.

Not in the ticket row, reached through the chain:
- **EZD-000c** (planned). The whole-read guard makes the builder read `next_ticket.mjs` by range (split proposal note 7). That is a working constraint, not a contract.
- **EZD-000b, EZD-000d, EZD-000e** (earlier parts). Nothing used.
- **EZD-000** (done).

No missing dependency. There is no screen, so EZD-016a is not needed.

Dependents:
- EZD-000h (next in the chain; it also edits `next_ticket.mjs`, in `--report`, a different function).
- Every later dispatch: lessons reach agents only once ratified.

Risks:
- **A lesson written without `status:` stops the launcher** at its next ticket pick until it is fixed. That is the intended strictness (PROCESS.md section 13), and the problem line names the file and L-number.
- **The two current lessons stop reaching dispatches** until Josh ratifies them (Scope "Effect today"). L-002 is the plan-review check that caught Q-0124. Today's `phase-00-for-josh.md` section 4 says "None", written before L-001 and L-002 existed, so the next `questions 0` unit must rewrite it to list both.

## 10. Open questions
None.
