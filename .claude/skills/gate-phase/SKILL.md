---
name: gate-phase
description: Unit `gate-phase <N>` - phase gate: ledger check, full gate on develop, security review of the phase diff, phase audit, fix tickets, PR develop → main with Josh's punch list, preview commit. Usage /gate-phase <phase number>.
---

Run the phase gate of `vault/PROCESS.md` (section 9) for phase $ARGUMENTS, with the additions in `vault/PROCESS-EZDRAFT.md` section 7. You are the orchestrator. Every ticket in the phase must be `done` or `blocked`. **Advisor (process v2.4):** you run on Sonnet 5.5 with an Opus 5.5 advisor. Consult it before opening the phase PR, before marking a ticket `blocked` and when a decision is not covered by PROCESS.md or the spec; not otherwise (each call re-reads the whole transcript).

1. `node vault/tools/next_ticket.mjs --check` passes. On `develop`: `node scripts/gate.mjs . --full`, plus the phase's Build gate test named in `vault/tickets/phases/phase-NN.md`. Red → stop, handoff, report.
2. `node vault/tools/next_ticket.mjs --report` (fresh `TRACE.md` and `PROGRESS.md`).
3. Dispatch `security-reviewer` over the phase diff (`git diff origin/main...develop`) with the gate summary. It also writes the "Production-sensitive changes: PASS / FAIL" section (Q-0112); a FAIL blocks the PR.
4. Dispatch `phase-auditor` (`claude-fable-5-1`; `claude-opus-5-5` if `EZD_FABLE_ALLOWED` is `0` or Fable fails) with: the diff range, the phase's plan paths, `vault/tickets/TRACE.md`, the phase's spec files, and the gate output. Every AC in the phase must map to a merged ticket with passing tests. At the Phase 0 gate also give it `docs/architecture.md` and the five spike notes (the architecture is locked after this).
5. **Findings, before the PR opens:**
   - a defect or a missed requirement → a **fix ticket**: next free number in the phase's range, title `Fix: …`, added to the phase file, `tickets.json` (`depends_on`, `build_order`, `acs` via `node vault/tools/gen_acs.mjs`) and `STATUS.md` in one commit; then it is planned, questioned, built and reviewed like any ticket (`plan`, `questions`, `build` units), and steps 1 to 4 repeat. Under the launcher: write the ticket, handoff, end; `--next-unit` picks it up.
   - a product judgment → the PR body, for Josh.
6. Push `develop`, then `gh pr create --base main --head develop --title "Phase $ARGUMENTS: <name>"` (from the agent account, Q-0108). Body:
   - **Punch list:** Josh's test script from `vault/tickets/PHASES.md` for this phase, as checkboxes, plus one line per done ticket (what to click, what should happen). An unchecked item becomes a fix ticket.
   - tickets done (ID, title, commit); tickets blocked and why;
   - **Wording to confirm:** every `needs-josh-confirm` entry from STATUS Notes;
   - **Product judgments** from the phase-auditor; agent answers not yet `confirmed-josh`;
   - the "Production-sensitive changes" section; the phase's Field check from the phase file; lessons added this phase.
   Then turn on auto-merge: `gh pr merge <url> --auto --merge` (Q-0261). If GitHub refuses it (auto-merge off in the repository settings, or a review still required), say so in the handoff and the end report; Josh then merges by hand.
7. Push one empty commit so hosting builds the preview for the PR: `git commit --allow-empty -m "chore: preview"`, `git push origin develop`. On the project's first gate, confirm with `gh pr view` that a preview appears; if none appears within a few minutes, say so in the handoff (the hosting rule, PROCESS.md section 12, needs fixing before the next phase).
8. Write `vault/tickets/gates/phase-NN.md`: `PR: <url>`, `Develop at PR: <full sha>`, `Merged: no`, the audit verdict, fix tickets created. `next_ticket.mjs --next-unit` reads it (waiting for the merge → `wrap` once the SHA is in `origin/main`).
9. Handoff; commit `vault/` (`docs(vault): gate phase $ARGUMENTS`); push `develop`. End the session with the PR link and the preview link. GitHub merges when the CI `gate` check passes; Josh works the punch list after. Never push to `main` and never merge without `--auto`.
