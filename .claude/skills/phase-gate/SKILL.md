---
name: phase-gate
description: Phase gate - full gate, security review, Fable phase audit, fix tickets, and PR develop to main with a punch list for Josh. Usage /phase-gate <phase number>.
disable-model-invocation: true
---

Run the phase gate in `vault/PROCESS.md` for phase $ARGUMENTS. You are the orchestrator.

1. `node vault/tools/next_ticket.mjs --check` must pass. On `develop`: `node scripts/gate.mjs .` and the phase's Build gate test named in its phase file. Red → stop and report.
2. Dispatch `security-reviewer` over the phase diff (`git diff main..develop`) with the gate output. It also writes the "Production-sensitive changes: PASS / FAIL" section (Q-0112); a FAIL blocks the PR.
3. Dispatch `phase-auditor` with the phase number and the gate output from step 1. At the Phase 0 gate, also give it `docs/architecture.md` and the five spike notes: this is the plan review before the architecture is locked. (If Q-0004 says Opus, pass model "opus" for this call.)
4. **Auditor and security findings, before the PR opens:**
   - A defect or a missed requirement becomes a **fix ticket** in this phase: the next free number in the phase's range (phase N owns N×100 to N×100+99; phase 0 owns 000–099), title starting `Fix:`. No suffixes such as `-fix` or `-v2`. Add it to the phase file, `tickets.json` (with `depends_on` and `build_order`) and `STATUS.md` in one commit, run `node vault/tools/next_ticket.mjs --check`, then plan, test, build and review it like any ticket (`/plan-phase`, `/questions`, `/build-phase` steps for that ticket). Then repeat steps 1–3.
   - A product judgment goes in the PR body for Josh, not a fix ticket.
5. Push `develop` (`git push origin develop`), then open a PR with `gh pr create --base main --head develop --title "Phase $ARGUMENTS: <name>"`. The PR starts the only CI run of the phase (the required `gate` check). Body:
   - **Punch list:** a checkbox per done ticket - what to click on the preview and what should happen, in plain words. Josh checks items off; an unchecked item becomes a fix ticket.
   - tickets done (ID, title, commit); tickets blocked and why;
   - **Wording to confirm:** every `needs-josh-confirm` entry from STATUS notes (ticket, where it shows, the text);
   - **Product judgments** from the phase-auditor;
   - agent-answered questions not yet `confirmed-josh`, for Josh to confirm;
   - the "Production-sensitive changes" section; reviewer findings not fixed; the phase's Field check copied from the phase file.
6. After the PR is open, push one empty commit so hosting builds the preview for the PR: `git commit --allow-empty -m "chore: preview"` then `git push origin develop`. On the project's first phase gate, check with `gh pr view` that a Vercel preview appears on the PR; if none appears within a few minutes, say so in the handoff and the report (the Vercel Ignored Build Step needs fixing before the next phase).
7. Write the handoff with the PR link and commit `vault/`, then push `develop`.
8. Report the PR link and the preview link. Josh works the punch list on the preview and merges; do not merge to main yourself.
