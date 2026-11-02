# Stage 2 log (overnight, unattended)

## Morning summary (2026-11-02, for Josh)

**Status: part done. The build is still paused (STOP in place). develop is green on the Mac gate; CI runs on every push to develop.**

Done, all merged and pushed: H7 CI fix (b07dee8f) · guard exceptions (a78c5b41) · 2.1 non-goals (191e40a9) · 2.2 (b60437ae) · 2.3 rules 17 and 18, debt list, plan caps (ff63dbaa, c103fb74) · 2.4 one launcher at a time (d4be9db6; the live service took the lock, pid 975) · 2.5 lesson (7259c07f) · 2.6 sandbox spike (727f3ffb) · 2.10 records database (d69d7cf7, aef626d9) · 2.11 round trip (76365f41) · 2.20 to 2.23 cleanup (8f2e83c1; worktrees and `perf-results/` removed).

Needs your decision:
1. The sandbox (2.7 to 2.9): see the question at the end of `vault/spikes/sandbox/NOTES.md`. Recommended: a unit-level sandbox now, and per-worktree isolation with the lanes work.
2. Start the session card "Records redesign 2.12 to 2.14" (it stays on a branch until you answer 1).
3. L8 (dependency audit in CI, Sentry update), L10 (knip in the gate) and 2.19 (test split) are build-system tickets; the new rule 18 needs your yes to create them. L9 (a proxy rule that hides developer pages on the live site) is an app security defect, so it becomes a ticket without one.

Needs your confirmation: the wording of CLAUDE.md rules 17 and 18 · the three deny entries moved from `.claude/settings.json` into the shell guard · lesson L-041 is marked ratified because you accepted the audit's recommendation, not this exact text.

Good to know: fix mode and the guard exceptions stay open until Stage 2 ends · the `archive/*` tags are on this Mac only · EZD-259 (the flaky backup restore drill) is still open and failed one gate run · four question rows were repaired · the planned one-session-per-group run could not start (the app allows that only on a turn you type), so everything ran in this one session.

Started 2026-11-01. Plan: ~/Projects/ezdraft-audit/REMEDIATION-PLAN.md Stage 2, with AUDIT-ADDENDUM.md sections 5, 8, 9 and 10. Fix mode: vault/handoff/LAUNCHER_FIX.md. Josh's standing approvals (chat, 2026-11-01): fix mode for Stage 2; one commit per item on develop after a green gate, then push; deletions the plan lists, tagged first; CLAUDE.md and PROCESS.md edited as D3 and D9 say; three guard-bash exceptions (starting `claude` for the sandbox spike, `node scripts/run.mjs --dry-run`, `rm -rf` on the listed cleanup folders) until item 2.8; a stuck item (guard or classifier refusal, a question for Josh, or two failed attempts) is skipped with its reason and the next independent item starts; vault/handoff/STOP stays; one session per group, never two at once.

Each session appends: item, commit hash or SKIPPED with the reason, and anything Josh must confirm.

## Order

| Session | Items |
| --- | --- |
| 1 | H7 (this session) |
| 2 | guard-bash exceptions; Group A: 2.1 to 2.5 (2.4 as changed by AUDIT-ADDENDUM section 8: one build at a time until H1 and EZD-172 are done; keep EZD-172 and EZD-174) |
| 3 | Group B: 2.6 to 2.9 (sandbox) |
| 4 | Group C part 1: 2.10, 2.11 (records database, import round trip) |
| 5 | Group C part 2: 2.12 to 2.14 (launcher as the only writer, readers, git-ignore) |
| 6 | Group C part 3: 2.15 to 2.18 (removals, ticket closures, PROCESS.md, session cost logging) |
| 7 | Group D: 2.19 (unit and db test projects); Group E: 2.20 to 2.23, plus L9, L8, L10 (AUDIT-ADDENDUM section 5) |

Not overnight (need Josh): 2.24 (his own folder), removing STOP, EZD-172 and EZD-174 builds (they run through the launcher), the phase 1 gate and punch list.

## Entries

- H7: done, b07dee8f (gate PASS on the Mac run CI-style; GitHub CI run 41376564624 on fix/h7-ci PASS; develop push started run 41378084333). Josh to confirm: nothing (approved and applied by him).
- Note: this session could not start the planned fresh sessions (the app allows a start only on a turn Josh typed), so Stage 2 continues in this one session.
- Guard-bash exceptions: done, a78c5b41. Also closes a gap: an env-prefixed `claude` (e.g. `FOO=1 claude`) was not denied before. Josh to confirm: the three settings.json deny entries moved to the hook.
- 2.1 non-goals: done, 191e40a9 (0 of 568 ticket titles match a remaining non-goal; positive control found the billing, IFC and AR tickets). The product overview's scope table is already overridden by the Q-0220 row in decisions/02-product-overview.md, so no new decision row.
- 2.2 duplicate sentence: done, b60437ae (count 1).
- 2.3 rules 17 and 18, debt list, plan caps, freeze: done, ff63dbaa and c103fb74. New file `vault/debt.md` (L11, L12 as D-001, D-002). Josh to confirm: the rule 17 and 18 wording in CLAUDE.md.
- 2.4 one launcher at a time: done, d4be9db6 (`<log_dir>/launcher.lock`; the launcher already ran one unit at a time, but nothing stopped a second launcher beside the service). EZD-172 and EZD-174 stay open.
- 2.5 lesson: done, 7259c07f (L-041, marked ratified on Josh's acceptance of the audit recommendations).
- Gate for all of the above: PASS on 11b8337c, pushed. One earlier gate run on the guard change alone failed only in the backup restore drills (EZD-025, EZD-1704); they passed alone (4 of 4) and in the next full gate. That is the open defect EZD-259 (scratch database start under a full gate), a flaky test, not accepted: it stays a ticket at the front of the queue after resume.
- 2.6 sandbox spike: done with a caveat, see `vault/spikes/sandbox/NOTES.md`. All write and secret probes were refused for a process started inside a worktree, but the sandbox covers shell commands only, a unit is one process started in the project folder, and the gate needs the Docker socket (a hole).
- 2.7, 2.8, 2.9: SKIPPED, needs Josh. The spike changed what D4 (a) can deliver; the choice is the question at the end of NOTES.md. 2.8 as written would remove the only containment for Read, Edit and Write, and EZD-279, 280, 282 stay open until the answer.
- 2.10 records database: done (d69d7cf7, aef626d9; gate PASS on 8f2e83c1, merged and pushed): `scripts/records.mjs` (import, export, show, backup; `--db`, default `~/.ezdraft/records.db`), tests on temp databases. `node:sqlite` is built in (Node 22.23.3); its one load warning is dropped in that script only.
- 2.11 round trip: done (76365f41). On today's vault: 568 tickets, 56 phase rows, 474 questions, 164 done lines, 603 cost rows, 67 findings imported; STATUS, QUESTIONS-answered and debt come back differing only in spacing, the other seven files byte for byte; PROGRESS and TRACE generated from the exported files equal those generated from today's apart from the timestamp line. Data fix needed first: four question rows (Q-0389, Q-0405, Q-0408, Q-0409) had 7 cells and no closing pipe; each got an empty Source cell. Josh to confirm: nothing.
- 2.20, 2.21 worktrees: done (no commit: worktrees are not in git). 13 removed (the nine done tickets, `brave-burnell-e43b42`, EZD-248, 251, 262); EZD-172 kept. Every branch tagged `archive/<branch>` first (local tags, not pushed); four had uncommitted plan edits (EZD-026b, 113, 200, 257), committed onto their own branches before tagging. About 15 GB freed.
- 2.22 `perf-results/`: done (already git-ignored; generated output, the perf check only appends to its history).
- 2.23 `apply_recut.mjs`: done (8f2e83c1).
- L9 (proxy rule for `/dev`), L8 (audit in CI, Sentry update), L10 (knip in the gate), 2.19 (unit and db test projects): SKIPPED overnight. Each changes app code, app config or packages, which the guards route to a builder agent with a plan and tests; they become small tickets after resume.
- 2.12 to 2.18: not started. 2.12 alone touches about 3,000 lines across the launcher, hooks and every skill, cannot merge before the sandbox answer, and needs a reviewed plan split under the new 5,000-character tooling cap; it is proposed as its own session for the morning.

## Resume session (2026-11-02, orchestrator)

- Unit guard (s2/unit-guard, 310f0cd5): done. Gate PASS on the branch; develop fast-forwarded and pushed; worktree and branch removed.
- Resume: done. `vault/handoff/STOP` removed 05:05 UTC. First unit: `gate-phase 1` at 05:06 UTC (ok, $5.45). It came before EZD-259 because a tooling ticket does not hold a phase gate (next_ticket.mjs, EZD-253/254). Then questions 1, plan EZD-283, questions 2, plan EZD-288, questions 2, build EZD-259 (merged 7024ee42, 1603 tests).
- Launcher stop at 06:03 UTC: the phase 1 gate wrote fix tickets EZD-284 to EZD-287 as `ready` with no plan; `build EZD-284` ended twice with no progress and the launcher stopped (service not running, exit 0). Rows set back to `todo` in 4bac5e27 (next unit: `plan EZD-284`); debt D-004. Root cause fixed on s2/plan-check (this commit): the ledger check refuses a ticket past `todo` with no plan, and the gate-phase skill names `todo`. **Restart refused:** `node scripts/launchd/install.mjs install` was denied by the auto-mode classifier ("Unauthorized Persistence"); Josh restarts the service.
- 2.8 grants and Stage 2 exceptions: done, 26ba6dee (gate PASS). Removed `.claude/hooks/grants.json`, `vault/tools/grants.mjs`, the launcher's grant pass, the merge-time grant drop, the hardcoded usage-fix grants in guard-paths, the three guard-bash Stage 2 exceptions, and their tests. Kept: guard-paths and guard-reads (Read, Edit and Write run outside the sandbox) and the next-unit hold for a plan that needs a guarded file (now `vault/tools/plan-paths.mjs`; text "waiting on Josh (guarded paths for ...; a change to them goes through fix mode)"). Guard source is not cut to under 200 lines (the plan's 2.8 target): the brief kept guard-paths and guard-reads.
- 2.7 unit sandbox: built, NOT merged (branch `s2/sandbox`, 23637f90, pushed). Probes in `vault/spikes/sandbox/NOTES.md`: writes outside the repository, `.env` reads in any letter case, through a symlink or a glob, the launcher config, the escape flag and subagent writes are all refused; git push, gh, pnpm, Docker and the local database work; outside sites are refused only with `strictAllowlist`. Blocker: Playwright Chromium cannot start in the sandbox (macOS refuses its Mach service registration; no setting allows it), so a sandboxed unit's gate fails at test:e2e. Not done from 2.7: "drop bypassPermissions for reviewers" (not in the brief).
- 2.9: EZD-282 closed as obsolete (grants gone; this commit). EZD-280 stays open: the probes show the sandbox would cover it once units run sandboxed. EZD-279 stays open (Read is outside the sandbox). EZD-154 not reduced (not in the brief).
- Records redesign session (2.12 to 2.14): reported failed before this merge; told once that the grant removal merged and the sandbox is held.

**Question for Josh (2.7):** the sandbox cannot run the browser tests. Options:
1. **Gate and database outside the sandbox, run by the launcher per lane (recommended).** The unit stays sandboxed; the launcher runs the gate (with Docker and Chromium) as its own process and hands back the result. Also closes the Docker-socket hole. Cost: about 1 to 2 days, part of the lanes work (EZD-172); units stay unsandboxed until then, as today.
2. Browser outside the sandbox: the launcher starts a Playwright browser server, the tests connect over localhost. Narrower hole; Docker hole stays. Cost: about half a day plus an app test-config ticket.
3. Exclude the gate command from the sandbox (one settings line). Everything the gate runs, including agent-written code and tests, runs unsandboxed; the Docker socket is already a full escape, so the added loss is smaller than it sounds. Cost: minutes.
4. Leave units unsandboxed until Claude Code allows the browser.

**Also for Josh:** the gate-phase skill turns on auto-merge for the phase PR (Q-0261), while the 2026-11-02 decision says the phase 1 PR "waits for Josh's punch-list walk". No PR is open yet (fix tickets EZD-284 to EZD-287 come first). Which holds?

## Phase 1 punch list walk (2026-11-02, orchestrator; Josh: "you can do the punch list walk in the browser")

Where: develop f20fb07e, `next dev` on 127.0.0.1:3100 against the local stack (reset by `pnpm db:up` first, because the app's gate secret no longer matched the database's), built-in browser, seeded test users signed in through emailed links from the local mailbox. Script: `vault/tickets/PHASES.md` slice 1. The audit walkthrough (`~/Projects/ezdraft-audit/notes/CC-07-walkthrough.md`, Nov 1) already covered steps 2 and 4 and the nav list; this walk covered what it left.

| Step | Result |
| --- | --- |
| 1 Settings from the gear; left nav | **FAIL on the gear, PASS on the nav.** Home after sign-in still shows only "Sign out", with no gear or link (audit M10, still open). By address, Settings shows the 10 sections and no Billing. |
| 2 Company name, PNG logo, Save | PASS in the audit walkthrough (not repeated) |
| 3 6 MB logo | PASS: "Logos can be up to 5 MB. Choose a smaller file." |
| 4 Two customers, duplicate email | PASS in the audit walkthrough (duplicate refused, any letter case) |
| 5 Search by part of a name | PASS: "mar" shows Martha Alvarez only, "thom" Derek Thompson only |
| 6 Crew user types the Settings URL | PASS: "You don't have access to this. Ask your supervisor." in place |
| Field check: bad SVG | PASS: an SVG with a script is refused, "This SVG can't be used. Save it as PNG and try again." |

**For Josh:** audit M10 ("No way from the home page to Settings") was to become a phase 1 gate product ticket (AUDIT-ADDENDUM section 10), and the phase 1 gate did not create one. Until the Projects page exists (phase 2): a "Settings" link on the home page, or send `/` to Settings for users who may see it? Wording is yours.

- M10 answer (Josh, chat 2026-11-02: "Add a Settings link"): fix ticket EZD-289 added to phase 1 as `todo` (a "Settings" link on the signed-in home page, shown only to users who may open Settings); decision row in `vault/spec/decisions/04-app-shell-and-global-ui.md`.

- Launcher restarted (Josh, chat 2026-11-02: "restart launcher") with `node scripts/launchd/install.mjs install` at 10:17 UTC; plan EZD-284 started at once.
- Launcher stops (Josh: "Yes, fix it"): all three self-stops since 2026-10-23 (EZD-154, EZD-258, EZD-284; about 16 idle hours) were `ready` tickets whose builds never started, which the table step refused. Fixed in 9fdc9e2c (gate PASS): the table step now takes a `ready` ticket (no plan: back to `todo`; with a plan: `blocked` with a note) and the launcher goes on; a third stuck build in a row still stops it.

- Phase 1 PR (Josh, chat 2026-11-02, relayed by the parent session): auto-merge on a green CI gate stays (Q-0261); Josh walks the punch list after. The 2026-11-02 row in `vault/spec/decisions/process.md` now says so.
- Sandbox (Josh, same relay): option 3 now (the gate command runs outside the sandbox), option 1 with the lanes work. Not yet done: the merge step runs the develop gate inside `unit-steps.mjs merge`, so excluding only `node scripts/gate.mjs *` would stop every merge, and the re-probe needs a `claude` start that 2.8 removed. Both asked back to Josh.
