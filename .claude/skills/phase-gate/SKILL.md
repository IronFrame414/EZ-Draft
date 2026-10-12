---
name: phase-gate
description: Phase gate - full gate, security review, Fable phase audit, and PR develop to main for Josh. Usage /phase-gate <phase number>.
disable-model-invocation: true
---

Run the phase gate in `vault/PROCESS.md` for phase $ARGUMENTS. You are the orchestrator.

1. `node vault/tools/next_ticket.mjs --check` must pass. On `develop`: `node scripts/gate.mjs .` and the phase's Build gate test named in its phase file. Red → stop and report.
2. Dispatch `security-reviewer` over the phase diff (`git diff main..develop`) with the gate output.
3. Dispatch `phase-auditor` with the phase number and the gate output from step 1. At the Phase 0 gate, also give it `docs/architecture.md` and the five spike notes: this is the plan review before the architecture is locked. (If Q-0004 says Opus, pass model "opus" for this call.)
4. Push `develop` once (`git push origin develop`), then open a PR with `gh pr create --base main --head develop --title "Phase $ARGUMENTS: <name>"`. The PR starts the only CI run of the phase (the required `gate` check). Body: tickets done (ID, title, commit); tickets blocked and why; agent-answered questions for Josh to confirm; reviewer findings not fixed; the phase's Field check copied from the phase file; the Vercel preview link if `gh pr view` shows one.
5. Write the handoff with the PR link and commit `vault/`.
6. Report the PR link. Josh reviews the preview and merges; do not merge to main yourself.
