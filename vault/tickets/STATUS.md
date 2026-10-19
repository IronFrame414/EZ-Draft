# Ticket status ledger

Status values: `todo` → `planned` or `questions` → `ready` → `in-progress` → `review` → `done`, or `blocked` (PROCESS.md section 13). Complexity: `low`, `medium` or `high` from the plan (PROCESS.md section 4); it picks the test-author and builder models. Phase 0 ratings were set by the orchestrator on 2026-10-18 from the v1 plans (no planner rating existed); the planner re-rates a plan it re-validates.
Only the orchestrator edits this file (enforced by hook). It records each stage's result: planner → `planned`/`questions`; Stage 2 → `ready`; build → `in-progress`, `review`; reviewers' verdict → `done` (with commit) or back to `in-progress`; three failed reviews or a question for Josh → `blocked`.
A ticket starts only when every ticket in its `depends_on` (in `tickets.json`, base IDs already expanded) is `done`. The Depends on column here is the original text, for reading only. Notes also records the models used for each dispatch and why (PROCESS.md section 4). Notes holds plan deviations (what the merged code does differently from its plan; dependents' plans are re-validated against it) and `needs-josh-confirm` wording (user-visible text no plan covered, listed in the phase PR for Josh). Pick tickets with `node vault/tools/next_ticket.mjs`; validate with `--check` (done needs a commit hash, blocked needs a note, statuses must be known, STATUS.md and tickets.json must list the same tickets).

| Phase | Ticket | Title | Tickets |
| --- | --- | --- | --- |
| 0 | Phase 0 · Setup | [phase-00.md](phases/phase-00.md) | 45 |
| 1 | Phase 1 · Foundation | [phase-01.md](phases/phase-01.md) | 37 |
| 2 | Phase 2 · Geometry core + plan editor | [phase-02.md](phases/phase-02.md) | 38 |
| 3 | Phase 3 · Imports | [phase-03.md](phases/phase-03.md) | 15 |
| 4 | Phase 4 · Cabinets + countertops | [phase-04.md](phases/phase-04.md) | 19 |
| 5 | Phase 5 · Ceilings / RCP | [phase-05.md](phases/phase-05.md) | 16 |
| 6 | Phase 6 · Electrical + code check | [phase-06.md](phases/phase-06.md) | 40 |
| 7 | Phase 7 · Sheets, issue, submittal profiles, revisions, property appraiser import | [phase-07.md](phases/phase-07.md) | 31 |
| 8 | Phase 8 · Detail editor | [phase-08.md](phases/phase-08.md) | 17 |
| 9 | Phase 9 · Reference DXF + supplier imports + rendering markup | [phase-09.md](phases/phase-09.md) | 25 |
| 10 | Phase 10 · 3D + design options | [phase-10.md](phases/phase-10.md) | 18 |
| 11 | Phase 11 · Render pipeline + allowance + local GPU worker | [phase-11.md](phases/phase-11.md) | 22 |
| 12 | Phase 12 · Client link | [phase-12.md](phases/phase-12.md) | 15 |
| 13 | Phase 13 · Change orders + EZ Binder webhooks and inbound API | [phase-13.md](phases/phase-13.md) | 13 |
| 14 | Phase 14 · Field pack + offline + field measurements review | [phase-14.md](phases/phase-14.md) | 22 |
| 15 | Phase 15 · Translations | [phase-15.md](phases/phase-15.md) | 10 |
| 16 | Phase 16 · Catalog + takeoff | [phase-16.md](phases/phase-16.md) | 19 |
| 17 | Phase 17 · Hardening | [phase-17.md](phases/phase-17.md) | 11 |

| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EZD-001 | 0 | Repo and tooling | done | high | EZD-000, EZD-000b, EZD-000c, EZD-000d, EZD-000e, EZD-000f, EZD-000g, EZD-000h, EZD-000i | 3b1037c | 139 | Done 2026-10-19 (139 = 138 repo node:test + 1 Vitest on develop phase 0). Step 1: plan re-validated (024ca47, 74888bc) after EZD-000/000d/000e/000h/000i deviations; complexity medium → high; QP-1 → Q-0139 answered-agent (a) (orchestrator), QP-2 → Q-0140 answered-agent (a) (security-reviewer). Models (high, PROCESS.md s4; EZD_FABLE_ALLOWED=1): planner Opus 5.5 (re-validation); test-author Fable 5.1; code-reviewer mode 2 Fable 5.1 PASS (also level-3 answer Q-0142 and repair check PASS); builder r1 Fable 5.1; code-reviewer mode 3 Fable 5.1 PASS (fresh agent, not the resumed step-5 reviewer: orchestrator slip); security-reviewer Fable 5.1 PASS (production-sensitive changes PASS). Gate: develop was red before this ticket (questions-flow.test.mjs, from 3e85263) → fixed in place b6e82e0 (Q-0141, rule 19). Worktree gate PASS round 1 after repairs; T3 clean-tree gate PASS on a fresh temp worktree (git clean -f is hook-blocked); develop phase 0 PASS. Structural repair: aa75701 T12 prettier default export. Deviations: (1) Q-0142 (a): EZD-000 fixtures T20c/T23a/T23c/T24c in scripts/conventions/__tests__/check.test.mjs gained an EZD-000 describe for C9 (file not in plan Files table); (2) eslint/@eslint/js 9.39.5 not 10.x (eslint-config-next 16.4.2 plugin peers stop at 9; registry marks 9.39.5 deprecated); (3) @types/node 22.20.5; (4) no tsconfig.test.json, geometry typecheck excludes tests (EZD-201 should add test type-checking); (5) settings.next.rootDir absolute via import.meta.dirname; (6) app tsconfig keeps create-next-app `@/*` paths alias. allowBuilds denies unrs-resolver only. Follow-up minor: T10 does not reject a pnpm `permissions` build key. needs-josh-confirm wording: tab title `EZ Draft` (plan Proposed wording). |
| EZD-002 | 0 | CI | done | medium | EZD-001 | 562313f | 145 | Done 2026-10-19 (145 = 145 repo node:test on develop phase 0, EZD-002 T1, T2, T2b, T3–T6 among them; Vitest 1). Step 1: plan re-validated (planner Opus 5.5, v2 template, medium); QP-1 → Q-0143 (a), QP-2 → Q-0144 (a) answered-agent (orchestrator; Josh adds the `gate` required check to the `main` ruleset, needs-from-josh.md). Models (medium, PROCESS.md s4): test-author Sonnet 5.5; builder r1 Sonnet 5.5; code-reviewer Opus 5.5 (mode 2 rounds 1–3, mode 3, same resumed agent) PASS; security-reviewer Opus 5.5 r1 FAIL (T2 bypass forms) → Q-0146 (a) answered-agent (security-reviewer level 3), planner amended T2 and added T2b, test-author fixed, r2 PASS. Gate fault: develop red before the ticket (questions-flow.test.mjs since EZD-001 went done) → fixed in place 35f8a97 (Q-0145, rule 19). Deviations: (1) childEnv also deletes NODE_TEST_CONTEXT; (2) 180 s timeout per test on T3 and T4, not file-level; (3) two `### CI` bullets worded slightly differently from plan Step 4 (same meaning); (4) T2b added (Q-0146). Follow-up minors (security, not in plan): T2 (i) misses inline `with: { cache: … }` on a one-line setup-node step and compares `actions/cache` case-sensitively. needs-josh-confirm wording: none. |
| EZD-003 | 0 | Hosting and subdomain | blocked | medium | EZD-002 | dc6e8e6 | 151 | Repo work merged 2026-10-19 dc6e8e6; blocked per plan Step 6 / Q-0032 (a): waiting on Josh: Before-launch checklist and first real release (T8 then → done; T7 at the Phase 0 gate; T10 after each main merge before launch). 151 = repo node:test on develop phase 0 (EZD-003 T1–T6 among them; Vitest 1). Step 1: plan re-validated (planner Opus 5.5; v2 template; Josh's Vercel dashboard paths; Steps 5.2–5.4 done 2026-10-19; no QP). Models (medium, PROCESS.md s4): test-author Sonnet 5.5; builder r1 Sonnet 5.5; code-reviewer Opus 5.5 (mode 2 PASS, resumed for mode 3 PASS); security-reviewer Opus 5.5 PASS. Gate fault: questions-flow.test.mjs red on develop again → fixed in place 52017e0 (Q-0147, rule 19). Deviations: (1) no `packageManager` in app/package.json (root pin via Corepack; unproven until T7); (2) check-live.mjs detail strings not in plan (script output only, not product wording). Follow-up minors (not in plan): `redirect` check accepts a Location that only starts with the address (security + code-reviewer; tighten = plan change + T4 case); docs say previews build "only for the phase PR" but the Ignored Build Step builds any PR (security; Q-0116 wording, Josh). needs-josh-confirm wording: none. Earlier: Build 2026-10-19: step 1 plan re-validated (planner Opus 5.5; v2 template, runbook paths fixed, no QP). Models (medium, PROCESS.md s4): test-author Sonnet 5.5, builder Sonnet 5.5, code-reviewer and security-reviewer Opus 5.5. Q-0116 (a) answered 2026-10-18; plan re-validated by the planner (Opus 5.5 high) the same day: previews only on the phase PR. Q-0123 (b) (domain already connected): re-validated again the same day; Josh turns off Auto-assign Custom Production Domains before the Phase 0 merge (Step 5.2). Josh did Steps 5.2–5.4 on 2026-10-19. Dashboard paths differ from the plan: Ignored Build Step is Settings → Build and Deployment (option Custom); Auto-assign Custom Production Domains is Settings → Environments → Production → Branch Tracking; Git Fork Protection is Settings → Security. The Stage 3 re-validation fixes the runbook paths. |
| EZD-004a | 0 | Local Supabase and migrations in the gate | done | high | EZD-001 | 78b3103 | 162 | Done 2026-10-19 (162 = 161 repo node:test incl. 10 EZD-004a + 1 Vitest on develop phase 0). Step 1 skipped (plan re-validated at the split). Precondition F3: guard-paths.mjs builder exception scripts/db/ (af17c5f; Q-0148, Q-0125 (a)). Models (high, PROCESS.md s4; EZD_FABLE_ALLOWED=1): test-author Fable 5.1; code-reviewer mode 2 Fable 5.1 FAIL then PASS (T1 parser repair b6a0a08; reviewer's first reading of the CLI source was wrong, the npm CLI prints JSON under an agent and an ASCII table otherwise); builder r1 Fable 5.1; code-reviewer mode 3 Fable 5.1 PASS (resumed step-5 agent); security-reviewer Fable 5.1 PASS (Production-sensitive changes PASS). Gate: develop red on EZD-000d T8 (research store not empty after R-001) → fixed in place 41cab19 (Q-0149, rule 19; assertion change, Josh confirms). Worktree gate PASS round 1; develop phase 0 PASS. Deviations: local.mjs inherits stdout only, so per-migration 'applying' lines are not in gate logs; gen-types.mjs reuses the Docker wording; docs/architecture.md EZD-004 refs → EZD-004a. Follow-ups (security, minor): health() exposes newest migration timestamp to anon (EZD-004b decides /api/health echo); db:env prints the local secret key (EZD-004c must not reuse for cloud); config.toml local auth defaults (signup on, password min 6, allowed_cidrs 0.0.0.0/0) settle in EZD-007 before any config push. needs-josh-confirm wording (developer stderr): local.mjs 'supabase <step> failed (exit N)', status-JSON messages, usage lines; gen-types.mjs failure, 'run pnpm db:types', 'wrote <path>', usage. |
| EZD-004b | 0 | App reads the health row | done | medium | EZD-004a | 22b6f0a | 174 | Done 2026-10-19 (174 = 164 repo node:test incl. 3 EZD-004b + 9 app Vitest + 1 geometry Vitest on develop phase 0). Step 1 planner re-validation (Opus 5.5) PASS, sections 7/9/10 non-behavior edits (659ae6d); /api/health keeps the migration version (Done-when requires it; already readable by anon via health()). Models (medium, PROCESS.md s4): test-author Sonnet 5.5; code-reviewer mode 2 Opus 5.5 FAIL (T19 test-file exemption; T5(d) loose mail key) then PASS (3c2296b, MAILPIT_URL); builder r1 Sonnet 5.5; code-reviewer mode 3 Opus 5.5 PASS (resumed step-5 agent); security-reviewer Opus 5.5 PASS. Worktree gate PASS round 1; develop phase 0 PASS. Deviations: route.ts imports server/db/health by relative path, not the @/ alias (Vitest has no alias). Follow-up (security, minor): add a DB request timeout to /api/health when EZD-024 adds logging. needs-josh-confirm wording: none. |Split from EZD-004 (Q-0148) at build step 1, 2026-10-19: planner re-validation (Opus 5.5; deviating dependencies EZD-000, EZD-001) found the plan over the size rule; split proposal in vault/plans/EZD-004.md (dbf4985). Complexity from the proposal. |
| EZD-004c | 0 | Cloud dev migrations workflow | done | medium | EZD-004a, EZD-004b, EZD-002 | ea665d3 | 179 | Done 2026-10-19 (179 = 169 repo node:test incl. 5 EZD-004c + 9 app Vitest + 1 geometry Vitest on develop phase 0). Field check O1 (first real cloud run) waits for Josh's dev project and SUPABASE_DEV_DB_URL (needs-from-josh.md; AC-3). Build 2026-10-19: step 1 planner re-validation (Opus 5.5) PASS, citation-only edits plus architecture "EZD-004 T13" → "EZD-004c T1" (3a48287). Models (medium, PROCESS.md s4): test-author Sonnet 5.5, builder Sonnet 5.5, code-reviewer and security-reviewer Opus 5.5. code-reviewer mode 2 PASS (first round), mode 3 PASS (resumed same agent); security-reviewer PASS (Production-sensitive changes PASS). Worktree gate PASS round 1 (2 flagged paths → security review); develop phase 0 PASS. Pins: actions/checkout and actions/setup-node v4.4.0 (SHAs checked by both reviewers). Deviations: none. needs-josh-confirm wording: none beyond plan section 6 (Stage 2). Runbook items 1–6 copied to needs-from-josh.md. Split from EZD-004 (Q-0148) at build step 1, 2026-10-19: planner re-validation (Opus 5.5; deviating dependencies EZD-000, EZD-001) found the plan over the size rule; split proposal in vault/plans/EZD-004.md (dbf4985). Complexity from the proposal. |
| EZD-005a | 0 | Tenancy tables | review | high | EZD-004a, EZD-004b |  |  | Build 2026-10-19: step 1 skipped (plan re-validated at the split, Q-0150). Models (high, PROCESS.md s4; EZD_FABLE_ALLOWED=1): test-author Fable 5.1; code-reviewer Fable 5.1; builder r1 Fable 5.1; security-reviewer Fable 5.1. Split from EZD-005 (Q-0150) at build step 1, 2026-10-19: planner re-validation (Opus 5.5; deviating dependencies EZD-004a, EZD-004b) found the plan over the size rule (16 files, 17 tests); split proposal and findings V1–V8 in vault/plans/EZD-005.md. Complexity from the proposal. |
| EZD-005b | 0 | Tenant 1 and Josh: seed and cloud setup file | ready | high | EZD-005a, EZD-004a, EZD-004c |  |  | Split from EZD-005 (Q-0150) at build step 1, 2026-10-19: planner re-validation (Opus 5.5; deviating dependencies EZD-004a, EZD-004b) found the plan over the size rule (16 files, 17 tests); split proposal and findings V1–V8 in vault/plans/EZD-005.md. Complexity from the proposal. Q-0151 (a): its test-author narrows EZD-004a T11 (seed.sql comment-only) as a recorded assertion change. |
| EZD-006 | 0 | Row-level security | ready | high | EZD-005 |  |  |  |
| EZD-007 | 0 | Magic-link sign-in | ready | high | EZD-005, EZD-026a, EZD-010, EZD-006, EZD-022 |  |  |  |
| EZD-008 | 0 | Email provider | ready | medium | EZD-004 |  |  |  |
| EZD-009 | 0 | Background job queue | ready | high | EZD-004, EZD-018, EZD-007, EZD-016a |  |  |  |
| EZD-010 | 0 | Design tokens | ready | medium | EZD-001 |  |  |  |
| EZD-011 | 0 | Shell: header card | ready | medium | EZD-010, EZD-026a, EZD-016a |  |  |  |
| EZD-012 | 0 | Shell: rail, panels, status bar | ready | medium | EZD-010, EZD-026a, EZD-016a, EZD-011 |  |  |  |
| EZD-013 | 0 | PWA install | ready | medium | EZD-012, EZD-016a, EZD-024 |  |  |  |
| EZD-014 | 0 | Device layouts | ready | medium | EZD-012, EZD-026a, EZD-011, EZD-016a |  |  |  |
| EZD-015 | 0 | Shared state components | ready | medium | EZD-010, EZD-026a, EZD-016a, EZD-014, EZD-011 |  |  |  |
| EZD-016a | 0 | Test harness | ready | high | EZD-007, EZD-002, EZD-006 |  |  |  |
| EZD-016b | 0 | Fixtures | ready | high | EZD-016a |  |  |  |
| EZD-017 | 0 | Performance budgets and benchmark | ready | high | EZD-016, EZD-012 |  |  |  |
| EZD-018 | 0 | Realtime channels | ready | high | EZD-006, EZD-007, EZD-016a |  |  |  |
| EZD-019 | 0 | EZ Binder contract and stub | ready | high | EZD-016, EZD-022 |  |  |  |
| EZD-020 | 0 | Entry points and lazy chunks | ready | high | EZD-017, EZD-014, EZD-015 |  |  |  |
| EZD-021 | 0 | AI client and stubs | ready | high | EZD-009, EZD-016, EZD-023b |  |  |  |
| EZD-022 | 0 | Event registry | ready | medium | EZD-001 |  |  |  |
| EZD-000 | 0 | Architecture conventions | done | high | — | 1739318 | 42 | Done 2026-10-19. Models (high, PROCESS.md s4; EZD_FABLE_ALLOWED=1): test-author Fable 5.1; code-reviewer mode 2 Fable 5.1 PASS; builder r1 Fable 5.1 (resumed 2026-10-19 as a fresh Fable 5.1 agent, prior agent not resumable across sessions); code-reviewer mode 3 Fable 5.1 PASS (fresh, step-5 reviewer not resumable); security-reviewer Fable 5.1 PASS (Production-sensitive changes PASS). Gate PASS worktree and develop phase 0. Deviations: T6 accepts `## Rules (every agent)` (v2 CLAUDE.md heading) as well as the plan's v1 heading; pnpm-workspace.yaml adds saveExact: true (pnpm 12 ignores .npmrc save-exact; .npmrc kept); typescript pinned 5.9.3 not 7.0.2; architecture.md cites CLAUDE.md v2 rule numbers (7, 8, 5-6) where the plan said 11, 12, 10; C2 fails when pnpm-workspace.yaml is missing and any package.json exists (plan implicit). Open minor follow-ups (reviewers, PASS): docs/architecture.md:54 says typescript 7.0.2 shipped 2026-10-18, registry says 2026-07-08 (fix date or drop clause); security: Money bullet (line 128) omits 03 rule 2's 'every new money field extends the EZD-133 cost-removal test'; client-link clause omits 03 rule 11 / R26 R14 field list, hashed tokens, rate limits (planner follow-up on re-validation). needs-josh-confirm: none. |
| EZD-000b | 0 | Hidden-token settings and honesty rules (Items 2, 5) | done | medium | EZD-000 | 2929564 | 10 | Done 2026-10-19. Models (medium, PROCESS.md s4; plan s8; EZD_FABLE_ALLOWED=1): test-author Sonnet 5.5 medium; code-reviewer mode 2 Opus 5.5 high PASS; builder r1 Sonnet 5.5 medium; code-reviewer mode 3 Opus 5.5 high PASS (resumed step-5 reviewer). Step 1 re-validation skipped: plan base e04d605 is after EZD-000's merge and nothing it reads changed. Gate round 1 red on 4 tooling tests outside the ticket (questions-flow hard-coded Q-IDs; guard-paths nested worktree root); fixed in place under rule 19 (dc361d2, Q-0136); round 2 gate PASS 59/59; develop phase 0 PASS 59/59. Deviations: none (plan s2 handoff-vs-PROCESS.md differences 1-3 reported as planned). Verification: item 12 verified (T8); item 6 not testable here, added to PILOT.md (Q-0126 (c)). Test count 10 = T1-T8 with T7 run per agent file. needs-josh-confirm: none. Part A of the EZD-000b split (2026-10-19). Source: vault/handoff/PA3-MECHANISMS.md. Builder may edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files the item names (rule 7; Q-0128). Test-author and builder Sonnet 5.5 medium; code-reviewer Opus 5.5 high. Was the whole PA3 ticket; plan unit re-plans Part A. |
| EZD-000c | 0 | Whole-read guard and outline tool (Item 3) | done | medium | EZD-000b | 3b7c7c1 | 10 | Done 2026-10-19. Models (medium, PROCESS.md s4; plan s8; EZD_FABLE_ALLOWED=1): test-author Sonnet 5.5 medium; code-reviewer mode 2 Opus 5.5 high PASS; builder r1 Sonnet 5.5 medium; code-reviewer mode 3 Opus 5.5 high PASS (resumed step-5 reviewer; plan s7). Step 1 skipped: EZD-000b recorded no plan deviation. Gate round 1 PASS 69/69; develop phase 0 PASS 69/69. Deviations: none (handoff-vs-PROCESS.md differences reported as planned: .mjs extension, CLAUDE.md sentence from s14 template). Verification: item 7 hook level verified (T5, T6, T9); live session not testable here, added to PILOT.md as check 13 (Q-0126 (c)). Reviewer notes, no fix needed: T7(d) depends on vault/PROCESS.md staying over 20,000 chars; T10 pins the other PreToolUse entries and spawn depth "1" (EZD-000f must update it); a 30,000-char .ipynb Read is denied (not on plan binary list; in PILOT check 13); sed -n /re/p and tail -f denied as planned; Bash paths resolve against cwd, not after an in-command cd. needs-josh-confirm: none. Part B of the EZD-000b split (2026-10-19). Source: vault/handoff/PA3-MECHANISMS.md. Builder may edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files the item names (rule 7; Q-0128). Test-author and builder Sonnet 5.5 medium; code-reviewer Opus 5.5 high. |
| EZD-000d | 0 | Research report store (Item 6) | done | medium | EZD-000c | ffa76d7 | 10 | Done 2026-10-19. Models (medium, PROCESS.md s4; plan s8; EZD_FABLE_ALLOWED=1): test-author Sonnet 5.5 medium; code-reviewer mode 2 Opus 5.5 high PASS; builder r1 Sonnet 5.5 medium; code-reviewer mode 3 Opus 5.5 high PASS (resumed step-5 reviewer; plan s7). Step 1 skipped: EZD-000c recorded no plan deviation. Gate round 1 PASS 79/79; develop phase 0 PASS 79/79. Deviations: (a) research.mjs CLI entry check resolves symlinks (realpathSync) before comparing with import.meta.url, where C4 compared the raw argv path; macOS /var symlink made T1, T5, T7 fail otherwise; reviewer accepted. (b) CLAUDE.md row uses PROCESS.md text "(only the reports your plan names)" over the handoff's "(read only ...)", as plan s2 planned. C9 TEMPLATE.md sentence added by the orchestrator at merge (grep confirmed). CLAUDE.md now 53 lines. Verification item 9 belongs to EZD-000e/EZD-000f. needs-josh-confirm: none. Part C of the EZD-000b split (2026-10-19). Source: vault/handoff/PA3-MECHANISMS.md. Builder may edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files the item names (rule 7; Q-0128). Test-author and builder Sonnet 5.5 medium; code-reviewer Opus 5.5 high. |
| EZD-000e | 0 | Retriever agents and dispatch brief (Item 4, agent files) | done | medium | EZD-000d | 89d95e9 | 7 | Done 2026-10-19. Models (medium, PROCESS.md s4; plan s8; EZD_FABLE_ALLOWED=1): planner re-validation (agent default Opus 5.5 high) CHANGED citations only (EZD-000d deviations do not touch this plan; plan re-validated at e379241); test-author Sonnet 5.5 medium; code-reviewer mode 2 Opus 5.5 high PASS; builder r1 Sonnet 5.5 medium; code-reviewer mode 3 Opus 5.5 high PASS (resumed step-5 reviewer). Gate round 1 PASS 86/86; develop phase 0 PASS 86/86. Deviations: (a) T7 pins dispatch.md lines 1-20 as a SHA-256 hash via node:crypto, where plan C8 lists no crypto module and T7 says the test holds the lines; same behavior, less precise failure message; reviewer accepted as minor. Builder: none. Spawn depth stays 1 (settings.json untouched). Verification items 8, 9 belong to EZD-000f. needs-josh-confirm: none. Part D of the EZD-000b split (2026-10-19). Source: vault/handoff/PA3-MECHANISMS.md. Builder may edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files the item names (rule 7; Q-0128). Test-author and builder Sonnet 5.5 medium; code-reviewer Opus 5.5 high. |
| EZD-000f | 0 | Retriever spawn limits (Item 4, enforcement) | done | medium | EZD-000e | 5a8ebe3 | 94 | Done 2026-10-19 (94 = all repo tests on develop phase 0; new file spawn-limits.test.mjs has T1-T8). Models (medium, PROCESS.md s4; plan s8; EZD_FABLE_ALLOWED=1): planner re-validation Opus 5.5 high (EZD-000e deviation (a)) CHANGED citations and contract wording only, no QP: develop 539b6cd line numbers; C6 write checks use guard-paths.test.mjs fixed fake root; C7 guard-reads T10 list of other PreToolUse entries gains the C4 entry; test-author Sonnet 5.5 medium (mode 2 round 1 FAIL, 2 minor fixture findings: T8 INDEX header not the C6 text, T6 `..` path normalized by path.join; fixed, round 2 PASS); builder r1 Sonnet 5.5 medium; code-reviewer Opus 5.5 high mode 3 round 1 FAIL minor (guard-paths registered an extra rules.retriever roster key, so an agent named "retriever" passed; same builder fixed it), round 2 PASS (resumed step-5 reviewer). Gate PASS 94/94 in worktree and on develop phase 0. Deviations: none remaining. Differences handoff vs PROCESS.md as planned (guard-agents hook, not tools lines or deny rules; Q-0132 (a) edit proposed in phase-00-for-josh.md). Verification items 8, 9: decision logic verified by T1, T3, T4(a), T8; live halves not testable here, added to PILOT.md as checks 14, 15 (Q-0126 (c)). needs-josh-confirm: none. Part E of the EZD-000b split (2026-10-19). Source: vault/handoff/PA3-MECHANISMS.md. Builder may edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files the item names (rule 7; Q-0128). Test-author and builder Sonnet 5.5 medium; code-reviewer Opus 5.5 high. |
| EZD-000g | 0 | Lesson ratification (Item 7) | done | medium | EZD-000f | 23a06c2 | 101 | Done 2026-10-19 (101 = all repo tests on develop phase 0; new file lesson-ratification.test.mjs has T1-T7). Models (medium, PROCESS.md s4; plan s8; EZD_FABLE_ALLOWED=1): test-author Sonnet 5.5 medium; code-reviewer mode 2 Opus 5.5 high PASS; builder r1 Sonnet 5.5 medium; code-reviewer mode 3 Opus 5.5 high PASS (resumed step-5 reviewer; plan s7). Step 1 skipped: EZD-000f recorded no plan deviation. Gate round 1 PASS 101/101; develop phase 0 PASS 101/101. Deviations: none. Differences handoff vs PROCESS.md as planned (s7 "three sections" over a four-item list: four written; "ratified" applies to both wrap triggers). Verification item 10 verified (live --lessons planner tooling printed "(no lessons for planner in areas tooling)"; reviewer re-ran it and checked INDEX.md skipped, missing vault/lessons/ allowed, real lessons pass). Reviewer notes, no fix needed: L-003 (orchestrator.md, test-author.md) is also a candidate, so the next questions 0 unit lists L-001, L-002 and L-003 under Rule candidates; next_ticket.mjs prints nothing and exits 0 when run through an unresolved symlinked path (macOS /var), pre-existing, not in this diff. needs-josh-confirm: none. Part F of the EZD-000b split (2026-10-19). Source: vault/handoff/PA3-MECHANISMS.md. Builder may edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files the item names (rule 7; Q-0128). Test-author and builder Sonnet 5.5 medium; code-reviewer Opus 5.5 high. |
| EZD-000h | 0 | Usage meters, five-hour pause and weekly gate (Item 1a and the gates) | done | medium | EZD-000g | 4296a46 | 111 | Done 2026-10-19 (111 = all repo tests on develop phase 0; new files scripts/budget/gates.test.mjs, statusline.test.mjs, cli.test.mjs hold T1-T10). Models (medium, PROCESS.md s4; plan s8; EZD_FABLE_ALLOWED=1): test-author Sonnet 5.5 medium; code-reviewer mode 2 Opus 5.5 high PASS; builder r1 Sonnet 5.5 medium; gate r1 PASS 111/111; code-reviewer mode 3 r1 Opus 5.5 high FAIL (behavior: an active override bypassed an existing BUDGET_HOLD.md; minor: report crashed on an unreadable time); builder r2 Opus 5.5 (fresh, one tier up, PROCESS.md s8 step 9); gate r2 PASS 111/111; code-reviewer mode 3 r2 PASS (same agent). Step 1 skipped: EZD-000g recorded no plan deviation. Deviations: (1) plan C7 put the override (b) before the existing-hold check (e); resolved by PROCESS.md s10 step 1 and plan s1 step 3 "Existing hold": an existing hold file blocks all but the in-progress build even under an override, the override turns off only meter warn and hold. (2) budget.mjs loads weekSpend/weekStart once from its own repo copy of next_ticket.mjs, not <root>/vault/tools per call (only differs in tests, which inject spend). (3) run.mjs --dry-run still writes WINDOW_PAUSE.md and waits through a pause. (4) unreadable times show — in both reports (shared fmt). Handoff vs PROCESS.md differences as planned (s2: fable_seven_day null; percentages in PROGRESS.md when fresh; *_pct keys read with s11 defaults, budget.json untouched). Verification items 3, 4 verified by T5-T7; items 1 and the statusline half of 2 not testable here, added to PILOT.md row 16 (Q-0126 (c)); statusLine shape checked against code.claude.com/docs/en/statusline by the reviewer; docs do not say CLAUDE_PROJECT_DIR is set for status-line commands (the :-. fallback covers it). PILOT.md row 6 now names --hold-at instead of --raise. needs-josh-confirm: budget.mjs report ends with a `Warning: <text>` line when meters fell back to the dollar proxy; run.mjs --status prints its own meter line (no read time or reset times), not the s6 report line. Part G of the EZD-000b split (2026-10-19). Source: vault/handoff/PA3-MECHANISMS.md. Builder may edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files the item names (rule 7; Q-0128). Test-author and builder Sonnet 5.5 medium; code-reviewer Opus 5.5 high. |
| EZD-000i | 0 | OAuth usage fallback (Item 1b) | done | medium | EZD-000h | 883a54f | 125 | Done 2026-10-19 (125 = all repo tests on develop phase 0; new scripts/budget/oauth.test.mjs T1-T10 and scripts/hooks/guard-bash.test.mjs T11). Step 1: plan re-validated after EZD-000h deviations (planner PASS, reference-only edits; QP-1 → Q-0137 answered-agent (a): a dry run polls like a real pass). Models (medium, PROCESS.md s4; plan s8; EZD_FABLE_ALLOWED=1): test-author Sonnet 5.5 medium; code-reviewer mode 2 Opus 5.5 high PASS; builder r1 Sonnet 5.5 medium; gate r1 PASS 125/125; code-reviewer mode 3 (same agent) PASS; security-reviewer Opus 5.5 high PASS (plan s7). Live probe (builder report, not verifiable from repo): HTTP 200 from the keychain source; Keychain service Claude Code-credentials confirmed without -w/-g; response five_hour/seven_day values use `utilization` (and dollar fields), not `used_percentage`, so parseUsage reads every real 200 as unreadable and falls back to the proxy: reported failed per Q-0134 (a), needs a follow-up ticket that also settles 0-1 vs 0-100. Deviations: (1) the step 11 `test -f` on the sign-in file was skipped because the orchestrator dispatch forbade naming it (lesson L-005); (2) run.mjs loads oauth-usage.mjs with await import, not a static import (same behavior, matches budget.mjs loading). Security minor findings (not blocking, accident guard per Q-0135): K1 splits segments inside quotes (settings deny still covers); K3 `test -f` word match swallows space-free chained commands; probe prints nested key names (check for account IDs before sharing probe lines). Follow-ups for Josh (orchestrator may not edit .claude/ or tests): remove the pa3Grant exception and its tests (Q-0128 (a)); token rules in PROCESS.md s14. needs-josh-confirm: the two guard-bash deny reasons (plan s6). Part H of the EZD-000b split (2026-10-19). Source: vault/handoff/PA3-MECHANISMS.md. Builder may edit .claude/, CLAUDE.md, scripts/ (not gate.mjs), vault/tools/ and the vault files the item names (rule 7; Q-0128). Test-author and builder Sonnet 5.5 medium; code-reviewer Opus 5.5 high; security-reviewer. |
| EZD-023a | 0 | Release safety: migration check | ready | medium | EZD-002, EZD-004 |  |  | Split from EZD-023 (Q-0042) |
| EZD-023b | 0 | Environments, promote and rollback | ready | high | EZD-023a, EZD-004, EZD-008, EZD-005 |  |  | Split from EZD-023 (Q-0042) · Q-0116 (a) answered 2026-10-18; plan re-validated by the planner (Opus 5.5 high) the same day: phase PR preview; release step unaffected. Q-0123 (b): Before-launch checklist aligned the same day. |
| EZD-024 | 0 | Error reporting | ready | high | EZD-008, EZD-009, EZD-026a, EZD-016a, EZD-022 |  |  |  |
| EZD-025 | 0 | Off-site backups and restore script | ready | high | EZD-004, EZD-009, EZD-023b, EZD-005, EZD-006 |  |  |  |
| EZD-026a | 0 | Message helper: helper, catalogs, lint | ready | medium | EZD-001, EZD-010 |  |  | Split from EZD-026 (Q-0028) |
| EZD-026b | 0 | Message helper: language from the user record | ready | medium | EZD-026a, EZD-005, EZD-006, EZD-007, EZD-016a |  |  | Split from EZD-026 (Q-0028) |
| EZD-027 | 0 | Spike: plan canvas on the iPad | ready | high | EZD-012, EZD-016a |  |  |  |
| EZD-028 | 0 | Spike: PDF from a drawing list | ready | high | EZD-001, EZD-010 |  |  |  |
| EZD-029 | 0 | Spike: DXF parser | ready | high | EZD-016, EZD-000 |  |  |  |
| EZD-030 | 0 | Spike: wall openings and sloped ceiling | ready | high | EZD-001 |  |  |  |
| EZD-031 | 0 | Spike: render trial | ready | medium | EZD-021 |  |  |  |
| EZD-032 | 0 | Phase 0 build-gate test | ready | medium | EZD-007, EZD-011, EZD-012, EZD-014, EZD-016a, EZD-017 |  |  | Added at plan review (Q-0085) |
| EZD-033 | 0 | Password sign-in | ready | high | EZD-007, EZD-006, EZD-016a, EZD-024 |  |  | Added at Stage 2 (Q-0095) · Q-0094 overridden by Josh 2026-10-18 (minimum 8 characters); plan re-validated by the planner (Opus 5.5 high) the same day. |
| EZD-101 | 1 | Permission and role tables | todo |  | EZD-005 |  |  |  |
| EZD-102 | 1 | Permission enforcement | todo |  | EZD-101, EZD-006 |  |  |  |
| EZD-103 | 1 | Settings shell | todo |  | EZD-102, EZD-012 |  |  |  |
| EZD-104 | 1 | Users table | todo |  | EZD-103 |  |  |  |
| EZD-105 | 1 | Invite user | todo |  | EZD-104, EZD-008 |  |  |  |
| EZD-106 | 1 | User inspector | todo |  | EZD-104 |  |  |  |
| EZD-107 | 1 | Custom roles | todo |  | EZD-106 |  |  |  |
| EZD-108 | 1 | Avatar menu and My profile | todo |  | EZD-103 |  |  |  |
| EZD-109 | 1 | Event log | todo |  | EZD-005, EZD-106 |  |  |  |
| EZD-110 | 1 | Notifications | todo |  | EZD-008, EZD-018 |  |  |  |
| EZD-111 | 1 | Send dialog with Copy link | todo |  | EZD-110, EZD-120 |  |  |  |
| EZD-112 | 1 | Company settings: identity | todo |  | EZD-103, EZD-132 |  |  |  |
| EZD-113 | 1 | Customers | todo |  | EZD-112 |  |  |  |
| EZD-114 | 1 | EZ Binder connection and shared sign-on | todo |  | EZD-112, EZD-007, EZD-019 |  |  |  |
| EZD-115 | 1 | Customer and user sync | todo |  | EZD-113, EZD-114 |  |  |  |
| EZD-116 | 1 | Defaults framework | todo |  | EZD-103 |  |  |  |
| EZD-117a | 1 | Projects page: query and cards | todo |  | EZD-102, EZD-110 |  |  |  |
| EZD-117b | 1 | Projects page: header, search and states | todo |  | EZD-117a, EZD-015 |  |  |  |
| EZD-118 | 1 | New project wizard | todo |  | EZD-117, EZD-113 |  |  |  |
| EZD-119 | 1 | EZ Binder job picker | todo |  | EZD-118, EZD-114 |  |  |  |
| EZD-120a | 1 | Model tables, save function and checkpoints | todo |  | EZD-005, EZD-133 |  |  |  |
| EZD-120b | 1 | Model store, outbox and editor route | todo |  | EZD-120a, EZD-012, EZD-117 |  |  |  |
| EZD-121 | 1 | Sent versions and numbering | todo |  | EZD-120, EZD-111 |  |  |  |
| EZD-122 | 1 | Versions panel | todo |  | EZD-121 |  |  |  |
| EZD-123 | 1 | Version cleanup | todo |  | EZD-122, EZD-110, EZD-116 |  |  |  |
| EZD-124 | 1 | Project card menu | todo |  | EZD-117, EZD-121 |  |  |  |
| EZD-125 | 1 | Edit lock service | todo |  | EZD-120, EZD-109, EZD-110, EZD-116, EZD-018 |  |  |  |
| EZD-126 | 1 | Edit lock UI | todo |  | EZD-125, EZD-011 |  |  |  |
| EZD-127 | 1 | Review pill | todo |  | EZD-117 |  |  |  |
| EZD-128 | 1 | Project switcher | todo |  | EZD-117 |  |  |  |
| EZD-129 | 1 | User project scope | todo |  | EZD-106, EZD-006 |  |  |  |
| EZD-130 | 1 | Project settings dialog | todo |  | EZD-118, EZD-116, EZD-128 |  |  |  |
| EZD-131 | 1 | Libraries shell | todo |  | EZD-103 |  |  |  |
| EZD-132 | 1 | File storage | todo |  | EZD-006 |  |  |  |
| EZD-133 | 1 | Access and money-field harness | todo |  | EZD-102, EZD-006 |  |  |  |
| EZD-134 | 1 | App-shell cache and device storage | todo |  | EZD-013, EZD-120 |  |  |  |
| EZD-135 | 1 | System status page | todo |  | EZD-103, EZD-024, EZD-025 |  |  |  |
| EZD-201 | 2 | Length parse and format | todo |  | EZD-001 |  |  |  |
| EZD-202 | 2 | Model document schema | todo |  | EZD-120 |  |  |  |
| EZD-203 | 2 | Walls core | todo |  | EZD-202 |  |  |  |
| EZD-204 | 2 | Openings core | todo |  | EZD-203 |  |  |  |
| EZD-205 | 2 | Rooms and closure | todo |  | EZD-203 |  |  |  |
| EZD-206 | 2 | Snapping | todo |  | EZD-203 |  |  |  |
| EZD-207 | 2 | Plan canvas | todo |  | EZD-012, EZD-202, EZD-017, EZD-020, EZD-236, EZD-238 |  |  |  |
| EZD-208 | 2 | Selection | todo |  | EZD-207 |  |  |  |
| EZD-209 | 2 | Typed dimension bar | todo |  | EZD-201, EZD-207 |  |  |  |
| EZD-210 | 2 | Wall and Room rectangle tools | todo |  | EZD-205, EZD-209 |  |  |  |
| EZD-211 | 2 | Door and window tools | todo |  | EZD-204, EZD-209 |  |  |  |
| EZD-212 | 2 | Move, handles, distance chips | todo |  | EZD-208 |  |  |  |
| EZD-213 | 2 | Inspector fields | todo |  | EZD-208 |  |  |  |
| EZD-214 | 2 | Status and phase switch | todo |  | EZD-213 |  |  |  |
| EZD-215 | 2 | Bearing wall rule | todo |  | EZD-213, EZD-132 |  |  |  |
| EZD-216 | 2 | Dimensions and text | todo |  | EZD-207, EZD-235 |  |  |  |
| EZD-217 | 2 | Undo, redo and clipboard | todo |  | EZD-208 |  |  |  |
| EZD-218 | 2 | Left panel: Layers and Rooms | todo |  | EZD-214, EZD-132 |  |  |  |
| EZD-219 | 2 | Status bar popovers | todo |  | EZD-206 |  |  |  |
| EZD-220 | 2 | Existing-condition pins | todo |  | EZD-213, EZD-132 |  |  |  |
| EZD-221 | 2 | Blank templates | todo |  | EZD-210, EZD-118 |  |  |  |
| EZD-222 | 2 | Keyboard shortcuts and Help | todo |  | EZD-116, EZD-012 |  |  |  |
| EZD-223 | 2 | Sketch tool | todo |  | EZD-207, EZD-108 |  |  |  |
| EZD-224 | 2 | Plan thumbnail | todo |  | EZD-207 |  |  |  |
| EZD-225 | 2 | Editor states | todo |  | EZD-126, EZD-204 |  |  |  |
| EZD-226 | 2 | Custom tile shower objects | todo |  | EZD-234 |  |  |  |
| EZD-227 | 2 | Grab-bar blocking | todo |  | EZD-234 |  |  |  |
| EZD-228 | 2 | Bath clearance check | todo |  | EZD-226, EZD-116 |  |  |  |
| EZD-229 | 2 | Existing-condition details | todo |  | EZD-220 |  |  |  |
| EZD-230 | 2 | Default key map and full rail | todo |  | EZD-222 |  |  |  |
| EZD-231 | 2 | Measure tool (plan) | todo |  | EZD-206, EZD-207 |  |  |  |
| EZD-232 | 2 | Manual revision cloud (plan) | todo |  | EZD-216 |  |  |  |
| EZD-233 | 2 | Context menu, mirror, align, groups | todo |  | EZD-217, EZD-131, EZD-234 |  |  |  |
| EZD-234 | 2 | Fixtures tool and utility points | todo |  | EZD-213 |  |  |  |
| EZD-235 | 2 | Derived values and workers | todo |  | EZD-205, EZD-207 |  |  |  |
| EZD-236 | 2 | Benchmark project generator | todo |  | EZD-202, EZD-017, EZD-120 |  |  |  |
| EZD-237 | 2 | Benchmark page | todo |  | EZD-207, EZD-236, EZD-135 |  |  |  |
| EZD-238 | 2 | Drawing list | todo |  | EZD-202 |  |  |  |
| EZD-301 | 3 | Upload step | todo |  | EZD-118, EZD-009, EZD-132 |  |  |  |
| EZD-302 | 3 | Polycam DXF detection | todo |  | EZD-301, EZD-202, EZD-016, EZD-029 |  |  |  |
| EZD-303 | 3 | Polycam GLB mesh | todo |  | EZD-301 |  |  |  |
| EZD-304 | 3 | PDF underlay and scale | todo |  | EZD-301 |  |  |  |
| EZD-305 | 3 | Vector PDF wall detection | todo |  | EZD-304 |  |  |  |
| EZD-306 | 3 | DXF conversion choice | todo |  | EZD-301, EZD-302 |  |  |  |
| EZD-307 | 3 | Import review screen | todo |  | EZD-302, EZD-303, EZD-012 |  |  |  |
| EZD-308 | 3 | Review modes | todo |  | EZD-307, EZD-116 |  |  |  |
| EZD-309 | 3 | Fix and delete | todo |  | EZD-307 |  |  |  |
| EZD-310 | 3 | Typed vs scan conflicts | todo |  | EZD-309, EZD-201 |  |  |  |
| EZD-311 | 3 | Resolve the gap | todo |  | EZD-310, EZD-205 |  |  |  |
| EZD-312 | 3 | Ceiling slope in review | todo |  | EZD-309, EZD-303 |  |  |  |
| EZD-313 | 3 | Finish and cancel | todo |  | EZD-308, EZD-310, EZD-311 |  |  |  |
| EZD-314 | 3 | Import states | todo |  | EZD-313, EZD-126 |  |  |  |
| EZD-315 | 3 | Laser keyboard input | todo |  | EZD-209, EZD-310 |  |  |  |
| EZD-401 | 4 | Catalog items (minimal) | todo |  | EZD-006 |  |  |  |
| EZD-402 | 4 | Cabinet object model | todo |  | EZD-202 |  |  |  |
| EZD-403 | 4 | Cabinet library panel | todo |  | EZD-402, EZD-401, EZD-404 |  |  |  |
| EZD-404 | 4 | Plan strip and elevation | todo |  | EZD-402, EZD-207 |  |  |  |
| EZD-405 | 4 | Box editing on canvas | todo |  | EZD-404 |  |  |  |
| EZD-406 | 4 | Box inspector | todo |  | EZD-405 |  |  |  |
| EZD-407 | 4 | Fit chip | todo |  | EZD-404, EZD-116 |  |  |  |
| EZD-408 | 4 | Auto-fill run | todo |  | EZD-407, EZD-234 |  |  |  |
| EZD-409 | 4 | Cabinet schedule | todo |  | EZD-406 |  |  |  |
| EZD-410 | 4 | Cabinet flags and states | todo |  | EZD-402, EZD-204 |  |  |  |
| EZD-411 | 4 | Countertop object model | todo |  | EZD-202 |  |  |  |
| EZD-412 | 4 | Trace and Draw outline | todo |  | EZD-411, EZD-404, EZD-116 |  |  |  |
| EZD-413 | 4 | Seams and cutouts | todo |  | EZD-412 |  |  |  |
| EZD-414 | 4 | Edges and overhangs | todo |  | EZD-412, EZD-116 |  |  |  |
| EZD-415 | 4 | Seating support check | todo |  | EZD-414 |  |  |  |
| EZD-416 | 4 | Left panel and status bar | todo |  | EZD-412 |  |  |  |
| EZD-417 | 4 | Edge profiles | todo |  | EZD-414 |  |  |  |
| EZD-418 | 4 | Top schedule | todo |  | EZD-416 |  |  |  |
| EZD-419 | 4 | Plan inspector: run selection | todo |  | EZD-406, EZD-409 |  |  |  |
| EZD-501 | 5 | Ceiling data per room | todo |  | EZD-202 |  |  |  |
| EZD-502 | 5 | RCP view and ceiling rail | todo |  | EZD-207, EZD-501, EZD-127 |  |  |  |
| EZD-503 | 5 | Ceiling type editor | todo |  | EZD-501, EZD-303 |  |  |  |
| EZD-504 | 5 | Walls cut under slopes | todo |  | EZD-503 |  |  |  |
| EZD-505 | 5 | Beams | todo |  | EZD-501 |  |  |  |
| EZD-506 | 5 | Section A-A preview | todo |  | EZD-505 |  |  |  |
| EZD-507 | 5 | Ceiling devices | todo |  | EZD-501 |  |  |  |
| EZD-508 | 5 | Fixture schedule panel | todo |  | EZD-507 |  |  |  |
| EZD-509 | 5 | Auto-layout cans | todo |  | EZD-507, EZD-116 |  |  |  |
| EZD-510 | 5 | Switching zones | todo |  | EZD-507 |  |  |  |
| EZD-511 | 5 | ACT grid | todo |  | EZD-501, EZD-116 |  |  |  |
| EZD-512 | 5 | HVAC objects | todo |  | EZD-511 |  |  |  |
| EZD-513 | 5 | Soffits, trays, coffers, crown, tags | todo |  | EZD-501 |  |  |  |
| EZD-514 | 5 | Framing known and keep-clear | todo |  | EZD-507 |  |  |  |
| EZD-515 | 5 | Fan clearance and hosted flags | todo |  | EZD-507, EZD-505, EZD-116 |  |  |  |
| EZD-516 | 5 | Beam finish, More menu, canvas | todo |  | EZD-505, EZD-401 |  |  |  |
| EZD-601 | 6 | Electrical mode and left panel | todo |  | EZD-207, EZD-202 |  |  |  |
| EZD-602 | 6 | Device toolbar | todo |  | EZD-601, EZD-507 |  |  |  |
| EZD-603 | 6 | Device height notes | todo |  | EZD-602, EZD-116 |  |  |  |
| EZD-604 | 6 | Circuits | todo |  | EZD-602 |  |  |  |
| EZD-605 | 6 | Switch legs | todo |  | EZD-604, EZD-510 |  |  |  |
| EZD-606 | 6 | Panel and existing panel dialog | todo |  | EZD-604, EZD-021 |  |  |  |
| EZD-607 | 6 | Load calc engine | todo |  | EZD-604 |  |  |  |
| EZD-608 | 6 | Load calc inspector | todo |  | EZD-607, EZD-116 |  |  |  |
| EZD-609 | 6 | Panel schedule | todo |  | EZD-604 |  |  |  |
| EZD-610 | 6 | Selected circuit and voltage drop | todo |  | EZD-604, EZD-116 |  |  |  |
| EZD-611a | 6 | Code check engine and rule registry | todo |  | EZD-604, EZD-218, EZD-613 |  |  |  |
| EZD-611b | 6 | Code rules: Florida Residential Ch. 3 (1 of 4) | todo |  | EZD-611a, EZD-620, EZD-501, EZD-234 |  |  |  |
| EZD-611c | 6 | Code rules: Florida Residential Ch. 3 (2 of 4) | todo |  | EZD-611a, EZD-620, EZD-501, EZD-234 |  |  |  |
| EZD-612 | 6 | Check button and results | todo |  | EZD-611a |  |  |  |
| EZD-613 | 6 | Code edition settings | todo |  | EZD-116 |  |  |  |
| EZD-614 | 6 | Appliance rating defaults | todo |  | EZD-607, EZD-401, EZD-103 |  |  |  |
| EZD-615 | 6 | Load calc: optional method and cases | todo |  | EZD-607, EZD-606, EZD-608 |  |  |  |
| EZD-616 | 6 | Code rules: Florida Residential Ch. 3 (3 of 4) | todo |  | EZD-611a, EZD-620, EZD-501, EZD-234 |  |  |  |
| EZD-617 | 6 | Code rules: Florida Residential Ch. 3 (4 of 4) | todo |  | EZD-611a, EZD-620, EZD-501, EZD-234 |  |  |  |
| EZD-618 | 6 | Code rules: Existing Building | todo |  | EZD-611a, EZD-620 |  |  |  |
| EZD-620 | 6 | Code data fields | todo |  | EZD-611a, EZD-130, EZD-213 |  |  |  |
| EZD-621 | 6 | Code rules: Florida construction chapters (1 of 2) | todo |  | EZD-611a, EZD-620, EZD-501 |  |  |  |
| EZD-622 | 6 | Code rules: Florida construction chapters (2 of 2) | todo |  | EZD-611a, EZD-620, EZD-501 |  |  |  |
| EZD-623 | 6 | Code rules: Energy Conservation | todo |  | EZD-611a, EZD-620, EZD-507 |  |  |  |
| EZD-624 | 6 | Code rules: Mechanical (1 of 2) | todo |  | EZD-611a, EZD-620, EZD-234 |  |  |  |
| EZD-625 | 6 | Code rules: Mechanical (2 of 2) | todo |  | EZD-611a, EZD-620, EZD-234 |  |  |  |
| EZD-626 | 6 | Code rules: Fuel gas | todo |  | EZD-611a, EZD-620, EZD-234 |  |  |  |
| EZD-627 | 6 | Code rules: Plumbing (1 of 3) | todo |  | EZD-611a, EZD-620, EZD-234, EZD-226 |  |  |  |
| EZD-628 | 6 | Code rules: Plumbing (2 of 3) | todo |  | EZD-611a, EZD-620, EZD-234, EZD-226 |  |  |  |
| EZD-629 | 6 | Code rules: Plumbing (3 of 3) | todo |  | EZD-611a, EZD-620, EZD-234, EZD-226 |  |  |  |
| EZD-630 | 6 | Code rules: NEC Art. 100-230 (1 of 4) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-411 |  |  |  |
| EZD-631 | 6 | Code rules: NEC Art. 100-230 (2 of 4) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-411 |  |  |  |
| EZD-632 | 6 | Code rules: NEC Art. 100-230 (3 of 4) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-411 |  |  |  |
| EZD-633 | 6 | Code rules: NEC Art. 100-230 (4 of 4) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-411 |  |  |  |
| EZD-634 | 6 | Code rules: NEC Art. 240-410 (1 of 4) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-610 |  |  |  |
| EZD-635 | 6 | Code rules: NEC Art. 240-410 (2 of 4) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-610 |  |  |  |
| EZD-636 | 6 | Code rules: NEC Art. 240-410 (3 of 4) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-610 |  |  |  |
| EZD-637 | 6 | Code rules: NEC Art. 240-410 (4 of 4) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-610 |  |  |  |
| EZD-638 | 6 | Code rules: NEC Art. 422-820 (1 of 2) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-234 |  |  |  |
| EZD-639 | 6 | Code rules: NEC Art. 422-820 (2 of 2) | todo |  | EZD-611a, EZD-620, EZD-604, EZD-234 |  |  |  |
| EZD-701 | 7 | Sheet model and default set | todo |  | EZD-202 |  |  |  |
| EZD-702a | 7 | Sheets screen | todo |  | EZD-701, EZD-726 |  |  |  |
| EZD-702b | 7 | Sheet renderer | todo |  | EZD-702a, EZD-235, EZD-238 |  |  |  |
| EZD-703 | 7 | Viewports and scales | todo |  | EZD-702, EZD-214 |  |  |  |
| EZD-704 | 7 | Sheet annotation tools | todo |  | EZD-702 |  |  |  |
| EZD-705 | 7 | Print rules | todo |  | EZD-703 |  |  |  |
| EZD-706 | 7 | Symbol key | todo |  | EZD-702 |  |  |  |
| EZD-707 | 7 | Elevations sheet | todo |  | EZD-703, EZD-404 |  |  |  |
| EZD-708a | 7 | A6.0 RCP sheet | todo |  | EZD-703, EZD-508 |  |  |  |
| EZD-708b | 7 | E1.0 electrical plan | todo |  | EZD-703, EZD-604, EZD-708a |  |  |  |
| EZD-708c | 7 | E2.0 panel schedule and load calc | todo |  | EZD-708b, EZD-609, EZD-607 |  |  |  |
| EZD-709 | 7 | Title block settings | todo |  | EZD-112, EZD-701 |  |  |  |
| EZD-710 | 7 | Title block on sheets | todo |  | EZD-709, EZD-130 |  |  |  |
| EZD-711 | 7 | Property appraiser import | todo |  | EZD-710, EZD-009, EZD-021, EZD-118 |  |  |  |
| EZD-712 | 7 | Submittal profiles | todo |  | EZD-116 |  |  |  |
| EZD-713 | 7 | Department profile settings | todo |  | EZD-712 |  |  |  |
| EZD-714 | 7 | Notes library | todo |  | EZD-712 |  |  |  |
| EZD-715 | 7 | PDF export job | todo |  | EZD-705, EZD-713, EZD-238, EZD-028 |  |  |  |
| EZD-716 | 7 | Issue checklist | todo |  | EZD-612, EZD-710 |  |  |  |
| EZD-717 | 7 | Issue Rev 0 and Rev N | todo |  | EZD-715, EZD-716, EZD-121 |  |  |  |
| EZD-718 | 7 | Revision clouds and log | todo |  | EZD-717 |  |  |  |
| EZD-719 | 7 | Send set to client | todo |  | EZD-717, EZD-111 |  |  |  |
| EZD-720 | 7 | Client set content | todo |  | EZD-701, EZD-418, EZD-726 |  |  |  |
| EZD-721 | 7 | Export menu | todo |  | EZD-715 |  |  |  |
| EZD-722 | 7 | Sheets states | todo |  | EZD-717 |  |  |  |
| EZD-723 | 7 | Download one page at a time | todo |  | EZD-715, EZD-713 |  |  |  |
| EZD-724 | 7 | Dismissible dimension warning | todo |  | EZD-716 |  |  |  |
| EZD-725 | 7 | Accepted warnings in the issue log | todo |  | EZD-717, EZD-612 |  |  |  |
| EZD-726 | 7 | Sheet sets | todo |  | EZD-701 |  |  |  |
| EZD-727 | 7 | Submittal profile enforcement at issue | todo |  | EZD-712, EZD-713, EZD-715 |  |  |  |
| EZD-728 | 7 | Cover sheet A0.0 | todo |  | EZD-706, EZD-714 |  |  |  |
| EZD-801 | 8 | Detail data and editor shell | todo |  | EZD-202, EZD-012 |  |  |  |
| EZD-802 | 8 | New detail dialog | todo |  | EZD-801 |  |  |  |
| EZD-803 | 8 | Drawing tools | todo |  | EZD-801, EZD-201 |  |  |  |
| EZD-804 | 8 | Line roles and hatches | todo |  | EZD-803 |  |  |  |
| EZD-805 | 8 | Annotation tools | todo |  | EZD-803 |  |  |  |
| EZD-806 | 8 | Parts | todo |  | EZD-801, EZD-817 |  |  |  |
| EZD-807 | 8 | Scale and NTS | todo |  | EZD-805, EZD-116 |  |  |  |
| EZD-808 | 8 | Steps and layers | todo |  | EZD-801 |  |  |  |
| EZD-809 | 8 | Legibility warnings | todo |  | EZD-805 |  |  |  |
| EZD-810 | 8 | Place on sheet | todo |  | EZD-809, EZD-702 |  |  |  |
| EZD-811 | 8 | Cut from model and callouts | todo |  | EZD-802, EZD-207 |  |  |  |
| EZD-812 | 8 | Underlay start | todo |  | EZD-802, EZD-304 |  |  |  |
| EZD-813 | 8 | Extrude to 3D | todo |  | EZD-803 |  |  |  |
| EZD-814 | 8 | Detail library and countertop link | todo |  | EZD-801, EZD-415, EZD-817 |  |  |  |
| EZD-815 | 8 | Detail PDF export | todo |  | EZD-810, EZD-721 |  |  |  |
| EZD-816 | 8 | Freehand pen | todo |  | EZD-803, EZD-223 |  |  |  |
| EZD-817 | 8 | Detail libraries in Settings | todo |  | EZD-801, EZD-131 |  |  |  |
| EZD-901a | 9 | Reference conversion job | todo |  | EZD-306, EZD-009, EZD-016, EZD-029 |  |  |  |
| EZD-901b | 9 | Reference drawing in Plan | todo |  | EZD-901a, EZD-207, EZD-235, EZD-017 |  |  |  |
| EZD-902 | 9 | Reference under the model | todo |  | EZD-901 |  |  |  |
| EZD-903 | 9 | Alignment | todo |  | EZD-902, EZD-904 |  |  |  |
| EZD-904 | 9 | Reference layers panel | todo |  | EZD-901 |  |  |  |
| EZD-905 | 9 | Paper-space layouts | todo |  | EZD-901 |  |  |  |
| EZD-906 | 9 | Convert layers | todo |  | EZD-904, EZD-307, EZD-306 |  |  |  |
| EZD-907 | 9 | Markup layer | todo |  | EZD-902, EZD-904 |  |  |  |
| EZD-908 | 9 | Reference versions | todo |  | EZD-904, EZD-921 |  |  |  |
| EZD-909a | 9 | Reference diff job | todo |  | EZD-908, EZD-907, EZD-116 |  |  |  |
| EZD-909b | 9 | Reference diff view | todo |  | EZD-909a |  |  |  |
| EZD-910 | 9 | Keep or accept a revision | todo |  | EZD-909 |  |  |  |
| EZD-911 | 9 | Export markup | todo |  | EZD-907, EZD-913, EZD-715 |  |  |  |
| EZD-912 | 9 | Section or callout from reference | todo |  | EZD-902, EZD-811 |  |  |  |
| EZD-913 | 9 | DXF export | todo |  | EZD-901, EZD-721 |  |  |  |
| EZD-914 | 9 | Supplier files panel | todo |  | EZD-301 |  |  |  |
| EZD-915 | 9 | Supplier vector PDF import | todo |  | EZD-914, EZD-305 |  |  |  |
| EZD-916 | 9 | 2020 order report import | todo |  | EZD-914, EZD-307, EZD-021 |  |  |  |
| EZD-917 | 9 | Tag and link tools | todo |  | EZD-914, EZD-404, EZD-907 |  |  |  |
| EZD-918 | 9 | Read codes | todo |  | EZD-917, EZD-916, EZD-021 |  |  |  |
| EZD-919 | 9 | Compare and resolve mismatches | todo |  | EZD-917, EZD-407, EZD-111 |  |  |  |
| EZD-920 | 9 | Suggested finishes | todo |  | EZD-917, EZD-401, EZD-021 |  |  |  |
| EZD-921 | 9 | Architect revision labels | todo |  | EZD-904 |  |  |  |
| EZD-922a | 9 | Reference states (screen 11) | todo |  | EZD-911 |  |  |  |
| EZD-922b | 9 | Supplier markup states (screen 12) | todo |  | EZD-919 |  |  |  |
| EZD-1001a | 10 | 3D scene core | todo |  | EZD-207, EZD-020, EZD-235, EZD-030 |  |  |  |
| EZD-1001b | 10 | 3D ceilings and beams | todo |  | EZD-1001a, EZD-504, EZD-505 |  |  |  |
| EZD-1001c | 10 | 3D cabinets, fixtures, devices and finishes | todo |  | EZD-1001b, EZD-402, EZD-414, EZD-234, EZD-226, EZD-602, EZD-401 |  |  |  |
| EZD-1002 | 10 | Navigation | todo |  | EZD-1001 |  |  |  |
| EZD-1003 | 10 | Walk and Look up | todo |  | EZD-1002, EZD-116 |  |  |  |
| EZD-1004 | 10 | Section and display modes | todo |  | EZD-1002 |  |  |  |
| EZD-1005 | 10 | 3D layers | todo |  | EZD-1001, EZD-303 |  |  |  |
| EZD-1006 | 10 | Saved views | todo |  | EZD-1002 |  |  |  |
| EZD-1007 | 10 | Select and apply finish | todo |  | EZD-1001, EZD-401, EZD-505 |  |  |  |
| EZD-1008 | 10 | Rail on the 3D tab | todo |  | EZD-1002, EZD-612 |  |  |  |
| EZD-1009 | 10 | Design options data | todo |  | EZD-202 |  |  |  |
| EZD-1010 | 10 | Options inspector | todo |  | EZD-1009, EZD-1001 |  |  |  |
| EZD-1011 | 10 | Make options from the RCP | todo |  | EZD-1010, EZD-505 |  |  |  |
| EZD-1012 | 10 | Measure in 3D | todo |  | EZD-1002 |  |  |  |
| EZD-1013 | 10 | Phone 3D viewer | todo |  | EZD-1012, EZD-014 |  |  |  |
| EZD-1014 | 10 | GLB and USDZ export | todo |  | EZD-1001, EZD-721 |  |  |  |
| EZD-1015 | 10 | iPad memory guard and states | todo |  | EZD-1001 |  |  |  |
| EZD-1017 | 10 | Inspector 3D preview | todo |  | EZD-1001 |  |  |  |
| EZD-1101 | 11 | Render records and jobs | todo |  | EZD-009, EZD-1006 |  |  |  |
| EZD-1102 | 11 | Render models settings | todo |  | EZD-116 |  |  |  |
| EZD-1103 | 11 | Provider adapters | todo |  | EZD-1101, EZD-1102, EZD-021 |  |  |  |
| EZD-1104a | 11 | Local worker protocol | todo |  | EZD-1103, EZD-116 |  |  |  |
| EZD-1104b | 11 | Local worker program | todo |  | EZD-1104a |  |  |  |
| EZD-1105 | 11 | Browser path tracer | todo |  | EZD-1001, EZD-1109 |  |  |  |
| EZD-1106 | 11 | Step 1: angle | todo |  | EZD-1006, EZD-1101 |  |  |  |
| EZD-1107 | 11 | Preview and optional alignment | todo |  | EZD-1106 |  |  |  |
| EZD-1108 | 11 | Step 2: style and direction | todo |  | EZD-1107, EZD-401 |  |  |  |
| EZD-1109 | 11 | Tiers and Generate | todo |  | EZD-1108, EZD-1103 |  |  |  |
| EZD-1110 | 11 | Renders list and notifications | todo |  | EZD-1109, EZD-110, EZD-127 |  |  |  |
| EZD-1111 | 11 | Render view | todo |  | EZD-1110 |  |  |  |
| EZD-1112 | 11 | Comment pins | todo |  | EZD-1111 |  |  |  |
| EZD-1113 | 11 | Fix and regenerate | todo |  | EZD-1111 |  |  |  |
| EZD-1114 | 11 | Two-step approval | todo |  | EZD-1111 |  |  |  |
| EZD-1115 | 11 | Model changed detection | todo |  | EZD-1114, EZD-1001, EZD-1109, EZD-127 |  |  |  |
| EZD-1116 | 11 | Download | todo |  | EZD-1111 |  |  |  |
| EZD-1117 | 11 | Render allowance | todo |  | EZD-1102, EZD-110 |  |  |  |
| EZD-1118 | 11 | Render A/B/C from 3D | todo |  | EZD-1109, EZD-1010 |  |  |  |
| EZD-1119 | 11 | R1.0 finish schedule + renders | todo |  | EZD-1114, EZD-716, EZD-401 |  |  |  |
| EZD-1120 | 11 | Local worker: real runner | todo |  | EZD-1104b |  |  |  |
| EZD-1121 | 11 | Second provider adapter | todo |  | EZD-1103 |  |  |  |
| EZD-1201 | 12 | Share links | todo |  | EZD-111, EZD-116 |  |  |  |
| EZD-1202 | 12 | Client page shell | todo |  | EZD-1201, EZD-020 |  |  |  |
| EZD-1203 | 12 | Render gallery | todo |  | EZD-1202, EZD-1114 |  |  |  |
| EZD-1204 | 12 | Client comments | todo |  | EZD-1203, EZD-1112 |  |  |  |
| EZD-1205 | 12 | Plans tab | todo |  | EZD-1202, EZD-702, EZD-1215 |  |  |  |
| EZD-1206 | 12 | Send options to client | todo |  | EZD-1010, EZD-1201, EZD-121 |  |  |  |
| EZD-1207 | 12 | Option choice | todo |  | EZD-1206, EZD-1215 |  |  |  |
| EZD-1208 | 12 | Selection offers and choice pages | todo |  | EZD-1202, EZD-417 |  |  |  |
| EZD-1209 | 12 | Edge choice | todo |  | EZD-1208, EZD-417 |  |  |  |
| EZD-1210 | 12 | Verify and sign | todo |  | EZD-1208, EZD-113 |  |  |  |
| EZD-1211 | 12 | Approve | todo |  | EZD-1210 |  |  |  |
| EZD-1212 | 12 | Selections PDF | todo |  | EZD-1211 |  |  |  |
| EZD-1213 | 12 | Send image | todo |  | EZD-1114, EZD-111 |  |  |  |
| EZD-1214 | 12 | Archive options on signing | todo |  | EZD-1009, EZD-1211 |  |  |  |
| EZD-1215 | 12 | Send to client composer | todo |  | EZD-1201, EZD-1208, EZD-401 |  |  |  |
| EZD-1301 | 13 | Webhook delivery | todo |  | EZD-114, EZD-109, EZD-116, EZD-022, EZD-009, EZD-019 |  |  |  |
| EZD-1302 | 13 | Outbound event payloads | todo |  | EZD-1301 |  |  |  |
| EZD-1303 | 13 | Inbound API authentication | todo |  | EZD-114, EZD-019 |  |  |  |
| EZD-1304 | 13 | Inbound: create project from job | todo |  | EZD-1303, EZD-119 |  |  |  |
| EZD-1305 | 13 | Inbound: open with shared sign-on | todo |  | EZD-1303 |  |  |  |
| EZD-1306 | 13 | Inbound: read approved data | todo |  | EZD-1303, EZD-1211, EZD-717, EZD-1114 |  |  |  |
| EZD-1307 | 13 | Inbound: mark CO approved | todo |  | EZD-1303, EZD-1308 |  |  |  |
| EZD-1308 | 13 | CO draft data and entry points | todo |  | EZD-717, EZD-122 |  |  |  |
| EZD-1309 | 13 | Before and after images | todo |  | EZD-1308, EZD-1114 |  |  |  |
| EZD-1310 | 13 | Scope text | todo |  | EZD-1308, EZD-009, EZD-021 |  |  |  |
| EZD-1311 | 13 | Line items and schedule impact | todo |  | EZD-1308 |  |  |  |
| EZD-1312 | 13 | Save draft and Send to EZ Binder | todo |  | EZD-1309, EZD-1311, EZD-1302 |  |  |  |
| EZD-1314 | 13 | Canonical event registry | todo |  | EZD-1301, EZD-022 |  |  |  |
| EZD-1401 | 14 | Service worker cache | todo |  | EZD-134 |  |  |  |
| EZD-1402 | 14 | Offline change queue | todo |  | EZD-1401, EZD-120 |  |  |  |
| EZD-1403 | 14 | Offline editing and conflicts | todo |  | EZD-1402, EZD-125 |  |  |  |
| EZD-1404 | 14 | Field pack shell | todo |  | EZD-1401, EZD-1305 |  |  |  |
| EZD-1405 | 14 | Plan and 3D tabs | todo |  | EZD-1404, EZD-1013 |  |  |  |
| EZD-1406 | 14 | Measure tab | todo |  | EZD-1405, EZD-315 |  |  |  |
| EZD-1407 | 14 | Send measurement and Flag conflict | todo |  | EZD-1406, EZD-1402 |  |  |  |
| EZD-1408 | 14 | Field task templates and publishing | todo |  | EZD-131, EZD-021 |  |  |  |
| EZD-1409 | 14 | Tasks tab | todo |  | EZD-1408, EZD-1402, EZD-1404 |  |  |  |
| EZD-1410 | 14 | Photo tab and pins | todo |  | EZD-1405, EZD-1402, EZD-1407 |  |  |  |
| EZD-1411 | 14 | Field pack PDF | todo |  | EZD-1405, EZD-1421, EZD-715 |  |  |  |
| EZD-1412 | 14 | Stale actions on reconnect | todo |  | EZD-1402, EZD-717 |  |  |  |
| EZD-1413 | 14 | Field measurements review | todo |  | EZD-1407, EZD-310, EZD-127, EZD-125 |  |  |  |
| EZD-1414 | 14 | Field conflicts list | todo |  | EZD-1407, EZD-127 |  |  |  |
| EZD-1415 | 14 | Field measure: shapes and walls | todo |  | EZD-1401 |  |  |  |
| EZD-1416 | 14 | Field measure: keypad and closure | todo |  | EZD-1415 |  |  |  |
| EZD-1417 | 14 | Field measure: offline save and send | todo |  | EZD-1416, EZD-1402, EZD-110 |  |  |  |
| EZD-1418 | 14 | Field measure into Import review | todo |  | EZD-1417, EZD-307 |  |  |  |
| EZD-1419 | 14 | Field measure entry points and states | todo |  | EZD-1415, EZD-1404, EZD-118, EZD-1305, EZD-1406 |  |  |  |
| EZD-1420 | 14 | Field tasks screen | todo |  | EZD-1408, EZD-1409 |  |  |  |
| EZD-1421 | 14 | Issue field pack | todo |  | EZD-1420, EZD-129, EZD-1404 |  |  |  |
| EZD-1422 | 14 | Field measure as wizard input | todo |  | EZD-118, EZD-1419 |  |  |  |
| EZD-1501 | 15 | Translation store | todo |  | EZD-006 |  |  |  |
| EZD-1502 | 15 | AI drafting | todo |  | EZD-1501, EZD-009, EZD-021, EZD-110 |  |  |  |
| EZD-1503 | 15 | Spanish display | todo |  | EZD-1501, EZD-1404, EZD-026 |  |  |  |
| EZD-1504 | 15 | Review table | todo |  | EZD-1501, EZD-103 |  |  |  |
| EZD-1505 | 15 | Review card actions | todo |  | EZD-1504 |  |  |  |
| EZD-1506 | 15 | Draft warnings | todo |  | EZD-1504 |  |  |  |
| EZD-1507 | 15 | Glossary | todo |  | EZD-1504 |  |  |  |
| EZD-1508 | 15 | Bulk approve | todo |  | EZD-1506 |  |  |  |
| EZD-1509 | 15 | Propagation | todo |  | EZD-1505 |  |  |  |
| EZD-1510 | 15 | Translation settings | todo |  | EZD-1504, EZD-716 |  |  |  |
| EZD-1601 | 16 | Catalog drawer | todo |  | EZD-401 |  |  |  |
| EZD-1602 | 16 | Place from catalog | todo |  | EZD-1601, EZD-234 |  |  |  |
| EZD-1603 | 16 | Add product: link | todo |  | EZD-1601, EZD-009, EZD-021 |  |  |  |
| EZD-1604 | 16 | Add product: paste text and screenshot | todo |  | EZD-1603, EZD-021 |  |  |  |
| EZD-1605 | 16 | Field confirmation | todo |  | EZD-1603 |  |  |  |
| EZD-1606 | 16 | Save and place | todo |  | EZD-1605 |  |  |  |
| EZD-1607 | 16 | Item detail | todo |  | EZD-1606 |  |  |  |
| EZD-1608 | 16 | Price snapshots and refresh | todo |  | EZD-1607 |  |  |  |
| EZD-1609 | 16 | Catalog settings | todo |  | EZD-103, EZD-1212 |  |  |  |
| EZD-1610 | 16 | Catalog states | todo |  | EZD-1601 |  |  |  |
| EZD-1611a | 16 | Takeoff framework and room finishes | todo |  | EZD-235, EZD-226, EZD-116 |  |  |  |
| EZD-1611b | 16 | Takeoff: cabinets, tops, fixtures and electrical | todo |  | EZD-1611a, EZD-418, EZD-604 |  |  |  |
| EZD-1611c | 16 | Takeoff: ACT, option costs and snapshot | todo |  | EZD-1611b, EZD-511, EZD-1010, EZD-121 |  |  |  |
| EZD-1612 | 16 | Waste factors | todo |  | EZD-1611, EZD-116 |  |  |  |
| EZD-1613 | 16 | Takeoff screen | todo |  | EZD-1611 |  |  |  |
| EZD-1614 | 16 | Tile layout preview | todo |  | EZD-1612, EZD-1001 |  |  |  |
| EZD-1615 | 16 | Takeoff CSV | todo |  | EZD-1613 |  |  |  |
| EZD-1616 | 16 | Catalog on the standard rail | todo |  | EZD-1601, EZD-230 |  |  |  |
| EZD-1617 | 16 | Catalog settings: markup per category and edge library | todo |  | EZD-1601, EZD-1609 |  |  |  |
| EZD-1701 | 17 | Performance targets | todo |  | EZD-1001, EZD-901 |  |  |  |
| EZD-1702 | 17 | DXF size limits | todo |  | EZD-1701 |  |  |  |
| EZD-1704 | 17 | Backups | todo |  | EZD-025 |  |  |  |
| EZD-1705 | 17 | Security review | todo |  | EZD-1302, EZD-1211 |  |  |  |
| EZD-1706 | 17 | Event log coverage | todo |  | EZD-109 |  |  |  |
| EZD-1707 | 17 | Terms of service | todo |  | EZD-007 |  |  |  |
| EZD-1708 | 17 | Accessibility pass | todo |  | EZD-222 |  |  |  |
| EZD-1709a | 17 | Screen states: Projects and Settings | todo |  | EZD-016 |  |  |  |
| EZD-1709b | 17 | Screen states: editor tabs | todo |  | EZD-1709a, EZD-1613 |  |  |  |
| EZD-1709c | 17 | Screen states: phone and client screens | todo |  | EZD-1709b |  |  |  |
| EZD-1710 | 17 | Code rule list and verification | todo |  | EZD-611, EZD-613, EZD-620 |  |  |  |
