# EZD-000f · Retriever spawn limits (Item 4, enforcement)

- **ACs:** AC-EZD-000f-1 to AC-EZD-000f-7 (`vault/spec/acceptance-criteria.md` lines 98–104). They were generated from the Done-when text and match it clause by clause, so there is no AC defect of the Q-0130 / Q-0131 kind here.
- **Complexity:** medium (reasoning in section 8).
- **User-visible result:** only the planner and the three reviewers can start a helper agent, and only one of the two cheap Haiku "retrievers". The builder and the other agents cannot start any agent, and retrievers can write only their report files. The main session can still start every agent.
- Phase: 0 · Planned by: planner · Date: 2026-10-19 · Status: ready

This is Part E of the EZD-000b split. The proposal is archived at `vault/handoff/log/EZD-000b-split-proposal-2026-10-19.md` (Part E and note 6).

## 1. What to build

Ticket row (`vault/tickets/phases/phase-00.md` line 37):
- **Scope:** Make sure that a nested spawn can reach only a retriever, that only the four dispatching agents can spawn at all, and that retrievers spawn nothing (PROCESS.md section 3 rule 15). Set env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "2"` in `.claude/settings.json`; `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` stays "3" (PROCESS.md section 11 Spend discipline). `guard-paths.mjs` gains the retrievers' write limit: `vault/research/pending/` only (PROCESS.md section 4 roster). Today the guard denies any agent not in its list. The enforcement mechanism is the part planner's choice; see note 6. Split of EZD-000b (Q-0010 flow). Builder write grant per PA3-MECHANISMS.md rule 7 and Q-0128.
- **Done when:** a subagent spawn requested by builder, test-author or ui-verifier is denied; one requested by the planner or a reviewer for an agent other than retriever-digest or retriever-web is denied; one requested by a retriever is denied; the planner's spawn of retriever-digest and the main session's spawn of any agent are allowed; a retriever may write only under `vault/research/pending/`; settings env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is "2" and `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` is "3". Verification items 8 and 9 are reported (verified, failed or not testable here) and the gate is green.
- **Depends on:** EZD-000e · **Spec ref:** PA3-MECHANISMS.md Item 4 and Findings; PROCESS.md v2.3 sections 3, 4, 11, 14.

### Mechanism (note 6 decided): a PreToolUse hook on the spawn tool, not settings deny rules

- **Deny rules cannot meet AC-4.** A settings rule `"deny": ["Agent(builder)"]` has the form `Tool(specifier)` and carries no condition on the calling agent; the `permissions.deny` list in `.claude/settings.json` has only that form. A deny for `builder`, `planner` and so on would therefore also stop the main session (the orchestrator) from dispatching them. AC-4 requires "the main session's spawn of any agent" to be allowed. Split proposal note 6 raises the same doubt.
- **`Agent(names)` in agent files does not limit targets.** The names are ignored in `.claude/agents/` files (PA3-MECHANISMS.md Findings, Item 4 row). EZD-000e therefore gives the four dispatchers a plain `Agent` tool (EZD-000e plan C4).
- **A hook can tell callers apart.** guard-paths.mjs already keys its rules on `input.agent_type` and treats a missing value as the main session (`.claude/hooks/guard-paths.mjs` line 8). Two facts were checked this session in the installed Claude Code 2.1.303 binary (`~/.local/share/claude/versions/2.1.303`, read with `strings | grep`, as the PA3-MECHANISMS.md Findings were):
  - **The caller's type.** The common hook input is built as `{ session_id, …, permission_mode, agent_id, agent_type: s?.agentType ?? pk(), effort }`, and `pk()` returns `mainThreadAgentType`. So `agent_type` is the subagent's name inside a subagent, the `--agent` name for a main session started that way (the launcher's `plan` and `review-plans` units, `scripts/run.mjs` line 135), and absent for a plain main session.
  - **The tool and its target.** The spawn tool is named `Agent` (`var ht="Agent"`). Its input field `tool_input.subagent_type` is what a hook reads ("a hook that means to allow web fetching can exempt tool_input.subagent_type == …").
- **Retrievers spawn nothing.** That is three locks deep: no `Agent` tool (EZD-000e C1, C2), the depth limit, and this hook.

Steps:
1. **New hook `.claude/hooks/guard-agents.mjs`** (contract C1–C3). A PreToolUse hook on the spawn tool. Its decision table:
   - No caller type (the main session): allow.
   - The caller is one of the four dispatchers and the target is a retriever: allow.
   - Anything else: deny.

   Sources: PROCESS.md section 3 rule 15 ("the planner, code-reviewer, security-reviewer and phase-auditor may dispatch a retriever … retrievers dispatch nothing. Everything else fans out only from the orchestrator"); section 4 Retrievers paragraph.

   It uses `readInput` and `deny` from `.claude/hooks/lib.mjs`, as guard-paths.mjs does. With malformed stdin, `readInput()` returns `{}`, the caller type is missing, and the hook allows. That is the same fail-open stance as guard-paths.mjs line 8 and EZD-000c C4, so a broken hook cannot block the orchestrator (PA3-MECHANISMS.md rule 5, the failure mode where the tooling blocks a legitimate run).
2. **Register the hook** in `.claude/settings.json` (C4): one `PreToolUse` entry, matcher `Agent|Task`, added after the existing entries.
   - `Agent` is the 2.1.303 tool name.
   - `Task` is its earlier name. EZD-000e C7 checks it the same defensive way (a build choice).
3. **Depth 2** (C4): in `.claude/settings.json`, change env `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` from `"1"` to `"2"`. This allows orchestrator → planner or reviewer → retriever (PROCESS.md section 11 Spend discipline; section 14 Settings; PA3-MECHANISMS.md Item 4 "Spawn depth"). `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` stays `"3"` (same sources). Every other key stays as EZD-000b and EZD-000c leave it.
4. **Retriever write limit in `guard-paths.mjs`** (C5). Add rules for `retriever-digest` and `retriever-web`: deny unless the repo-relative path starts with `vault/research/pending/` (PROCESS.md section 4 roster "Can write: `vault/research/pending/` only"; PA3-MECHANISMS.md Item 6 file name `vault/research/pending/<agent>-<slug>.md`).
   - **Earlier checks keep precedence.** The rule sits in the `rules` object, so the `.env` and Josh-only checks still run first.
   - **Main checkout and worktrees alike.** `repoRelative` (`.claude/hooks/lib.mjs` lines 11–19) maps a ticket-worktree path to the same relative path as the main checkout, like every other agent's limit in the guard.
   - **Path tricks.** `path.resolve` normalizes `..` before the prefix test.
5. **Update two earlier tests' depth value** (test-author; C7). Two earlier plans pinned the then-current depth `"1"`, each noting that it stays 1 until EZD-000f:
   - EZD-000b T3 in `scripts/process/hidden-token-honesty.test.mjs`;
   - EZD-000c T10 in `scripts/hooks/guard-reads.test.mjs`.

   The test-author changes only that expected value to `"2"`. The source of the new value is this ticket row and PROCESS.md sections 11 and 14. If either file pins the number of `PreToolUse` entries, that count also goes up by one (C4 adds one). No other assertion, input or test count changes; the code-reviewer confirms this from the diff. EZD-000e deliberately did not pin depth (EZD-000e plan step 5), so its tests are untouched.
6. **New test file** `scripts/hooks/spawn-limits.test.mjs` (T1–T8). It uses the spawn-the-hook pattern of `scripts/hooks/guard-paths.test.mjs`.
7. **Verification items 8 and 9** (AC-7; PA3-MECHANISMS.md rule 6). The builder reports each one in two halves.
   - **Decision logic: verified by the tests.**
     - Item 8: T1, T3 and T4 cover the hook's decisions.
     - Item 9: T8 shows the guard lets a retriever write its pending file and `adopt()` (EZD-000d C1) adopts a file in the retriever's format.
   - **Live half: "not testable here".**
     - Reason: the builder cannot start a session (`.claude/settings.json` denies `Bash(claude *)`, and guard-bash.mjs blocks nested sessions). Also, a running session loads hooks from the main checkout, not the worktree (EZD-000c plan step 3).
     - What happens next: the orchestrator adds the live halves to `vault/handoff/PILOT.md` when this ticket merges (Q-0126 (c)), so EZD-001 checks them end to end.
8. **Gate:** `node scripts/gate.mjs <worktree>` (CLAUDE.md rule 12). The root `test` script runs `node --test "scripts/**/*.test.mjs"` (root `package.json`), so the gate runs the new and changed test files.

| Path | New / change | Why | Writer (L-002 check against guard-paths.mjs) |
| --- | --- | --- | --- |
| `.claude/hooks/guard-agents.mjs` | new | Step 1 | builder: `pa3Grant()` (`.claude/`, worktree `EZD-000f` matches `EZD-000[b-i]`, guard-paths.mjs line 46) |
| `.claude/settings.json` | change | Steps 2, 3 | builder: same |
| `.claude/hooks/guard-paths.mjs` | change | Step 4 | builder: same |
| `scripts/hooks/spawn-limits.test.mjs` | new | T1–T8 | test-author: `isTest` (`.test.mjs`, line 16) |
| `scripts/process/hidden-token-honesty.test.mjs` | change (one expected value) | Step 5 | test-author: `isTest` |
| `scripts/hooks/guard-reads.test.mjs` | change (one expected value, plus an entry count if pinned) | Step 5 | test-author: `isTest` |

Data: none. No tables, migrations, money or `schema_version`.

## 2. Sources

- `vault/handoff/PA3-MECHANISMS.md`, the handoff:
  - rules 1, 5, 6, 7;
  - Item 4 ("Who may dispatch them", "Spawn depth", "Tests");
  - Item 6 (pending file name);
  - Findings rows for Item 4 (`Agent(...)` does not work as written; deny rules are the only documented form) and for spawn depth and concurrency (confirmed names);
  - verification items 8 and 9.
- `vault/PROCESS.md` v2.3:
  - section 3 rule 15;
  - section 4: roster rows for retriever-digest and retriever-web ("`vault/research/pending/` only"), the "Retrievers" paragraph;
  - section 11 Spend discipline (concurrency 3, depth 2);
  - section 14 Settings (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`) and Hooks.
- `vault/tickets/phases/phase-00.md` line 37. `vault/spec/acceptance-criteria.md` lines 98–104. Split proposal Part E and notes 2 and 6.
- Questions:
  - Q-0126 (c): items that are "not testable here" go to PILOT.md.
  - Q-0128 (a): the builder grant.
  - Q-0125 (a): fix mode, not used here.
  - Q-0132 (a): PROCESS.md edit naming guard-agents, proposed to Josh by the orchestrator.
- Plans:
  - `vault/plans/EZD-000e.md`: C1, C2 (retrievers have no `Agent`), C4 (plain `Agent` on the four dispatchers), C7 (`Task` as the earlier tool name), step 5 (depth left at 1 for this ticket), risk "Window before EZD-000f".
  - `vault/plans/EZD-000d.md`: C1 `adopt(researchDir, date)`, C2 (pending format), C6 (`INDEX.md` header).
  - `vault/plans/EZD-000c.md`: C4 (fail-open hook), C10 and T10 (settings; depth pinned at `"1"`), step 3 (live session not testable).
  - `vault/plans/EZD-000b.md`: contract and T3 (depth pinned at `"1"`), test folder `scripts/process/`.
- Code at develop `0055b60`:
  - `.claude/hooks/guard-paths.mjs` lines 8, 43–51, 53–87;
  - `.claude/hooks/lib.mjs` (`readInput`, `repoRelative`, `deny`);
  - `.claude/settings.json` (env depth `"1"`, concurrency `"3"`; `PreToolUse` entries; `Bash(claude *)` deny);
  - `scripts/hooks/guard-paths.test.mjs` (test pattern);
  - `scripts/run.mjs` line 135 (`--agent`).
- Installed binary `~/.local/share/claude/versions/2.1.303`: the hook input builder (`agent_type: s?.agentType ?? pk()`, `pk()` = `mainThreadAgentType`), the tool name `Agent`, and `tool_input.subagent_type` (section 1, Mechanism).
- Lessons: L-002 (Files table checked against guard-paths.mjs; see the Writer column).
- Product spec sections 03, 04 and 11, non-goals, glossary, decisions and mockups: not applicable. This is process tooling only ("No app code. No change to the product spec", PA3-MECHANISMS.md header).
- Research reports: none exist (`vault/research/` is absent at `0055b60`), so no R-NNN covers this ticket. Split proposal note 6 expected a `retriever-web` lookup; retrievers do not exist until EZD-000e merges, so the binary check above replaced it.

**Differences between the handoff and PROCESS.md** (handoff rule 1; the builder repeats them in its report):
1. Item 4 and PROCESS.md section 4 say the `tools` lines enforce who may dispatch. In subagent files they can only grant or withhold `Agent` (Findings), so the "only retrievers" half is enforced by guard-agents.mjs (Q-0132 (a): the orchestrator proposes the PROCESS.md edit to Josh).
2. The Findings propose settings deny rules. This plan uses a hook instead, because deny rules would also block the main session (AC-4).

## 3. Interface contract

| # | Kind | Name or path | Details |
| --- | --- | --- | --- |
| C1 | hook | `.claude/hooks/guard-agents.mjs` | **Imports:** `readInput`, `deny` from `./lib.mjs` only. **Stdin:** the PreToolUse JSON `{ tool_name, tool_input: { subagent_type, … }, agent_type?, cwd }`. **Allow:** exit 0 with empty stdout. **Deny:** `deny(reason)` from `lib.mjs` (stdout JSON with `permissionDecision: "deny"`), exit 0. Never exits 2. |
| C2 | logic | same | Constants `DISPATCHERS = ['planner', 'code-reviewer', 'security-reviewer', 'phase-auditor']`, `RETRIEVERS = ['retriever-digest', 'retriever-web']`. In order: (1) `tool_name` not `Agent` and not `Task` → allow. (2) `agent_type` missing or empty string → allow (main session). (3) `agent_type` not in DISPATCHERS → deny with D1. (4) `tool_input?.subagent_type` not in RETRIEVERS (missing counts as not in) → deny with D2. (5) allow. Names compare exactly (case-sensitive). |
| C3 | text | deny reasons | **D1:** `` `${caller} may not start other agents. Only the planner, code-reviewer, security-reviewer and phase-auditor may, and only retriever-digest or retriever-web (vault/PROCESS.md section 3 rule 15).` `` **D2:** `` `${caller} may start only retriever-digest or retriever-web, not ${target \|\| 'an agent with no subagent_type'} (vault/PROCESS.md section 3 rule 15).` `` where `caller` = `agent_type`, `target` = `tool_input?.subagent_type`. |
| C4 | file | `.claude/settings.json` | Valid JSON. `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH === "2"`; `env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS === "3"`. `hooks.PreToolUse` has exactly one entry whose `hooks[].args` contains a string ending `/.claude/hooks/guard-agents.mjs`; it is the last entry and equals `{ "matcher": "Agent\|Task", "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/guard-agents.mjs"] }] }`. Every other key, value and hook entry is unchanged from EZD-000e's merge (including EZD-000b's switches and env, EZD-000c's guard-reads entry and env). |
| C5 | logic | `.claude/hooks/guard-paths.mjs` | One function `retriever` added and registered as `rules['retriever-digest']` and `rules['retriever-web']`: returns D3 unless `rel.startsWith('vault/research/pending/')`. D3: `Retrievers write only research reports under vault/research/pending/ (vault/PROCESS.md section 4 roster).` One comment line above it citing PROCESS.md section 4 and EZD-000f. No other line changes; the `readOnly` list, the PA3 grant and the unknown-agent deny (line 87) stay. |
| C6 | test file | `scripts/hooks/spawn-limits.test.mjs` | Uses only `node:test`, `node:assert/strict`, `node:child_process`, `node:fs`, `node:os`, `node:path`, `node:url`. Root is `path.resolve(dirname(fileURLToPath(import.meta.url)), '../..')`. Hooks run with `spawnSync('node', [hook], { input: JSON.stringify(...), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' })`; a result is `deny` when stdout contains `"deny"`, else `allow` (as `guard-paths.test.mjs`). Spawn input: `{ tool_name: 'Agent', agent_type: <caller>, tool_input: { subagent_type: <target>, description: 't', prompt: 't' }, cwd: root }`; "main session" omits the `agent_type` key; "no target" omits `subagent_type`. Write input as `guard-paths.test.mjs` `decide()`. Every test title starts `EZD-000f`. |
| C7 | test edits | `scripts/process/hidden-token-honesty.test.mjs` (EZD-000b T3), `scripts/hooks/guard-reads.test.mjs` (EZD-000c T10) | The `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` expected value `"1"` becomes `"2"`; a pinned `PreToolUse` entry count, if any, rises by 1. Nothing else changes. |

## 4. Tests

All new tests are in `scripts/hooks/spawn-limits.test.mjs` (C6). Every "deny" also checks that stdout parses as JSON with `hookSpecificOutput.permissionDecision === 'deny'`.

| Test | AC | Type | Input | Expected value | Source of the expected value |
| --- | --- | --- | --- | --- | --- |
| T1 | AC-EZD-000f-1 | unit (hook) | guard-agents: caller `builder`, `test-author`, `ui-verifier`, each with target `retriever-digest`, `retriever-web` and `builder` | all deny | Done-when clause 1; PROCESS.md rule 15 ("Everything else fans out only from the orchestrator"); section 4 Retrievers ("the builder, test-author and ui-verifier have no `Agent` tool") |
| T2 | AC-EZD-000f-2 | unit (hook) | caller each of `planner`, `code-reviewer`, `security-reviewer`, `phase-auditor` with target `builder`, `test-author`, `planner`, `Explore`, `general-purpose`, and no target | all deny | Done-when clause 2; PROCESS.md rule 15 ("may dispatch a retriever"); Item 4 |
| T3 | AC-EZD-000f-3 | unit (hook) | caller `retriever-digest` and `retriever-web`, each with target `retriever-digest`, `retriever-web`, `builder` | all deny | Done-when clause 3; PROCESS.md rule 15 ("retrievers dispatch nothing") |
| T4 | AC-EZD-000f-4 | unit (hook) | (a) caller `planner`, target `retriever-digest`; (b) each of the four dispatchers with `retriever-digest` and with `retriever-web`; (c) main session (no `agent_type`) with targets `builder`, `test-author`, `planner`, `code-reviewer`, `ui-verifier`, `Explore`, `retriever-web`, `general-purpose`; (d) caller `builder` with `tool_name: 'Read'`; (e) stdin `not json` | all allow | Done-when clause 4; PROCESS.md rule 15 and section 4; C2 steps 1–2 (non-spawn tools and unreadable input pass, fail-open as guard-paths.mjs line 8 and EZD-000c C4) |
| T5 | AC-EZD-000f-1 (Scope: "only the four dispatching agents can spawn at all") | unit (hook) | caller `calc-auditor`, `Explore`, `general-purpose`, `Planner` (wrong case), each with target `retriever-digest` | all deny | Ticket Scope sentence 1; PROCESS.md rule 15 (the four named dispatchers only); C2 (exact names) |
| T6 | AC-EZD-000f-5 | unit (guard-paths) | agent `retriever-digest` and `retriever-web` writing (a) `vault/research/pending/retriever-digest-spawn-limits.md`, (b) `.claude/worktrees/EZD-001/vault/research/pending/retriever-web-x.md`; then (c) `vault/research/INDEX.md`, `vault/research/R-001.md`, `vault/research/pending/../INDEX.md`, `vault/plans/EZD-000f.md`, `CLAUDE.md`, `.claude/settings.json`, `app/src/x.ts`, `.env.local` | (a), (b) allow; every (c) path deny | Done-when clause 5; PROCESS.md section 4 roster ("`vault/research/pending/` only"); Item 6 file name; `lib.mjs` `repoRelative` (worktree path maps to the same relative path) |
| T7 | AC-EZD-000f-6 | unit (repo file) | parse `.claude/settings.json` | `env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH === "2"`; `env.CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS === "3"`; exactly one `PreToolUse` entry runs a path ending `/.claude/hooks/guard-agents.mjs`, it is the last entry, and its matcher as `new RegExp('^(?:' + m + ')$')` matches `Agent` and `Task` and not `Read`, `Bash`, `Write` or `Edit` | Done-when clause 6; PROCESS.md section 11 Spend discipline and section 14 Settings; C4 |
| T8 | AC-EZD-000f-7 (verification item 9, local half) | unit (guard + adopt) | (1) guard-paths decision for `retriever-digest` writing `vault/research/pending/retriever-digest-spawn-limits.md`; (2) in a temp dir (`fs.mkdtempSync`), `research/INDEX.md` = the four lines of EZD-000d C6 and `research/pending/retriever-digest-spawn-limits.md` with front matter `title: spawn limits`, `scope: .claude/hooks/`, `ticket: EZD-000f` (EZD-000e C3 format), then `adopt(<tmp>/research, '2026-10-19')` imported from `vault/tools/research.mjs` | (1) allow; (2) returns `{ ids: ['R-001'], skipped: [] }`, `pending/` has no `.md` left, `INDEX.md` gains exactly one line, `R-001 \| 2026-10-19 \| spawn limits \| .claude/hooks/ \| EZD-000f` | Item 6; verification item 9; EZD-000d C1 (next number = 1 + largest; none → 1; format), C2, C6; EZD-000e C3 (retriever front matter) |

Notes:
- **Before the build,** the tests fail for the right reason:
  - T1–T5 fail because `guard-agents.mjs` does not exist (spawnSync exits non-zero with no deny, so the deny rows fail). The T4 allow rows pass trivially until then. T4 still has a purpose: it pins that the hook never blocks the main session.
  - T6 (a), (b) fail because guard-paths.mjs denies unknown agents (line 87).
  - T7 fails on depth `"1"` and the missing hook entry.
  - T8 (1) fails; T8 (2) passes once EZD-000d has merged.
- **Item 8, local half,** is T1 + T3 + T4 (a). The builder reports both halves of items 8 and 9 as section 1 step 7 says.
- **Not tested, by design:** the live behaviour of the depth limit and of the hook inside a real nested session (not testable here; goes to PILOT.md per Q-0126 (c)). AC-7's "gate is green" is the gate itself.
- **Earlier tests:**
  - EZD-000b T3 and EZD-000c T10 change as C7 says.
  - `scripts/hooks/guard-paths.test.mjs` is unchanged and stays green: no rule for builder or test-author changes.
  - EZD-000e's T1–T7 do not read settings or hooks.

## 5. Visual checklist
None (no screen changes).

## 6. Proposed wording
None. The deny reasons D1–D3 are messages to agents, not app text (PROCESS.md section 3a covers user-visible app text). They follow the style of the existing guard-paths.mjs reasons, and Josh can still change them at Stage 2.

## 7. Security review
security-review: no. This is agent tooling: no app auth, data permissions, data access, money, API or migrations, and no secrets are read (split proposal Part E).

Reviewers needed:
- **code-reviewer:** yes, Opus 5.5 high (PA3-MECHANISMS.md rule 5).
  - **Failure-mode check (split proposal, reviewers note).** The hook must never block the main session: no `agent_type` → allow, and unreadable input → allow.
  - **The launcher's runs as agents.** The `plan` unit runs as `planner` and the `review-plans` unit as `code-reviewer`. They may still spawn retrievers, and they never need any other agent.
  - **guard-paths.mjs diff.** It only adds the retriever rule.
  - **The two earlier test edits.** They change only the depth value (and an entry count if pinned).
- **calc-auditor:** no.
- **ui-verifier:** no.
- **security-reviewer:** no.

## 8. Complexity and model recommendation
Medium. The code is small and the contract is complete. But the hook runs on every agent spawn in every later unit, so a wrong decision either lets the builder fan out or blocks the orchestrator's dispatches. Test-author: Sonnet 5.5, medium effort. Builder: Sonnet 5.5, medium effort (PA3-MECHANISMS.md rule 5; STATUS.md row notes).

## 9. Dependencies

From the ticket row:
- **EZD-000e** (ready; Q-0131 answered (a)). It creates the retriever agent files and the plain `Agent` tool on the four dispatchers. The names in C2 match its C1, C2 and C4.

Not in the ticket row, reached through the chain:
- **EZD-000d** (ready; Q-0130 answered (a)). It provides `adopt()` and the pending format used by T8.
- **EZD-000c** (planned). It adds the guard-reads entry and env that C4 keeps, and owns T10, edited in C7.
- **EZD-000b** (planned). It adds the switches and env that C4 keeps, and owns T3, edited in C7.
- **EZD-000** (done).

No missing dependency: all of the above are already in the chain. There is no screen, so EZD-016a is not needed.

Dependents:
- EZD-000g (next in the chain).
- EZD-001 (pilot). PILOT.md gains the live halves of items 8 and 9 (Q-0126 (c)).

Risks:
- **Runs that rely on spawning.** From the merge on, every unit's spawns go through the hook. If a later Claude Code release renames the tool or stops sending `agent_type`, the hook allows everything (fail-open), so it never blocks the orchestrator, but the limit lapses silently. The pilot's live check (item 8) is the detector.
- **Reports written in a worktree.** A retriever dispatched by a reviewer can write to a worktree's `vault/research/pending/`, and the guard allows this by the `repoRelative` design. The squash merge then brings the file to develop, where the next `adopt` run picks it up. Nothing is lost, but the report rides in the ticket's commit.

## 10. Open questions
- **Q-0132 (answered-agent, orchestrator):** (a) the orchestrator proposes to Josh, in phase-00-for-josh.md section 2, the two-line PROCESS.md edit (section 14 Hooks names `guard-agents`; section 4 points to it), applied when he confirms. EZD-000f builds the same either way, so the plan does not change.

No open questions remain.
