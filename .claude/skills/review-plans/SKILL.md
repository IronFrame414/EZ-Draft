---
name: review-plans
description: Unit `review-plans <N>` - the code-reviewer reads all of a phase's plans together (missed requirements, conflicts, interface contracts that don't line up) and TRACE.md is regenerated. The launcher runs it as the code-reviewer agent. Usage /review-plans <phase number>.
---

Plan review for phase $ARGUMENTS (PROCESS.md section 6, "Plan review unit"). Read-only on app code; nothing is built.

**If you are the code-reviewer agent** (launcher run with `--agent code-reviewer`): do the review below and end with the report; the launcher writes it to `vault/plans/review-phase-NN.md` and the handoff. **If you are the orchestrator** (interactive): run `node vault/tools/next_ticket.mjs --report` first, dispatch `code-reviewer` in mode 1 with the list of the phase's plan paths and `vault/tickets/TRACE.md` (dispatch template in `.claude/skills/build-ticket/dispatch.md`), then write its report to `vault/plans/review-phase-NN.md` (two-digit phase) and do the ledger step.

Review (code-reviewer, mode 1):
1. Read every `vault/plans/EZD-<phase>xx.md` for the phase and `vault/tickets/TRACE.md` (phase section). Read spec files only to settle a specific doubt.
2. Report, numbered, with plan path and section: missed requirements (an AC of the phase with no plan row covering it; TRACE.md shows ACs per ticket); conflicts between tickets; wrong or missing dependencies; interface contracts that don't line up between a ticket and its dependents (a dependent imports a path, name, signature, route or `data-testid` the earlier plan doesn't provide, or provides differently); tests without a sourced expected value; a plan with a visual checklist that does not depend on EZD-016a; user-visible text not on a mockup that is not under Proposed wording; a plan missing `security-review: yes|no`, a complexity rating or ACs; a plan over the size limit (about 8 files or 10 tests) with no split proposal.
3. End with `VERDICT: PASS` (no findings that need a plan change) or `VERDICT: FAIL` and the list of plans to re-dispatch to the planner. 20 lines per finding at most; no code.

Ledger step (orchestrator; the launcher does it for an agent-run unit): save the report as `vault/plans/review-phase-NN.md`; for each plan that needs a change, the next `plan <T>` unit re-dispatches the planner with the findings (set that ticket back to `todo` so `--next-unit` picks it up, and note why in STATUS Notes); an uncovered AC goes back to the planner of the ticket that owns it. Handoff; commit `vault/` (`docs(vault): review plans phase $ARGUMENTS`); end the session.
