# EZ Draft — build rules
Process: vault/PROCESS.md (the orchestrator and Josh read it; other agents read only what their dispatch names). Project additions: vault/PROCESS-EZDRAFT.md.
Remodel CAD and permit-set web app for Worth Properties (tenant 1), served at ezdraft.ezcontractorbinder.com. Owner and only human: Josh Bishop, a general contractor, not a programmer. Ask him what to build, never how.

## Rules (every agent)
1. Never guess. If the spec, decisions, answers or code don't settle it, stop and raise a question.
2. Cite a spec section, decision ID, question ID or file path for every answer. Every expected number needs a cited source.
3. Product, scope, workflow, wording and money decisions are Josh's. You decide only how to build. Wording not on a mockup follows the wording rule in vault/PROCESS.md section 3a. Standing rule (Josh 2026-11-05, chat): only design and user-interface questions that cannot be resolved internally go to Josh. Every other question or block (product, scope, workflow, wording, money, security, build system) is settled by the orchestrator on Opus or a reviewer on Fable (code-reviewer, security-reviewer, phase-auditor), with its source cited, recorded as answered-agent for Josh to read, and the work goes on.
4. Implement exactly your plan. No extra features, refactors, files or text.
5. Tests come first. The builder never edits tests, vault/, .claude/, CLAUDE.md or the gate script. A test that fails only on structure goes through the structural-repair step (vault/PROCESS.md section 8).
6. Tests never call live services (AI models, email, render providers, EZ Binder). Use stubs.
7. No new dependency without a line in docs/architecture.md in the same commit.
8. No secrets. Never read .env files.
9. Final report: 20 lines max, PASS/FAIL or status first, then file paths. No code.
10. Read only what your dispatch names plus what this directory points you to. Never read vault/ wholesale; never load vault/spec/spec.md. A file over 20,000 characters is read by range after `node vault/tools/outline.mjs <path>`.
11. One ticket = one branch t/EZD-xxx in its own worktree = one commit on develop. Nobody commits to main; develop → main goes only through the phase PR, which the launcher merges once the CI `gate` check on its head is green and every production-sensitive change since the phase audit has a security pass (Q-0594; auto-merge stays off) (Josh 2026-10-23, Q-0261; Josh 2026-11-05: Claude Code always pushes, merges and completes its own PRs once the CI `gate` check is green; Josh never merges by hand). The orchestrator's checkout stays on develop.
12. The gate is a script, not an opinion: node scripts/gate.mjs <worktree>. A ticket cannot be done with a red gate.
13. Rule tickets take their numbers only from the catalog's check text (vault/spec/code-rules.json); never look up or copy code text. Mockup sample data is not a decision.
14. Report only what a tool result in this session backs. A claim about our code is verified by reading it in the same action.
15. Another agent's report, a test runner's summary, a profiler, a metric or a past log is a claim until checked against the primary artifact (the file, the diff, the output).
16. A result that looks too good is a bug until proven otherwise. Prove a fix with a re-run. Never redefine a term, weaken a check or narrow a test to make a failure pass; report failures as failures, with the output.
17. No known issue is parked (Q-0268). Narrowed by the lean process (Josh 2026-11-04): it binds app issues; build-system notes never block. Every finding is one of five kinds. **in-place:** up to about 30 changed lines in files already in the ticket, fixed before merge and re-checked by the reviewer. **defect** (app behaviour wrong, a security or data-isolation issue, anything that fails the gate): a ticket at once, at the front of the queue. **debt** (an app wording, doc or warning issue that is not wrong behaviour): one row on `vault/debt.md` with severity and deadline (`gate` before the next merge, `medium` before the phase gate, `low` within two phases). **note** (any build-system, tooling or test-plumbing issue that has not failed the gate): one line in `vault/tooling-notes.md`, no severity, no deadline, never blocking a merge or a phase gate, never a ticket. **question:** Josh's queue, design and user interface only (rule 3). Never write an app finding off as a minor, follow-up, watch item or known limit. If only a third party can fix it, it goes to Josh as a question with the evidence and the workarounds.
18. Build for the long term (Josh 2026-10-27). The system must be secure, robust, bug free and lasting, with no major rework or overhaul later. For app security and data integrity, close the whole class of problem instead of the one example and prefer a design that cannot drift from what it checks (D3 (a)). Elsewhere, including the agents' own accident guards (guard-bash, guard-paths), fix the case found and stop; the guards are not a sandbox (lean process, Josh 2026-11-04). When options differ, recommend the most secure and robust long-term option and say plainly what it costs. The build system is frozen (lean process, Josh 2026-11-04): a new build-system ticket (launcher, guards, hooks, ledger tools, sandbox, skills) only when the launcher cannot run at all, or secrets or app data are exposed, and each still needs Josh's yes on a one-line why and cost.

## Directory
| When you need | Read |
| --- | --- |
| Versions, folder layout, naming | docs/architecture.md, by section (Conventions file below) |
| What the product does | vault/spec/INDEX.md, then the files it points to |
| Josh's answers that override the spec | vault/spec/decisions/INDEX.md (only the areas your plan cites) |
| What we never build | vault/spec/non-goals.md |
| Josh's words vs code names | vault/spec/glossary.md |
| Acceptance criteria | vault/spec/acceptance-criteria.md |
| Known limits of the documents | vault/KNOWN-LIMITS.md (read once) |
| Your ticket | vault/plans/<T>.md; its row in vault/tickets/phases/phase-NN.md |
| Plan format | vault/plans/TEMPLATE.md |
| Mockups | vault/mockups/INDEX.md (PNG + HTML; sample data is not a decision) |
| Code rule catalog | vault/spec/code-rules.json, vault/spec/code-check-rules.md |
| Past mistakes to avoid | vault/lessons/<your role>.md (only the entries your dispatch includes) |
| Phases and ticket status | vault/tickets/PHASES.md, vault/tickets/STATUS.md |
| Open questions | vault/questions/QUESTIONS.md |
| Answered questions still needed (no longer needed: QUESTIONS-archive.md) | vault/questions/QUESTIONS-answered.md |
| Where the work stands | vault/handoff/CURRENT.md |
| Models, budget, units, gates | vault/PROCESS.md; project specifics in vault/PROCESS-EZDRAFT.md |
| Findings from earlier lookups | vault/research/INDEX.md (only the reports your plan names) |
| Gate and ledger commands | scripts/gate.mjs, vault/tools/next_ticket.mjs |
| Spike notes | vault/spikes/ |

## Reading list by role
- planner: the phase's spec files, decisions for those areas, non-goals, glossary, acceptance criteria, the architecture sections the ticket needs, lessons (planner), KNOWN-LIMITS, the phase's vault/research/reuse/ file and the files it marks `reference` (Q-0405).
- test-author, builder: your plan, the files it lists, the architecture sections on your dispatch's `Architecture:` line, lessons (your role), KNOWN-LIMITS.
- reviewers: the plan, the diff, the gate summary, the spec sections the plan cites, decisions the plan cites, the architecture sections on the dispatch's `Architecture:` line.

## Conventions file
docs/architecture.md (pinned versions, folder layout, naming; written by EZD-000) is never imported here and never read whole (EZD-244). Read it by heading with `node vault/tools/outline.mjs docs/architecture.md --section '<heading>'`. With a ticket, run the `Architecture:` line of `node vault/tools/next_ticket.mjs --reads <ticket> <role>` (the core sections, then the ticket's own). Without one (interactive and orchestrator sessions), print the core (the file's `Core sections:` line), list the headings with `--headings` and print the ones the task needs.
