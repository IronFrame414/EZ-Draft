# Build process handoff

How Josh wants software built with Claude Code. This file covers only the process. It contains nothing about what the product is; the product's spec comes separately.

**First session in a new repo:** read this whole file, set up the files under "Repo setup", then stop and ask Josh for the spec if there isn't one in the repo yet.

## Who is who

- **Josh** is the owner and the only human on the project. He is a general contractor, not a programmer. Ask him **what** to build, never **how**. Ask in plain words, give options with a recommendation first, and ask one question at a time. Tone: factual and direct, with no compliments.
- **Orchestrator:** the main Claude Code session. It picks the work, sends it to subagents, routes questions, merges finished tickets and keeps the ledgers. It does not write app code itself. Its checkout stays on `develop` at all times; worktrees branch from it.
- **Subagents** do the work (see Agents). They are plain subagents, not agent teams.

## The three stages (every phase, in this order)

```
Phase N
  Stage 1  Plan       planner writes one plan per ticket; reviewer checks the plans together
  Stage 2  Questions  chain of command answers what it can; Josh answers the rest and
                      confirms or overrides the agents' answers
  Stage 3  Build      per ticket: tests → test review → code → gate → review → merge to develop
  Gate                full checks, audit, fix tickets, PR develop → main, Josh works the punch list and merges
```

- Nobody writes app code in Stage 1 or Stage 2.
- Stage 3 does not start until every question for the phase is answered, unless Josh says a ticket may start early.
- Josh touches each phase twice: once after Stage 2 to answer questions and confirm agent answers, and once at the gate to work the punch list and merge.

## Rules for every session and every agent

1. **Never guess.** If the spec, decisions, answered questions or existing code don't settle something, it becomes a question and the ticket waits. Work continues on tickets that don't depend on the answer.
2. **No citation, no answer.** An agent answering another agent's question must cite a spec section, a decision, a question ID or a file path. Every expected number in a test cites its source the same way (a spec table, a hand calculation Josh verified, a reference document). A number without a source is a question.
3. **Business and product decisions always go to Josh.** That covers scope, what a screen shows, workflow, and anything that costs money. **User-visible wording** follows the wording rule below so it doesn't block tickets.
4. **The spec is read-only.** Changes are recorded as Josh's answers in `vault/spec/decisions.md`, and those answers override the spec text.
5. **Tests come before code, and the builder may not change tests.** A test whose *behavior or expected values* look wrong becomes a question. A test that fails only because of *structure* (a file name, an export, a signature, a route, a test ID) follows the structural-repair step in Stage 3.
6. **One ticket = one branch = one commit on `develop`.** Nobody commits to `main`. Only Josh merges `develop` → `main`, once per phase.
7. **The gate is a script, not an opinion.** A ticket can't be `done` while the gate is red.
8. **Tests never call live services** (AI models, email, payments, outside APIs). Use stubs.
9. **No new dependency without a line in `docs/architecture.md`,** added in the same commit.
10. **No secrets in the repo or in agent context.** `.env.local` is unreadable to agents. Only variable names go in `.env.example`.
11. **The vault is the source of truth.** Once the spec is copied into `vault/`, any outside copies are frozen.
12. **Before a session ends,** update the ticket ledger, the questions ledger and the handoff file.

### Wording rule (user-visible text)

- Text that appears on an approved mockup is decided. Sample data on a mockup is not a decision.
- Text that does not appear on a mockup (error messages, validation text, empty states, toasts, button labels on unmocked states) is proposed by the planner in the plan, in a section titled **Proposed wording**. Josh approves or edits it in bulk at Stage 2.
- Text discovered during Stage 3 that no plan covers: the builder writes it in the same style as the approved wording, the ticket records it under `needs-josh-confirm` in STATUS notes, and the ticket does not block. All such text is listed in the phase PR for Josh to confirm or change. Changes become fix tickets.

## Agents

| Agent | Model | Job | Can write |
| --- | --- | --- | --- |
| orchestrator (main session) | Opus | Picks tickets, dispatches agents, routes questions, merges, keeps ledgers | `vault/` only |
| planner | Opus | Stage 1: one plan per ticket, listing every open question; re-validates dependent plans in Stage 3 | `vault/plans/` |
| test-author | Sonnet | Writes the failing tests and fixtures from the plan; structural repairs only after that | test files, fixtures, test configs |
| builder | Sonnet for round 1, Opus from round 2 of the same ticket | Writes code until the gate passes | app code; never tests, `vault/`, `.claude/`, `CLAUDE.md` or the gate script |
| builder-senior | Opus | Same agent file as builder with `model: opus`; the orchestrator dispatches it from round 2 | same as builder |
| code-reviewer | Opus | Reviews the plans together (Stage 1), the tests against the plan (before build), and each finished ticket; returns PASS or FAIL | nothing |
| ui-verifier | Sonnet | Runs the app, takes screenshots and checks them against the plan's visual checklist and the mockup | screenshots only |
| security-reviewer | Opus | Auth, permissions, data isolation, money visibility, the API | nothing |
| phase-auditor | Fable (falls back to Opus) | Reviews the whole phase against the spec before Josh sees it | nothing |
| Explore | Haiku | Codebase search | nothing |

**For a small project,** start with orchestrator, planner, test-author, builder and code-reviewer. Add ui-verifier when there are screens. Add security-reviewer when there are logins, user data or money. Add a domain specialist (such as a calculation auditor) only when the product has rules worth checking against known values.

**Reviewers don't run the gate.** They read its output. ui-verifier runs the app to take screenshots; it does not run builds or tests.

Write limits are enforced by hooks, not only by instructions (see Safeguards).

## Stage 1: plan

For each ticket, in ticket order, the planner writes `vault/plans/<TICKET>.md` from `vault/plans/TEMPLATE.md`. Each plan includes:
- what to build and which files it touches;
- the spec sections, decisions and mockup it relies on, cited;
- an **interface contract**: file paths, exported names and signatures, route paths, component props, and `data-testid` values the tests will use. Tests and code are both written to this contract;
- the tests, with known correct values for every number and a cited source for each value;
- a **visual checklist** when a screen changes: which elements, which states (empty, loading, error, filled), and which mockup each maps to;
- **Proposed wording** for any user-visible text not on a mockup;
- `security-review: yes` or `no`, with the areas touched (auth, permissions, data access, money, API) when yes;
- dependencies, including ones the ticket list missed;
- open questions, labelled QP-1, QP-2 and so on. Only the orchestrator turns these into Q-IDs, so planners running in parallel can't produce the same ID twice.

The code-reviewer then reads all the phase's plans together, looking for missed requirements, conflicts between tickets, and interface contracts that don't line up between a ticket and its dependents.

**Oversized tickets:** if a plan won't fit one build session, the planner proposes splitting it into lettered parts (T-012a, T-012b). The orchestrator updates the phase file, ticket data and ledger in one commit.

After Stage 1, each ticket's status is `planned` or `questions`.

## Stage 2: questions (chain of command)

Each question climbs this chain until someone can answer it with a citation:

| Level | Who | Answers when |
| --- | --- | --- |
| 1 | Asking agent | The answer is in the spec, decisions, an answered question or existing code |
| 2 | Orchestrator | The answer is in another plan, the phase context or a dependency |
| 3 | Specialist (code-reviewer for architecture, security-reviewer for permissions, a domain auditor for its own domain) | Only within their domain |
| 4 | Josh | Nobody above can cite an answer, or it's a business or product decision |

- Agent answers are logged as `answered-agent` with their source.
- Questions for Josh go in one file per phase, `vault/questions/phase-NN-for-josh.md`, with three sections:
  1. **Decisions needed** — each question gives the context, the options and a recommended answer with the reason.
  2. **Agent answers to confirm** — every `answered-agent` entry for the phase, with its source, as a confirm-or-override list. Josh sees these before anything is built on them.
  3. **Proposed wording** — all wording from the plans, approved or edited in bulk.
- If Josh is at the computer, also ask the decisions as multiple-choice prompts, recommendation first.
- Josh's answers and overrides are logged as `answered-josh` and appended to `vault/spec/decisions.md` with the question ID. Agent answers he confirms become `confirmed-josh`.
- Agent answers Josh has not confirmed when Stage 3 starts stand as written, so an unattended run doesn't stall. If he overrides one later, any ticket already built on it gets a fix ticket.

## Stage 3: build (one ticket at a time)

The orchestrator takes the next ready ticket, using `vault/tools/next_ticket.mjs --ready`:

1. **Re-validate the plan** if any dependency's STATUS notes record a deviation from its plan. The planner updates the plan's interface contract and citations; a changed test value or behavior is a question. Skip if no dependency deviated.
2. Create a worktree with `git worktree add .claude/worktrees/<T> -b t/<T> develop`. Status → `in-progress`. **Resume:** if the worktree or branch `t/<T>` already exists (a session ended mid-ticket), continue in it from the last commit; don't recreate it. `next_ticket.mjs` prints an `in-progress` or `review` ticket first, so a new session always finishes it before starting another.
3. **test-author** writes failing tests in that worktree from the plan's interface contract. Commit `test(<T>): …`.
4. **Test review:** code-reviewer checks the tests against the plan: every acceptance item covered, every expected value matches the plan and its cited source, structure matches the interface contract. FAIL → back to test-author. PASS → continue.
5. **builder** implements the plan exactly, committing work in progress on the ticket branch as it goes so a restart resumes instead of starting over. Anything the plan doesn't cover becomes a question, and the ticket goes to `blocked` while other tickets continue — except wording, which follows the wording rule.
   - **Structural test repair:** if a test fails only because the code's structure differs from the test (and the plan's contract didn't settle it), the builder reports the mismatch; test-author fixes only the structure; code-reviewer confirms the diff touched no assertions or expected values. Any dispute about behavior is a question.
6. **Gate:** the orchestrator runs `node scripts/gate.mjs .claude/worktrees/<T>` once (typecheck, lint, tests, build, browser tests). The gate also prints the touched paths (`git diff --name-only develop...HEAD` in the worktree) and flags any that match the security path list at the top of `gate.mjs` (default: `auth/`, `api/`, `db/`, `middleware`, migrations, billing; edit it per project). Reviewers read its output and don't run it themselves.
7. **Review:** code-reviewer reviews every ticket against its plan, the spec, decisions and mockup, and confirms the implementation handles the general case, not only the test inputs. ui-verifier also reviews when the plan has a visual checklist. security-reviewer reviews when the plan says `security-review: yes` **or** the gate flagged a path — either trigger is enough.
8. **FAIL** → the findings go back to the builder in the same worktree. Round 1 uses Sonnet; from round 2 the builder runs on Opus. After 3 failed rounds the ticket goes to `blocked` with notes, and the orchestrator moves on.
9. **PASS** → squash the branch into one commit `feat(<T>): <title>` on `develop`, remove the worktree, mark the status `done` with the commit hash, record any deviation from the plan in STATUS notes, and push `develop`. Pushing is free (CI doesn't run on pushes and hosting skips `develop`), and it protects the work.

## Phase gate

1. The ledger check passes.
2. The full gate passes on `develop`.
3. security-reviewer reviews the whole phase diff, if that agent is in use.
4. phase-auditor reviews the whole phase against the spec. Findings are handled before the PR opens:
   - a defect or a missed requirement becomes a fix ticket in the same phase (next free number in the phase, title starting `Fix:`; see Ticket IDs), planned, tested, built and reviewed like any ticket;
   - a product judgment goes in the PR for Josh.
5. The orchestrator pushes `develop` and opens a PR `develop` → `main` titled `Phase N: <name>`, then pushes one empty commit (`chore: preview`) so hosting builds the preview for the PR. The PR contains:
   - **Punch list:** per ticket, what to click and what should happen. Josh checks items off; an unchecked item becomes a fix ticket.
   - tickets done, tickets blocked and why;
   - `needs-josh-confirm` wording;
   - product judgments from the auditor.
6. Josh works the punch list on the preview deploy and merges the PR himself.

On the first phase of a project, confirm the preview actually appears on the PR. If it doesn't, fix the hosting rule before moving on.

## CI and deploys (keep GitHub Actions usage low)

- CI runs **only** on the PR to `main` and when started by hand from the Actions tab. It does not run on every push.
- Per-ticket checks run locally with `scripts/gate.mjs`.
- `develop` is pushed after every merged ticket. This does not trigger CI or a preview build.
- Hosting builds production only from `main`. To skip preview builds for `develop` on Vercel, set the Ignored Build Step to: `[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && [ -z "$VERCEL_GIT_PULL_REQUEST_ID" ] && exit 0 || exit 1`. A push that happens before the PR exists is skipped, which is why the gate pushes an empty commit after opening the PR.
- Public repos get free Actions minutes and free branch protection. Never commit keys.
- Protect `main`: require a PR, require the `gate` check to pass, and allow no bypassing.

## Ticket IDs

- Format: `<PREFIX>-<number>` with an optional lowercase letter for split parts, e.g. `T-012`, `T-012a`. The prefix is set per project (EZ Draft uses `EZD`). `next_ticket.mjs` parses only this format, so no other suffixes (`-fix`, `-v2`).
- Phase N owns numbers N×100 to N×100+99 (phase 0: 000–099). Fix tickets and punch-list tickets take the next free number in their phase.
- A new ticket is added to the phase file, `tickets.json` and `STATUS.md` in one commit by the orchestrator, then `next_ticket.mjs --check` must pass.

## Ledgers and handoff

- `vault/tickets/STATUS.md` has columns Ticket, Phase, Title, Status, Depends on, Commit, Tests and Notes. The statuses are: `todo` → `planned` or `questions` → `ready` → `in-progress` → `review` → `done`, or `blocked`. Notes record plan deviations and `needs-josh-confirm` wording. Only the orchestrator edits it.
- `vault/questions/QUESTIONS.md` has columns ID, Phase/ticket, Asked by, Question, Status, Answered by, Answer and Source. The statuses are `open`, `answered-agent`, `escalated`, `answered-josh` and `confirmed-josh` (an agent answer Josh confirmed). IDs are never reused.
- `vault/handoff/CURRENT.md` is overwritten at the end of every session. It contains: phase and stage, why the session ended, what was completed, what's in progress, what's blocked and the questions for Josh, decisions made, and the next 3 steps. The previous handoff is moved to `vault/handoff/log/`.
- `vault/tickets/tickets.json` holds each ticket's dependencies, spec files, mockups and one valid build order. `vault/tools/next_ticket.mjs` prints the next ticket (phases in order; the lowest-numbered ticket whose dependencies are all `done`). With `--ready`, it only considers `ready` tickets. With `--check`, it validates the ledger against `tickets.json`.

## Repo setup

```
CLAUDE.md                 where everything is + the rules above (short)
docs/architecture.md      pinned versions, folder layout, naming (written by the first ticket)
scripts/gate.mjs          the gate; prints touched paths and security flags
.github/workflows/ci.yml  gate + ledger check; on: pull_request to main, workflow_dispatch
.claude/agents/*.md       one file per agent (name, description, tools, model)
.claude/skills/           plan-phase, questions, build-phase, phase-gate, handoff
.claude/hooks/            guard-paths, guard-bash, session-start, session-end, ledger-check
.claude/settings.json     model, allow/ask/deny lists, hooks, worktree.baseRef "head"
vault/PROCESS.md          this process
vault/spec/               spec split into one file per section and screen, INDEX.md, decisions.md
vault/tickets/            phase files, tickets.json, STATUS.md, needs-from-josh.md
vault/tools/next_ticket.mjs
vault/plans/              TEMPLATE.md, one plan per ticket, shots/
vault/questions/          QUESTIONS.md, phase-NN-for-josh.md
vault/handoff/            CURRENT.md, TEMPLATE.md, log/
vault/mockups/            PNG + source per screen, INDEX.md (sample data on mockups is not a decision)
```

Tool configs (TypeScript, lint, test discovery) exclude `.claude/worktrees/` and `vault/`.

`worktree.baseRef "head"` only matches the Stage 3 command because the orchestrator's checkout never leaves `develop`. If it ever must, set the base to `develop` explicitly.

## Safeguards (hooks)

- **guard-paths** (runs before Write and Edit): enforces each agent's write limits from the Agents table. It blocks `.env*` files except `.env.example`. The spec is read-only except `decisions.md`.
- **guard-bash** (runs before Bash): strips quoted text before matching, then blocks force pushes, pushes to `main`, checking out `main`, `reset --hard`, `rm -rf`, production deploys, package publishing, remote database pushes, reading `.env` files and `gh pr merge`. Reviewers can't write. The builder and test-author can't merge, push or switch branches.
- **session-start:** adds the handoff, the ledger check result, the next ticket and the open question count to the session context.
- **Stop (ledger-check):** refuses to end the main session's turn while `next_ticket.mjs --check` fails. Escape: if `vault/handoff/FORCE_STOP` exists, the hook writes the check failure into the handoff, deletes the file, and lets the session end. Use this only when the check itself is broken (a bug in the script or malformed `tickets.json`); the next session's first job is fixing it.
- **session-end** (timeout 30 s): archives the handoff, adds any ledger problems to it, and commits `vault/` on `develop`.
- Deny rules in settings: reading `.env`, `.env.local`, `.env.*.local`, `.env.production`, plus the same git and deploy commands as guard-bash.

## Running unattended

- **User settings** (`~/.claude/settings.json`; these only work there, not in project settings): `{ "autoContinueAtUsageLimit": true, "permissions": { "defaultMode": "auto" } }`.
- Start each stage with `/goal`, for example: `/goal Follow the build-phase skill for phase N until every ticket in the phase is done or blocked in STATUS.md, each done ticket shows a commit hash, and the gate exits 0 on develop`. A stage stops by design when all tickets are planned, when everything left is waiting on Josh, when the phase is built, or at a usage limit (it resumes on its own when the limit resets).
- Keep the machine awake and pause OS updates during a run. A restart kills the session; the builder's work-in-progress commits on the ticket branch let the next session resume the ticket rather than restart it.
- Run `/remote-control` in the session to reach it from the phone.
- One build per machine at a time. Two parallel builds can run out of memory, and failed tests then waste usage on retries.
- Start with one ticket in progress at a time. Raise the limit only when Josh says so and the plans touch no shared files.

## First phase of any project

- **Ticket 000:** architecture conventions in `docs/architecture.md` (pinned versions, folder layout, naming), then one line in `CLAUDE.md`: `See @docs/architecture.md`.
- **Browser test harness:** a ticket in phase 1 (or phase 2 at the latest) sets up end-to-end browser tests and wires them into `gate.mjs`. No ticket with a visual checklist can be `done` before it: the planner lists the harness ticket under dependencies of every plan that has a visual checklist, and the orchestrator adds it to `depends_on` in `tickets.json`.
- **Spikes:** for anything risky (a library, a performance target, an outside API), write a short spike note in `vault/spikes/` ending in `Verdict: go` or `no-go`. Phase 2 doesn't start until ticket 000 is done and every spike has a verdict. `next_ticket.mjs` enforces this.
- Dry run before building: `node vault/tools/next_ticket.mjs --check` passes, and both `next_ticket.mjs` and a fresh session asked "which ticket is next?" name ticket 000.

## Project-specific (EZ Draft)

Kept from the earlier `vault/PROCESS.md`. Where these add to the general process above, both apply.

**Commands.** Stage 1 `/plan-phase N`, Stage 2 `/questions N`, Stage 3 `/build-phase N`, gate `/phase-gate N`, end of session `/handoff`.

**Extra agent: calc-auditor** (Opus, high effort, writes nothing). Load calc, voltage drop, scaling, dimensions and code-check rules; checks numbers against known values. In the chain of command it answers NEC / FBC / calculation questions (Level 3). In Stage 3 it reviews any ticket that touches calculations, dimensions, scaling or code-check rules. security-reviewer's domain here: tenant isolation, row-level security, money permissions (company cost vs sell price), auth, client link. ui-verifier writes screenshots under `vault/plans/shots/`.

**Write limits beyond the table.** The orchestrator may also write `CLAUDE.md` and `docs/architecture.md`; in `vault/spec/` only `decisions.md`. test-author may also write `test-utils/` and `test-harness/`. builder may add new CI workflow files but never `ci.yml`.

**Ticket data.** `tickets.json` lists every ticket with `depends_on` (base IDs expanded to all lettered parts), `spec_files`, `mockups` and one valid `build_order`. Josh's answers go in `decisions.md` under "Build answers (Josh)".

**Oversized tickets.** Anything that depended on a split ticket's base ID now depends on every part. The 20 code-rule tickets (EZD-611b, 611c, 616 to 618, 621 to 639; about 30 checks plus 35 reminders each) are the likeliest to need a split.

**Special tickets.**
- **Harness tickets** (EZD-006, EZD-008, EZD-016a, EZD-016b, EZD-019, EZD-021): the test-author builds the harness code itself (test configs, `test-utils/`, `test-harness/`, fixtures, stubs); the builder does any non-test part. The browser test harness ticket in the general process is EZD-016a.
- **EZD-000:** after merge, the orchestrator appends `See @docs/architecture.md` to CLAUDE.md and copies `docs/architecture.md` to `vault/architecture.md`, re-copying on every merge that changes it (Q-0012).
- **EZD-000 / EZD-001** must exclude `.claude/worktrees/`, `vault/` and `spikes/` from TypeScript, lint and test discovery.
- **Spikes EZD-027 to EZD-031:** the builder reports the result; the orchestrator writes `vault/spikes/<ID>.md` from `vault/spikes/TEMPLATE.md` with its `Verdict:` line.

**Architecture checkpoint.** EZD-000 (conventions) and spikes EZD-027 to EZD-031 are the point where the architecture can still change. No Phase 2 ticket starts until EZD-000 is done and all five notes exist; `next_ticket.mjs` enforces it (exit 4). The Phase 0 gate's phase audit reviews these notes and `docs/architecture.md` before they are locked.

**Gate scope (Q-0006, Q-0019).** In a ticket worktree the gate runs the phase's tests plus the `@smoke` set; at the root or with `--full` it runs the full suite. After each squash merge, the orchestrator runs `node scripts/gate.mjs . --phase <N>` on `develop`. Only one gate runs at a time on this machine.

**Phase gate additions.**
- The full gate on `develop` also runs the phase's "Build gate" test from its phase file.
- security-reviewer also reviews every change to production-sensitive paths (`.github/workflows/**`, `scripts/release/**`, `scripts/backup/**`, `scripts/hosting/**`, `supabase/migrations/**`, `supabase/bootstrap/**`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`) and writes a plain-language "Production-sensitive changes: PASS / FAIL" section for the PR (Q-0112). A FAIL blocks the PR.
- The PR is opened from the agents' GitHub account (Q-0108) and also carries the "Production-sensitive changes" section and the phase's Field check.
- Merging the PR releases automatically (Q-0106): the release workflow backs up production, applies migrations and makes the build live, or stops with the live site unchanged.

**Limits.** One ticket in progress at a time (`next_ticket.mjs --check` fails on more than one). Josh raises the limit by editing this section.
