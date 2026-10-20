# Handoff · 2026-10-20 · spec-check 1

- Phase and stage: Phase 1 (Company settings and customers) Stage 0 done except Josh's sign-off row; Phase 0 build continues (see vault/PROGRESS.md)
- Why the session ended: unit complete (waiting on Josh's SIGNOFF.md row)
- Completed this session: Phase 1 real ACs (47, `acs_source: "stage-0"` on EZD-101, 102, 103, 112, 113, 132, 1704, 1707, 136); `vault/tools/gen_acs.mjs` now keeps hand-written stage-0 rows (it dropped them before). Phase-auditor round 1: 14 gaps → vault/questions/phase-01-spec-gaps-for-josh.md. Josh answered (relayed by session "Spec restructure and reading map"): Q-0223 to Q-0231, Q-0234 (no Translations page or switch; Approve translations removed as a consequence), Q-0235 (company costs off by default for Foreman and Crew); Q-0219 confirmed (a). Agent answers Q-0232. Glossary addendum vault/spec/sections/00b-glossary-phase-01.md (Q-0231). Round 2 audit: all 14 closed; its two new items settled (Q-0235 by Josh; customer-name wording by PROCESS.md 3a, noted in Q-0232). Final count change (Q-0235) checked by hand, not by a third audit run.
- In progress: none
- Blocked: Phase 1 Stage 1 waits only on Josh adding the Phase 1 row to vault/spec/SIGNOFF.md (agents cannot write it).
- Questions for Josh: Phase 1 sign-off row; Q-0175, Q-0089 still escalated; Q-0236, Q-0237 per their rows.
- Decisions made: Q-0219, Q-0223 to Q-0231, Q-0234, Q-0235 (Josh); Q-0232 (agent). No lesson.
- Notes for Phase 1 planners: page-switch inspector group is the planner's (cite Q-0210); 00b glossary "Page switch" row mentions Translations, but Q-0234 says there is none; a Foreman who creates a project must be listed on it (Projects phase, Q-0202, Q-0224).
- Next unit: `next_ticket.mjs --next-unit` → build EZD-011 (Phase 0 continues; Phase 1 planning starts once the sign-off row exists)
