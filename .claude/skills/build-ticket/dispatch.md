# Dispatch template (PROCESS.md section 10, context diet)

Every subagent dispatch contains only the lines below. Nothing else: no spec text pasted in, no whole files, no history. The agent reads the paths it is given. Fill `<areas>` from the plan (for example `auth, api, data-model`); get the lessons with `node vault/tools/next_ticket.mjs --lessons <role> <areas>` and paste only its output.

```
Ticket: EZD-xxx · Role: <test-author | builder | code-reviewer (mode N) | ui-verifier | security-reviewer | calc-auditor | planner (re-validation)>
Plan: vault/plans/EZD-xxx.md
Worktree: <absolute path> (use absolute paths inside it)
Spec files: <the files the plan's Sources section cites>
Decisions: <vault/spec/decisions/<area>.md files the plan cites; Q-IDs>
Gate summary: <paste the GATE SUMMARY block and SECURITY FLAG lines; reviewers only>
Findings to address: <numbered findings from the last review; retries only>
Lessons:
<output of next_ticket.mjs --lessons <role> <areas>, or "(none)">
Report format: 20 lines max. First line PASS, FAIL or STATUS: <one line>. Then file paths and findings, numbered. No code.
```

Model and effort go on the dispatch call itself (`model`, `effort`), chosen from the plan's Complexity (PROCESS.md section 4), never set by the agent.

Reviewers get the plan, the diff (they run `git -C <worktree> diff develop...HEAD` themselves) and the gate summary, not the whole repository. phase-auditor (gate-phase unit) gets the phase diff range, the plan paths, `vault/tickets/TRACE.md` and the phase's spec files.

**Retriever brief** (PROCESS.md section 4): `QUESTION · FOR (agent and ticket) · SCOPE (paths or sites) · CAP (max lines) · REPORT yes|no · KNOWN (what the asker already has)`. Only the orchestrator, planner, code-reviewer, security-reviewer and phase-auditor dispatch `retriever-digest` (documents in this repository) or `retriever-web` (the outside world), with only these lines:

```
QUESTION: <one question>
FOR: <asking agent> · EZD-xxx
SCOPE: <paths or sites>
CAP: <max lines, 40 at most>
REPORT: yes | no
KNOWN: <what the asker already has>
```
