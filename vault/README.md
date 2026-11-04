# Vault

Canonical copies of everything the build agents need. Agents read these; the original claude.ai artifacts are reference only.

| Folder | Contents | Written by |
| --- | --- | --- |
| `spec/` | `spec.md` (whole, do not load), `INDEX.md`, `sections/` and `sections/screens/` (one file each), `decisions/` (one file per area + `INDEX.md`; `decisions.md` is a pointer), `acceptance-criteria.md` (generated), `glossary.md`, `non-goals.md`, `READINESS.md`, `SIGNOFF.md`, `code-rules.json`, `code-check-rules.md` | Read-only after sign-off. Orchestrator appends Josh's answers in `decisions/`; Josh writes `SIGNOFF.md` |
| `tickets/` | `PHASES.md` (phases and slices, Josh approves), `BACKLOG.md`, `README.md` (ticket rules), `needs-from-josh.md`, `phases/phase-NN.md`, `tickets.json` (expanded dependencies, spec files, mockups, ACs, build order), `recut.json`, `STATUS.md`, `TRACE.md` (generated), `gates/` (gate records) | Orchestrator edits `STATUS.md`; phase files and `tickets.json` only when splitting or adding a ticket |
| `tools/` | `next_ticket.mjs` (next ticket, next unit, ledger check, reports, lessons), `gen_acs.mjs` (acceptance criteria), `apply_recut.mjs` (phase re-cut) | Josh |
| `spikes/` | Go / no-go notes for EZD-027 to EZD-031 | Orchestrator |
| `KNOWN-LIMITS.md` | Limits of these documents; every agent reads it | Read-only |
| `plans/` | `EZD-xxx.md` per ticket, `TEMPLATE.md`, `review-phase-NN.md`, `shots/` (ui-verifier screenshots) | Planner, ui-verifier; the orchestrator or launcher writes the review files |
| `questions/` | `QUESTIONS.md` (open and escalated), `QUESTIONS-answered.md` (answered, still needed), `QUESTIONS-archive.md` (answered, no longer needed), `phase-NN-for-josh.md` batches | Orchestrator (assigns all Q-IDs) |
| `handoff/` | `CURRENT.md`, `TEMPLATE.md`, `log/`, `PILOT.md`, `MAC-MIGRATION.md`, `PROCESS-V2-MIGRATION.md`; `STOP`, `BUDGET_HOLD.md`, `FORCE_STOP` when present | Orchestrator; session-end hook rotates; the launcher writes the hold |
| `lessons/` | One file per role + `INDEX.md` | Orchestrator, at the end of a unit |
| `cost/` | `log.jsonl` (launcher runs), `phase-NN.md` (wrap reports) | Launcher; orchestrator at wrap |
| `PROCESS.md`, `PROCESS-EZDRAFT.md`, `budget.json`, `DONE.md`, `PROGRESS.md` | The process, the project additions, the budget, what is built, the generated dashboard | Josh (process, budget); orchestrator (DONE); generated (PROGRESS) |
| `mockups/` | 36 Studio boards: PNG + HTML, `INDEX.md` | Read-only |
| `archive/` | Superseded first export (Q-0011) and the Oct 17 process files. Never read | Nobody |

Sources, exported Oct 11, 2026:
- Build specification doc, main tab rev 502 and "Phases and tickets" tab rev 634 (401 tickets, 18 phases): https://claude.ai/code/artifact/c982b66d-3c87-4aae-94d7-642d69f6884a
- Studio mockups, design canvas versions 1791755641-7309 and 1791766660-e6c1: https://claude.ai/artifact/TTF8cGeHCB3tBEkAWAU6Ex
- Code rule catalog: project doc `claude/ezdraft-code-rules.json` (1,248 rules)

**These vault files are the source of truth** (Q-0008). The claude.ai documents above are frozen as of Oct 11, 2026 and superseded; do not edit them. A spec change during the build is recorded as a Josh answer in `spec/decisions/<area>.md`, which overrides the spec text; the spec section files stay as exported (Q-0009).
