# Handoff · 2026-10-28 · build EZD-247

- EZD-247: DONE, merged to develop fdf4ef97, 1371 tests, gate green, 1 round.
- Models: test-author haiku/high, builder haiku/high, code-reviewer opus/medium, security-reviewer opus/high (all --dispatch).
- Reviews: code-reviewer PASS, security-reviewer PASS (run because the gate flagged scripts/hosting/__tests__/hosting.test.mjs).
- Deviations: built alone, not batched with EZD-257 (worktree was made before batch markers). EZD-257 stays ready for its own unit.
- Needs Josh: Q-0420 (who enters the Preview EMAIL_TRANSPORT value; two docs lines still say EZD-023b does).
- Still open: EZD-199 blocked at merge (Q-0419), EZD-173 (needs Josh's patch), run.mjs stderr echo uncapped (no ticket).
