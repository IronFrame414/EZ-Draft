# Handoff · 2026-10-19 · build EZD-000g

- Phase and stage: Phase 0, Stage 3 (build); EZD-000, EZD-000b to EZD-000g done
- Why the session ended: unit complete
- Completed this session: EZD-000g done, 23a06c2 (101 repo tests). `next_ticket.mjs --lessons` prints only `status: ratified` entries; `--check` (and so the default pick and `--next-unit`) fails on a lessons entry with no or an unknown heading status, naming file and L-number (INDEX.md skipped; missing vault/lessons/ allowed). questions skill: fourth section "Rule candidates", Josh's ratify/reject sets the status in every role file and INDEX.md plus one answered-josh row (`<N> / L-nnn`); unattended, candidates stay candidate. wrap skill: both automation triggers apply to ratified lessons only. New test file scripts/ledger/lesson-ratification.test.mjs (T1-T7).
- Models: test-author and builder Sonnet 5.5 medium; code-reviewer Opus 5.5 high (mode 2 PASS; mode 3 PASS, same agent). Gate PASS in worktree and on develop phase 0 (101/101).
- Deviations: none. Verification item 10 verified (builder and reviewer both ran it live).
- Effect now: no lesson reaches a dispatch until Josh ratifies it. L-001, L-002 and L-003 are all candidates; the next questions 0 unit must list all three under Rule candidates (phase-00-for-josh.md section 4 still says "None").
- Note: next_ticket.mjs exits 0 silently when run via an unresolved symlinked path (macOS /var); pre-existing, tests use realpathSync.
- In progress: none
- Blocked: none
- Questions for Josh: none new; Q-0136 still to confirm (from EZD-000b); Q-0132 (a) PROCESS.md edit is proposed in phase-00-for-josh.md.
- Decisions made: none. No new lesson.
- Next unit: build EZD-000h
