# Build process

Version 2.4. Changelog: v2.4 (Oct 22 2026): usage efficiency; 8 changes approved by Josh (merged test review on low and medium tickets, advisor-first escalation, Haiku low tier and helpers, Sonnet orchestrators with an Opus advisor and routing from `next_ticket.mjs --dispatch`, medium review effort on low tickets, code-intelligence plugins, `gate-failures.log`, batched low tickets). Deviations: `vault/handoff/PROCESS-DEVIATIONS.md`.

How Josh wants software built with Claude Code. This file is the complete process for any new project. It contains nothing about what the product is; the product's spec comes separately.

Project-specific additions live in `vault/PROCESS-<PROJECT>.md` (for EZ Draft: `vault/PROCESS-EZDRAFT.md`). Where that file adds to this one, both apply; where the two differ, the project file records Josh's decision for that project and wins there, with the Q-ID that decided it.

Model names (section 4) and billing rules (section 11) change over time. Re-check both at the start of each project against the references in section 17.

**First session in a new repo:** read this whole file. Set up the files in section 14. Ask Josh the setup decisions in section 15. Then stop and ask for the spec if there isn't one in the repo yet.

---

## 1. Who is who

- **Josh** is the owner and the only human on the project. He is a general contractor, not a programmer. Ask him **what** to build, never **how**. Questions go to him in plain text as a numbered list; each gives the options and a recommendation first, and he answers in a list by number. There is no limit on rounds: an answer may raise new questions or contradict an earlier answer, and those go back as the next list. Never use multiple-choice prompts. Tone: factual and direct, with no compliments.
- **Orchestrator:** the main Claude Code session, running Opus 5.5 at high effort (Sonnet 5.5 for `build` units, section 10). It picks the work, chooses the model for every subagent dispatch, routes questions, merges finished tickets, and keeps the ledgers and lessons. It does not write app code. An orchestrator session handles one unit of work (section 10) and holds no state of its own: everything it needs is in the vault.
- **Subagents** do the work (section 4). They are plain subagents, not agent teams.
- **This file** changes only with Josh's approval: propose the change in chat, get a yes, then edit. That applies to the orchestrator and to any assistant working on the process.

---

## 2. The shape of a phase

A **phase** is a set of tickets that delivers something Josh can click through and test in one sitting. The phases for the whole project are listed in `vault/tickets/PHASES.md` and approved by Josh before the first phase starts. Each phase runs these stages in order:

```
Phase N
  Stage 0  Spec ready  spec files audited against a checklist; Josh closes gaps and signs off
  Stage 1  Plan        planner writes one plan per ticket; code-reviewer checks the plans together
  Stage 2  Questions   chain of command answers what it can; Josh answers the rest,
                       confirms agent answers, approves wording
  Stage 3  Build       per ticket: tests → test review → code → gate → review → merge to develop
  Gate                 full checks, audit, fix tickets, PR develop → main; auto-merges on a green CI gate (Q-0261); Josh tests after
  Wrap                 lessons, progress, cost report
```

- Nobody writes app code in Stage 0, 1 or 2.
- Stage 1 doesn't start until Josh has signed off the phase's spec. Stage 3 doesn't start until every question for the phase is answered, unless Josh says a ticket may start early.
- Josh touches each phase three times: spec sign-off (after Stage 0), questions (after Stage 2), and testing (at the gate).
- Josh does the testing, at the gate. Agents run the automated tests on every ticket; Josh does not test tickets one by one.

### 2a. Establishing phases

Done once per project, before Stage 0 of phase 1. The orchestrator drafts `vault/tickets/PHASES.md` from the spec; Josh approves it. Rules:

1. **A phase is a vertical slice, not a layer.** It delivers something Josh can use from screen to data. "The database" or "all the screens" are not phases. Phase 1 is the thinnest end-to-end slice that proves the stack: a login, one screen, one saved record, deployed.
2. **Size.** About 4 to 10 tickets, and testable by Josh in one sitting. If testing would take more than one sitting, split it. Starting values; tune them from the cost report.
3. **Each phase entry states:** a one-sentence goal; the user-visible result; the spec files and AC IDs it covers; its tickets; the phases it depends on; what is out of scope until later; risks and spikes; and Josh's test script (numbered steps, each with the expected result), which becomes the punch list at the gate.
4. **Every AC belongs to exactly one phase.** `TRACE.md` flags any AC with no phase or with two.
5. **Order by dependency, then by value.** A phase may use only what earlier phases built. Foundations (auth, data model) are built only as far as the current slice needs them.
6. **Clean breaking point.** A phase closes only when all of these hold: the gate is green and every ticket is `done` or explicitly deferred by Josh; nothing half-built is reachable by a user (unfinished features are hidden or absent); no open questions remain for the phase; nothing from the next phase is needed to make this one work; the app runs from `develop` as it would in production; Josh's test script passes; lessons, progress and the handoff are current.
7. **A phase that can't meet rule 6 is split before building,** not after.
8. **Scope changes.** Only Josh changes an approved `PHASES.md`. New requests go to `vault/tickets/BACKLOG.md`, then into a later phase.
9. **Cost check.** If a phase's actual cost exceeds a third of the weekly ceiling, the wrap step recommends splitting the next one.

---

## 3. Rules for every session and every agent

1. **Never guess.** If the spec, decisions, answered questions or existing code don't settle something, it becomes a question and the ticket waits. Work continues on tickets that don't depend on the answer.
2. **No citation, no answer.** An agent answering another agent's question must cite a spec section, a decision, a question ID or a file path. Every expected number in a test cites its source the same way: a spec table, a worked example in a spec rule, or a hand calculation Josh verified. A number without a source is a question.
3. **Business and product decisions always go to Josh.** That covers scope, what a screen shows, workflow, and anything that costs money. User-visible wording follows rule 3a so it doesn't block tickets.
4. **The spec is read-only once Josh signs it off.** Changes are recorded as Josh's answers in `vault/spec/decisions/` (one file per spec area), and those answers override the spec text.
5. **Tests come before code, and the builder may not change tests.** A test whose behavior or expected values look wrong becomes a question. A test that fails only because of structure (a file name, an export, a signature, a route, a test ID) follows the structural-repair step in section 8.
6. **One ticket = one branch = one commit on `develop`.** Nobody commits to `main`. `develop` → `main` goes only through the phase PR, once per phase; the gate-phase unit turns on GitHub auto-merge, so it merges when the CI `gate` check passes (Josh 2026-10-23, Q-0261: until Josh says the system works and turns it off; then he merges by hand again).
7. **The gate is a script, not an opinion.** A ticket can't be `done` while the gate is red.
8. **Tests never call live services** (AI models, email, payments, outside APIs). Use stubs.
9. **No new dependency without a line in `docs/architecture.md`,** added in the same commit.
10. **No secrets in the repo or in agent context.** `.env.local` is unreadable to agents. Only variable names go in `.env.example`.
11. **The vault is the source of truth.** Once the spec is copied into `vault/`, any outside copies are frozen.
12. **Before a session ends,** update the ticket ledger, the questions ledger and the handoff file.
13. **No extras.** The builder implements exactly the plan. Behavior, features, refactors, files or text that the plan doesn't call for are defects, and review fails them.
14. **Read the lessons.** Every agent applies the entries in its role's file under `vault/lessons/`, filtered to its areas. The orchestrator records new lessons (section 13).
15. **No agent teams, no dynamic workflows, no nested subagents,** with one exception: the planner, code-reviewer, security-reviewer and phase-auditor may dispatch a retriever (section 4), the planner may also dispatch `plan-checker` (Josh, 2026-10-22), and retrievers and `plan-checker` dispatch nothing. Everything else fans out only from the orchestrator. Agent teams and nesting multiply token use.
16. **Report only what a tool result in this session backs.** A claim about our code is verified by reading it in the same action.
17. **Another agent's report, a test runner's summary, a profiler, a metric or a past log is a claim** until checked against the primary artifact: the file, the diff, the output.
18. **A result that looks too good is a bug until proven otherwise.** Prove a fix with a re-run. Never redefine a term, weaken a check or narrow a test to make a failure pass; report failures as failures, with the output.
19. **Tooling faults are fixed in place (Q-0125 (a), Josh 2026-10-19).** When a run is broken or looping, or a plan names a path a guard denies, the orchestrator may fix and commit the launcher, a hook, a skill, a ledger tool or these process files: it writes `vault/handoff/LAUNCHER_FIX.md` naming the fault (guard-paths.mjs fix mode), makes the change, records it in the handoff and the questions ledger, commits, and removes the file. Josh confirms or reverts at his next sit-down.
20. **No known issue is parked (Q-0268, Josh 2026-10-24: "no issues or potential problems should be skipped. I want to build this right the first time. this system must be robust and future proof from the start").** A finding of any size is fixed before the ticket merges, or becomes a fix ticket in the same phase before the phase gate opens its PR. That covers reviewer findings marked *minor*, deviations that leave something wrong, a flaky test (fixed, never accepted by a re-run), and any warning our code or configuration causes in a build, test run, browser console or service log. Nothing is recorded as a minor, follow-up, watch item or known limit instead. A reviewer `PASS` means zero findings. When only a third party can fix something, it goes to Josh as a question with the evidence and the workarounds, never as a recommendation to accept it.

### 3a. Wording rule (user-visible text)

- Text on an approved mockup is decided. Sample data on a mockup is not a decision.
- Text not on a mockup (error messages, validation text, empty states, toasts, labels on unmocked states) is proposed by the planner in the plan under **Proposed wording**. Josh approves or edits it in bulk at Stage 2.
- Text discovered during Stage 3 that no plan covers: the builder writes it in the same style as the approved wording, the ticket records it under `needs-josh-confirm` in STATUS notes, and the ticket does not block. All such text is listed in the phase PR for Josh to confirm or change. Changes become fix tickets.

---

## 4. Agents and models

### Roster

| Agent | Default model | Range | Effort | maxTurns | Job | Can write |
| --- | --- | --- | --- | --- | --- | --- |
| orchestrator (main session) | Sonnet 5.5 with an Opus 5.5 advisor (v2.4) | fixed | medium (section 10) | set by launcher | Runs one unit: takes model routing from `next_ticket.mjs --dispatch`, dispatches agents, routes questions, merges, keeps ledgers and lessons | `vault/` only |
| planner | Opus 5.5 | fixed | high | 40 | Stage 1 plans; re-validates a plan when a dependency deviated | `vault/plans/` |
| test-author | Sonnet 5.5 | Haiku 5.5 to Opus 5.5; Fable 5.1 only on a retry after an Opus FAIL | medium | 40 | Failing tests and fixtures from the plan; structural repairs only after that | test files, fixtures, test configs |
| builder | Sonnet 5.5 | Haiku 5.5 to Opus 5.5; Fable 5.1 only on a retry after an Opus FAIL | medium | 80 | Code until the gate passes | app code; never tests, `vault/`, `.claude/`, `CLAUDE.md` or the gate script |
| plan-checker | Sonnet 5.5 | fixed | low | 12 | Dry-reads a plan as the builder would and lists every decision it leaves open; dispatched by the planner before a plan is returned (Josh, 2026-10-22) | nothing |
| code-reviewer | Opus 5.5 | fixed | high | 30 | Reviews plans together, tests against the plan, and each finished ticket; returns PASS or FAIL | nothing |
| ui-verifier | Sonnet 5.5 | fixed | low | 20 | Runs the app, takes screenshots, checks them against the plan's visual checklist and the mockup | screenshots only |
| security-reviewer | Opus 5.5 | Opus 5.5; Fable 5.1 on high-complexity tickets | high | 30 | Auth, permissions, data isolation, money visibility, the API | nothing |
| phase-auditor | Fable 5.1 (falls back to Opus 5.5) | fixed | high | 40 | Audits spec readiness (Stage 0) and the whole phase against the spec (gate) | nothing |
| Explore | Haiku 5.5 | fixed | low | none | Codebase search | nothing |
| log-summarizer | Haiku 5.5 | fixed | low | 10 | Reads `gate.log` when `gate-failures.log` is unclear; returns failing test names, the first error for each and one line on the likely cause; never proposes fixes (v2.4) | nothing |
| retriever-digest | Haiku 5.5 | fixed | low | 15 | Answers one question about documents in the repo (spec, plans, logs, lessons, research) in 40 lines at most, with `path:line` pointers; writes a research report when asked (section 13) | `vault/research/pending/` only |
| retriever-web | Haiku 5.5 | fixed | low | 15 | The same for the outside world, with WebSearch and WebFetch | `vault/research/pending/` only |

maxTurns values are starting points; tune them from the cost report (section 9).

**Models.** Use the current release of each family and name it by full ID in agent files and dispatches so versions don't drift: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`. Orchestrator units run Sonnet 5.5 at medium effort with an Opus 5.5 advisor (v2.4; `plan` and `review-plans` run as the Opus agent, section 10); Fable is used only for subagent dispatches. Any agent file, setting or script that names Haiku names Haiku 5.5. When a newer release ships, change this paragraph and the agent files in one commit.

**Which agents to use.** For a small project, start with orchestrator, planner, test-author, builder and code-reviewer. Add ui-verifier when there are screens. Add security-reviewer when there are logins, user data or money. Add a domain specialist (such as a calculation auditor) only when the product has rules worth checking against known values. When a database exists, migrations are forward-only and count as a security-review trigger.

**Reviewers don't run the gate.** They read its output. ui-verifier runs the app to take screenshots; it does not run builds or tests.

Write limits are enforced by hooks, not only by instructions (section 14).

**Retrievers.** A lookup that would pull more than about 30,000 tokens into an agent's context, or that needs sifting (a long log, the whole spec, a web search), goes to a retriever; the asking agent gets the answer, never the pages. One grep or one small file is fine inline. Only the orchestrator, planner, code-reviewer, security-reviewer and phase-auditor may dispatch retrievers, enforced by each agent file's `tools` line and, for which agent they may start, by the guard-agents hook (section 14) (the builder, test-author and ui-verifier have no `Agent` tool); retrievers have no `Agent` tool, so the chain stops with them. Retriever brief: `QUESTION · FOR (agent and ticket) · SCOPE (paths or sites) · CAP (max lines) · REPORT yes|no · KNOWN (what the asker already has)`. Never read a research report's body; cite its ID.

### How the orchestrator picks models

The orchestrator passes a `model` (and, where useful, an `effort`) on each dispatch. A per-invocation value beats the agent file's `model` field, which beats the `CLAUDE_CODE_SUBAGENT_MODEL` environment variable, which beats the orchestrator's own model. The agent file's model is therefore the default, and the orchestrator overrides it per ticket.

The planner rates each ticket's complexity in its plan (section 6): **low**: the plan's interface contract is complete, the change follows an existing pattern, few files, no calculations, permissions, money, data-model or auth work; **medium** (default): anything not clearly low or high; **high**: a new pattern, calculations, permissions, data model, auth or money, or many files.

**Routing is mechanical (v2.4).** `node vault/tools/next_ticket.mjs --dispatch <ticket> <role> [--round N]` prints `{agent, model, effort, orchestratorAdvice}` from the table below, the STATUS Complexity, the round and the role. The orchestrator uses those values and deviates only with a one-line reason in STATUS notes.

| Agent | low | medium | high |
| --- | --- | --- | --- |
| orchestrator | Sonnet 5.5 / medium + Opus advisor | same | same |
| planner | Opus 5.5 / high | Opus 5.5 / high | Opus 5.5 / high |
| plan review (code-reviewer, Stage 1) | Opus 5.5 / high | Opus 5.5 / high | Opus 5.5 / high |
| test-author | Haiku 5.5 / high | Sonnet 5.5 / medium | Sonnet 5.5 / medium; Opus 5.5 for calculation-heavy tests |
| standalone test review | none (merged into the final review) | none (merged into the final review) | Opus 5.5 / high |
| builder round 1 | Haiku 5.5 / high | Sonnet 5.5 / medium | Opus 5.5 / medium |
| builder round 2 | same model | same model | Opus 5.5 / high |
| builder round 3 | Sonnet 5.5 + the orchestrator's advisor advice | Opus 5.5 + the orchestrator's advisor advice | blocked review by the orchestrator + advisor, then blocked |
| final review (code-reviewer) | Opus 5.5 / medium | Opus 5.5 / high | Opus 5.5 / high |
| security-reviewer | Opus 5.5 / high | Opus 5.5 / high | Opus 5.5 / high (Fable 5.1 per the rule below) |
| ui-verifier | Sonnet 5.5 / low | same | same |
| phase-auditor | Fable 5.1 → Opus 5.5 / high | same | same |
| Explore, retrievers, log-summarizer | Haiku 5.5 / low | same | same |

**Advisor (v2.4).** Project settings set `advisorModel` to `claude-opus-5-5`; subagents inherit it. Every Opus-model agent file says "Do not call the advisor tool" (no second Opus reviewing the first); Fable takes no Opus advisor. Advisor calls count toward plan limits and re-read the whole transcript uncached, so consult only where named. Subagents are never told to consult it (Q-0333 (c), Josh 2026-10-25: the dispatch line never reached them); instead the orchestrator consults its own advisor before a round-3 builder or test-author dispatch (`--dispatch` prints `orchestratorAdvice: true`) and passes the advice with the findings. The orchestrator also consults it before accepting a complexity rating it doubts, before marking a ticket `blocked`, before opening a phase PR, and when a decision is not covered by this file or the spec.

**Haiku price cliff.** Haiku 5.5 costs five times as much per token once a prompt passes 100,000 tokens. Haiku dispatches carry only the plan, the contract and the files they touch; if one would clearly pass 100,000 tokens, use Sonnet 5.5 and log why.

Floors and ceilings:
- planner, code-reviewer, security-reviewer and phase-auditor never run below Opus 5.5. ui-verifier never runs below Sonnet 5.5.
- Josh, 2026-10-20 (from the C2 cost baseline, `vault/cost/baseline-2026-10-19.md`): Opus 5.5 is the default for high-complexity work, and Fable 5.1 is an upgrade on retry (Josh, in chat: "most of the higher agents are good on opus with the option to upgrade to fable if the task is complex"). test-author and builder follow the v2.4 ladder above and are never dispatched on Fable 5.1. code-reviewer always runs Opus 5.5, also when it reviews a Fable retry; that is the one exception to the next rule. On a high-complexity ticket, security-reviewer runs Fable 5.1. Otherwise neither reviewer runs a lower tier than the builder it reviews. ui-verifier is exempt and stays on Sonnet 5.5: it checks screenshots against the mockup, which doesn't depend on the builder's tier.
- **Retry and escalation on FAIL (v2.4, advisor first):** round 1 is the tier's model. Round 2 is the same model again, resumed when the findings are *minor* (naming, style, a fix confined to one file, nothing about behavior or a requirement) and fresh otherwise, with no advisor. Round 3 is one tier up (Haiku → Sonnet → Opus) with the orchestrator's advisor advice in the dispatch, except on a high ticket, where round 2 is Opus at high effort and round 3 is the orchestrator's blocked review with the advisor. After 3 failed rounds the ticket is `blocked`. A FAIL caused by a test defect goes to the test-author first, then the builder, and counts as one round. Opus-model agents never call the advisor. If the advisor is not working, the old ladder applies (one tier up per failed round) until it is fixed.
- **Fable fallback:** Fable has its own weekly limit, separate from the main one (section 11). Every place this process says Fable, the orchestrator uses Opus 5.5 instead when Fable is past its fallback fraction (section 11), when a Fable run ends on a limit error, or, unlikely, when Fable declines a task (its extra safeguards cover biology, cybersecurity and model research, not ordinary app work). With Fable out, Opus is the ceiling. The fallback is logged in STATUS notes with the reason.
- The gate script and the reviews are identical whatever model wrote the code. A cheaper model never means a lighter check.
- **Batches (v2.4).** The orchestrator may group 2 or 3 low tickets into one unit when they are in the same phase, their plans touch overlapping files, none depends on an unfinished ticket outside the batch, and every plan rated them low (`next_ticket.mjs --batch <ticket>` lists them). One test-author dispatch writes all their tests, one builder dispatch builds them, the gate runs once, and the code-reviewer reviews each ticket's diff separately with a PASS or FAIL per ticket. Each ticket is its own commit. A FAIL on one ticket sends only that ticket into the round-2 ladder; the others merge.
- The model chosen for every dispatch, with its reason, is logged in STATUS notes. The wrap step uses this log to adjust the table above.

Never set `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`: it ignores per-dispatch choices. Set `CLAUDE_CODE_SUBAGENT_MODEL` to `claude-sonnet-5-5` in project settings only as a backstop so an unlisted agent never silently inherits Opus.

---

## 5. Stage 0: spec ready

Before a phase's planning starts, the phase's spec must be detailed enough that a builder who has never spoken to Josh can build it correctly. This stage exists to stop agents from guessing and straying.

**The spec pack.** The product spec lives in `vault/spec/`, split into one file per section and screen, with `INDEX.md`. Each phase lists the spec files it needs in `vault/tickets/PHASES.md`. A phase is ready only when its spec files cover everything in `vault/spec/READINESS.md`, which contains this checklist:

1. **Goal and non-goals** for the phase, and the product-wide `vault/spec/non-goals.md`: things agents must not build or change.
2. **Every screen:** who sees it, purpose, each field shown and where its data comes from, each action and its result, every state (empty, loading, error, filled, no permission), where it links to, its mockup, and the wording on the mockup.
3. **Every workflow:** the steps, who does each, and what happens when each step fails.
4. **Every rule or calculation:** the statement, its inputs, the formula or table, and at least three worked examples with real numbers, including edge cases (zero, maximum, rounding).
5. **Data:** each thing the system stores, its fields, which are required, how things relate, who can create, edit and delete them, and what is kept after deletion.
6. **Roles and permissions:** a table of role × action × which data, including who can see money.
7. **Outside services:** which, what we send and receive, what happens when they fail, and a sample response to build stubs from.
8. **Acceptance criteria:** each feature's checks as short, testable sentences, each with an ID (`AC-001`, `AC-002`, ...).
9. **Glossary:** Josh's words for things and the names the code will use (`vault/spec/glossary.md`).
10. **Open questions:** none, or each one marked decided or deferred to a named phase.

**Steps:**
1. Josh provides the spec, or the orchestrator interviews him to build it, as numbered lists in plain words, recommendation first (section 1).
2. The orchestrator splits the spec into `vault/spec/` files, assigns AC IDs, and records the phase in `PHASES.md` (goal, user-visible result, spec files in scope, done-when).
3. **spec-check unit:** the phase-auditor audits those files against `READINESS.md` and returns a gap list (read-only).
4. The orchestrator turns the gaps into questions in `vault/questions/phase-NN-spec-gaps-for-josh.md` (context, options, recommended answer) and asks Josh in a sitting.
5. Josh's answers become new spec files for missing sections, or entries in `vault/spec/decisions/` for changes. The audit repeats until it returns no gaps.
6. Josh signs off in `vault/spec/SIGNOFF.md` ("Phase N spec ready", with the date). `next_ticket.mjs` refuses to start Stage 1 without it.

New spec files created in step 5 become read-only after sign-off like the rest (rule 4).

The spec-check unit needs Josh present, so it runs interactively. The launcher never starts it.

---

## 6. Stage 1: plan

For each ticket, in ticket order, the planner writes `vault/plans/<TICKET>.md` from `vault/plans/TEMPLATE.md`. The planner reads only: the phase's spec files, the decision files for those areas, `non-goals.md`, `glossary.md`, `architecture.md`, and `vault/lessons/planner.md` filtered to the ticket's areas. For the codebase and the outside world it dispatches retrievers (section 4) with `REPORT: yes`, then runs `node vault/tools/research.mjs adopt` and cites the IDs.

Each plan has a header and ten sections:

**Header:** ticket ID, title, the AC IDs it covers, complexity (low, medium or high), and a one-line plain-words **user-visible result** (what now works for Josh).

1. **What to build**, execution-grade (Josh, 2026-10-22: Opus thinks, Sonnet executes): the **Build steps** table (one row per file in build order: path, exact exports and signatures, an existing file to copy the pattern from, a verify command), **Decided for the builder** (every choice a builder could otherwise make, with its source) and **Do not touch**. `vault/tools/plan_lint.mjs` checks the form and bans vague words in sections 1, 3 and 4; the planner then dispatches `plan-checker` (Sonnet) to list any decision still open, and closes each gap in the plan or as a QP question. A plan must pass `plan_lint.mjs` (strict) before its ticket becomes `ready`. In Stage 3 a builder or test-author that meets an undecided point stops with `PLAN-GAP`; the planner patches the plan and records a planner lesson, and the builder resumes at the same tier.
2. **Sources:** the spec sections, decisions and mockup it relies on, cited, and the research reports (`R-NNN`, section 13) the plan drew on. A ticket no report covers says so.
3. **Interface contract:** file paths, exported names and signatures, route paths, component props, and `data-testid` values. Tests and code are both written to this contract.
4. **Tests:** each test with the AC it checks, known correct values for every number, and a cited source for each value.
5. **Visual checklist** (when a screen changes): which elements, which states, and which mockup each maps to.
6. **Proposed wording** for user-visible text not on a mockup.
7. **Security review:** `yes` or `no`; when yes, the areas touched (auth, permissions, data access, money, API, migrations).
8. **Complexity and model recommendation:** the rating, one sentence of reasoning, and the suggested test-author and builder models (section 4).
9. **Dependencies,** including ones the ticket list missed.
10. **Open questions,** labelled QP-1, QP-2 and so on. Only the orchestrator turns these into Q-IDs.

Plans are written one at a time, in ticket order. Parallel planning saves no usage (the same tokens are spent either way) and risks ledger conflicts, so it is not used.

**Ticket size.** Every ticket must be buildable in one fresh session. A plan targets 25,000 characters: over it, the planner tightens the wording first (section 1 as steps and the file table, sources cited by ID, nothing repeated) without dropping any requirement, test, source or question (optimize plan C4, Josh 2026-10-20: tighten, don't split). If a plan is still over 45,000 characters after tightening, or touches more than about 20 files or has more than about 25 tests (raised from 8 and 10 by Josh, 2026-10-22: every part pays the whole per-ticket overhead again), the planner proposes a split into lettered parts (T-012a, T-012b). The orchestrator updates the phase file, ticket data and ledger in one commit. These numbers are starting values; adjust them from the cost report.

**Plan review unit.** The code-reviewer reads all the phase's plans together, looking for missed requirements, conflicts between tickets, and interface contracts that don't line up between a ticket and its dependents. `next_ticket.mjs --report` also writes `vault/tickets/TRACE.md` (each AC → the ticket and tests that cover it). Every AC in the phase must appear at least once. An uncovered AC is a gap and goes back to the planner.

After Stage 1, each ticket's status is `planned` or `questions`.

---

## 7. Stage 2: questions (chain of command)

Each question climbs this chain until someone can answer it with a citation:

| Level | Who | Answers when |
| --- | --- | --- |
| 1 | Asking agent | The answer is in the spec, decisions, an answered question or existing code |
| 2 | Orchestrator | The answer is in another plan, the phase context or a dependency |
| 3 | Specialist (code-reviewer for architecture, security-reviewer for permissions, a domain auditor for its own domain) | Only within their domain |
| 4 | Josh | Nobody above can cite an answer, or it's a business or product decision |

- Agent answers are logged as `answered-agent` with their source.
- Everything for Josh goes in one file per phase, `vault/questions/phase-NN-for-josh.md`, with three sections:
  1. **Decisions needed:** each question gives the context, the options, and a recommended answer with the reason.
  2. **Agent answers to confirm:** every `answered-agent` entry for the phase with its source, as a confirm-or-override list. Josh sees these before anything is built on them.
  3. **Proposed wording:** all wording from the plans, approved or edited in bulk.
  4. **Rule candidates:** every lesson with status `candidate` (section 13), one line each: the L-number, the rule in one sentence, the ticket it came from, and a recommendation (ratify or reject). Nothing is applied until Josh answers.
- If Josh is at the computer, the orchestrator asks the same list in chat (section 1) instead of waiting for the file.
- Josh's answers and overrides are logged as `answered-josh`; confirmed agent answers as `confirmed-josh`. Both are appended to the decision file for the spec area (`vault/spec/decisions/`) with the question ID. Rule candidates get status `ratified` or `rejected` from his answer, recorded in `QUESTIONS.md` the same way.

After Stage 2, every ticket with no open questions is `ready`.

Questions are answered automatically and at once (Q-0129, Josh 2026-10-19): when a plan unit leaves open Q-IDs, the next unit is `questions <phase>`, before any build; unattended it runs levels 1 to 3, records `answered-agent` with citations, sets tickets ready, escalates only uncitable or business and product questions (one ntfy message each), and ends so the launcher continues with other ready work. A questions unit that changed nothing is not run again until the ledger changes.

---

## 8. Stage 3: build (one ticket per unit)

Each ticket is built in its own fresh orchestrator session (section 10). The orchestrator takes the ticket the launcher gives it and works these steps:

1. **Re-validate the plan** if any dependency's STATUS notes record a deviation from its plan. The planner updates the interface contract and citations; a changed test value or behavior is a question. Skip if no dependency deviated.
2. **Worktree:** `git worktree add .claude/worktrees/<T> -b t/<T> develop`. Status → `in-progress`. A worktree that already exists with commits means a previous run was interrupted: resume from it instead of starting over.
3. **Pick models** with `next_ticket.mjs --dispatch` (section 4) and log them in STATUS notes.
4. **test-author** writes failing tests in that worktree from the plan's interface contract. Commit `test(<T>): …`.
5. **Test review (high tickets only, v2.4):** code-reviewer checks the tests against the plan: every AC covered, every expected value matches the plan and its cited source, structure matches the interface contract. FAIL → back to test-author. PASS → continue.
   - On **low and medium** tickets this step is skipped. The Stage 1 plan review checks each plan's Tests section (known correct values, a cited source for each, coverage of the interface contract), and the final review in step 8 checks the tests against the contract and the cited values, then the code, in one pass with one verdict. A final-review FAIL caused by a test defect goes to the test-author first, then the builder, as one round.
6. **builder** implements the plan exactly, committing work in progress on the ticket branch as it goes. Anything the plan doesn't cover becomes a question and the ticket goes to `blocked` while other tickets continue, except wording, which follows rule 3a.
   - **Structural test repair:** if a test fails only because the code's structure differs from the test and the plan's contract didn't settle it, the builder reports the mismatch; test-author fixes only the structure; code-reviewer confirms the diff touched no assertions or expected values. A dispute about behavior is a question.
7. **Gate:** the orchestrator runs `node scripts/gate.mjs .claude/worktrees/<T>` once (typecheck, lint, tests, build, browser tests). It prints a short summary (pass or fail per step, failing test names, the first error line) and writes two files in the worktree: `gate.log` (the full output, for humans and the cost report) and `gate-failures.log` (each failing test name and its first error, 100 lines at most). It also lists touched paths and flags any under `auth/`, `api/`, `db/`, `middleware`, migrations or billing. Builders, test-authors and reviewers get the summary and `gate-failures.log`, never `gate.log` (v2.4). When `gate-failures.log` is unclear, the orchestrator dispatches `log-summarizer` on `gate.log`; no other agent reads it.
8. **Review:**
   - code-reviewer reviews every ticket against its plan, the spec files the plan cites, decisions and mockup. It confirms the implementation handles the general case, not only the test inputs, and that nothing in the diff goes beyond the plan (rule 13). On low and medium tickets it reviews the tests here too (v2.4), at medium effort on low tickets and high effort otherwise. On high tickets the step-5 reviewer is **resumed** for this step rather than started fresh: it keeps the tests it approved and its warm cache. *Revisit flag:* a fresh reviewer brings no assumptions from the test review; if the cost report shows the resumed reviewer missing defects that the phase-auditor or Josh then catch, go back to a fresh dispatch for step 8;
   - ui-verifier reviews when the plan has a visual checklist: only the states on the checklist, at one viewport, with screenshots downscaled before the agent reads them (screenshots are image tokens);
   - security-reviewer reviews when the plan says `security review: yes` **or** the gate flagged a path. Either trigger is enough;
   - a reviewer that needs more than the plan, the diff and the gate summary asks a retriever (section 4) rather than reading the spec or the logs itself.
9. **FAIL** (any finding, *minor* included, rule 20) → findings go back to the builder in the same worktree, following the v2.4 ladder in section 4 (round 2 same model, round 3 one tier up with the orchestrator's advisor advice); a test defect goes to the test-author first. Only the reviewers whose findings are open review again. After 3 failed rounds the ticket goes to `blocked` with notes and the orchestrator ends the unit.
10. **PASS** (zero findings from every reviewer, rule 20) → squash the branch into one commit `feat(<T>): <title>` on `develop`, remove the worktree, mark the status `done` with the commit hash, record any deviation from the plan in STATUS notes, append a line to `vault/DONE.md`, regenerate `PROGRESS.md` (`next_ticket.mjs --report`), push `develop`, record any lesson (section 13), update the handoff, and end the session.

Pushing is free: CI doesn't run on pushes and hosting skips `develop` (section 12), and it protects the work.

Stage 3 ends when every ticket in the phase is `done` or `blocked`.

---

## 9. Phase gate and wrap

**Gate:**
1. `node vault/tools/next_ticket.mjs --check` passes.
2. The full gate passes on `develop`.
3. security-reviewer reviews the whole phase diff, if that agent is in use.
4. phase-auditor reviews the whole phase against the spec and `TRACE.md`: every AC in the phase must map to a merged ticket with passing tests. Findings are handled before the PR opens:
   - a defect or a missed requirement becomes a fix ticket (`T-0xx-fix`) in the same phase, planned, tested, built and reviewed like any ticket;
   - a product judgment goes in the PR for Josh.
5. The orchestrator pushes `develop`, opens a PR `develop` → `main` titled `Phase N: <name>`, then pushes one empty commit (`chore: preview`) so hosting builds the preview for the PR. The PR body contains:
   - **Punch list:** the test script for Josh, per ticket: what to click and what should happen. Josh checks items off; an unchecked item becomes a fix ticket;
   - tickets done; tickets blocked and why;
   - `needs-josh-confirm` wording;
   - product judgments from the auditor;
   - lessons added this phase.
6. The orchestrator turns on auto-merge (`gh pr merge <url> --auto --merge`); GitHub merges the PR when the required CI `gate` check passes (Josh 2026-10-23, Q-0261: until Josh says the system works and turns it off; then he merges by hand again). Josh works the punch list on the preview or the merged build afterwards; an unchecked item becomes a fix ticket in the next phase and does not hold the merge or the next phase.

On the first phase of a project, confirm the preview actually appears on the PR. If it doesn't, fix the hosting rule (section 12) before moving on.

**Wrap unit (after the phase PR merges):**
- Consolidate `vault/lessons/` (section 13), and promote any lesson that a script could check into the gate.
- Write the phase cost report into `vault/cost/phase-NN.md`: spend per ticket, per agent and per model from the budget log; tickets that needed escalation; places Opus ran on low-complexity work or Haiku failed; defects the resumed step-8 reviewer missed that the auditor or Josh caught (section 8 revisit flag); whether the phase cost more than a third of the weekly ceiling (section 2a). Use it to adjust the complexity table, ticket-size numbers and maxTurns.
- Regenerate `PROGRESS.md`, update the handoff, and end the session.
- The next phase starts at Stage 0.

---

## 10. Sessions, context and clearing

**Principle:** no session holds anything the files don't. A session does one unit of work, writes its results to the vault, and ends. The next unit starts fresh. That is how context stays small without anyone remembering to clear it. There is no setting or hook that clears context for you in the middle of a session, so a fresh process per unit is the mechanism.

### Units

| Unit | What it does | Needs Josh? |
| --- | --- | --- |
| `spec-check` | Stage 0 audit, gap questions, sign-off | Yes (interactive) |
| `plan <T>` | The planner writes one ticket's plan (runs as the planner, no orchestrator) | No |
| `review-plans` | Plan review and `TRACE.md` (runs as the code-reviewer, no orchestrator) | No |
| `questions` | Chain of command; writes the file for Josh | No (Josh answers afterward) |
| `build <T>` | Stage 3 steps 1 to 10 for one ticket (also fix tickets) | No |
| `gate-phase` | Phase gate steps 1 to 5 | No (Josh tests afterward) |
| `wrap` | Lessons, cost report, progress | No |

Each unit has a skill in `.claude/skills/`. The names match the unit, except that unit `plan` uses skill `plan-ticket` and unit `build` uses skill `build-ticket`.

`plan <T>` and `review-plans` dispatch exactly one agent, so the launcher runs them **as that agent** (`claude -p` with the planner's or code-reviewer's prompt, model and effort) with no orchestrator session in front; an Opus orchestrator that only forwards one dispatch costs a second session and adds nothing. The launcher writes the ledger line and handoff for those units itself. Every other unit runs as the orchestrator. `next_ticket.mjs --next-unit` prints the next unit as `<unit> <ticket-or-phase>`, or `none: <reason>` (waiting on Josh, spec not signed off, spike pending, budget hold, or phase built).

### The launcher

`scripts/run.mjs` runs the loop. Each pass:
1. If `vault/handoff/STOP` exists, wait and re-check every minute; it resumes when the file is removed (fix mode, rule 19; Q-0233). If `vault/handoff/WINDOW_PAUSE.md` exists, wait until its resume time (section 11). If `vault/handoff/BUDGET_HOLD.md` exists, run only a `build <T>` unit for a ticket already `in-progress` (so it reaches `done` or `blocked`); start nothing else (section 11).
2. Ask `next_ticket.mjs --next-unit`. If `none`, notify Josh once with the reason and re-check every 5 minutes, so his answer is picked up without a restart; only a budget hold ends the run (Josh, 2026-10-20, Q-0233: the build never stops unless it hits a usage limit or truly nothing can be done until he answers).
3. Start a fresh `claude -p` for that unit with the unit's skill as the prompt, a session name such as `T-012 build`, a `--max-turns` limit, and a `--max-budget-usd` cap (section 11). Orchestrator units (`build`, `questions`, `gate-phase`, `wrap`) run `claude-sonnet-5-5` at `medium` effort with the Opus 5.5 advisor from project settings (v2.4; the judgment calls go to the advisor at the moments section 4 names). `plan` and `review-plans` run as the agent at that agent's model and effort. Effort is set per run, never changed within one.
4. Record the run's estimated cost in `vault/cost/log.jsonl`.
5. Run `next_ticket.mjs --check`. If it fails twice in a row, stop and notify.

Do not start units with `--bare`: it skips CLAUDE.md, hooks, skills and subagents, which this process depends on. Unattended runs use the permission settings in section 14, and `--permission-prompts none` so a prompt nobody can answer is denied instead of hanging the run. A denial becomes a note on the ticket.

### Using it interactively

Run a unit by typing its skill name. Run `/clear` at each unit boundary: after a ticket merges, after a stage finishes. The `session-start` hook fires on `startup`, `resume`, `clear` and `compact`, and injects the handoff summary and the next unit, so a cleared session picks up where the files say the work is. In an interactive session, check `/context` and finish the unit and clear when it passes about half full; that figure is community folklore, not a documented limit.

### What a unit loads

Only these: `CLAUDE.md` (automatic), the hook-injected state (the handoff summary, at most 30 lines, and the next unit), and the unit's skill. Nothing else is read until the unit needs it.

### Dispatch rule (context diet)

Every subagent dispatch contains only: the ticket ID and role; the path to the plan; the spec files and decision IDs the plan cites; the lessons for that role filtered to the plan's areas (`node vault/tools/next_ticket.mjs --lessons <role> <areas>` prints them, so the orchestrator never reads the lessons files itself); and the report format. Subagent final reports are 20 lines at most: PASS, FAIL or status first, then file paths and findings, no code. The dispatch template lives in `.claude/skills/build-ticket/dispatch.md`.

Each role reads only its plan sections, named on a `Sections:` line the orchestrator adds under the dispatch's `Plan:` line from the table in `.claude/skills/build-ticket/SKILL.md` and printed with `node vault/tools/outline.mjs <plan> --section <n>`; the orchestrator reads the plan's header and sections 5, 7, 8 and 9 once per unit (optimize plan C3, Josh 2026-10-20). Reviewers receive their plan sections, the diff and the gate summary, not the whole repository or the whole spec. phase-auditor receives the phase diff, the plans, `TRACE.md` and the phase's spec files. Anything beyond that comes through a retriever (section 4). The whole-read guard (section 14) stops any agent from loading a file over 20,000 characters without a range.

### Keeping the machine running

- **Run the launcher as a launchd service, never in a terminal tab** (2026-10-23: the Claude app's update restart killed a launcher running in its terminal pane mid-merge and the build sat idle 9.5 hours). `node scripts/launchd/install.mjs install` loads two agents: `com.ezdraft.launcher` (`scripts/run.mjs`, restarted by launchd after a crash or kill, not after a stop it notified about) and `com.ezdraft.watchdog` (`scripts/watchdog.mjs` every 15 minutes: it restarts a launcher that is down and notifies Josh when a unit shows no activity for 45 minutes or the launcher starts nothing for 30 minutes without a waiting reason; Haiku 5.5 writes one plain sentence about the log for the alert). `status` and `uninstall` do what they say; logs are in `~/Library/Logs/ezdraft/`. Pause with `vault/handoff/STOP` as before. A unit killed mid-run gets an `interrupted` cost row on the next start (`inflight.json`), and `unit-steps.mjs` finishes a merge that was squashed but not gated (`RESUME merged=yes`).
- Keep the machine awake and pause OS updates during a run. A restart kills the session; the builder's work-in-progress commits on the ticket branch let the next unit resume the ticket.
- One build per machine at a time. Two parallel builds can run out of memory, and failed tests then waste usage on retries.
- One ticket in progress at a time. Raise the limit only when Josh says so and the plans touch no shared files. Exception (v2.4): a batch of 2 or 3 low tickets (section 4) counts as one ticket in progress.
- Never change the orchestrator's model or effort in the middle of a session; that invalidates the prompt cache for the whole context.

---

## 11. Budget and billing

### What counts against what

As of October 2026:
- Josh's Max plan has usage limits (a rolling five-hour window and a weekly window) shared across Claude chat, Cowork and Claude Code. Interactive Claude Code draws from them.
- `claude -p` run while signed in with the plan also draws from those same plan limits.
- **Monthly API credits** are a separate dollar balance included with Max and Team plans: $100 a month on Max 5x and $200 on Max 20x. Josh claims them once at claude.ai under Settings > Billing by linking one Claude Console organization; the link can't be changed without contacting support. They apply to the Claude API, the Agent SDK and `claude -p` only when the run authenticates with an API key from the linked Console organization. They do not cover interactive Claude Code, extra usage, or `claude -p` started by the GitHub Action, an IDE extension or the desktop app. They don't roll over, they never charge the plan, and when they run out API requests stop unless the organization has purchased credits.
- Billing rules for programmatic use changed twice in 2026. Re-check before each project (section 17).

**What 24/7 means on a plan.** Opus units fill the rolling five-hour window regularly. The launcher waits for the window to reset and resumes; those idle gaps are expected, not failures. The weekly window is the real throughput limit, and the budget below exists to keep build spend inside it.

### Auth mode

The launcher has one setting, `AUTH_MODE`: `plan` (default; runs draw from the plan's limits) or `api` (runs use a Console API key; they draw from the monthly API credits, then from purchased credits). Switching changes where the cost lands and nothing else. In `api` mode the key lives in an untracked launcher config the agents can't read, `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` is set, and ticket 000 confirms an agent's shell can't print the key.

### The budget

The launcher gates on the plan's **real usage percentages**, read from two sources and kept in `vault/cost/usage.json` (`five_hour`, `seven_day`, `fable_seven_day`, each with `pct` and `resets_at`, plus `read_at` and `source`):

1. **The statusline payload.** Claude Code passes a JSON object to the configured statusline command on every refresh, carrying the account's rate-limit windows (`rate_limits`, with `used_percentage` and `resets_at` per window, and model-scoped entries for Fable). `scripts/statusline.mjs` prints a short status line and writes those windows to `usage.json`. Field names are confirmed against the installed version in ticket 000 (section 15).
2. **The OAuth usage endpoint**, as the fallback when no statusline refresh has happened in 20 minutes (headless runs may never trigger one): `GET https://api.anthropic.com/api/oauth/usage` with the login token as a bearer. The endpoint is undocumented and rate-limited: poll at most every 15 minutes; on 429 wait `max(Retry-After, 120) + 30` seconds; on 401 or 403 stop polling for an hour and notify Josh. The token is `claudeAiOauth.accessToken` in `~/.claude/.credentials.json` on Linux and Windows; on macOS it may be in the Keychain instead. **The token is never written to any file, log or output.**
3. **The dollar proxy** (the sum of each run's estimated cost from `vault/cost/log.jsonl` against `weekly_ceiling_usd_est`) only when neither meter is available, with a warning in the log. The cost log is kept in every mode as the per-ticket and per-agent record for the phase cost report.

`vault/budget.json` holds:

- `meter_source`: `auto` (default: statusline, then endpoint, then proxy), `statusline`, `oauth` or `proxy`.
- `five_hour_pause_pct`: 90 by default. A pause, not a hold (below).
- `warn_at_pct`: 70 by default. One notification that a hold is coming.
- `hold_at_pct`: 80 by default, on the weekly window.
- `fable_fallback_pct`: 90 by default, on Fable's own weekly window. At or above it, dispatches that would use Fable use Opus 5.5 instead until the reset, logged in STATUS notes. Not a pause: the launcher keeps running. It is higher than `hold_at_pct` because reaching it costs nothing: the work moves to Opus and continues, while the main hold stops new tickets.
- `weekly_ceiling_usd_est` and `fable_ceiling_usd_est`: used only in proxy mode. They cover build runs only; Josh's chat and other Claude use also draw from the plan, so set them below the plan's real capacity.
- `week_resets`: the day and time the plan's weekly window resets, used in proxy mode (the meters carry their own `resets_at`). For Josh: Monday 2:00 AM Eastern.
- `per_unit_cap_usd_est`: passed to `--max-budget-usd` for each run, so one runaway unit stops itself. The cap is checked against Claude Code's own estimate and can be overshot, so leave headroom.
- `override`: empty unless Josh set one (below).

**Proxy mode only.** When the meters are unavailable, `/usage` still shows percentages, not dollars, so the ceiling is calibrated: after Stage 1 of phase 1, Josh compares the weekly bar with the log's total for the same period and sets the ceiling from that, and the same for Fable. Until `weekly_ceiling_usd_est` is set, proxy mode refuses to run unattended. In every mode: chat, Cowork and interactive Claude Code draw from the same weekly bar, so a run can hold sooner than the build spend alone would predict. Set `per_unit_cap_usd_est` after the pilot ticket from its measured cost, for example at three times the median unit.

`PROGRESS.md` shows the three percentages and their reset times.

### The five-hour pause

Before every unit, if the five-hour window is at or above `five_hour_pause_pct`, the launcher writes `vault/handoff/WINDOW_PAUSE.md` (the percent and the reset time), starts nothing until two minutes after the reset, then deletes the file and continues. No notification, no override: this is the normal rhythm of a 24/7 run on a plan. A unit already running is never interrupted.

### When the weekly hold is reached

Before every unit, the launcher reads the weekly percentage. At or above `warn_at_pct` it notifies Josh once. At or above `hold_at_pct`, the launcher: Under boost (vault/handoff/BOOST.json) there is no hold, so no warning is sent either (Q-0342 (a)).
1. Writes `vault/handoff/BUDGET_HOLD.md`: the percentages, the reset time, the next unit, and how to override.
2. Notifies Josh through the configured channel.
3. Starts no new ticket. A ticket already `in-progress` keeps running until it is `done` or `blocked`, including its reviews and merge, so nothing is left half-built. The week can overshoot the hold by about one ticket's cost.
4. Exits once no ticket is in progress.

**Override:** Josh runs `node scripts/budget.mjs` with one of:
- `--hold-at <pct>` (or edits `budget.json`); the raised hold is logged with the date;
- `--until-reset`: ignore the ceiling for the rest of the week;
- `--api-until-reset`: switch `AUTH_MODE` to `api` for the rest of the week, so runs draw from the monthly API credits instead of the plan. The launcher never switches to `api` on its own; this is Josh's call each time. The credit is small next to a week of Opus units, and when it is spent API requests stop and the launcher holds again.

Then he starts the launcher again. Hold and override are Josh's decisions; agents never edit `budget.json` or `BUDGET_HOLD.md`.

### When the plan's own limit is hit

A run that ends on a plan limit error is not a bug. The launcher classifies it:
- Five-hour session limit (rare once the pause above is working): wait until the reset time in the message, then resume the same ticket from its worktree.
- Weekly limit, or any message it can't classify: treat it like the budget hold (write `BUDGET_HOLD.md`, notify, exit). The same three overrides apply; `--api-until-reset` is the one that lets work continue before the reset.

Until the message formats are confirmed in the pilot (section 15), every limit error is treated as the weekly case. Leave `autoContinueAtUsageLimit` unset for build machines so a weekly limit never leaves a session silently waiting for days.

### Notification channel

The launcher calls a notify command, kept in an untracked config. Josh uses the ntfy app, so the command posts to his ntfy topic (for example `curl -d "<message>" https://ntfy.sh/<topic>`). Use a long random topic name: on the public ntfy.sh server anyone who knows the topic can read it. It is called when the launcher stops for any reason that needs Josh: budget hold, waiting on questions, spec sign-off, a blocked phase, a failed ledger check, or a built phase. The `/remote-control` mobile push only works for interactive sessions, so it doesn't cover the launcher.

### Spend discipline

- Agent teams, dynamic workflows and nested subagents are off (rule 15), except retrievers and the planner's `plan-checker`. In project settings, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` is 3 and `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` is 2 (orchestrator → planner or reviewer → retriever); the agent files' `tools` lines keep everything else at depth 1.
- Hidden tokens are turned off in project settings (section 14): no task-list tool, no prompt suggestions, no total-tokens reminder, no goal check-ins, no auto-compaction.
- No agent reads a file over 20,000 characters without a range (section 14, guard-reads).
- No MCP servers in the build repo. CLI tools only. Code-intelligence plugins (language-server plugins such as the TypeScript one) are allowed (v2.4); builders and reviewers use go-to-definition and find-references instead of grep followed by reading candidate files.
- `CLAUDE.md` stays small (section 14).
- The wrap unit reviews the cost report each phase. `/usage` shows which subagents and tools drew the most, and its breakdown names behaviors (long context, cache misses) that account for 10% or more of recent usage; `/insights` summarizes patterns across sessions. Use both to tune the next phase.

---

## 12. CI and deploys (keep GitHub Actions usage low)

- CI runs **only** on the PR to `main` and when started by hand from the Actions tab. It does not run on every push.
- Per-ticket checks run locally with `scripts/gate.mjs`.
- `develop` is pushed after every merged ticket. This does not trigger CI or a preview build.
- Hosting builds production only from `main`. On Vercel, set the Ignored Build Step to: `[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && [ -z "$VERCEL_GIT_PULL_REQUEST_ID" ] && exit 0 || exit 1`. A push made before the PR exists is skipped, which is why the gate pushes an empty commit after opening the PR.
- Public repos get free Actions minutes and free branch protection. Never commit keys.
- Protect `main`: require a PR, require the `gate` check to pass, allow no bypassing.

---

## 13. Ledgers, lessons and progress

**`vault/tickets/PHASES.md`** — every phase, written to the rules in section 2a. Josh approves it before phase 1. **`vault/tickets/BACKLOG.md`** holds requests that arrive after approval.

**`vault/tickets/STATUS.md`** — columns: Ticket, Phase, Title, Status, Complexity, Depends on, Commit, Tests, Notes. Statuses: `todo` → `planned` or `questions` → `ready` → `in-progress` → `review` → `done`, or `blocked`. Notes record the models used and why, plan deviations, and `needs-josh-confirm` wording. Only the orchestrator edits it.

**`vault/questions/QUESTIONS.md`** — columns: ID, Phase/ticket, Asked by, Question, Status, Answered by, Answer, Source. Statuses: `open`, `answered-agent`, `escalated`, `answered-josh`, `confirmed-josh`. IDs are never reused.

**`vault/handoff/CURRENT.md`** — overwritten at the end of every session, 30 lines at most: phase and stage, why the session ended, what was completed, what's in progress, what's blocked, questions for Josh, decisions made, the next unit. The previous handoff moves to `vault/handoff/log/`.

**`vault/tickets/tickets.json`** — each ticket's dependencies, spec files, mockups, ACs, and one valid build order.

**`vault/tools/next_ticket.mjs`** — flags:
- `--ready`: the next `ready` ticket (phases in order; the lowest-numbered ticket whose dependencies are all `done`).
- `--next-unit`: the next unit, or `none: <reason>`.
- `--check`: validates the ledger against `tickets.json`, the status list above, and the sign-off and spike rules.
- `--report`: regenerates `PROGRESS.md` and `TRACE.md`.
- `--lessons <role> <areas>`: prints the `ratified` lessons for a role, filtered to the areas, for a dispatch. Candidates are never printed.

**`vault/tools/research.mjs`** — `adopt`: moves every file in `vault/research/pending/` to `vault/research/R-NNN.md` (next free number), appends the index line, prints the IDs. Run by the orchestrator after any dispatch that returned a `REPORT:` line, and by the `plan` unit before the planner finishes. A second run with nothing pending changes nothing.

**`vault/tools/outline.mjs <path>`** — prints a file's outline (Markdown: headings to depth 2 with line numbers; code: the top comment block, then each exported function, class or constant with its line; 60 lines at most). What the guard-reads hook returns on a denied whole read; agents can call it directly.

**Knowledge files are directories, not long files.** Any knowledge file an agent might be handed (lessons, decisions, architecture, spec) is split so a dispatch can hand over only the part that applies. A knowledge file that passes about 150 lines becomes a directory of smaller files with an `INDEX.md` (one line per file: what it holds, its tags). This keeps every session from reading long files that aren't relevant to its task.

**`vault/spec/decisions/`** — Josh's answers that override the spec, one file per spec area mirroring the spec files (`decisions/invoices.md` for `spec/invoices.md`), plus `INDEX.md`. A dispatch hands over the decision files for the areas the plan cites.

**`vault/lessons/`** — the mistakes we don't repeat. One file per role: `orchestrator.md`, `planner.md`, `test-author.md`, `builder.md`, `reviewer.md` (code-reviewer and security-reviewer), `ui.md` (ui-verifier), `spec.md` (Stage 0 gaps), plus `INDEX.md`. A lesson that applies to two roles is written in both files with the same L-number. Entry format:

```
## L-007  areas: auth, api  seen: 1  status: candidate
Ticket T-014, 2026-10-20
Mistake: what went wrong, in one sentence.
Cause: why it happened.
Rule: an imperative, checkable instruction.
Check: how a reviewer or the gate would catch it.
```

- **Status:** every entry carries `status: candidate | ratified | rejected`. A new entry is `candidate`. Only Josh ratifies, at the next Stage 2 (section 7, section 4 of the questions file); a candidate written after a phase's Stage 2 waits for the next phase's. Candidates never reach a dispatch. `next_ticket.mjs --check` fails on an entry without a status.
- **Who writes:** only the orchestrator, at the end of a unit. **When:** a review round failed for a reason no lesson covers; the gate failed for a repeatable reason; a ticket was blocked; Josh failed a punch-list item or overrode an agent answer; a spec gap was found late. Not for one-off typos.
- **Before adding,** search for an existing lesson. If one exists, increase its `seen` count instead of adding another.
- **Who reads:** every agent applies its role file, filtered to the plan's areas. `next_ticket.mjs --lessons <role> <areas>` prints the matching entries and the dispatch carries only those (section 10), so the files can grow without bloating context.
- **Wrap step:** merge duplicates, drop entries made obsolete, and keep each role file under about 30 entries. A ratified lesson with `seen` of 2 or more, or one a script could check, becomes a gate check, lint rule or hook, and the entry is marked `automated: <name>`.
- **Josh sees** the lessons added in each phase in the PR (informational); ratification happens at Stage 2.

**`vault/DONE.md`** — append-only, one line per merged ticket: date, ticket, title, the plan's user-visible result, commit. It is the plain-words record of what has been built.

**`vault/PROGRESS.md`** — generated, never hand-edited. Per phase: tickets done, blocked and remaining; acceptance criteria covered by merged tickets; the last ten merges; open question count; this week's estimated spend against the ceiling.

**`vault/tickets/TRACE.md`** — generated: each AC → ticket → tests.

**`vault/cost/`** — `usage.json` (the meters, section 11), `log.jsonl` (one line per run: unit, ticket, models, estimated cost, outcome) and `phase-NN.md` cost reports.

**`vault/research/`** — findings from retriever lookups. `INDEX.md` (one line per report: `R-NNN | date | title | scope | ticket`), one file per report, and `pending/` where retrievers write before adoption. A retriever briefed with `REPORT: yes` writes `pending/<agent>-<slug>.md` and returns `REPORT: pending/<file>` as its first line. Plans cite reports by ID; no agent reads a report body unless its plan or dispatch names that ID.

---

## 14. Repo setup

```
CLAUDE.md                 basic rules + a directory of where everything is (template below)
docs/architecture.md      pinned versions, folder layout, naming (written by ticket 000)
scripts/gate.mjs          the gate; prints a summary, writes gate.log, flags security paths
scripts/run.mjs           the launcher (section 10)
scripts/budget.mjs        meters, pause, hold and override (section 11)
scripts/statusline.mjs    prints the status line; writes the rate-limit windows to vault/cost/usage.json
.github/workflows/ci.yml  gate + ledger check; on: pull_request to main, workflow_dispatch
.claude/agents/*.md       one file per agent, including Explore.md, retriever-digest.md and retriever-web.md
                          (name, description, tools, model, effort, maxTurns)
.claude/skills/           spec-check, plan-ticket, review-plans, questions, build-ticket (with dispatch.md), gate-phase, wrap
.claude/hooks/            guard-paths, guard-bash, guard-reads, guard-agents, session-start, stop-ledger-check, stop-failure, session-end
.claude/settings.json     env, allow/ask/deny lists, hooks, statusLine, worktree.baseRef "head", the hidden-token switches
vault/PROCESS.md          this file
vault/budget.json         budget settings (section 11)
vault/lessons/            one file per role + INDEX.md (section 13)
vault/DONE.md             what has been built, one line per ticket
vault/PROGRESS.md         generated dashboard
vault/spec/               INDEX.md, one file per section and screen, decisions/ (per area + INDEX.md),
                          non-goals.md, glossary.md, READINESS.md, SIGNOFF.md
vault/spikes/             one note per risk, ending in a verdict
vault/tickets/            PHASES.md, BACKLOG.md, phase files, tickets.json, STATUS.md, TRACE.md, needs-from-josh.md
vault/tools/              next_ticket.mjs, research.mjs, outline.mjs
vault/plans/              TEMPLATE.md (header + ten sections from section 6), one plan per ticket, shots/
vault/questions/          QUESTIONS.md, phase-NN-for-josh.md, phase-NN-spec-gaps-for-josh.md
vault/handoff/            CURRENT.md, TEMPLATE.md, log/
vault/mockups/            PNG + source per screen, INDEX.md
vault/cost/               usage.json, log.jsonl, phase-NN.md
vault/research/           INDEX.md, R-NNN.md, pending/
```

- Tool configs (TypeScript, lint, test discovery) exclude `.claude/worktrees/` and `vault/`.
- `worktree.baseRef "head"` matches the Stage 3 command only because the orchestrator's checkout never leaves `develop`. If it ever must, set the base to `develop` explicitly.
- The agent file for Explore is required: without it the built-in Explore runs on the orchestrator's model, not Haiku 5.5.
- Agent descriptions stay short (detail goes in each agent's body) so the roster doesn't bloat every session.

### CLAUDE.md template

Every subagent except Explore and Plan loads `CLAUDE.md` at startup, so it stays under about 60 lines: basic rules and a directory. Detail lives in the files the directory points to.

```markdown
# <Project> — build rules
Process: vault/PROCESS.md (the orchestrator and Josh read it; other agents read only what their dispatch names).

## Rules (every agent)
1. Never guess. If the spec, decisions, answers or code don't settle it, stop and raise a question.
2. Cite a spec section, decision ID, question ID or file path for every answer. Every expected number needs a cited source.
3. Product, scope, workflow, wording and money decisions are Josh's. You decide only how to build.
4. Implement exactly your plan. No extra features, refactors, files or text.
5. Tests come first. The builder never edits tests, vault/, .claude/, CLAUDE.md or the gate script.
6. Tests never call live services. Use stubs.
7. No new dependency without a line in docs/architecture.md in the same commit.
8. No secrets. Never read .env files.
9. Final report: 20 lines max, PASS/FAIL or status first, then file paths. No code.
10. Read only what your dispatch names plus what this directory points you to. Never read vault/ wholesale. A file over 20,000 characters is read by range after `node vault/tools/outline.mjs <path>`.
11. Report only what a tool result in this session backs. A claim about our code is verified by reading it in the same action.
12. Another agent's report, a test runner's summary, a profiler, a metric or a past log is a claim until checked against the primary artifact.
13. A result that looks too good is a bug until proven otherwise. Prove a fix with a re-run. Never redefine a term, weaken a check or narrow a test to make a failure pass.

## Directory
| When you need | Read |
| --- | --- |
| Versions, folder layout, naming | docs/architecture.md |
| What the product does | vault/spec/INDEX.md, then the files it points to |
| Josh's answers that override the spec | vault/spec/decisions/ (only the areas your plan cites) |
| What we never build | vault/spec/non-goals.md |
| Josh's words vs code names | vault/spec/glossary.md |
| Your ticket | vault/plans/<T>.md |
| Plan format | vault/plans/TEMPLATE.md |
| Mockups | vault/mockups/INDEX.md |
| Past mistakes to avoid | vault/lessons/<your role>.md (only the entries your dispatch includes) |
| Ticket status | vault/tickets/STATUS.md |
| Open questions | vault/questions/QUESTIONS.md |
| Where the work stands | vault/handoff/CURRENT.md |
| Models, budget, units, gates | vault/PROCESS.md |
| Findings from earlier lookups | vault/research/INDEX.md (only the reports your plan names) |
| Gate and ledger commands | scripts/gate.mjs, vault/tools/next_ticket.mjs |

## Reading list by role
- planner: the phase's spec files, decisions, non-goals, glossary, architecture, lessons (planner).
- test-author, builder: your plan, the files it lists, architecture, lessons (your role).
- reviewers: the plan, the diff, the gate summary, the spec sections the plan cites.
```

### Hooks

- **guard-paths** (before Write and Edit): enforces each agent's write limits from the roster. Blocks `.env*` files except `.env.example`. Spec files are read-only after sign-off except `decisions/`. `budget.json` and `BUDGET_HOLD.md` are writable only by Josh's scripts.
- **guard-bash** (before Bash): strips quoted text before matching, then blocks force pushes, pushes to `main`, checking out `main`, `reset --hard`, `rm -rf`, production deploys, package publishing, remote database pushes, reading `.env` files, `gh pr merge`, and running `claude` from inside a session. Reviewers can't write. The builder and test-author can't merge, push or switch branches.
- **session-start** (matchers `startup`, `resume`, `clear`, `compact`): injects the handoff summary, the ledger check result, the next unit and the open question count. Output is plain text on stdout.
- **stop-ledger-check** (Stop): refuses to end the main session's turn while `next_ticket.mjs --check` fails. Escape: if `vault/handoff/FORCE_STOP` exists, the hook writes the failure into the handoff, deletes the file, and lets the session end. Use this only when the check itself is broken; fixing it is the next unit's first job.
- **guard-reads** (before Read and Bash): denies a `Read` with no `offset`/`limit` on a file over `GUARD_WHOLE_READ_CHARS` (20,000 by default), and `cat`, `head`, `tail`, `sed -n` or `less` on such a file without a narrowing range; `grep`, `wc` and ranged `sed -n 'a,bp'` pass. The denial carries the file's outline (`vault/tools/outline.mjs`) and ends "Read the ranges you need with offset and limit." Exempt list in settings, empty by default; `gate.log` is not exempt.
- **guard-agents** (before Agent): the main session may start any agent; the planner, code-reviewer, security-reviewer and phase-auditor may start only retriever-digest and retriever-web; every other agent, the retrievers included, starts none (Q-0132).
- **stop-failure** (StopFailure): records the error type and time in `vault/handoff/last-failure.json` for the launcher.
- **session-end** (timeout 30 s): archives the handoff, adds any ledger problems to it, and commits `vault/` on `develop`.
- Deny rules in settings: reading `.env`, `.env.local`, `.env.*.local`, `.env.production`, plus the same git and deploy commands as guard-bash.

### Settings

- **Project `.claude/settings.json`:** `todoFeatureEnabled: false`, `promptSuggestionEnabled: false`, `autoCompactEnabled: false`, `statusLine` → `scripts/statusline.mjs`; env `CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-5-5`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=3`, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2`, `CLAUDE_CODE_TOTAL_TOKENS_REMINDER=off`, `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0`, `GUARD_WHOLE_READ_CHARS=20000`. Never `CLAUDE_CODE_SUBAGENT_MODEL_FORCE`. With auto-compaction off, a unit whose context fills ends instead of compacting; the per-unit design makes that rare and the builder's work-in-progress commits let the next unit resume. No skill may rely on the task-list tools; the ledgers are files.
- **User `~/.claude/settings.json`** (these only work there, not in project settings): `{ "permissions": { "defaultMode": "auto" } }`.

---

## 15. First phase of any project

**Josh's decisions at setup** (asked as one numbered list, recommendation first; section 1):
1. Which Max tier, and whether runs use `plan` or `api` auth (section 11). Decided: Max 20x, `plan`.
2. The weekly build allowance and the plan's weekly reset time. Reset decided: Monday 2:00 AM Eastern. The allowance is provisional until calibrated after Stage 1 of phase 1.
3. The notification channel for the launcher. Decided: ntfy.
4. Approval of `PHASES.md`.

Josh's standing decisions on models: the orchestrator is Opus; Fable 5.1 is used by the phase-auditor, by the security-reviewer on high-complexity tickets, and by test-author and builder only as the retry step after an Opus FAIL (Josh, 2026-10-20); it runs on its own usage meter and falls back to Opus when Fable's weekly limit is reached (section 4). Josh does three things per phase (section 16).

**Ticket 000** writes `docs/architecture.md` (pinned versions, folder layout, naming), the one line in `CLAUDE.md` (`See @docs/architecture.md`) beside the template in section 14, and the process tooling:
- `scripts/gate.mjs` with the summary, `gate.log` and security-path flags;
- `next_ticket.mjs` with `--ready`, `--next-unit`, `--check`, `--report` and the sign-off and spike rules;
- `scripts/run.mjs`, `scripts/budget.mjs` and `scripts/statusline.mjs`;
- `vault/tools/research.mjs` and `vault/tools/outline.mjs`;
- the hooks (including guard-reads), settings, agent files (including Explore and the retrievers) and skills in section 14.

Before relying on a flag or message format, ticket 000 confirms it against `claude --help` and the docs for the installed version: `--permission-prompts none`, `--max-budget-usd`, `--max-turns`, the cost field in the run's JSON output, and the per-dispatch `model` and `effort` parameters.

**Pilot ticket (T-001):** a trivial change run through every step of section 8, including one deliberate failure to exercise escalation and lesson capture. It verifies, in this order:
1. The meters: the statusline script receives rate-limit data in an interactive session and writes `usage.json` (record the field names); whether the statusline fires during a `claude -p` unit; whether the endpoint fallback returns data on this machine and from which credential source; that no token string appears in any file after a poll.
2. Subagents dispatched from a `claude -p` session finish before the session ends (the orchestrator needs each result before its next step).
3. A per-dispatch `model` override takes effect (the run's JSON output or the agent's own final report names the model; `/tasks` isn't available in a `-p` run).
4. The session-start hook injects state after `/clear`, and on `startup` in a `-p` run.
5. The Stop hook, `FORCE_STOP` and the session-end hook behave as described.
6. The cost field names in the run output, and the log and budget arithmetic.
7. Budget hold, notification and override work end to end.
8. The preview deploy appears on a PR.
9. The plan-limit error message format, when first encountered.
10. `plan` and `review-plans` run as the agent with no orchestrator session, and the launcher's ledger line for them is correct.
11. The warning at 70%, the hold at 80% letting the in-progress ticket finish, and `--api-until-reset` switching auth.
12. Resuming a subagent (step-8 reviewer, same-tier builder retry) works from a `-p` session.
13. The five-hour pause writes `WINDOW_PAUSE.md`, the launcher waits, and it resumes after the reset (fixture with a short reset).
14. guard-reads denies a whole read of a 25,000-character file, allows the ranged read, and leaves `grep` alone.
15. The builder cannot dispatch any agent; the planner can dispatch `retriever-digest` and `plan-checker`, and the chain stops there.
16. `research.mjs adopt` works end to end from a retriever's pending file; `--lessons` excludes candidates; `--check` rejects an entry without `status:`.
17. No task-list widget and no prompt suggestions in an interactive session.

**Browser test harness:** a ticket in phase 1 (phase 2 at the latest) sets up end-to-end browser tests and wires them into `gate.mjs`. No ticket with a visual checklist can be `done` before this ticket is.

**Spikes:** for anything risky (a library, a performance target, an outside API), write a short note in `vault/spikes/` ending in `Verdict: go` or `no-go`. Phase 2 doesn't start until ticket 000 is done and every spike has a verdict. `next_ticket.mjs` enforces this.

**Dry run before building:** `node vault/tools/next_ticket.mjs --check` passes, and both `--next-unit` and a fresh session asked "which unit is next?" give the same answer.

---

## 16. Josh's part, per phase

**Spec sign-off** (one sitting, before planning):
1. Open `vault/questions/phase-NN-spec-gaps-for-josh.md` and answer each gap, recommendation first.
2. Read the audit result. When it returns no gaps, sign off in `vault/spec/SIGNOFF.md`.

**After Stage 2** (one sitting):
1. Open `vault/questions/phase-NN-for-josh.md`.
2. Answer each decision, recommendation first.
3. Confirm or override each agent answer.
4. Approve or edit the proposed wording.
5. Ratify or reject each rule candidate.

**At the gate** (one sitting, and where all testing happens):
1. Open the PR `Phase N: <name>` and the preview link.
2. Work the punch list on the preview; check each item off.
3. Confirm or change the `needs-josh-confirm` wording, the auditor's judgments, and the lessons added.
4. Merge the PR. Unchecked items and changes come back as fix tickets.

**Anytime:** read `vault/PROGRESS.md` for status and `vault/DONE.md` for what's built. When the launcher warns at 70% or holds at 80%, decide whether to raise the ceiling, switch to API credits for the week (`--api-until-reset`), or wait for the weekly reset. A held ticket finishes on its own; nothing new starts until you decide.

Anything else that reaches Josh mid-run is a level-4 question in the ticket's notes; it can wait until the next sitting unless the whole phase is blocked on it.

---

## 17. References

Check these when starting a project; the facts in sections 4 and 11 come from them as of October 2026.
- Plans and `claude -p` billing: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- Monthly API credits for Max and Team: https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans
- CLI flags: https://code.claude.com/docs/en/cli-reference
- Subagents (model choice, effort, limits): https://code.claude.com/docs/en/sub-agents
- Hooks (events and matchers): https://code.claude.com/docs/en/hooks
- Costs: https://code.claude.com/docs/en/costs
- Statusline (the payload the status script reads): https://code.claude.com/docs/en/statusline
- Project Architect 3.0, the source of the meters, the five-hour pause, the read guard, retrievers, research reports, rule ratification and the honesty rules: https://github.com/Druthulu/ProjectArchitect (its usage endpoint, `api.anthropic.com/api/oauth/usage`, is undocumented)
