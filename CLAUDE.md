# EZ Draft

Remodel CAD and permit-set web app for Worth Properties (tenant 1), served at ezdraft.ezcontractorbinder.com.
Owner and only human on the project: Josh Bishop. Josh is a general contractor, not a software engineer: questions to him are about what to build, never how.

## Where everything is

| What | Where |
| --- | --- |
| Build process (stages, chain of command, pipeline) | `vault/PROCESS.md` — read it before doing anything |
| Spec (do not load whole) | `vault/spec/INDEX.md` → one file per section and per screen |
| Decisions that override the spec | `vault/spec/decisions.md`, then answered rows in `vault/questions/QUESTIONS.md` |
| Tickets, one file per phase | `vault/tickets/phases/phase-NN.md`; rules in `vault/tickets/README.md` |
| Ticket data (expanded dependencies, spec files, mockups, build order) | `vault/tickets/tickets.json` |
| Ticket status ledger | `vault/tickets/STATUS.md` — checked by `node vault/tools/next_ticket.mjs --check` |
| Next ticket | `node vault/tools/next_ticket.mjs` (`--ready` in Stage 3) — never pick by number alone |
| Known limits of the documents | `vault/KNOWN-LIMITS.md` — every agent reads it |
| Spike go / no-go notes | `vault/spikes/` |
| Needs from Josh | `vault/tickets/needs-from-josh.md` |
| Per-ticket plans | `vault/plans/EZD-xxx.md` |
| Questions ledger | `vault/questions/QUESTIONS.md` |
| Handoff between sessions | `vault/handoff/CURRENT.md` (previous ones in `vault/handoff/log/`) |
| Mockups (22 Studio boards) | `vault/mockups/INDEX.md` (PNG + HTML). Sample data on boards is not a decision |
| Code rule catalog | `vault/spec/code-rules.json` (1,248 rules) |
| Architecture conventions | `docs/architecture.md` — written by ticket EZD-000 |

## Rules for every session and every agent

1. **Three stages per phase, in order: plan → questions → build.** No app code is written in Stage 1 or 2. See `vault/PROCESS.md`.
2. **Never guess.** If the spec, decisions, answered questions or existing code do not decide something, it becomes a question in `QUESTIONS.md` with the ticket marked `questions` or `blocked`. Work continues on tickets that do not depend on the answer.
3. **No citation, no answer.** Any answer an agent gives to another agent's question must cite a spec section, a decision ID, a question ID, a file path, or a code section number.
4. **Business and product decisions always go to Josh** (pricing, scope, what a screen shows, workflow, wording users see, anything that costs money). Agents decide only *how* to build.
5. **The spec is read-only.** Only the orchestrator writes in `vault/spec/`, and only to append Josh's answers to `decisions.md`.
6. **Tests come before code and the builder may not change them.** The test author writes the "Done when" test from the plan; the builder makes it pass. A test that looks wrong becomes a question, not an edit.
7. **One ticket = one branch `t/EZD-xxx` in its own worktree = one commit on `develop` after review passes.** Nobody commits to `main`. Only Josh merges `develop` → `main`.
8. **Tool configs exclude `.claude/worktrees/`, `vault/` and `spikes/`** from typecheck, lint and test discovery.
9. **The gate is a script, not an opinion:** `node scripts/gate.mjs <worktree>` (typecheck, lint, unit tests, build, plus browser tests and the performance check once they exist). A ticket cannot be `done` with a red gate.
10. **Tests never call live AI models, email, render providers or EZ Binder** (tickets README rule 4).
11. **No new dependency without a line in `docs/architecture.md`** in the same commit (spec, Named tools). The reviewer fails a ticket that adds one without it.
12. **No secrets in the repo or in agent context.** `.env*` files are unreadable to agents by rule; use `.env.example` for names only.
13. **The vault is the source of truth.** The claude.ai spec, tickets and mockup documents are frozen as of Oct 11, 2026 and superseded (Q-0008).
14. **Architecture checkpoint:** no Phase 2 ticket starts until EZD-000 is done and spikes EZD-027 to EZD-031 each have a go / no-go note in `vault/spikes/`.
15. **Before a session ends:** update `STATUS.md`, `QUESTIONS.md` and `vault/handoff/CURRENT.md` (format in `vault/handoff/TEMPLATE.md`). A Stop hook refuses to end the main session's turn while `next_ticket.mjs --check` fails.

## Conventions file

EZD-000 creates `docs/architecture.md` (pinned versions, folder layout, naming). It must not rewrite the sections above. After EZD-000 merges, the orchestrator appends one line here: `See @docs/architecture.md`. Until then, use the Stack and Named tools tables in `vault/spec/sections/02-product-overview.md`.
