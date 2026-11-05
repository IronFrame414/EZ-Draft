## Punch list (Josh's test script, PHASES.md Phase 2)
- [ ] 1. Sign in. Projects shows the status tabs with counts, sort and search, and no EZ Binder link. (EZD-117a, 117b)
- [ ] 2. Type part of a client name in search. The cards and the tab counts narrow to the matches. (EZD-117b)
- [ ] 3. New project: fill name, address, type and scope of work, pick or add a client, Create. Back on Projects with the new Draft card. (EZD-118)
- [ ] 4. Send yourself a notification from the development page on the preview, then open the bell. It is listed and the email arrives; clicking it marks it read. (EZD-110a, 110b, 332)
- [ ] 5. Avatar → My profile → Notifications, turn that kind's Email off, Save, send it again. It shows in the bell but no email arrives. (EZD-108, 140)
- [ ] 6. My profile → Profile, change iPad drawing and language, Save, reload. Both kept. (EZD-108)

## Tickets done (ID, title, commit)
- EZD-108 Avatar menu and My profile (f8904f94)
- EZD-110a Notifications: table, email and routes (dd1e24c3)
- EZD-110b Notifications: bell and list (232e1372)
- EZD-117a Projects page: query and cards (f880bc59)
- EZD-117b Projects page: header, search and states (39c6bc9a)
- EZD-118 New project wizard (c9498cb0)
- EZD-140 Notification settings per user (cd5ef475)
- Fixes and research: EZD-283 (8db3bef6), 288 (5e6be990), 292 (73a1e2a4), 293 research (1cb78993), 318 (0bd4bc20), 319 (1382b768), 324 (e9b43882), 330 (9f815787), 332 (26e41274)
- Tooling, done: EZD-325 scratch database test flake (12ef30c2).

## Blocked
- EZD-327 (EZD-025 backup test T3 flake): duplicate of EZD-326, done; needs a ledger drop.
- EZD-276 (perf check for the Projects first cards): tooling, put off; AC-EZD-117a-2's 1-second line rests on browser test B2 alone.

## Tooling tickets still open
EZD-276 (phase 2, blocked). Earlier phases, blocked: EZD-185, 191, 248, 249, 261, 263, 264, 265, 268, 269, 270, 271, 272, 273, 274, 275.

## Tooling tickets from earlier phases in this PR (done, not yet on main; audited at this gate)
EZD-154 Remove the PA3 grant from the path guard (31ade158); EZD-172 Parallel lanes: own database and ports (bb5d102f); EZD-174 Parallel lanes: launcher runs several units (9b6706e3; lanes stay off until `node vault/tools/lanes.mjs on`); EZD-256 One gate takes over a dead lock (8a9d92cd); EZD-279 Read guard denies secret files in any letter case (1b320982); EZD-280 Shell guard denies any command naming a secret file (d058154c); EZD-326 EZD-025 T3 test fix (35fdefa1); EZD-329 Tooling worktree gets its held tickets.json entry (86671a64); EZD-331 Dead-lock take-over tests (f7e7803a).

## Later-phase tickets in this PR
- EZD-133 (phase 3) Access and money-field harness (97e1ca98)
- EZD-201 (phase 4) Length parse and format (d14e0c7b)
Built early; Josh tests them at their own phase's gate.

## Wording to confirm (needs-josh-confirm)
- EZD-108: 9 Spanish error.* keys in es.ts; error.db_unavailable shown in the password section on network failure or unknown code.
- EZD-118: "Choose a type"; "Pick a customer"; "No customer"; "Show more"; "Couldn't create the project. Try again."; "This customer isn't available. Pick another customer or leave Customer empty."; "Discard this new project?"; "Nothing you typed will be saved."; Discard / Keep editing; Spanish error.project_customer_unavailable.

## Product judgments (phase-auditor)
- The Projects page download budget is 300 KB (Q-0586, your word 2026-11-05) against the spec's 200 KB; the page measures about 231 KB. Confirm this is the lasting number.
- Q-0451 (agent answer): a Foreman who creates a project is listed on it automatically. Confirm.
- AC-EZD-118-4: the wizard reuses the Company settings customer dialog, so a new client needs an email at creation. Confirm.
- Other agent answers not yet confirmed-josh: vault/questions/phase-02-for-josh.md section 2.

## Audit and gate
- Gate: GATE PASS (typecheck, lint, test, build, e2e, perf).
- Phase audit (Fable): READY, plus addendum PASS over the phase-2 fix tickets, the phase-2 tickets already on main and the nine earlier-phase tooling tickets above. All 42 slice ACs map to done tickets with passing tests. No defects, no fix tickets. Fixed in place: stale 220,000 budget wording. Debt: D-086 (duplicate Q-0586 ID, low). Four tooling notes in vault/tooling-notes.md.
- vault/handoff/EZD-117b-budget.patch was staged add-only and blocked the merge; it is now committed as a record.

## Production-sensitive changes: PASS (security-reviewer)
- Migrations 20261104190000_create_list_projects, 20261104190002_create_count_projects, 20261104230731_add_project_search (list and counts run as the caller under row-level security; search wildcards escaped), 20261105105039_create_create_project (the only way to create a project; checks Create projects and the company in the database).
- package.json db:reset and db:stop, scripts/backup/scratch*, scripts/release/scratch config: local-only port and lane changes; no production backup change.
- No changes to .github/workflows, hosting, bootstrap, lockfile, workspace or .npmrc.

## Field check (what tests cannot catch)
Real email on the preview; the bell live over hosted Realtime; "/" and Esc with the iPad keyboard; search feel at 250 ms and mixed case; Spanish switch; create a project as a listed-scope Foreman and see the card; Offline banner with New project disabled; Projects grid at Surface width; tap targets on the iPad.

## Lessons added this phase
vault/lessons/builder.md, planner.md, test-author.md (index regenerated, 8429578e).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
