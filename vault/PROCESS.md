# Build process

Every phase runs three stages in order. Josh touches the build twice per phase: after Stage 2 (answer questions) and after Stage 3 (review the preview, merge `develop` → `main`).

```
Phase N
  Stage 1  /plan-phase N     planner writes vault/plans/EZD-xxx.md for every ticket; reviewer checks plans
  Stage 2  /questions N      chain of command answers what it can; Josh answers the rest
  Stage 3  /build-phase N    per ticket: tests → build → gate → review → merge to develop
  Gate     /phase-gate N     full suite, security review, Fable phase audit, PR develop → main
```

## Tools

- `vault/tickets/tickets.json` — every ticket with `depends_on` (base IDs expanded to all lettered parts), `spec_files`, `mockups`, and one valid `build_order`. Checked at export: 401 tickets, no cycles, no dependency on a later phase; 29 tickets depend on a later-numbered ticket in the same phase.
- `node vault/tools/next_ticket.mjs` — the coordinator rule as code: phases in order; in the current phase the lowest-numbered ticket whose dependencies are all `done`. `--ready` limits it to `ready` tickets (Stage 3). `--check` validates the ledger. It also enforces the architecture checkpoint.
- Dry run after setup: `node vault/tools/next_ticket.mjs` prints `EZD-000`, and a fresh session asked "what is the next ticket?" must name the same one.

## Agents

| Agent | Model | Job | Can write |
| --- | --- | --- | --- |
| orchestrator (main session) | Opus | Picks tickets, dispatches agents, routes questions, merges, keeps ledgers | `vault/` only (in `vault/spec/` only `decisions.md`) |
| planner | Opus | Stage 1: one plan per ticket; lists every open question in the plan | `vault/plans/` |
| test-author | Sonnet | Writes the failing "Done when" tests and fixtures from the plan; on harness tickets builds the test harness | test files, fixtures, test configs, `test-utils/`, `test-harness/` |
| builder | Sonnet | Implements the ticket until the gate passes | app code and new CI workflows; never tests, `vault/`, `.claude/`, `CLAUDE.md`, the gate script or `ci.yml` |
| code-reviewer | Opus | Reviews every ticket against plan, spec, decisions, mockup; PASS / FAIL | nothing |
| calc-auditor | Opus, high effort | Load calc, voltage drop, scaling, dimensions, code-check rules; checks numbers against known values | nothing |
| ui-verifier | Sonnet | Runs the app, screenshots, compares to the mockup PNG | screenshots under `vault/plans/shots/` |
| security-reviewer | Opus | Tenant isolation, row-level security, money permissions (company cost vs sell price), auth, client link | nothing |
| phase-auditor | Fable (fallback Opus) | Whole-phase review against the spec before Josh sees it | nothing |
| Explore (override) | Haiku | Codebase search | nothing |

Write limits are enforced by `.claude/hooks/guard-paths.mjs`, not only by instructions.

## Stage 1 — Research and plan

For each ticket in the phase, in ticket order, the planner writes `vault/plans/EZD-xxx.md` using `vault/plans/TEMPLATE.md`:

- what to build and the files it will touch;
- the spec sections, decisions and mockup it relies on (cited);
- the tests, with known correct values for every number (dimensions, load calc, scaling, voltage drop);
- dependencies, including ones the ticket row missed;
- every question it could not answer from the sources, listed in the plan as QP-1, QP-2…; the orchestrator assigns the Q-IDs and logs them in `QUESTIONS.md` (only the orchestrator assigns IDs, so parallel planners cannot collide).

Then the code-reviewer reads all the phase's plans together for missed requirements and conflicts between tickets. Findings become plan edits or questions.

**Oversized tickets (decision 3.8).** If a plan shows a ticket will not fit one build session, the planner proposes a split into lettered parts (EZD-217a, EZD-217b). The orchestrator adds the new rows to the phase file, `tickets.json` (with `depends_on`; anything that depended on the base ID now depends on every part) and `STATUS.md` in one commit, then plans each part. The 20 code-rule tickets (EZD-611b, 611c, 616 to 618, 621 to 639; about 30 checks plus 35 reminders each) are the likeliest to need it.

STATUS after Stage 1: each ticket is `planned` (no open questions) or `questions`.

## Stage 2 — Questions (chain of command)

Every open question in `QUESTIONS.md` climbs this chain until someone can answer it **with a citation**:

| Level | Who | Answers when |
| --- | --- | --- |
| 1 | Asking agent | The answer is in the spec, `decisions.md`, an answered question, or existing code. |
| 2 | Orchestrator | The answer is in another ticket's plan, phase context, or a dependency. |
| 3 | Specialist routed by the orchestrator | calc-auditor: NEC / FBC / calculations. security-reviewer: permissions, roles, money visibility. code-reviewer: technical conventions and architecture. In their domain only. |
| 4 | Josh | Nobody above could cite an answer, or it is a business/product decision. |

- Agent answers are logged as `answered-agent` with the source. Josh sees them in the batch and can override any.
- Josh's questions go into one file: `vault/questions/phase-NN-for-josh.md` — context, options, a recommended answer with the reason, one question at a time. If Josh is at the computer, the orchestrator also asks them as multiple-choice prompts, recommendation first.
- Josh's answers are recorded as `answered-josh` and appended to `vault/spec/decisions.md` under "Build answers (Josh)" with the question ID, so later agents find them at Level 1.
- Stage 3 does not start until every question for the phase is answered. Tickets that depend on nothing open may be marked `ready` earlier only if Josh says so.

## Stage 3 — Build (one ticket at a time)

The orchestrator takes the ticket printed by `node vault/tools/next_ticket.mjs --ready`:

1. `git worktree add .claude/worktrees/EZD-xxx -b t/EZD-xxx develop`; STATUS → `in-progress`.
2. **test-author** writes the failing tests in that worktree from the plan. Commit `test(EZD-xxx): …`.
3. **builder** implements in the same worktree, following the plan exactly. Anything the plan does not cover → a question, and the ticket pauses (`blocked`) while others continue.
4. **Gate:** the orchestrator runs `node scripts/gate.mjs .claude/worktrees/EZD-xxx` once; it must exit 0. Reviewers get its output and do not run builds themselves.
5. **Review:** code-reviewer always; calc-auditor if the ticket touches calculations, dimensions, scaling or code-check rules; ui-verifier if it changes a screen; security-reviewer if it touches tables, permissions, money, auth, share links or the API.
6. **FAIL** → findings back to the builder (same worktree). After 3 failed loops the ticket is `blocked` with notes in STATUS and a question in QUESTIONS; the orchestrator moves on.
7. **PASS** → squash the branch to one commit `feat(EZD-xxx): <title>` on `develop`, push `develop`, remove the worktree, STATUS → `done` with the commit hash.

CI is bundled to save usage: GitHub Actions runs the gate and ledger check once per phase, on the phase PR (`develop` → `main`), plus by hand from the Actions tab. `develop` is pushed once at the end of each build run, not after each ticket, so Vercel builds a preview only then. Per-ticket checks are local (`node scripts/gate.mjs`).

Special tickets:
- **Harness tickets** (EZD-006, EZD-008, EZD-016, EZD-019, EZD-021): the test-author builds the harness code itself (test configs, `test-utils/`, `test-harness/`, fixtures, stubs); the builder does any non-test part.
- **EZD-000**: after merge, the orchestrator appends `See @docs/architecture.md` to CLAUDE.md and copies `docs/architecture.md` to `vault/architecture.md`.
- **EZD-000 / EZD-001** must exclude `.claude/worktrees/`, `vault/` and `spikes/` from TypeScript, lint and test discovery, so a check run at the repo root never scans ticket worktrees.

**Architecture checkpoint.** EZD-000 (conventions) and spikes EZD-027 to EZD-031 are the point where the architecture can still change. Each spike ends with a note in `vault/spikes/` (`Verdict: go` or `no-go`). No Phase 2 ticket starts until EZD-000 is done and all five notes exist; `next_ticket.mjs` enforces it. The Phase 0 gate's phase audit reviews these notes and `docs/architecture.md` before they are locked.

## Phase gate

0. `node vault/tools/next_ticket.mjs --check` must pass.
1. Full gate on `develop`, plus the phase's "Build gate" test from its phase file.
2. security-reviewer over the whole phase diff. It also reviews every change to production-sensitive paths (`.github/workflows/**`, `scripts/release/**`, `scripts/backup/**`, `scripts/hosting/**`, `supabase/migrations/**`, `supabase/bootstrap/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`) and writes a plain-language "Production-sensitive changes: PASS / FAIL" section for the PR (Q-0112). A FAIL blocks the PR.
3. phase-auditor (Fable) over the whole phase against the spec.
4. Orchestrator opens a PR `develop` → `main` titled `Phase N: <name>` (from the agents' GitHub account, Q-0108) with: tickets done, tickets blocked and why, questions answered by agents (for Josh to confirm), the "Production-sensitive changes" section, and the phase's Field check.
5. Josh clicks through the Vercel preview, approves and merges the PR. Merging releases automatically (Q-0106): the release workflow backs up production, applies migrations and makes the build live, or stops with the live site unchanged. Then he starts the next phase.

## Ledgers

- `vault/tickets/STATUS.md` — statuses: `todo` → `planned` / `questions` → `ready` → `in-progress` → `review` → `done`, or `blocked`. Only the orchestrator edits it.
- `vault/questions/QUESTIONS.md` — statuses: `open`, `answered-agent`, `escalated`, `answered-josh`.
- `vault/handoff/CURRENT.md` — overwritten at the end of every session (format: `TEMPLATE.md`). The session-end hook copies the previous one to `log/`, adds any ledger problems to it, and commits `vault/`. A Stop hook blocks the main session from ending a turn while the ledger check fails.

## Limits

- One ticket in progress at a time to start. Two independent tickets may run in parallel only when their plans touch no common files and Josh has raised the limit in this file.
- A stage runs under `/goal`. It stops by design at: all tickets planned, all questions waiting on Josh, phase built, or a usage limit (it resumes when the limit resets).
