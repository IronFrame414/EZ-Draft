# EZD-000e · Retriever agents and dispatch brief (Item 4, agent files)

- **ACs:** AC-EZD-000e-1 to AC-EZD-000e-5 (`vault/spec/acceptance-criteria.md` lines 93–97), regenerated from the Done-when: AC-EZD-000e-1 to -5 = DW-1 to DW-5 (Q-0131 (a)). Section 4 cites the AC ID for every test.
- **Complexity:** medium (reasoning in section 8).
- **User-visible result:** the planner and the three reviewers can hand a big lookup (a long log, the whole spec, a web search) to a cheap Haiku "retriever" and get back a short answer with pointers instead of loading the pages, and the builder, test-author and other agents cannot start other agents.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: ready

Part D of the EZD-000b split (proposal archived at `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md`, Part D).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 36):
- **Scope:** New `.claude/agents/retriever-digest.md`: `claude-haiku-5-5`, effort medium, maxTurns 15, tools `Read, Grep, Glob, Write`. New `.claude/agents/retriever-web.md`: the same settings, with tools `WebSearch, WebFetch, Write`. Both retrievers follow Item 4's contract: answer only, 40 lines at most, `path:line` pointers. With `REPORT: yes` they write `vault/research/pending/<agent>-<slug>.md` and return `REPORT: pending/<file>` as their first line, in the file format Part C defines. `planner.md`, `code-reviewer.md`, `security-reviewer.md` and `phase-auditor.md` get an `Agent` tool and the retriever rule (about 30,000 tokens, or a lookup that needs sifting, goes to a retriever; never read a report body, cite its ID). The brief format `QUESTION · FOR · SCOPE · CAP · REPORT yes\|no · KNOWN` is added to `.claude/skills/build-ticket/dispatch.md`. Spawn depth stays at 1 in this part, so the new `Agent` tools cannot nest until Part E's enforcement exists. Split of EZD-000b (Q-0010 flow; planner 2026-10-19). Builder write grant per PA3-MECHANISMS.md rule 7 and Q-0128.
- **Done when:** (DW-1) `retriever-digest.md` and `retriever-web.md` exist with model claude-haiku-5-5, effort medium, maxTurns 15 and tools "Read, Grep, Glob, Write" and "WebSearch, WebFetch, Write" respectively; (DW-2) planner, code-reviewer, security-reviewer and phase-auditor have an Agent tool and the retriever rule; (DW-3) builder, test-author, ui-verifier, calc-auditor, Explore and both retrievers have no Agent tool; (DW-4) `dispatch.md` holds the retriever brief format. (DW-5) The gate is green.
- **Depends on:** EZD-000d · **Spec ref:** PA3-MECHANISMS.md Item 4 and Findings; PROCESS.md v2.3 sections 3 (rule 15), 4, 10.

Steps:
1. **Two retriever agent files** (contract C1–C3). Frontmatter from the ticket row and the PROCESS.md section 4 roster (model `claude-haiku-5-5`, effort medium, maxTurns 15; tools per Item 4). Body: the Item 4 contract (one question, answer only, 40 lines at most, `path:line` pointers) and the Item 6 report step. The report file uses EZD-000d's pending format (EZD-000d plan C2: front matter `title`, `scope`, `ticket`), filled from the brief: `SCOPE` gives `scope`, the ticket in `FOR` gives `ticket` (EZD-000d plan step 2). The answer is capped at the brief's `CAP` and never more than 40 lines: both Item 4 ("40 lines at most") and the brief's `CAP (max lines)` apply, so the smaller wins.
   - **retriever-web pointers.** Item 4 says retriever-web has "the same contract for the outside world" and PROCESS.md section 4 "the same … with WebSearch and WebFetch". A web page has no `path:line`, so its pointer is the page URL. Build choice, not a product decision.
   - **retriever-digest and the read guard.** It has no Bash tool (Item 4), so it cannot run `vault/tools/outline.mjs`. EZD-000c's guard denies a whole read of a file over 20,000 characters and returns the outline in the denial (PROCESS.md section 14 Hooks, guard-reads); the body tells it to read the ranges the outline gives.
2. **Four dispatching agents** (contract C4, C5). Add `Agent` as the last entry of the `tools:` line of `planner.md`, `code-reviewer.md`, `security-reviewer.md` and `phase-auditor.md`. It is a plain `Agent`, not `Agent(retriever-digest, retriever-web)`: the names inside `Agent(...)` are ignored in subagent files (PA3-MECHANISMS.md Findings, Item 4 row; the ticket row "get an `Agent` tool"). Append a `## Retrievers` section with the retriever rule (Item 4 "Rule for the dispatching agents"; PROCESS.md section 4 "Retrievers"; section 3 rule 15). It is appended after EZD-000b's `## Honesty` section, so that section (which runs to the next `## ` line, EZD-000b plan contract) keeps exactly its three rules. No other frontmatter or body line changes.
3. **No Agent tool elsewhere** (DW-3). `builder.md`, `test-author.md`, `ui-verifier.md`, `calc-auditor.md` and `Explore.md` are not edited; at develop `2d8e927` none of their `tools:` lines names `Agent` (read this session). The test pins it so a later edit cannot add one. calc-auditor is not a dispatcher in PROCESS.md rule 15 (split proposal note 2).
4. **Brief format in dispatch.md** (contract C6). Append a "Retriever brief" paragraph and a fill-in block (PA3-MECHANISMS.md Item 4 "Brief format … added to `.claude/skills/build-ticket/dispatch.md`"; PROCESS.md section 4 gives the one-line format verbatim). The existing template block and its role list are unchanged.
5. **Settings unchanged** (Scope: "Spawn depth stays at 1 in this part"; no AC ID). `.claude/settings.json` env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` stays `"1"` (read this session); this ticket does not touch the file. Depth 2 is EZD-000f's (phase-00.md line 37). This is a review check on the diff, not a test, because EZD-000f changes the value to `"2"` and a test pinning `"1"` would have to be rewritten by the next ticket.
6. **Gate** (DW-5). `node scripts/gate.mjs <worktree>` (CLAUDE.md rule 12). Verification item 8 ("builder cannot dispatch; planner can dispatch retriever-digest and the chain stops") and item 9 (adopt end to end from a retriever's pending file) need EZD-000f's depth 2 and the retrievers' write limit in `guard-paths.mjs`, so they are EZD-000f's (phase-00.md line 37 Done-when "Verification items 8 and 9"). This ticket reports neither.

| Path | New / change | Why | Writer (L-002 check against guard-paths.mjs) |
| --- | --- | --- | --- |
| `.claude/agents/retriever-digest.md` | new | Step 1 | builder: `pa3Grant()` (`.claude/`) |
| `.claude/agents/retriever-web.md` | new | Step 1 | builder: same |
| `.claude/agents/planner.md` | change | Step 2 | builder: same |
| `.claude/agents/code-reviewer.md` | change | Step 2 | builder: same |
| `.claude/agents/security-reviewer.md` | change | Step 2 | builder: same |
| `.claude/agents/phase-auditor.md` | change | Step 2 | builder: same |
| `.claude/skills/build-ticket/dispatch.md` | change | Step 4 | builder: same |
| `scripts/process/retrievers.test.mjs` | new | T1–T7 | test-author: `isTest` (`.test.mjs`) |

- **Grant scope:** `pa3Grant()` applies only in a worktree matching `EZD-000[b-i]` (`guard-paths.mjs` line 46; Q-0128 (a)); `.claude/worktrees/EZD-000e` matches. None of the paths is a test, `vault/spec/`, `vault/PROCESS.md` or `scripts/gate.mjs`.
- **Test runner:** the root `test` script runs `node --test "scripts/**/*.test.mjs"` (root `package.json` line 11), so the gate runs the file. `scripts/process/` is the folder EZD-000b's test uses (EZD-000b plan contract).

Data: none. No tables, migrations, money or `schema_version`.

## 2. Sources

- `vault/handoff/PA3-MECHANISMS.md`: rules 1, 4, 5, 7; Item 4 (files, models, tools, contract, brief format, dispatchers, rule for dispatching agents, tests); Item 6 (pending file name, `REPORT:` first line, never read a report body); Findings row "Item 4 `Agent(...)`" (plain `Agent`; names ignored in subagent files); verification items 8, 9.
- `vault/PROCESS.md`: section 3 rule 15 (who may dispatch; retrievers dispatch nothing); section 4 roster rows retriever-digest and retriever-web (Haiku 5.5, medium, maxTurns 15, write `vault/research/pending/` only), "Models" (full IDs), "Retrievers" paragraph (rule text, brief format); section 10 "Dispatch rule" (reviewers get more only through a retriever; whole-read guard); section 14 Hooks (guard-reads denial carries the outline).
- `vault/tickets/phases/phase-00.md` lines 36–37. `vault/spec/acceptance-criteria.md` lines 93–97 (AC-EZD-000e-1 to -5 = DW-1 to DW-5, Q-0131 (a)). `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md` Part D, Part E, notes 2, 6, 8, 9.
- Questions: Q-0128 (a) builder grant; Q-0130 (a) and Q-0131 (a) (ACs regenerated from the Done-when); Q-0126 (c) ("not testable here" items go to PILOT.md; none expected here).
- Plans: `vault/plans/EZD-000d.md` C2 (pending front matter), step 2 (`FOR` → ticket, `SCOPE` → scope); `vault/plans/EZD-000b.md` step 4 and contract (`## Honesty` appended last in the three reviewer files; test folder `scripts/process/`); `vault/plans/EZD-000c.md` (guard-reads; no agent-file changes).
- Code at develop `2d8e927`: `.claude/agents/*.md` frontmatter (tools lines quoted in C4, C7); `.claude/skills/build-ticket/dispatch.md` (20 lines); `.claude/settings.json` env (depth `"1"`, concurrency `"3"`); `.claude/hooks/guard-paths.mjs` lines 8, 46–50, 83–87 (agent_type; PA3 grant; unknown agents may not write); root `package.json`.
- Re-validated at develop `e379241` (Stage 3 step 1, 2026-10-19). `git diff 2d8e927 e379241` is empty for every `.claude/agents/*.md` frontmatter, `dispatch.md` and `guard-paths.mjs`, so the `2d8e927` cites in C4, C6, C7, T4 and T7 still hold. The only agent-file change is EZD-000b's `## Honesty` section, appended last in `code-reviewer.md` (line 31), `security-reviewer.md` (line 26) and `phase-auditor.md` (line 25). `scripts/process/hidden-token-honesty.test.mjs` T7 ends that section at the next `## ` line (line 70), so C5 still fits. `settings.json` line 84 is still depth `"1"`. `.claude/hooks/guard-reads.mjs` (EZD-000c) denies an unranged Read of a file over `GUARD_WHOLE_READ_CHARS` and puts the outline in the denial, which step 1 relies on. `vault/tools/research.mjs` `parse()` (lines 10–24) requires `---` on line 1 and non-empty `title`, `scope`, `ticket`, which matches the C3 front matter.
- Lessons: L-002 (Files table checked against guard-paths.mjs; see section 1 Writer column).
- Product spec sections 03, 04, 11, non-goals, glossary, decisions and mockups: not applicable. Process tooling only: "No app code. No change to the product spec" (PA3-MECHANISMS.md header).
- Research reports: none exist. At `e379241`, `vault/research/` holds only `INDEX.md` (no `R-` lines) and an empty `pending/`, so no R-NNN covers this ticket.

**Differences between the handoff and PROCESS.md** (handoff rule 1; the builder repeats them in its report):
1. **maxTurns 15** comes from the PROCESS.md section 4 roster; Item 4 gives none (split proposal note 8).
2. **`Agent(retriever-digest, retriever-web)`** in Item 4 becomes a plain `Agent` (Findings row; ticket row). PROCESS.md section 4 says dispatch is "enforced by each agent file's `tools` line"; in subagent files that line can only grant or withhold `Agent`, so the "only retrievers" half is EZD-000f's.
3. **Spawn depth.** Item 4 and PROCESS.md section 14 set depth 2; this part keeps 1 (ticket row) and EZD-000f sets 2.

## 3. Interface contract

Frontmatter parsing (tests and code agree on this): line 1 of the file is exactly `---`; frontmatter is the lines up to the next line that is exactly `---`; each is `key: value`, split at the first `: `, value trimmed. `tools` is the value split at `,`, each entry trimmed. The **body** is everything after the closing `---`.

| # | Kind | Name or path | Details |
| --- | --- | --- | --- |
| C1 | file frontmatter | `.claude/agents/retriever-digest.md` | Exactly these keys in this order: `name: retriever-digest`; `description: ` + D1; `tools: Read, Grep, Glob, Write`; `model: claude-haiku-5-5`; `effort: medium`; `maxTurns: 15`. |
| C2 | file frontmatter | `.claude/agents/retriever-web.md` | Same keys and order: `name: retriever-web`; `description: ` + D2; `tools: WebSearch, WebFetch, Write`; `model: claude-haiku-5-5`; `effort: medium`; `maxTurns: 15`. |
| C3 | body | both retrievers | The body (everything after the closing `---` line's `\n`) is one empty line (`\n`) followed by that agent's body text below, exactly, ending in `\n`. Neither body contains `TaskCreate`, `TaskUpdate` or `TaskList` (EZD-000b T4). |
| C4 | frontmatter `tools` | the four dispatchers | Exactly: `planner.md` `Read, Grep, Glob, Write, Edit, Bash, Agent`; `code-reviewer.md`, `security-reviewer.md`, `phase-auditor.md` `Read, Grep, Glob, Bash, Agent`. Their `name`, `description`, `model`, `effort` and `maxTurns` lines are unchanged (planner opus/high/40; code-reviewer opus/high/30; security-reviewer opus/high/30; phase-auditor `claude-fable-5-1`/high/40). |
| C5 | body section | the four dispatchers | Appended at the end of the file: one blank line, the line `## Retrievers`, one blank line, the line R below, ending `\n`. Exactly one `## Retrievers` line per file. Every earlier line, including EZD-000b's `## Honesty` section in the three reviewer files, is unchanged. |
| C6 | text | `.claude/skills/build-ticket/dispatch.md` | After the current last line (line 20), one blank line, then line B1 below, one blank line, then the fenced block B2 below, ending `\n`. Lines 1–20 are unchanged. |
| C7 | invariant | every other `.claude/agents/*.md` | Every agent file other than the four in C4 has a `tools:` line (a missing line would inherit every tool, including `Agent`), and none of its entries is `Agent`, starts with `Agent(` or is `Task`. At `2d8e927` plus C1–C2 these are `builder`, `test-author`, `ui-verifier`, `calc-auditor`, `Explore`, `retriever-digest`, `retriever-web`. (`Task` is the earlier name of the spawn tool; build choice, a defensive check.) |
| C8 | test file | `scripts/process/retrievers.test.mjs` | Uses only `node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:url`. Root is `path.resolve(dirname(fileURLToPath(import.meta.url)), '../..')`, so it runs against the worktree. Every test title starts `EZD-000e`. |

**D1** (retriever-digest description): `Answers one question about documents in this repository (spec, plans, logs, lessons, research) in 40 lines at most, with path:line pointers. Writes a research report to vault/research/pending/ when the brief says REPORT: yes. Dispatched only by the orchestrator, planner, code-reviewer, security-reviewer and phase-auditor.`

**D2** (retriever-web description): `Answers one question about the outside world with WebSearch and WebFetch in 40 lines at most, with a URL for every statement. Writes a research report to vault/research/pending/ when the brief says REPORT: yes. Dispatched only by the orchestrator, planner, code-reviewer, security-reviewer and phase-auditor.`

**Body of `retriever-digest.md`** (C3), exactly:
~~~
You answer one question about documents in this repository (spec files, plans, logs, lessons, research reports) for the agent that briefed you. The only file you may write is a research report under `vault/research/pending/`.

The brief has six lines: `QUESTION`, `FOR` (the asking agent and ticket), `SCOPE` (the paths you may read), `CAP` (max lines), `REPORT` (yes or no) and `KNOWN` (what the asker already has; do not repeat it).

1. Read only inside SCOPE. Find the lines with Grep and Glob first, then Read only the ranges you need. A Read of a file over 20,000 characters without a range is denied with the file's outline; read the ranges it points to. Never read `.env` files.
2. Answer the question only: no preamble, no account of what you read, no advice. At most CAP lines and never more than 40. Back every statement with a `path:line` pointer. If SCOPE does not answer the question, say so in one line and name what you searched.
3. With `REPORT: yes`, write your findings with their pointers to `vault/research/pending/retriever-digest-<slug>.md` before you answer, where `<slug>` is two to five lowercase words from the question joined by hyphens. The file starts with this front matter:
```
---
title: <the question in a few words>
scope: <SCOPE from the brief>
ticket: <the ticket ID from FOR>
---
```
Then make `REPORT: pending/retriever-digest-<slug>.md` the first line of your answer. With `REPORT: no`, write nothing.
4. You dispatch no agents.
~~~

**Body of `retriever-web.md`** (C3), exactly:
~~~
You answer one question about the outside world (documentation, product pages, release notes, standards) for the agent that briefed you. The only file you may write is a research report under `vault/research/pending/`.

The brief has six lines: `QUESTION`, `FOR` (the asking agent and ticket), `SCOPE` (the sites you may use), `CAP` (max lines), `REPORT` (yes or no) and `KNOWN` (what the asker already has; do not repeat it).

1. Search and fetch only inside SCOPE. Never put a secret, token or key in a search or a URL.
2. Answer the question only: no preamble, no account of what you read, no advice. At most CAP lines and never more than 40. Back every statement with the URL of the page it comes from. If SCOPE does not answer the question, say so in one line and name what you searched.
3. With `REPORT: yes`, write your findings with their URLs to `vault/research/pending/retriever-web-<slug>.md` before you answer, where `<slug>` is two to five lowercase words from the question joined by hyphens. The file starts with this front matter:
```
---
title: <the question in a few words>
scope: <SCOPE from the brief>
ticket: <the ticket ID from FOR>
---
```
Then make `REPORT: pending/retriever-web-<slug>.md` the first line of your answer. With `REPORT: no`, write nothing.
4. You dispatch no agents.
~~~

**R** (C5, one line): ``A lookup that would pull more than about 30,000 tokens into your context, or that needs sifting (a long log, the whole spec, a web search), goes to a retriever through the Agent tool: `retriever-digest` for documents in this repository, `retriever-web` for the outside world. You get the answer, never the pages. One grep or one small file is fine inline. Brief it in the format in `.claude/skills/build-ticket/dispatch.md`. Dispatch no other agent (PROCESS.md section 3 rule 15). Never read a research report's body; cite its ID (R-NNN).``

**B1** (C6, one line): ``**Retriever brief** (PROCESS.md section 4): `QUESTION · FOR (agent and ticket) · SCOPE (paths or sites) · CAP (max lines) · REPORT yes|no · KNOWN (what the asker already has)`. Only the orchestrator, planner, code-reviewer, security-reviewer and phase-auditor dispatch `retriever-digest` (documents in this repository) or `retriever-web` (the outside world), with only these lines:``

**B2** (C6), exactly:
~~~
```
QUESTION: <one question>
FOR: <asking agent> · EZD-xxx
SCOPE: <paths or sites>
CAP: <max lines, 40 at most>
REPORT: yes | no
KNOWN: <what the asker already has>
```
~~~

## 4. Tests

All in `scripts/process/retrievers.test.mjs` (C8). Each reads repo files; no fixtures.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 AC-EZD-000e-1: retriever-digest frontmatter | AC-EZD-000e-1 | unit (repo files) | frontmatter of `.claude/agents/retriever-digest.md` | keys in order `name, description, tools, model, effort, maxTurns`; `name` `retriever-digest`; `description` = D1; `tools` = `['Read','Grep','Glob','Write']`; `model` `claude-haiku-5-5`; `effort` `medium`; `maxTurns` `15` | Done-when DW-1; Item 4; PROCESS.md section 4 roster (maxTurns 15) and "Models"; C1 |
| T2 AC-EZD-000e-1: retriever-web frontmatter | AC-EZD-000e-1 | unit (repo files) | frontmatter of `.claude/agents/retriever-web.md` | as T1 with `name` `retriever-web`, `description` = D2, `tools` = `['WebSearch','WebFetch','Write']` | Done-when DW-1; Item 4; C2 |
| T3 AC-EZD-000e-1: retriever bodies match the contract | AC-EZD-000e-1 (contract) | unit (repo files) | body of each retriever | equals its C3 body text exactly. For each `<a>` in the two names, the body contains `never more than 40`, `vault/research/pending/<a>-<slug>.md`, `REPORT: pending/<a>-<slug>.md` and the five-line front-matter block (`---`, `title: …`, `scope: …`, `ticket: …`, `---`); retriever-digest's contains `path:line` | Item 4 contract (answer only, 40 lines, pointers); Item 6 (pending name, `REPORT:` first line); EZD-000d C2 (keys `title`, `scope`, `ticket`); C3 |
| T4 AC-EZD-000e-2: dispatchers hold Agent as last tool | AC-EZD-000e-2 | unit (repo files) | frontmatter of the four dispatchers | `tools` lists equal C4 exactly (each holds `Agent` once, as its last entry); `name`, `model`, `effort`, `maxTurns` equal C4's values | Done-when DW-2; Findings row Item 4 (plain `Agent`); PROCESS.md rule 15; `2d8e927` frontmatter |
| T5 AC-EZD-000e-2: dispatchers carry the retriever rule | AC-EZD-000e-2 | unit (repo files) | body of the four dispatchers | exactly one line `## Retrievers`; the next non-empty line equals R | Done-when DW-2 "the retriever rule"; Item 4 "Rule for the dispatching agents"; PROCESS.md section 4 "Retrievers"; C5 |
| T6 AC-EZD-000e-3: no other agent has an Agent tool | AC-EZD-000e-3 | unit (repo files) | every `.claude/agents/*.md` except the four dispatchers | the checked set includes `builder`, `test-author`, `ui-verifier`, `calc-auditor`, `Explore`, `retriever-digest`, `retriever-web` (by file name, so the test cannot pass on an empty set); each has a `tools:` line; no entry is `Agent`, starts with `Agent(` or is `Task`; on failure, names the file | Done-when DW-3; Item 4 "Tests: a dispatch from the builder agent file has no `Agent` tool (inspect the frontmatter)"; PROCESS.md rule 15; C7 |
| T7 AC-EZD-000e-4: dispatch.md holds the retriever brief format | AC-EZD-000e-4 | unit (repo files) | `.claude/skills/build-ticket/dispatch.md` | lines 1–20 equal the `2d8e927` text (the test holds them); then a blank line, B1, a blank line, and B2's eight lines in order | Done-when DW-4; Scope ("… is added to dispatch.md"); Item 4 brief format; PROCESS.md section 4 (B1's quoted format verbatim); C6 |

Notes:
- **Before the build,** T1–T7 fail for the right reason: the retriever files, the `Agent` entries, the `## Retrievers` sections and the brief are missing. T6 fails only because the two retriever files are missing (the other five already pass).
- **Not tested, checked by review:** the Scope clause "Spawn depth stays at 1 in this part" (no AC ID): the code-reviewer confirms `git diff develop...HEAD -- .claude/settings.json` is empty (step 5). AC-EZD-000e-5 (DW-5) is the gate itself.
- **Earlier tests stay green:** EZD-000b's T4 (no TaskCreate/TaskUpdate/TaskList under `.claude/agents/`) holds, since neither body names them; EZD-000b's T7 (`## Honesty` section holds the three rules up to the next `## ` line) holds, since `## Retrievers` is appended after it. `scripts/hooks/guard-paths.test.mjs` is unchanged.

## 5. Visual checklist
None (no screen changes).

## 6. Proposed wording
None. No app or user-interface text is added. The agent bodies, descriptions, the rule R and the brief B1–B2 are process text for agents, not product text (PROCESS.md section 3a covers user-visible app text). They follow Item 4 and PROCESS.md section 4 wording; Josh can still change them at Stage 2.

## 7. Security review
security-review: no. Agent configuration only: no auth, permissions on data, data access, money, API or migrations, and no secrets read (split proposal Part D).

Reviewers needed:
- **code-reviewer:** yes, Opus 5.5 high (PA3-MECHANISMS.md rule 5). Check that no agent outside the four gained `Agent`, that the depth setting is untouched (step 5), that the reviewers' frontmatter and `## Honesty` sections are otherwise unchanged, and that retriever-web's body forbids secrets in queries (CLAUDE.md rule 8).
- **calc-auditor:** no.
- **ui-verifier:** no.
- **security-reviewer:** no.

## 8. Complexity and model recommendation
Medium. The edits are text with a complete contract, but they change the tools and prompts of agents every unit dispatches, and a wrong `tools` line either blocks a reviewer or lets the builder spawn agents. Test-author: Sonnet 5.5, medium effort. Builder: Sonnet 5.5, medium effort (PA3-MECHANISMS.md rule 5; STATUS.md row notes).

## 9. Dependencies
- **EZD-000d** (done, `ffa76d7`; Q-0130 answered (a)). Defines the pending report format (C2) and `vault/research/pending/`; the retriever bodies match it. Its recorded deviations do not touch this plan: (a) the `realpathSync` CLI entry check (`research.mjs` line 72) changes only how the CLI detects that it is being run directly, not the pending format; (b) the CLAUDE.md row wording is in a file this ticket does not edit.
- **EZD-000c** (done), through EZD-000d. Its guard-reads denial carries the outline that retriever-digest relies on (step 1).
- **EZD-000b** (done), through EZD-000c. Adds `## Honesty` at the end of the three reviewer files; C5 appends after it.
- **EZD-000** (done).
- No missing dependency. No screen, so EZD-016a is not needed. The builder grant already covers `.claude/` (`guard-paths.mjs` `pa3Grant`).
- **Dependent:** EZD-000f sets depth 2, limits nested spawns to the retrievers, and gives the retrievers their `vault/research/pending/` write limit; it reports verification items 8 and 9.

Risks:
- **Window before EZD-000f.** Until EZD-000f merges, `guard-paths.mjs` denies every write by an agent not in its list (line 87), so a retriever briefed `REPORT: yes` cannot write its report; it can still answer. And a planner or code-reviewer run by the launcher as the main agent (`--agent`) has a plain `Agent` tool at depth 0, so only its prompt (R: "Dispatch no other agent") limits it to retrievers. EZD-000f's planner should brief retrievers with `REPORT: no` (split proposal note 6 expects a `REPORT: yes` lookup, which the guard would deny until EZD-000f itself merges).
- **Web content.** retriever-web brings page text into a pending report that later plans cite; reviewers read the report ID only (R), not its body.

## 10. Open questions
- **Q-0131 (answered-agent, orchestrator):** (a) same `gen_acs.mjs` fault and fix as Q-0130; regenerated, EZD-000e now has AC-EZD-000e-1 to -5 = DW-1 to DW-5, and section 4 cites those IDs.

No open questions remain.
