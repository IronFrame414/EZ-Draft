# EZ Draft — build rules
Process: vault/PROCESS.md (the orchestrator and Josh read it; other agents read only what their dispatch names). Project additions: vault/PROCESS-EZDRAFT.md.
Remodel CAD and permit-set web app for Worth Properties (tenant 1), served at ezdraft.ezcontractorbinder.com. Owner and only human: Josh Bishop, a general contractor, not a programmer. Ask him what to build, never how.

## Rules (every agent)
1. Never guess. If the spec, decisions, answers or code don't settle it, stop and raise a question.
2. Cite a spec section, decision ID, question ID or file path for every answer. Every expected number needs a cited source.
3. Product, scope, workflow, wording and money decisions are Josh's. You decide only how to build. Wording not on a mockup follows the wording rule in vault/PROCESS.md section 3a.
4. Implement exactly your plan. No extra features, refactors, files or text.
5. Tests come first. The builder never edits tests, vault/, .claude/, CLAUDE.md or the gate script. A test that fails only on structure goes through the structural-repair step (vault/PROCESS.md section 8).
6. Tests never call live services (AI models, email, render providers, EZ Binder). Use stubs.
7. No new dependency without a line in docs/architecture.md in the same commit.
8. No secrets. Never read .env files.
9. Final report: 20 lines max, PASS/FAIL or status first, then file paths. No code.
10. Read only what your dispatch names plus what this directory points you to. Never read vault/ wholesale; never load vault/spec/spec.md. A file over 20,000 characters is read by range after `node vault/tools/outline.mjs <path>`.
11. One ticket = one branch t/EZD-xxx in its own worktree = one commit on develop. Nobody commits to main; develop → main goes only through the phase PR, which the gate-phase unit sets to auto-merge when the CI `gate` check passes (Josh 2026-10-23, Q-0261: until Josh says the system works and turns it off; then he merges by hand again). The orchestrator's checkout stays on develop.
12. The gate is a script, not an opinion: node scripts/gate.mjs <worktree>. A ticket cannot be done with a red gate.
13. Rule tickets take their numbers only from the catalog's check text (vault/spec/code-rules.json); never look up or copy code text. Mockup sample data is not a decision.
14. Report only what a tool result in this session backs. A claim about our code is verified by reading it in the same action.
15. Another agent's report, a test runner's summary, a profiler, a metric or a past log is a claim until checked against the primary artifact (the file, the diff, the output).
16. A result that looks too good is a bug until proven otherwise. Prove a fix with a re-run. Never redefine a term, weaken a check or narrow a test to make a failure pass; report failures as failures, with the output.
17. No known issue is parked (Q-0268). Every finding of any size (a reviewer minor, a deviation that leaves something wrong, a flaky test, a warning from our code or configuration in a build, test run, browser console or service log) is fixed before the ticket merges or becomes a fix ticket in the same phase. Never write it off as a minor, follow-up, watch item or known limit. If only a third party can fix it, it goes to Josh as a question with the evidence and the workarounds.

## Directory
| When you need | Read |
| --- | --- |
| Versions, folder layout, naming | docs/architecture.md |
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
| Where the work stands | vault/handoff/CURRENT.md |
| Models, budget, units, gates | vault/PROCESS.md; project specifics in vault/PROCESS-EZDRAFT.md |
| Findings from earlier lookups | vault/research/INDEX.md (only the reports your plan names) |
| Gate and ledger commands | scripts/gate.mjs, vault/tools/next_ticket.mjs |
| Spike notes | vault/spikes/ |

## Reading list by role
- planner: the phase's spec files, decisions for those areas, non-goals, glossary, acceptance criteria, architecture, lessons (planner), KNOWN-LIMITS.
- test-author, builder: your plan, the files it lists, architecture, lessons (your role), KNOWN-LIMITS.
- reviewers: the plan, the diff, the gate summary, the spec sections the plan cites, decisions the plan cites.

## Conventions file
EZD-000 creates docs/architecture.md (pinned versions, folder layout, naming) and must not rewrite this file. After EZD-000 merges, the orchestrator appends one line here: `See @docs/architecture.md`. Until then, use the Stack and Named tools tables in vault/spec/sections/02-product-overview.md.
See @docs/architecture.md
