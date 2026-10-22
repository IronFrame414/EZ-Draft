# Handoff · 2026-10-22 · build EZD-014 (split)

- Phase and stage: phase 0, Stage 3 (see vault/PROGRESS.md)
- Why the session ended: unit complete (step 1 re-validation ended in a split; nothing built)
- Completed this session: EZD-014 plan re-validated (Opus 5.5 planner) against the 011/012/016/026 splits; found over the size rule (54,530 chars, about 28 builder files, 22 tests). Split into EZD-014a (device switch, phone layout), EZD-014b (44 px targets, icon-only Share/Export), EZD-014c (/dev/device, browser tests B1-B8, docs; carries both ACs). Q-0244 (split) and Q-0245 (QP-1 tooltip rule, option b) recorded answered-agent. Ledger commits 658b3fc, 89618ce. Findings V1-V14 in vault/plans/EZD-014.md apply to every part.
- In progress: none
- Blocked: EZD-034 waits on Q-0241 and Q-0243. EZD-003 blocked as before.
- Questions for Josh: Q-0244, Q-0245 (confirm, he can override); plus earlier Q-0241, Q-0243, Q-0239, Q-0240, Q-0242.
- Decisions made: Q-0245 (b): 014b's test-author edits EZD-012a U8 so keyboard focus shows the tooltip on every device.
- Notes: each part needs its own plan unit (/plan-ticket EZD-014a, 014b, 014c). Risk for 014c: touch emulation reporting any-pointer: coarse is unproven in WebKit/Chromium; raise a question, do not skip.
- Next unit: run `node vault/tools/next_ticket.mjs --next-unit`
