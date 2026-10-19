---
name: wrap
description: Unit `wrap <N>` - after Josh merges the phase PR: consolidate lessons, write the phase cost report, regenerate progress, record the merge, hand off. Usage /wrap <phase number>.
---

Run the wrap of `vault/PROCESS.md` (section 9, "Wrap unit") for phase $ARGUMENTS. You are the orchestrator. Run it only after the phase PR is merged (`git fetch origin` and `git merge-base --is-ancestor <Develop at PR sha> origin/main` succeeds; the sha is in `vault/tickets/gates/phase-NN.md`).

1. `git fetch origin`; confirm the merge; set `Merged: yes` in `vault/tickets/gates/phase-NN.md`. Punch-list items Josh left unchecked, and wording or lessons he changed in the PR, become fix tickets in the phase (same procedure as gate-phase step 5) and are noted in the handoff; the launcher builds them before the next phase starts.
2. **Lessons** (PROCESS.md section 13): merge duplicates across `vault/lessons/*.md`, drop entries made obsolete, keep each role file under about 30 entries, update `vault/lessons/INDEX.md` (areas per file). Any ratified lesson with `seen` of 2 or more, or any ratified lesson a script could check, becomes a gate check, lint rule or hook: write the check proposal in the cost report's "Automate" list (you do not edit `scripts/` or `.claude/`; Josh applies it) and mark the entry `automated: <name>` once he has.
3. **Cost report** `vault/cost/phase-NN.md`, from `vault/cost/log.jsonl` and STATUS Notes: spend per ticket, per unit type, per model (Fable separately); tickets that needed escalation (tier changes) and why; places Opus or Fable ran on low-complexity work, or Haiku failed; defects the resumed step-8 reviewer missed that the auditor or Josh then caught (section 8 revisit flag); whether the phase cost more than a third of `weekly_ceiling_usd_est` (section 2a rule 9: recommend splitting the next phase if so); the median unit cost (for `per_unit_cap_usd_est`); recommended changes to the complexity table, ticket-size numbers and maxTurns, as a numbered list for Josh (PROCESS.md changes need his yes).
4. `node vault/tools/next_ticket.mjs --report`.
5. Handoff: next unit is the next phase's `spec-check` (needs Josh) or, if its spec is already signed off, `plan <first ticket>`. Commit `vault/` (`docs(vault): wrap phase $ARGUMENTS`); push `develop`; end the session. Report: cost total, Fable total, lessons kept, recommendations.
