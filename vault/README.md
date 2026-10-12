# Vault

Canonical copies of everything the build agents need. Agents read these; the original claude.ai artifacts are reference only.

| Folder | Contents | Written by |
| --- | --- | --- |
| `spec/` | `spec.md` (whole, do not load), `INDEX.md`, `sections/` and `sections/screens/` (one file each), `decisions.md`, `code-rules.json`, `code-check-rules.md` | Read-only. Orchestrator appends Josh's answers to `decisions.md` |
| `tickets/` | `README.md` (ticket rules), `needs-from-josh.md`, `phases/phase-NN.md`, `tickets.json` (expanded dependencies, spec files, mockups, build order), `STATUS.md` | Orchestrator edits `STATUS.md`; phase files and `tickets.json` only when splitting a ticket |
| `tools/` | `next_ticket.mjs`: next ticket, ledger check, architecture checkpoint | Josh |
| `spikes/` | Go / no-go notes for EZD-027 to EZD-031 | Orchestrator |
| `KNOWN-LIMITS.md` | Limits of these documents; every agent reads it | Read-only |
| `plans/` | `EZD-xxx.md` per ticket, `TEMPLATE.md`, `shots/` (UI verifier screenshots) | Planner, ui-verifier |
| `questions/` | `QUESTIONS.md`, `phase-NN-for-josh.md` batches | Orchestrator (assigns all Q-IDs) |
| `handoff/` | `CURRENT.md`, `TEMPLATE.md`, `log/` | Orchestrator; session-end hook rotates |
| `mockups/` | 22 Studio boards: PNG + HTML, `INDEX.md` | Read-only |

Sources, exported Oct 11, 2026:
- Build specification doc, main tab rev 502 and "Phases and tickets" tab rev 634 (401 tickets, 18 phases): https://claude.ai/code/artifact/c982b66d-3c87-4aae-94d7-642d69f6884a
- Studio mockups, design canvas version 1791755641-7309: https://claude.ai/artifact/TTF8cGeHCB3tBEkAWAU6Ex
- Code rule catalog: project doc `claude/ezdraft-code-rules.json` (1,248 rules)

**These vault files are the source of truth** (Q-0008). The claude.ai documents above are frozen as of Oct 11, 2026 and superseded; do not edit them. A spec change during the build is recorded as a Josh answer in `spec/decisions.md`, which overrides the spec text; the spec section files stay as exported (Q-0009).
