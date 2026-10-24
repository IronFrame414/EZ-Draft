---
name: spec-check
description: Unit `spec-check <N>` - Stage 0 for one phase: audit the phase's spec files against READINESS.md, turn gaps into questions for Josh, record his answers, repeat until no gaps, then Josh signs off. Interactive only; the launcher never starts it. Usage /spec-check <phase number>.
---

Run Stage 0 of `vault/PROCESS.md` (section 5) for phase $ARGUMENTS. You are the orchestrator and Josh is present. No app code, no plans.

1. Read the phase's entry in `vault/tickets/PHASES.md` (goal, user-visible result, spec files in scope, tickets, ACs). If the phase has no entry, or the re-cut of phases 1 to 17 is not yet approved by Josh, stop and ask him for that first (one numbered list).
2. **Acceptance criteria.** The phase's ACs in `vault/spec/acceptance-criteria.md` are generated from Done-when for Phase 0 only. For this phase, write real ACs: short testable sentences, `AC-<ticket>-<n>`, one block per ticket under the phase heading, and set `acs_source: "stage-0"` with the `acs` list on each ticket in `tickets.json` (then `node vault/tools/gen_acs.mjs --check` must still pass). Worked examples: every calculation in scope needs at least three (zero, maximum, rounding); if the spec has fewer, that is a gap for step 4.
3. Dispatch `phase-auditor` (read-only; `claude-fable-5-1`, Opus fallback) with: the phase's spec files, `vault/spec/READINESS.md`, `non-goals.md`, `glossary.md`, the phase's ACs, the decisions files for the areas, and `vault/mockups/INDEX.md`. It returns a numbered gap list against the ten READINESS items, each with the item number, the spec file, and what is missing.
4. Turn the gaps into `vault/questions/phase-NN-spec-gaps-for-josh.md`: for each gap the context, the options, and a recommended answer with the reason. Ask Josh the same list in chat as a plain-text numbered list, recommendation first; he answers by number; follow-ups go back as the next list.
5. Record each answer: a missing section becomes a new file under `vault/spec/sections/` (named like its neighbours; added to `INDEX.md`), a change to an existing file becomes a row in the matching `vault/spec/decisions/<area>.md` with a new Q-ID (`answered-josh` in `QUESTIONS.md`). Existing spec files are not edited.
6. Repeat steps 3 to 5 until the audit returns no gaps.
7. Ask Josh to sign off: he adds the row to `vault/spec/SIGNOFF.md` himself (or tells you the exact words to write and you write them, quoting him in the Note column). `next_ticket.mjs --next-unit` then returns `plan <first ticket>`.
8. Handoff; commit `vault/` (`docs(vault): spec-check phase $ARGUMENTS`); end the session.
