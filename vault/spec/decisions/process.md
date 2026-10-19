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
| Q-0116 | 2026-10-18 | (a): set the Vercel Ignored Build Step (PROCESS.md section 12). Previews come only from the phase PR; the gate pushes an empty `chore: preview` commit after opening it. Field checks use the phase PR preview. EZD-003 Step 3 and EZD-023b's develop-preview text re-validated. |
| Q-0118 | 2026-10-18 | (a) Phase 0 of `vault/tickets/PHASES.md` approved as written (goal, result, test script). (b) the 53-slice re-cut is still open (Josh has seen slices 1 to 3). |
| Q-0119 | 2026-10-18 | Estimated-dollar ceilings superseded by the real usage meters of PROCESS.md v2.3 section 11 (built by EZD-000b); `weekly_ceiling_usd_est` and `fable_ceiling_usd_est` are optional, proxy mode only. ntfy topic set in `scripts/launcher.config.json`. |
| Q-0118 (b) | 2026-10-18 | Josh reviews the 53-slice re-cut before Phase 1 starts; nothing applied now. Agent answers Q-0005 to Q-0120 listed in phase-00-for-josh.md section 2 confirmed, except Q-0094 (overridden) and Q-0023 (already superseded by Q-0107). |
| Q-0124 | 2026-10-19 | (a): the builder may write `scripts/conventions/` (the conventions check); the gate, launcher and budget stay protected. |
| Q-0125 | 2026-10-19 | (a): the orchestrator may fix and commit faults in the launcher, hooks, skills and ledger tools when a run is broken, under fix mode (`vault/handoff/LAUNCHER_FIX.md` present), recorded in the handoff for Josh to confirm or revert. Same for a plan path a guard denies. |
| Q-0129 | 2026-10-19 | Agent questions are answered automatically and promptly through the chain of command (levels 1 to 3, with citations); only uncitable or business/product questions escalate to Josh, notified at once, while the run continues on other ready work. |
| Q-0138 | 2026-10-19 | (a): Phase 0 tooling ticket EZD-000j makes the OAuth usage fallback read `utilization`, with its scale (0–1 or 0–100) confirmed by one live probe, so unattended runs gate on real percentages; before the Phase 0 gate. |
| Q-0126 to Q-0151 | 2026-10-19 | Josh, in chat: the 24 agent answers in phase-00-for-josh.md section 2 (Q-0126 to Q-0137, Q-0139 to Q-0151) confirmed, Q-0132's two PROCESS.md edits applied; rule candidates L-001 to L-008 ratified. Section 3 wording not yet answered (Josh on mobile; raise again at desktop). |
