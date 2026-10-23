# Handoff · 2026-10-22 · build EZD-018

- Phase and stage: phase 0, Stage 3
- Why the session ended: unit complete
- Completed this session: EZD-018 done, commit da0db65, 802 tests, develop phase 0 gate PASS. Code-reviewer (Opus 5.5) and security-reviewer (Fable 5.1) PASS; reviewer approved adding app/src/lib/realtime/adapter.ts to the EZD-007c T34 list.
- In progress: none
- Blocked: EZD-034 (Q-0243 escalated), EZD-003 (Before-launch checklist)
- Questions for Josh: none new; earlier escalations unchanged (vault/questions/phase-00-for-josh.md)
- Decisions made: none; planner lesson added (guard-test edits named in the plan, jsonb bound as objects, one expected-refused Realtime join per connection)
- Plan deviations: plan-gap patch (rt-self dropped; T34 entry; jsonb object; T6 per-topic connection); three structural test repairs (370f2f5, 2c13c09, 3902b57)
- Watch: presence is display-only, never lock authority (EZD-125/126); realtime token fetch sends no app version until EZD-134; hub.ts project key could collide with USER_KEY (minor). Running Vitest replaces the stored API-gate hash: run `pnpm db:up` before browser tests.
- Next unit: build EZD-009
