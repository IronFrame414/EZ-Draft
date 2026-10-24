# EZ Draft vault

Canonical build documents for EZ Draft v1, a multi-tenant remodel drawing and permit-set web app. Exported Oct 11, 2026 from the Claude documents after the build-readiness audit. Start with `SETUP-SESSION-BRIEF.md`.

| Path | What it is |
| --- | --- |
| `SETUP-SESSION-BRIEF.md` | What the setup session has to produce and decide. Read first. |
| `handoff.md` | State at the end of the last session. Every session reads it first and updates it last. |
| `decisions.md` | Decisions made after the build starts. |
| `spec/` | The build spec, one file per section and one per screen. `spec/INDEX.md` lists them. |
| `tickets/` | 401 tickets in 18 phases: one markdown file per phase, `tickets.json` (same tickets as data), `status.json` (the ledger), Needs from Josh, Not in v1. |
| `rules/` | The code-rule catalog, 1,248 rules, as JSON and CSV. Loaded by EZD-611a. |
| `mockups/` | The 22 Studio boards as PNG and as source HTML. `mockups/INDEX.md` maps screen to file. |
| `audit/` | The build-readiness audit of Oct 11. A record of what was found and changed; its counts describe the documents at the time of each pass. Not an instruction file. |
| `tools/next_ticket.py` | Prints the next ready ticket and checks the ledger. |

Order of authority when two files disagree: `decisions.md`, then Round 26, Round 25 and Round 24 in `spec/12-decisions-and-remaining-items.md`, then the rest of the spec, then the mockups.
