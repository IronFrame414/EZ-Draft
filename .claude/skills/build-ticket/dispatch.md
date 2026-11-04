# Dispatch template (PROCESS.md section 10, context diet)

Every subagent dispatch contains only the lines below. Nothing else: no spec text pasted in, no whole files, no history. The agent reads the paths it is given. Fill `<areas>` from the plan (for example `auth, api, data-model`); get the lessons with `node vault/tools/next_ticket.mjs --lessons <role> <areas>` and paste only its output.

```
Ticket: EZD-xxx · Role: <test-author | builder | code-reviewer (mode N) | ui-verifier | security-reviewer | calc-auditor | planner (re-validation)>
Plan: vault/plans/EZD-xxx.md
Worktree: <absolute path> (use absolute paths inside it)
Spec files: <the files the plan's Sources section cites>
Decisions: <vault/spec/decisions/<area>.md files the plan cites; Q-IDs>
Architecture: <the Architecture line of next_ticket.mjs --reads, as printed; the agent runs it from the worktree root>
Gate summary: <paste the GATE SUMMARY block and SECURITY FLAG lines; reviewers only>
Gate failures: <worktree>/gate-failures.log (never gate.log); red-gate rounds and reviewers
Findings to address: <numbered findings from the last review; retries only. When --dispatch says orchestratorAdvice: true, add a block "Advice (orchestrator's advisor):" with the advice you got (Q-0333 (c))>
Lessons:
<output of next_ticket.mjs --lessons <role> <areas>, or "(none)">
Report format: 20 lines max. First line PASS, FAIL or STATUS: <one line>. Then file paths and findings, numbered. No code.
```

Model and effort go on the dispatch call itself (`model`, `effort`), taken from `node vault/tools/next_ticket.mjs --dispatch <ticket> <role> [--round N]` (PROCESS.md section 4, v2.4), never set by the agent.

Reviewers get the plan, the diff (they run `git -C <worktree> diff develop...HEAD` themselves) and the gate summary, not the whole repository. phase-auditor (gate-phase unit) gets the phase diff range, the plan paths, `vault/tickets/TRACE.md` and the phase's spec files.

**Plan-checker dispatch** (EZD-245). Only the planner dispatches `plan-checker`, with:

```
<the output of: node vault/tools/next_ticket.mjs --reads EZD-xxx plan-checker>
Report format: 15 lines max, no code. First line READY or GAPS: <n>. Then one numbered line per gap: <step, section or L-n> · <what is undecided or lacking> · <the options you see>.
```

**Retriever brief** (PROCESS.md section 4): `QUESTION · FOR (agent and ticket) · SCOPE (paths or sites) · CAP (max lines) · REPORT yes|no · KNOWN (what the asker already has)`. Only the orchestrator, planner, code-reviewer, security-reviewer and phase-auditor dispatch `retriever-digest` (documents in this repository) or `retriever-web` (the outside world), with only these lines:

```
QUESTION: <one question>
FOR: <asking agent> · EZD-xxx
SCOPE: <paths or sites>
CAP: <max lines, 40 at most>
REPORT: yes | no
KNOWN: <what the asker already has>
```

## Batch review dispatch

A review batch (build-ticket SKILL.md, Review batch (medium)) gets one reviewer dispatch for all its members, in this form:

```
Batch: <EZD-a>, <EZD-b>[, <EZD-c>] · Role: <code-reviewer (mode 3) | security-reviewer>
--- <EZD-a>
<every line of the single-ticket template between its Ticket: line and Lessons:, filled for EZD-a>
--- <EZD-b>
<the same for EZD-b; then EZD-c>
Lessons:
<output of next_ticket.mjs --lessons <role> <every member's areas, each once>, or "(none)">
Report format: one block per ticket, in the order above, each starting VERDICT <ticket>: PASS (zero findings) or VERDICT <ticket>: FAIL, then that ticket's numbered findings; 20 lines max per ticket. No code.
```

Each member block keeps its own `--reads <member> <role>` lines.
