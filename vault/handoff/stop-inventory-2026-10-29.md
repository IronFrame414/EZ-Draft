# Stop and block inventory · 2026-10-29 (orchestrator, read-only research; key claims re-checked in code)

Josh's rule (2026-10-29, chat): "the only thing that should stop forward progress as a whole and for individual tickets is if there is something that cannot be answered by the information already within this system or if something has tried and failed to complete its task even after being escalated to a higher model 2-3 times."
Josh approved the redesign (2026-10-29): "Approve the redesign with keep money stops and launcher-applied grants".

Verified in code by the orchestrator: `scripts/run.mjs:605-608` retries a failed unit once on the same model, then stops; `scripts/watchdog.mjs:39-40` never restarts a launcher that stopped after a notice; `scripts/run.mjs:62-72` fixes each unit's model (build/questions/gate-phase/wrap/repair Sonnet, plan/review-plans Opus); `vault/tools/next_ticket.mjs:500` throws on round 4 or higher.

## Stop and block points (L = whole launcher, T = one ticket)
- S1 run.mjs:598 (L exit): no-progress guard; a non-build unit, or a build whose table() fails, ends ok twice with STATUS unchanged. No escalation. CHANGE.
- S2 unit-steps.mjs:221/306 → run.mjs:595-599 (L exit): table() accepts only in-progress/review, so a looping `ready` ticket stops the launcher (EZD-258, 06:23). CHANGE.
- S3 run.mjs:585-596 (T): a build stuck twice is tabled ("most likely waiting on Josh"), same Sonnet model, no escalation. CHANGE.
- S4 run.mjs:605-608 (L exit): error/max_turns/budget failure: one same-model retry, then stop. CHANGE.
- S5 run.mjs:605 (L): other failures (e.g. error_during_execution) are re-run on the same model with no cap (the no-progress guard counts only ok outcomes). CHANGE.
- S6 run.mjs:549-559, 162-168 (L exit): plan-limit error writes a hold and exits; with `limit_formats_confirmed` false every limit is treated as weekly (config file not readable by the researcher). KEEP for weekly (money); CHANGE if a five-hour limit is treated as weekly.
- S7 run.mjs:531-537, budget.mjs:100-117 (L exit): budget hold / ceiling unset. KEEP (money, Josh 2026-10-29).
- S8 run.mjs:507, launcher-idle.mjs:33 (L exit): `none: budget hold`. KEEP.
- S9 launcher-idle.mjs:30 (L wait): STOP file. KEEP.
- S10 next_ticket.mjs:709 + repair (L wait): ledger check failure → Sonnet repair, max 3, one try per wait, then a silent wait; 0 repair runs ever logged. CHANGE (ladder).
- S11 next_ticket.mjs:744 (L wait): phase spec not signed off. KEEP.
- S12 next_ticket.mjs:755-758 (L wait): before Stage 3 an escalated question holds the phase (KEEP); the "questions changed nothing" loop guard (CHANGE).
- S13 next_ticket.mjs:763 (L wait): architecture checkpoint not met; Sonnet repair only. Undetermined.
- S14 next_ticket.mjs:766-769, run.mjs:411-417 (T hold, L wait): guard-grant holds wait for Josh's patch, though Q-0386 (2) says the orchestrator applies plan-named grants. CHANGE: the launcher's own code applies grants for files an approved plan names (Josh 2026-10-29).
- S15 next_ticket.mjs:670-675, 776 (T): `blocked` never re-enters the queue; "blocked on ticket X" lives only in note text; the wait message blames Josh even when agent-fixable. CHANGE: a wait on another ticket is a `depends_on`, the ticket stays ready.
- S16 next_ticket.mjs:733-737 (L wait): phase PR waiting on CI. KEEP (red CI already repairs).
- S17 build-ticket SKILL.md:60, next_ticket.mjs:500-507 (T): 3 failed rounds → blocked; ladder low Haiku→Haiku→Sonnet, medium Sonnet→Sonnet→Opus, high Opus medium→Opus high (effort, not model); Fable never used; round 4 throws. Conflicts with Q-0386 (1). CHANGE.
- S18 build-ticket SKILL.md:47 (T): 3 failed test reviews → blocked + question, no escalation. CHANGE.
- S19 build-ticket SKILL.md:30, 50; PROCESS.md:263 (T): builder/planner question "needs Josh" → blocked. KEEP only for true Level 4 (PROCESS.md:229-235); otherwise answered by the chain.
- S20 build-ticket SKILL.md:51 (T): change to a protected file → blocked + patch for Josh. Separate category (tooling/classifier).
- S21 build-ticket SKILL.md:61 (T): MERGE STOP on files the builder may not write → blocked, needs an interactive orchestrator (Q-0310); MERGE RED counts as a round. CHANGE.
- S22 build-ticket SKILL.md:29, unit-steps.mjs:71-84 (T, unit ends): preflight stop; retried next pass. Mostly fine; a dirty develop is agent-fixable.
- S23 questions SKILL.md:12-13, 20 (T stays `questions`): business/product or uncitable questions go to Josh. KEEP (Josh's rule).
- S24 gate-phase SKILL.md:8 (L, unit ends): red full gate → stop and report, no fix ticket. CHANGE.
- S25 run.mjs:507, launcher-idle.mjs:16-25 (L wait): reasons "only Josh can clear" are never repaired, including the questions loop guard. CHANGE in part.
- Third category: classifier refusals and protected paths (EZD-154 security review and planner stopped by the classifier); no skill says what a unit does on a refusal (PROCESS.md:336 only "a denial becomes a note").

## Tickets blocked or in questions (2026-10-29 ~16:30 UTC)
- EZD-003 (phase 0): Josh's before-launch checklist (Q-0032 (a)). KEEP.
- EZD-141: waits on Supabase auth#2852 (Q-0274). KEEP (third party).
- EZD-154: Re-run 6 guard-hook work; classifier stops reviews (S20/third category). Handoff 2c43b02d.
- EZD-172: round 9 reviews passed; merge red only on EZD-173 K7 (same on develop); waits on EZD-266. S21→S15; a dependency.
- EZD-248: merge clash in 6 files; Q-0427 (a) rebase in fix mode. S21.
- EZD-251: waits on EZD-172 merging. S15; a dependency.
- EZD-253: gate red only on K7; waits on EZD-266. S15; a dependency.
- EZD-265 (questions): Q-0431; settled by Josh's 2026-10-29 rule (a stuck repair goes up the ladder, then waits).

## Launcher log, 2026-10-26 to 10-29 (UTC)
- Launcher exited on one ticket: 10-27 12:59 EZD-154 (idle ~8.7 h); 10-29 06:23 EZD-258 TABLE STOP (idle ~2.9 h).
- Crash/kill: during EZD-188, restarted 10-26 20:11.
- Waiting on Josh for open questions: 10-27 03:14-09:24; 10-28 06:11-09:26.
- Ledger check waits: 10-28 10:34 (5 min); 10-28 11:38-14:18 (agent-fixable, 2 h 40 m); 10-28 23:03 (5 min).
- STOP file (fix mode): 6 waits, two of 1-3 h.
- Guard grant holds: EZD-172, 175, 199, 253, 254, 255, 260, 261, 262.
- Budget/limit stops: none in this window.

## Model escalation that exists
- Subagents: `--dispatch` (next_ticket.mjs:487-530), rounds 1-3 only; Fable only for security-reviewer on high tickets and phase-auditor (:522, 525) with Opus fallback. PROCESS.md:99-100 allows Fable for test-author/builder on a retry after an Opus FAIL, PROCESS.md:153 says never; code never routes it.
- Launcher units: fixed models; a failed unit is retried at most once on the same model; never on a higher one.

## Why this keeps coming back (orchestrator, from the record)
- Josh's rule has been stated before: 2026-10-20 Q-0233 ("the build never stops"; only a budget hold ends the run, PROCESS.md:331); 2026-10-27 ("override so it keeps moving forward", decisions/process.md:69); 2026-10-28 Q-0386 (extra rounds and plan-named grants never go to Josh, PROCESS-EZDRAFT.md:100).
- Each time the rule was written into prose (decisions, PROCESS.md) but the code was changed only for the one case in front of us: 10-27 tabled stuck builds only when `in-progress`/`review`; Q-0386 changed no code, so grants still wait for Josh (S14) and round 4 still throws (S17). The code and the skills are what units obey, and nothing checks that they match the decisions.
- Units are told to block and ask Josh when unsure, and no step sends a failed unit to a higher model first.
- The orchestrator (this session included) worked around stops by hand (watchers, unblock scripts) instead of fixing the cause, and proposed narrow fix tickets (EZD-265) until Josh pushed back.
- Fix tickets queued behind feature work while the same stops kept firing.
- Remedy built into the redesign: a test that lists every stop path in the launcher and next_ticket against an allowlist of the KEEP stops above, so a new stop path fails the gate; the fix tickets carry priority 1.
