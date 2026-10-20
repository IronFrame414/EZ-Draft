# Handoff · 2026-10-20 · spec restructure and reading map (fix mode)

- Phase and stage: see vault/PROGRESS.md (phases renumbered by the re-cut: 54 phases; Phase 0 unchanged)
- Why the session ended: unit complete
- Completed this session (Q-0218, fix mode, rule 19): spec 03 and 09 split word for word into 03a–03f and 09a–09i; X- screens renamed S19–S22 (check `node --test scripts/spec/split.test.mjs`, 25 pass); prep C2, C9, C11, C15 recorded as decision rows, C6 and C14 in vault/spec/INDEX.md, C5 already Q-0034, C8 by the reading map; re-cut applied (recut.json, apply_recut.mjs; 15 EZ Binder tickets out of v1 per Q-0190; 16 new tickets EZD-136–138, 640, 641, 729–738, 1424); reading map in tickets.json (`spec_files` with anchors, `decisions`, `mockups`); `next_ticket.mjs --reads <ticket> <role>` and stricter `--check` (scripts/ledger/reads.test.mjs, 10 pass); build-ticket and plan-ticket skills use `--reads`; research reports adopted as R-008–R-012.
- In progress: EZD-016c is `review`, paused at merge by STOP (c9fb885); its next unit resumes it.
- Blocked: none new
- Questions for Josh: Q-0219 (field-pack measurement review placement, applied as (a)), Q-0220 (not-in-v1.md vs Q-0177) escalated; Q-0175, Q-0089 still escalated. Josh confirms or reverts Q-0218's fix-mode changes at his next sit-down.
- Decisions made: none by Josh this session (Q-0218 records his earlier OK)
- Follow-ups: `scripts/gate.mjs --phase N` still selects tests by ticket number (EZD-<N>xx), which no longer matches the re-cut phase numbers; fix before Phase 1 builds.
- Gate: `node scripts/gate.mjs .` full suite PASS (typecheck, lint, test 356, build, test:e2e) after the restructure.
- Next unit: build EZD-016c

Ledger: LEDGER OK: 433 tickets
