# Session 15 brief: take over from session 13 (2026-11-10 19:45 UTC)

You are the orchestrator for the EZ Draft build. Read `CLAUDE.md` first.

Josh closed session 13 because it was past the 30% context limit. He is going to reevaluate the build process:
- add more planning and oversight;
- audit what has been built;
- audit the process, to find a method with a higher success rate.

The full background is in `vault/handoff/session-13-brief.md`, especially its "What went wrong" list. Josh is a general contractor, not a programmer. Only design and UI questions go to him (CLAUDE.md rule 3).

## 1. State now
- **Live:** phases 0 to 3.
- **Phase 4:** every product ticket is done. EZD-370 and EZD-371 merged at about 19:30. EZD-372 is the last fix ticket (the long-tasks-during-pan perf check that fails at random); its build is running. After it merges, the launcher runs gate-phase 4, then the PR, then the merge on green CI. Nineteen phase 4 gate attempts so far.
- **Phases 5 and 56:** building (EZD-211b is running).
- **Phase 6:** held by Josh. Its 8 open tickets are `blocked` with a "Held by Josh 2026-11-10" note that keeps each prior status. Do not release them until Josh says so.
- **Build-system tickets reviewed but not merged:**
  - EZD-365: the full gate tests only the committed HEAD. Worktree `.claude/worktrees/EZD-365`. Code review PASS.
  - EZD-369: three strikes, then an assessment. Worktree `.claude/worktrees/EZD-369`. Code review PASS after a re-check; security review PASS.
  - Both gates were red only on EZD-323 T8, which EZD-370 has now fixed.
- **Fix mode:** `vault/handoff/LAUNCHER_FIX.md` is open for EZD-365 and EZD-369.
- **Overwatch:** scheduled task `ezdraft-overwatch` runs `.claude/skills/overwatch/SKILL.md` every 30 minutes and is working (it committed `432e1829` at 19:32).
- **Session 13's architecture-sync watcher:** a while-loop in Terminal tab "architecture sync watcher". Stop it once EZD-369 is merged, or now if the overwatch covers the case.

## 2. First steps (in this order)
1. **Finish EZD-365.** In its worktree:
   - Run `git merge --no-edit develop`.
   - Run its gate as `EZD_LANE=3 node <worktree>/scripts/gate.mjs <worktree>` in a Terminal tab (`run_in_terminal`). Never as a background Bash call; never close the tab mid-run.
   - On GATE PASS: squash-merge into develop as one `feat(EZD-365): ...` commit.
   - Set it `done` with `node scripts/ledger.mjs status EZD-365 status=done commit=<sha> tests=<n> "notes=..."`.
   - Run `node scripts/unit-steps.mjs record-develop <sha>` at once, then push develop.
2. **Do the same for EZD-369.** It touches `scripts/run.mjs` and `vault/tools/next_ticket.mjs`, so the launcher restarts itself after the merge.
3. **Close fix mode:** `git rm vault/handoff/LAUNCHER_FIX.md`, commit, then record-develop and push.
4. **Watch the phase 4 gate** after EZD-372.
   - If it fails, do not release it again by editing `.git/set-aside.json`.
   - Once EZD-369 is in, three strikes on a key require the assessment in overwatch step K.
5. After any commit that touches `.claude/`, `scripts/`, `vault/tools/` or the process files, run `node scripts/unit-steps.mjs record-develop <sha>` in the same step. If you skip it, every merge stops and the build sits idle (6 hours on 2026-11-10).

## 3. Start the audit as its own session
Josh asked for the audit to run in its own sub-session. Start it with `mcp__ccd_session__start_session`:
- initiation `user_asked`, context `fresh`;
- title `16 · Build audit: product and process`;
- `use_worktree: false`;
- read-only except its report files;
- the brief below.

Brief:

> **Goal.** Audit the EZ Draft build and its process, and recommend a method with a higher success rate. Josh will use the result to redesign planning and oversight. Read `CLAUDE.md`, `vault/handoff/session-13-brief.md` and this file's section 3. Do not change code, tickets or the launcher. Write reports only, under `vault/research/audit-2026-11/`, and commit them by path. Use subagents (Explore, code-reviewer, security-reviewer, phase-auditor, calc-auditor) for the parts below, run in parallel where they don't depend on each other. Give every number a source (file, command or log line).
>
> **A. What has been built (product audit)**
> 1. **Phases 0 to 4, ticket by ticket.** For each ticket marked done:
>    - Is there a feat commit on develop?
>    - Does the code meet the ticket's acceptance criteria (`vault/spec/acceptance-criteria.md`)?
>    - Does each criterion have a test that would fail if the behaviour broke, rather than a weakened or vacuous test?
>    - Are there plan deviations nobody recorded?
>    List each gap with its file:line.
> 2. **Spec coverage.** Use `vault/tickets/TRACE.md` and `vault/PROGRESS.md` (`ACs covered`). Which acceptance criteria are uncovered or only partly covered, and why?
> 3. **Cross-phase regressions.** A ticket's gate runs only its own phase's tests plus @smoke. Find every case where a later ticket broke an earlier phase's tests, for example EZD-5601 breaking EZD-323 T8 and EZD-108 T18. Estimate how many more could be hiding: run the full unit suite on develop and list failures.
> 4. **Security and data isolation.** Have security-reviewer audit the production-sensitive code merged since the last phase audit: permissions, money visibility, tenant isolation, secret-key client users.
> 5. **Live site.** Is what is live (main, the PR 6 merge) the same as what the phase 3 gate passed?
> 6. **Debt and open findings.** Everything in `vault/debt.md` and `vault/tooling-notes.md` that is overdue or keeps coming back.
>
> **B. How it was built (process audit)**
> 1. **Measured history** from `~/Library/Logs/ezdraft/launcher.log`, `vault/cost/`, git log and the overseer log:
>    - tickets merged per day;
>    - units per merged ticket;
>    - estimated cost per merged ticket;
>    - gate attempts per ticket and per phase gate;
>    - set-asides, tabled builds, repairs (and how many failed);
>    - time the launcher sat idle, and why.
> 2. **Every failure class** behind a repeated run, with counts, cost and time lost. At least:
>    - the 10-minute background stop;
>    - leftover app servers and ports;
>    - uncommitted vault files and plan-record or architecture mismatches;
>    - unrecorded develop and merge stops;
>    - merge clashes and the EZD-367/368 deadlock;
>    - false port holds;
>    - flaky perf checks;
>    - weekly-limit loops;
>    - the questions 5/56 loop;
>    - planner split proposals planned twice;
>    - network fetches blocked by the sandbox;
>    - cross-phase regressions.
>    For each: root cause, whether it is fixed now (commit) or still open, and whether the fix closes the whole class.
> 3. **Planning.**
>    - How often was a plan too big and split after planning?
>    - How often did a re-validation or questions unit rewrite a plan after it was planned?
>    - How often was a plan wrong about the code, so that the builder deviated?
>    - What would have caught each case earlier?
> 4. **Oversight.**
>    - Which stalls did the launcher's own repair unit fail on, and why (sandbox limits)?
>    - How long did each stall last before an interactive session fixed it?
>    - Is the overwatch runbook complete?
> 5. **The four speed-ups session 13 proposed to Josh**, each with expected effect and cost:
>    - make the gate's tests read only committed files (EZD-365);
>    - more usage capacity, through a second Max account or API overflow (Josh's money decision);
>    - check a ticket's size before writing its full plan, so it is split once, not planned twice;
>    - run phase sign-offs several phases ahead in a side session, so planning never runs dry.
> 6. **Usage.** The weekly limit stopped all work on 11-07/08 and on the morning of 11-09. The usage meter has been unreadable since 11-09 (OAuth 401). What was spent, on what, and what capacity the planned pace needs.
>
> **C. Recommendations**
> 1. **A redesigned method with a higher success rate.** Include:
>    - more planning before building: size checks, an interface check across a phase's plans, and a dependency check;
>    - stronger oversight: three strikes and assessments (EZD-369), gate preflight checks, overwatch, and when a human or Opus session must step in;
>    - gates: whether ticket gates should run the full unit suite to catch cross-phase regressions, and at what cost in time.
> 2. **For each recommendation:** the evidence from A and B, the failure classes it removes, its cost (build time, tokens, Josh's time), and an order of work.
> 3. **The phase 6 hold:** what must be true before phase 6 goes back on the build list.
> 4. **A one-page plain-words summary for Josh,** who is not a programmer: what is solid, what is at risk, and the top three changes.
>
> **Report.**
> - `vault/research/audit-2026-11/REPORT.md`, with the summary first and the detail after, plus any supporting files. Commit them by path.
> - Run `node scripts/unit-steps.mjs record-develop <sha>` only if you touched a protected path (you shouldn't need to).
> - End with a 20-line summary for the orchestrator. Questions for Josh: design and UI only.

## 4. Keep doing
- Every launcher stall: apply the overwatch runbook fix and log it in `vault/handoff/overseer-log.md`. Note new stall patterns for the runbook.
- Restart your log watch (Monitor, 30-minute expiry) every time it expires, or rely on overwatch. Do not leave the build unwatched.
