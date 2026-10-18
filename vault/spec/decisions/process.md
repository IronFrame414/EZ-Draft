# Decisions · Build process and repository (answers that shape how the build runs rather than the product)

Josh's answers during the build, for this spec area. Each overrides the spec text and any Round 24–26 row that names the same thing. The question, the asker and the full source are in `vault/questions/QUESTIONS.md`; new answers are appended here by the orchestrator with their Q-ID.

| Q-ID | Date | Answer |
| --- | --- | --- |
| Q-0004 | 2026-10-11 | Fable uses existing usage credits with no auto-refill. Use Fable for phase audits; fall back to Opus if the credits run out. |
| Q-0019 | 2026-10-11 | Build PC has 16 GB RAM: keep parallel test workers low (Playwright workers = 2) and never run two gate checks at once. |
| Q-0006 | 2026-10-11 | Each ticket's check runs the phase's tests plus a smoke set; the full suite runs at the phase gate. Rule 3 in `tickets/README.md` is updated; Josh applies the `scripts/gate.mjs` change specified in the EZD-001 plan. |
| Q-0011 | 2026-10-11 | The duplicate first export at the repo root is moved to `vault/archive/original-export/`. Agents never read `vault/archive/`. |
| Q-0025 | 2026-10-11 | The `.env` read deny is narrowed to `.env.local`, `.env.*.local`, `.env.production` and `.env.development`; `.env.example` is readable. |
| Q-0032 | 2026-10-12 | (a): EZD-003's repo work merges to develop in Stage 3; the ticket stays blocked (waiting on Josh: Vercel, DNS, Phase 0 merge) and the live HTTPS check runs right after the Phase 0 merge, as part of the field check. |
| Q-0065 | 2026-10-12 | (b): real fixtures are committed only after Josh removes names, addresses and photo location data; the README says so. The repository will be made private after the app is built (public for now for the free tooling). |
| Q-0108 | 2026-10-12 | Agents use a separate GitHub account with Write access only; they push develop and open PRs; only Josh approves and merges into main (branch protection requires his approval of the latest push). |
| Q-0114 | 2026-10-17 | Playwright workers = 4 on the Mac mini; still one gate at a time (replaces Q-0019's worker count). |
| Q-0117 | 2026-10-18 | Process v2 adopted with: Phase 0 kept as planned (37 tickets; the only exception to the 4-to-10 rule); Stage 0 skipped for Phase 0 (retroactive sign-off); EZD- IDs and v2 statuses; calc-auditor kept; `autoContinueAtUsageLimit` unset; Q-0006 gate scope stands. |
