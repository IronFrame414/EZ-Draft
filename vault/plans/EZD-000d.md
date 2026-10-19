# EZD-000d · Research report store (Item 6)

- **ACs:** AC-EZD-000d-1 to AC-EZD-000d-6 (`vault/spec/acceptance-criteria.md` lines 89–94). These IDs were generated from the wrong column of the ticket row and cover the Scope text, not the Done-when (see QP-1). Section 4 maps every test to a Done-when clause DW-1 to DW-4 and, where one fits, to a current AC ID.
- **Complexity:** medium (reasoning in section 8).
- **User-visible result:** when an agent looks something up for a ticket, the findings are saved once as a numbered report (R-001, R-002 …) with a one-line index entry. Later plans can cite the report instead of paying for the same lookup again.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: questions

Part C of the EZD-000b split (proposal archived at `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md`, Part C).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 35):
- **Scope:** New `vault/tools/research.mjs adopt`. New `vault/research/INDEX.md` and `vault/research/pending/`. New `CLAUDE.md` directory row "Findings from earlier lookups \| vault/research/INDEX.md (only the reports your plan names)". Add the adopt step to `.claude/skills/plan-ticket/SKILL.md` (the plan unit runs adopt before the planner finishes) and to `.claude/skills/build-ticket/SKILL.md` (the orchestrator runs it after any dispatch that returned a `REPORT:` line). Orchestrator step, not the builder's: `vault/plans/TEMPLATE.md` section 2 gains "research reports R-NNN; a ticket no report covers says so" (PROCESS.md section 6 item 2). Split of EZD-000b (Q-0010 flow; planner 2026-10-19). Builder write grant per PA3-MECHANISMS.md rule 7 and Q-0128.
- **Done when:** (DW-1) `node vault/tools/research.mjs adopt` with two files in `vault/research/pending/` moves them to the next two free `R-NNN.md` numbers, appends two lines `R-NNN | date | title | scope | ticket` to `vault/research/INDEX.md`, prints the two IDs and leaves `pending/` empty; (DW-2) a second run with nothing pending prints nothing and changes nothing; (DW-3) `CLAUDE.md`'s directory table has the research row and the file is at most 60 lines. (DW-4) Verification item 11 is reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000c · **Spec ref:** PA3-MECHANISMS.md Item 6; PROCESS.md v2.3 sections 6, 13, 14.

Steps:
1. **Adopt tool** `vault/tools/research.mjs` (contract C1–C5). It moves every pending report to `vault/research/R-NNN.md` at the next free number, appends one index line per report, and prints the IDs. A second run with nothing pending changes nothing. (PA3-MECHANISMS.md Item 6; PROCESS.md section 13 `vault/tools/research.mjs`; Done-when DW-1, DW-2.) It is plain Node with no dependencies and no relative imports (PA3-MECHANISMS.md rule 4), so the tests can run a copy of it in a temp tree.
2. **Pending file format** (contract C2). Part D (EZD-000e) writes retriever reports "in the file format Part C defines" (phase-00.md line 36). The format is a front-matter block with `title`, `scope` and `ticket`. Adopt needs these to write the index line `R-NNN | date | title | scope | ticket` (Item 6). The values come from the retriever brief: `FOR` gives the ticket and `SCOPE` gives the scope (Item 4 brief format). The date is the adoption date. This is a build choice: the sources define the index line but not where its fields come from, and the split proposal leaves the format to this part.
3. **Store** (contract C6): new `vault/research/INDEX.md` with a heading and a one-line description and no report lines yet, plus `vault/research/pending/.gitkeep`. Git does not track empty folders, so the `.gitkeep` is what makes `pending/` exist in the repo (Scope "New … `vault/research/pending/`"). Adopt moves only `.md` files, so `.gitkeep` stays. "Leaves `pending/` empty" in DW-1 means no report files are left.
4. **CLAUDE.md row** (contract C7). Insert one row in the `## Directory` table, directly after the `| Models, budget, units, gates | … |` row and before `| Gate and ledger commands | … |`. That is the position in the PROCESS.md section 14 template. The row text follows the ticket row and the PROCESS.md template: "(only the reports your plan names)". Item 6 says "(read only the reports your plan names)"; PROCESS.md wins (PA3-MECHANISMS.md rule 1), so the builder reports this difference. CLAUDE.md goes from 52 lines (after EZD-000b; EZD-000c adds none) to **53**, within the 60-line limit (EZD-000b plan step 3; EZD-000c plan step 4).
5. **Skill steps** (contract C8). Add one sentence to each skill:
   - **plan-ticket:** appended to the end of "Planner's work" step 2. It says the planner runs adopt before finishing. Source: Scope; Item 6 ("the `plan` unit runs it before the planner finishes"); PROCESS.md section 6 ("then runs `node vault/tools/research.mjs adopt` and cites the IDs").
   - **build-ticket:** a new paragraph after the "**Load only:**" paragraph. It says the orchestrator runs adopt after any dispatch that returned a `REPORT:` line (Scope; Item 6; PROCESS.md section 13).
   - Neither change renumbers a step, because other documents cite "plan-ticket skill step 3".
6. **Template (orchestrator, not builder).** At Stage 3 step 10, after `git merge --squash t/EZD-000d` and before `git commit`, the orchestrator appends one sentence to the section 2 paragraph of `vault/plans/TEMPLATE.md` (contract C9). This keeps the ticket to one commit (CLAUDE.md rule 11). Sources: Scope; PROCESS.md section 6 item 2. `vault/plans/` is outside the builder's PA3 grant (`guard-paths.mjs` `pa3Vault`), and the orchestrator may write `vault/` (`guard-paths.mjs` orchestrator rule). There is no test for it, because the gate runs before the edit. The orchestrator confirms it with `grep -n "Research reports R-NNN" vault/plans/TEMPLATE.md` before committing.
7. **Verification item 11** (DW-4; PA3-MECHANISMS.md rule 6). Item 11 is "`CLAUDE.md` is at or under about 60 lines after Items 3, 5 and 6". The builder reports it as **verified**, with the `wc -l` count (53 expected), backed by T9. The builder also runs `node scripts/gate.mjs <worktree>` (CLAUDE.md rule 12). Verification item 9 ("adopt works end to end from a retriever's pending file") needs the retrievers of EZD-000e, so it is not this ticket's. EZD-000e/EZD-000f report it.

| Path | New / change | Why | Writer (L-002 check against guard-paths.mjs) |
| --- | --- | --- | --- |
| `vault/tools/research.mjs` | new | Step 1 | builder: `pa3Grant()` (`pa3Vault` has `vault/tools/`) |
| `vault/research/INDEX.md` | new | Step 3 | builder: `pa3Grant()` (`pa3Vault` has `vault/research/`) |
| `vault/research/pending/.gitkeep` | new (empty) | Step 3 | builder: same |
| `CLAUDE.md` | change | Step 4 | builder: `pa3Grant()` (`rel === 'CLAUDE.md'`) |
| `.claude/skills/plan-ticket/SKILL.md` | change | Step 5 | builder: `pa3Grant()` (`.claude/`) |
| `.claude/skills/build-ticket/SKILL.md` | change | Step 5 | builder: same |
| `scripts/tools/research.test.mjs` | new | T1–T10 | test-author: `isTest` (`.test.mjs`) |
| `vault/plans/TEMPLATE.md` | change | Step 6 | orchestrator (`isVault`), at merge |

- **Grant scope:** the PA3 grant applies only in a worktree matching `EZD-000[b-i]` (Q-0128 (a)), and `.claude/worktrees/EZD-000d` matches.
- **Test runner:** the root `test` script runs `node --test "scripts/**/*.test.mjs"` (root `package.json`), so the gate runs the test file.
- **Fixtures:** written to a temp directory at run time, so there are no fixture files.

Data: none. No tables, migrations, money or `schema_version`.

## 2. Sources

- `vault/handoff/PA3-MECHANISMS.md`:
  - Rules 1, 4, 5, 6, 7.
  - Item 6 (store, index line, pending name, `REPORT:` line, adopt, plan citation, CLAUDE.md row, tests).
  - Item 4 (brief format `QUESTION · FOR · SCOPE · CAP · REPORT · KNOWN`).
  - Verification items 9 and 11.
- `vault/PROCESS.md`:
  - Section 6 (planner runs adopt and cites IDs; plan section 2 item).
  - Section 13 (`vault/tools/research.mjs`; `vault/research/`).
  - Section 14 (repo tree `vault/research/ INDEX.md, R-NNN.md, pending/`; CLAUDE.md template Directory row and its position).
- `vault/tickets/phases/phase-00.md` lines 35–36. `vault/spec/acceptance-criteria.md` lines 89–94. `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md` Part C and note 9.
- Questions:
  - Q-0128 (a): builder grant.
  - Q-0126 (c): "not testable here" items go to PILOT.md. None are expected here.
- Plans: `vault/plans/EZD-000b.md` (CLAUDE.md contract and line count 52), `vault/plans/EZD-000c.md` (CLAUDE.md line count unchanged; test-file layout `scripts/tools/*.test.mjs`; CLI usage and exit-code style C3).
- Code at develop `1f680bf`:
  - `.claude/hooks/guard-paths.mjs` (`pa3Grant`, `pa3Vault`, orchestrator rule).
  - `CLAUDE.md` (49 lines; Directory rows 38–39).
  - `.claude/skills/plan-ticket/SKILL.md`, `.claude/skills/build-ticket/SKILL.md` (line 8 "Load only").
  - `vault/plans/TEMPLATE.md` line 14.
  - Root `package.json`, `.gitignore` (`vault/research/` not ignored).
- Product spec sections 03, 04, 11, non-goals, glossary, decisions and mockups: not applicable. This is process tooling: "No app code. No change to the product spec" (PA3-MECHANISMS.md header).
- Research reports: none exist (`vault/research/` is absent at `1f680bf`), so no R-NNN covers this ticket.

**Differences between the handoff and PROCESS.md** (handoff rule 1; the builder repeats them in its report):
1. **CLAUDE.md row text.** The handoff has "(read only the reports your plan names)". PROCESS.md section 14 and the ticket row have "(only the reports your plan names)", and the row uses the PROCESS.md text.

No other differences were found.

## 3. Interface contract

| # | Kind | Name or path | Details |
| --- | --- | --- | --- |
| C1 | export | `adopt(researchDir: string, date: string): { ids: string[], skipped: { file: string, reason: string }[] }` in `vault/tools/research.mjs` | **Directory:** `pending = join(researchDir, 'pending')`. If `pending` does not exist, return `{ ids: [], skipped: [] }` with no writes. **Candidates:** entries of `pending` that are regular files, end in `.md` and do not start with `.`, sorted with the default `Array.prototype.sort()`. Other entries are left alone. No candidates means return empty with no writes, and `INDEX.md` is not read. **Index:** `join(researchDir, 'INDEX.md')`; if it is missing, throw `Error('vault/research/INDEX.md not found')`. **Next number:** 1 + the largest N among file names in `researchDir` matching `^R-(\d+)\.md$` and index lines matching `^R-(\d+) \|`, or 1 when there are none. **Per candidate, in order:** parse with C2. An invalid file goes into `skipped` (`file` is the bare file name) and stays in `pending`. A valid file gets `id = 'R-' + String(n).padStart(3, '0')` and is renamed (`renameSync`, content unchanged) to `join(researchDir, id + '.md')`, then n += 1. **Append:** after the loop, if any id was made, append to `INDEX.md` one line per id, `` `${id} \| ${date} \| ${title} \| ${scope} \| ${ticket}` ``. Lines are joined with `\n` and end with `\n`, with a `\n` first when the file does not already end in one. Earlier bytes are unchanged. |
| C2 | format | pending report file | Line 1 is exactly `---`. Then `key: value` lines (split at the first `:`) up to the next line that is exactly `---`. `\r` at line ends is ignored. Keys `title`, `scope` and `ticket` are required (lowercase); other keys are ignored. Values are trimmed, and every `\|` in a value becomes `/`. Everything after the closing `---` is the report body, which adopt does not read. **Invalid reasons** (exact strings): `no front matter` (line 1 is not `---`, or there is no closing `---`), else `missing <key>` for the first required key, in the order title, scope, ticket, that is absent or empty. |
| C3 | export | `localDate(d?: Date): string` | `YYYY-MM-DD` from `d.getFullYear()`, `getMonth() + 1` and `getDate()`, zero-padded. `d` defaults to `new Date()`. |
| C4 | CLI | `node vault/tools/research.mjs adopt` | `researchDir = resolve(dirname(fileURLToPath(import.meta.url)), '../research')`. It calls `adopt(researchDir, localDate())` and writes each id + `\n` to stdout, in order. For each skipped file it writes `` `research: skipped pending/${file}: ${reason}` `` + `\n` to stderr. Exit 1 if any were skipped, else 0. Nothing pending means no output and exit 0. A thrown error writes `` `research: ${err.message}` `` to stderr and exits 1. Any other arguments (none, or not exactly `adopt`) write `usage: node vault/tools/research.mjs adopt` to stderr and exit 2. The CLI runs only when the file is the entry point (`import.meta.url === pathToFileURL(process.argv[1]).href`), as in EZD-000c C3. |
| C5 | imports | `vault/tools/research.mjs` | Only `node:fs`, `node:path` and `node:url`. No relative imports. |
| C6 | files | store | `vault/research/INDEX.md` is exactly the four lines below, ending in `\n`. `vault/research/pending/.gitkeep` is empty. The repo has no `vault/research/R-*.md` and no `.md` in `pending/`. |
| C7 | file | `CLAUDE.md` | Exactly one line equals `\| Findings from earlier lookups \| vault/research/INDEX.md (only the reports your plan names) \|`. The line before it starts `\| Models, budget, units, gates \|` and the line after it starts `\| Gate and ledger commands \|`. Both are in the section from `## Directory` to the next `## ` line. The line count is ≤ 60, counted as in the EZD-000b contract (`split('\n')`, one trailing empty string dropped); 53 is expected. Everything else is unchanged, including the EZD-000b rules 14–16 and the EZD-000c rule 10 sentence. |
| C8 | text | skill sentences | **S1:** appended (after one space) to the end of the line in `.claude/skills/plan-ticket/SKILL.md` starting `2. Write \`vault/plans/$ARGUMENTS.md\``: `` If a retriever you dispatched returned a `REPORT:` line, run `node vault/tools/research.mjs adopt` before you finish and cite the IDs it prints as `R-NNN` in section 2; a ticket no report covers says so in section 2. `` **S2:** in `.claude/skills/build-ticket/SKILL.md`, a blank line and then this new line, directly after the line starting `**Load only:**`: `` **Research reports.** After any dispatch that returned a `REPORT:` line, run `node vault/tools/research.mjs adopt`; it moves each pending report to `vault/research/R-NNN.md` and prints the IDs to cite (PROCESS.md section 13). `` No step number in either file changes. |
| C9 | text | `vault/plans/TEMPLATE.md` (orchestrator) | Append ` Research reports R-NNN the plan drew on; a ticket no report covers says so.` to the end of the section 2 paragraph (today line 14). |
| C10 | test file | `scripts/tools/research.test.mjs` | Uses only `node:test`, `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:url` and `node:child_process`. Root is `path.resolve(dirname(fileURLToPath(import.meta.url)), '../..')`. **CLI tests** copy `<root>/vault/tools/research.mjs` to `<tmp>/vault/tools/research.mjs` (tmp from `fs.mkdtempSync(os.tmpdir())`), build `<tmp>/vault/research/`, and run `spawnSync('node', [<tmp>/vault/tools/research.mjs, ...args], { encoding: 'utf8' })`. The real `vault/research/` is never written. Every test title starts `EZD-000d`. |

`vault/research/INDEX.md` (C6), exactly:
```
# Research reports

One line per report: `R-NNN | date | title | scope | ticket`, appended by `node vault/tools/research.mjs adopt`. Read only the reports your plan or dispatch names (PROCESS.md section 13).

```
(Line 1 heading; line 2 empty; line 3 the sentence; line 4 empty. The file ends after line 4's `\n`.)

**Fixtures the tests use** (the test file holds these exactly; lines are joined with `\n` and end in `\n`):
- `H` (fixture index) = `# Research reports\n\nHeader line.\n`.
- `retriever-digest-b.md` = `---\ntitle: Title B\nscope: app/src\nticket: EZD-101\n---\nBody B\n`.
- `retriever-web-a.md` = `---\ntitle:  Title A \nscope: example.com\nticket: EZD-102\nextra: ignored\n---\nBody A\n`.
- `bad-nofm.md` = `# no front matter\n`.
- `bad-noscope.md` = `---\ntitle: T\nticket: EZD-1\n---\n`.
- `pipe.md` = `---\ntitle: a | b\nscope: x\nticket: EZD-1\n---\n`.

## 4. Tests

All tests are in `scripts/tools/research.test.mjs`. "today" is `localDate()` as computed by the test. The test accepts either the value computed just before or just after the run, in case the run crosses midnight.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 | DW-1 (no AC ID; QP-1) | unit (CLI) | tmp tree: index `H`; `pending/` = `.gitkeep`, `retriever-digest-b.md`, `retriever-web-a.md`; run `adopt` | exit 0; stdout `R-001\nR-002\n`. `R-001.md` is byte-equal to the original `retriever-digest-b.md` and `R-002.md` to `retriever-web-a.md` (`d` sorts before `w`). `pending/` lists exactly `['.gitkeep']`. INDEX = `H` + `R-001 \| <today> \| Title B \| app/src \| EZD-101\nR-002 \| <today> \| Title A \| example.com \| EZD-102\n` | Done-when DW-1 (two files, next two free numbers, two lines in that order of fields, prints the IDs, pending empty); Item 6; C1–C4. `001` is the first free number with no reports; the width comes from `R-NNN` |
| T2 | DW-2 (no AC ID; QP-1) | unit (CLI) | after T1's run, run `adopt` again | exit 0; stdout `''`; stderr `''`. INDEX bytes and the sorted listings of `vault/research/` and `pending/` are equal to those before the second run | Done-when DW-2 "prints nothing and changes nothing"; Item 6 tests |
| T3 | DW-1 | unit (`adopt()`) | (a) dir with `R-007.md` and index `H` + `R-007 \| 2026-10-01 \| x \| y \| z\n`, two valid pending files, date `'2026-10-19'`. (b) index `H` + `R-010 \| …` line with no `R-010.md` file, one valid pending file | (a) `ids` `['R-008','R-009']`, and the last index line starts `R-009 \| 2026-10-19 \|`. (b) `ids` `['R-011']` | Done-when "next two free `R-NNN.md` numbers"; C1 next-number rule |
| T4 | DW-1 | unit (`adopt()`) | pending `pipe.md` plus `retriever-web-a.md`; index `H` without a trailing `\n` (`'# Research reports\n\nHeader line.'`) | index = `'# Research reports\n\nHeader line.\nR-001 \| 2026-10-19 \| a / b \| x \| EZD-1\nR-002 \| 2026-10-19 \| Title A \| example.com \| EZD-102\n'` | C1 append rule; C2 (trim, `\|` → `/`, extra key ignored) |
| T5 | DW-1 | unit (CLI) | pending `bad-nofm.md`, `bad-noscope.md`, `retriever-digest-b.md` | exit 1; stdout `R-001\n`. stderr has the lines `research: skipped pending/bad-nofm.md: no front matter` and `research: skipped pending/bad-noscope.md: missing scope`. Both bad files are still in `pending/`, and the index gained exactly one line | C2 reasons; C4; architecture.md "Nothing fails silently" |
| T6 | DW-2 | unit (CLI) | (a) tmp tree with index `H` and no `pending/` folder. (b) `pending/` holding only `notes.txt` and `.gitkeep` | (a) and (b): exit 0, stdout `''`, index unchanged. In (b) `notes.txt` is still there | C1 candidates rule; DW-2 |
| T7 | — (contract) | unit (CLI) | args `[]`; `['foo']`; `['adopt', 'x']` | each: exit 2; stderr starts `usage: node vault/tools/research.mjs adopt` | C4 (same style as EZD-000c C3) |
| T8 | AC-EZD-000d-1 (scope); DW-1 | unit (repo files) | read `<root>/vault/research/INDEX.md`; list `<root>/vault/research/pending/` | INDEX equals the C6 text exactly; no line matches `^R-\d+ \|`; `pending/` contains `.gitkeep` (size 0) and no `.md`; no `R-*.md` in `vault/research/` | Scope (new INDEX.md and pending/); C6 |
| T9 | AC-EZD-000d-1; DW-3; DW-4 (item 11) | unit (repo files) | read `<root>/CLAUDE.md` | C7 holds: one exact row, between the Models row and the Gate row, inside `## Directory`; line count ≤ 60 | Scope (row text); PROCESS.md section 14 template (text and position); Done-when "at most 60 lines"; verification item 11 |
| T10 | AC-EZD-000d-2 | unit (repo files) | read both skill files | plan-ticket's step 2 line ends with S1; build-ticket has a line equal to S2 directly after the blank line that follows the `**Load only:**` line; the numbered step lines (`^\d+\. `) of both files are the same as before the build: plan-ticket `1.`–`4.`, build-ticket `0.`–`11.` | Scope; Item 6; PROCESS.md sections 6, 13; C8; `1f680bf` step numbering |

Notes:
- **Before the build,** T1–T10 fail for the right reason: the module, the store files, the row and the sentences are missing.
- **Not tested:**
  - AC-EZD-000d-3 and -4 (template, step 6) are done by the orchestrator at merge, after the gate. The orchestrator checks them with grep.
  - AC-EZD-000d-5 and -6 are notes (the split origin and the write grant), not checks (KNOWN-LIMITS.md, Phase 0 ACs). The test-author maps them to this section's step 6 and the section 1 Writer column.
- **Earlier tests stay green:**
  - EZD-000b's CLAUDE.md test (rules 1–16 numbering, ≤ 60 lines) is not affected by a Directory row.
  - EZD-000c's T10 checks the rule 10 line and ≤ 60, which still hold.
  - `scripts/hooks/guard-paths.test.mjs` is unchanged.

## 5. Visual checklist
None (no screen changes).

## 6. Proposed wording
None. No app or user-interface text is added. The CLAUDE.md row is the ticket's and PROCESS.md's wording, verbatim. The INDEX.md line, the skill sentences (C6, C8, C9) and the CLI messages (C4) are process text for agents, not product text (PROCESS.md section 3a covers user-visible app text). Josh can still change them at Stage 2.

## 7. Security review
security-review: no. This is a file-moving tool inside `vault/`. It touches no auth, permissions on data, data access, money, API or migrations, and it reads no secrets.

Reviewers needed:
- **code-reviewer:** yes, Opus 5.5 high (PA3-MECHANISMS.md rule 5). Check that adopt never overwrites an existing `R-NNN.md`, and that an invalid file is reported, not lost.
- **calc-auditor:** no.
- **ui-verifier:** no.
- **security-reviewer:** no.

## 8. Complexity and model recommendation
Medium. The tool is small and dependency-free, but it defines the report format and numbering that EZD-000e's retrievers and every later plan rely on, and it edits CLAUDE.md and two skills that every unit loads. This matches the STATUS.md rating. Test-author: Sonnet 5.5, medium effort. Builder: Sonnet 5.5, medium effort (PA3-MECHANISMS.md rule 5; STATUS.md row notes).

## 9. Dependencies
- **EZD-000c** (planned). It changes CLAUDE.md rule 10 on the same line count. C7 keeps it.
- **EZD-000b** (planned), through EZD-000c. It brings CLAUDE.md to 52 lines with rules 14–16; C7 keeps them.
- **EZD-000** (done).
- No missing dependency. There is no screen, so EZD-016a is not needed. The builder grant (Q-0128 (a)) is already in guard-paths.mjs, and `pa3Vault` already lists `vault/research/`.
- **Dependent:** EZD-000e writes pending reports in the C2 format and returns `REPORT: pending/<file>`. Its plan must match C2 (front matter `title`, `scope`, `ticket`).

Risks:
- **Process text agents load.** If S1 or S2 lands at the wrong place, a step reference breaks. T10 pins the numbering.
- **Hand-edited index.** Adopt takes the next number from both files and index lines, so a hand-edited index cannot cause a reused ID.

## 10. Open questions
- **Q-0130 (was QP-1):** The ACs for EZD-000d (`acceptance-criteria.md` lines 89–94) were generated from the Scope text, not the Done-when. The escaped `\|` in the Scope's CLAUDE.md row appears to have shifted the columns. So no AC ID covers the adopt behaviour (DW-1, DW-2) or verification item 11. Options:
  - (a) Regenerate EZD-000d's ACs from the Done-when, giving AC-EZD-000d-1 to -4 = DW-1 to DW-4, and the test-author uses those IDs in place of the DW labels in section 4.
  - (b) Keep the current six IDs and add AC-EZD-000d-7 to -10 for DW-1 to DW-4.
  - (c) Keep the IDs as they are and track the DW clauses through this plan only.
