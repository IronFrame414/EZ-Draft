# A3. Cross-phase regressions and the state of the full suite on develop

Audit 2026-11, session 16. Sources: GitHub Actions run history (`gh run list`), the main checkout's gate.log, git log. Raw data: `data/ci-develop-all.txt`, `data/ci-develop-runs.txt`, `data/ci-develop-failures.txt`.

## A3.1 The full suite on develop: CI says red for four days

How the full suite was measured. I did not start my own suite. Lane 0 is reserved for gate-phase 4, and lanes 1-3 belong to the launcher (`vault/handoff/LANES.json`: 3 lanes, 2 build lanes; EZD-372's gate held lane 1 at 20:3xZ, `ps eww 17848` showed EZD_LANE=1). The full suite already runs in CI on every develop push (workflow `CI`, job `gate`, "scope: full suite"; run 42888313901 log line `GATE: /home/runner/work/EZ-Draft/EZ-Draft · scope: full suite`).

| Fact | Source |
| --- | --- |
| The last green `CI` run on develop was **2026-11-06 18:27Z** (feat(EZD-205b), run 42270896570). | `gh run list --branch develop --workflow CI -L 400` → `data/ci-develop-all.txt` |
| Since then **every** `CI` run on develop has failed or been cancelled: 0 successes from 11-07 to 11-10. Failures by day: 17, 2, 10, 9. | same file, counted per day |
| Over the whole history: 61 success, 100 failure, 188 cancelled. Cancelled runs are superseded by a newer push. | same |
| The 5 "success" rows in the last 60 develop runs are the `Supabase dev migrations` workflow, not the gate. | `gh run list --branch develop -L 60 --json workflowName,conclusion` |
| The local full-suite gate on the main checkout at 2026-11-10 19:11Z (develop 45146b1c, just after EZD-371) **passed**: node:test 1666/1666, Vitest 174/174 and 1755/1755, perf PASS. That run was before EZD-365, so it tested the working tree, uncommitted vault files included. | `gate.log` lines 11100-11103, 11144-11145, 11619-11620; `GATE PASS` at the end |
| The CI run on the same commit 45146b1c (run 42882716995) **failed**: test, test:e2e and perf. | `data/ci-develop-failures.txt` |

### What fails in CI, by test, since 11-07

| Failing test | Ticket and phase | Runs it fails in (of the 26 failures listed) | Notes |
| --- | --- | --- | --- |
| `EZD-207c pan on fixture pages` / `EZD-207c P2 wheel steps reach the page` | EZD-207c, phase 4 | every product-commit run from 11-07 14:41Z to 11-10 19:44Z | Perf/benchmark check. Fix tickets EZD-356, EZD-358 and EZD-359 (all phase 4, done) did not make it pass in CI. EZD-372 is the fourth fix ticket on the same check. |
| `EZD-356 long-task list on the pan rows` / `EZD-356 T1 pan rows list each long task and the load` | EZD-356, phase 4 | same runs, up to 11-10 19:11Z | |
| `EZD-359 pan task attribution` / `EZD-359 I1`, `I2` | EZD-359, phase 4 | 11-09 16:34Z, 21:49Z, 23:35Z | Random. |
| `EZD-014b done when: coarse-pointer 44 px targets ...` | **EZD-014b, phase 0** | 11-07 14:41Z to 11-09 15:31Z (8 runs) | Cross-phase: a phase 0 test red on develop for about 2 days. It is gone from runs after 11-09 15:31Z; I did not identify which commit cleared it. |
| `EZD-299a T9 accepts an equal or newer build`, `T9 refuses a bad resolves list` | **EZD-299a, phase 3 (live)** | 11-09 14:12Z (feat(EZD-294)) | Cross-phase: a phase 4 ticket's push broke a phase 3 test once. |
| `EZD-033 T13 sign-in emails are throttled per email ...` (14 s) | **EZD-033, phase 0** | 11-10 01:49Z | Timing-sensitive; one run. |
| `EZD-323 T8 only the job runner files and the dev route use the secret-key client` | **EZD-323, phase 1** | 11-10 16:43Z (feat(EZD-5601)) | The known case. Fixed by EZD-370 (9aff3804). |
| `EZD-108` My profile set password (locator resolved to 3 elements) | **EZD-108, phase 2 (live)** | 11-10 16:43Z onward | The known case (`14 × locator resolved to 3 elements`). Fixed by EZD-371 (45146b1c). |
| `EZD-250 T20, T26`, `EZD-337 C1`, `EZD-267 N2`, `EZD-174 N1, N2` (build-system next-unit tests) | phase 1 build system | 11-07 12:35Z, 19:16Z, 23:47Z, 11-08 00:28Z (vault-only commits) | They failed only on commits where the ledger state on develop (phase 5/56 sign-off, weekly-limit pause) disagreed with the fixtures. These are ledger-state-dependent tests, not product tests. |

### What this means

1. **Local gates and CI disagree.** The local full gate passed perf at 19:11Z; CI failed perf on the same commit. The pan check (EZD-207c) depends on the machine. Three fix tickets so far have made it pass locally, never in CI.
2. **The phase 4 PR cannot merge while this holds.** CLAUDE.md rule 11: the launcher merges the phase PR only "once the CI `gate` check on its head is green". If EZD-372 makes the check pass only on Josh's Mac, the phase 4 PR will sit red in CI. This is the 20th-attempt risk for gate-phase 4.
3. **Nobody watches develop's CI.** It has been red since 11-06 18:27Z, about 4 days and 28 failed runs, and no ticket, debt row or overseer-log line is about "develop CI red" (`grep -n 'CI' vault/handoff/overseer-log.md` shows only phase-PR CI). Ticket gates run only their own phase plus @smoke, so they pass while develop's full suite is red.

## A3.2 Cross-phase regressions found

The table above lists five cases where a later ticket's push turned an earlier phase's test red in CI: EZD-014b (phase 0), EZD-033 (phase 0, timing), EZD-299a (phase 3), EZD-323 T8 (phase 1) and EZD-108 (phase 2). The brief knew of two (EZD-323 T8 and EZD-108 T18). EZD-014b stayed red about 2 days and EZD-299a once. Neither has a fix ticket: `grep -n 'EZD-014b\|EZD-299a T9' vault/tickets/STATUS.md vault/debt.md` finds no row about them.

## A3.3 How many more could be hiding

- CI has been red on the EZD-207c pan check for every product push since 11-07. **A red test inside the same gate step hides any new failure in that step.** Four days of CI results (17+2+10+9 = 38 failed runs) were never read for new names. The newest CI run on a8bf92fb (42897650540) was still running at the time of writing.
- Every red name in the CI failures since 11-07 is listed in the table above (`data/ci-develop-failures.txt`, first 12 failure lines per run). Apart from the pan/perf group and the build-system fixture tests, that is 5 cross-phase cases in 4 days.
- Estimate: roughly 1 cross-phase break per 1-2 days of product merges at the 11-07 to 11-10 pace (about 9 merges a day, session-13 brief). Each one stays hidden until a phase gate or someone reads CI.
