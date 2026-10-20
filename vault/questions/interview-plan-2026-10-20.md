# Spec interviews, smaller spec files, and a reading map (approved by Josh 2026-10-20)

Josh's choices (taken as the recommendations when he approved this plan): whole system first; real job stories, then short numbered follow-ups; a one-time OK to restructure the locked spec files (PROCESS.md rule 4), recorded as a Q-ID when the restructure runs. Josh added the reading map (2026-10-20).

## How every round works
- One interview session per round, with Josh present; the launcher never runs these.
- The orchestrator writes up what Josh said. He confirms or corrects it, then it goes into the spec with a Q-ID.
- Follow-up questions come in batches of 15 or fewer, numbered, recommendation first. Every calculation gets at least three worked examples with real numbers, including the zero, maximum and rounding cases (vault/spec/READINESS.md item 4); the calc-auditor checks the numbers.
- Work happens on its own branch and merges into develop only between launcher units. Phase 0 builds keep running.

## Round 0 — prep (orchestrator, no interview)
- One phase-auditor pass over the whole spec against the 10 READINESS items.
- A contradiction sweep: the S19–S22 boards against the X-files marked "not in mockup", the "mockups still needed" line in 13-decisions-and-remaining-items.md, and the draft PHASES.md re-cut.
- Output: vault/questions/interview-00-prep.md, with the gap list by area and the round-1 questions. Nothing is decided.

## Round 1 — the whole job (Josh, about an hour)
- Walk through 2–3 real jobs (kitchen, bath, one with electrical work): first call, measure, draw, client approval, permit set and department, changes, field crew, closeout. For each: where EZ Draft is used, by whom, and what it must produce.
- Approve or change the 17-phase order and the PHASES.md draft.
- Output: new vault/spec/sections/00-job-stories.md, decision rows, an approved PHASES.md, and a goal line per phase.

## Restructure and reading map (orchestrator, after round 1)
- **Smaller files.** Split the spec files into area files of 20,000 characters or fewer (for example, 09 into load calc, electrical rules, building rules, geometry, cabinets/countertops, ceilings, sheets/revisions, takeoff; 03 by table group). Text moves word for word, and a check script proves nothing was lost. Each old file becomes a pointer; INDEX.md is updated.
- **Reading map.** Each ticket's tickets.json entry lists its exact spec files down to the heading, plus its decision files and mockups. `node vault/tools/next_ticket.mjs --reads <ticket> <role>` prints the dispatch lines (spec files, decisions, plan sections). `--check` fails if a listed file is missing or a spec file is over 20,000 characters. This runs in fix mode, with tests first and a green gate.

## Round 2 — Phase 1–2 areas (Josh)
Sign-in and company settings (S01, S15), roles and permissions (10), app shell (04), plan editor (S03, geometry): screen states (empty, loading, error, no permission), wording, failure paths.

## Round 3 — calculations and rules (Josh)
Load calc, code warnings, cabinets, countertops, ceilings and lighting, sheet sets, revisions, takeoff: worked examples with real numbers, checked by the calc-auditor.

## Round 4 — outside services and later areas (Josh)
EZ Binder, renders, client link, field pack and Spanish, change orders: what happens when a service is down, sample responses, and the open items in section 13.

## Then
`/spec-check 1` mostly confirms; Josh signs off; Phase 1 planning starts. Later phases get a short spec check that uses the same map.

## How we'll know it worked
- Josh confirms each round's write-up before any file changes.
- The restructure check proves every word was kept.
- `--check` passes with every ticket's reading list resolving.
- At Phase 1, `vault/tools/usage-by-agent.mjs` compares planner context and question counts against Phase 0 (171 questions, 93 answered by Josh).
