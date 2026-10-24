# Moving EZ Draft to build process v2

**Applied on 2026-10-18** by the chat session linked to the Mac (commit `docs(vault): process v2 applied`). Status per step is in the "Applied" section at the end; the original steps follow unchanged as the record of what was asked.

Written Oct 18, 2026 from the refined `vault/PROCESS.md` (this kit replaces the Oct 11 version) and the Oct 14 Mac handoff. The repo was not read when this was written; where a step says "check", the first Mac session checks the repo and adjusts. Work this file top to bottom in the first Mac session, before `/build-phase 0` or any `build` unit. Nothing here writes app code.

## A. Decisions applied (Josh said "proceed" with the recommended answers, Oct 18)

| # | Decision | Applied as |
| --- | --- | --- |
| 1 | Scope of the update | Project docs updated; this kit for the repo. |
| 2 | Phase cut | Phase 0 stays as planned (37 tickets, the only exception to the 4-to-10 rule). Phases 1 to 17 are re-cut into vertical slices in `PHASES.md` before Phase 1's Stage 0; ticket IDs and dependencies are kept. Josh approves the re-cut. |
| 3 | Stage 0 for Phase 0 | Skipped, recorded as a retroactive sign-off in `SIGNOFF.md`. Phase 1 is the first phase to run Stage 0. |
| 4 | Acceptance-criteria IDs | Generated from each ticket's Done-when as `AC-<ticket>-<n>` (step 4 below). Real ACs are written per phase at Stage 0 from Phase 1 on. |
| 5 | IDs and statuses | `EZD-` stays. Ledger statuses are the v2 set: `todo`, `planned`, `questions`, `ready`, `in-progress`, `review`, `done`, `blocked`. |
| 6 | calc-auditor | Kept as the domain specialist PROCESS.md section 4 allows: Opus 5.5, high, maxTurns 30; level-3 answerer for calculation questions; reviews any ticket whose plan touches the load calc, voltage drop, takeoff formulas or code-rule checks. |
| 7 | Launcher, budget, cost log, unit skills, new `next_ticket.mjs` flags | EZD-000's work. Its plan is re-validated by the planner to add them (step 7). EZD-001 doubles as the pilot ticket (section 15, T-001). |
| 8 | Weekly allowance | Left `null` in `budget.json`; the launcher refuses unattended runs until Josh sets it. Interactive units run meanwhile. |
| 9 | `autoContinueAtUsageLimit` | Follow PROCESS.md section 11: leave it unset. The Oct 14 Mac handoff said `true`; that line is withdrawn. |
| 10 | Vercel ignored-build rule and CI trigger | Verified in step 10, not assumed. |

Q-0006 (per-ticket test scope) is answered by the process: the gate runs the full checks on every ticket (section 8 step 7); reviewers read its summary. Record it as `answered-josh` with source "PROCESS.md v2 section 8".

## B. Files in this kit (new, or replace an older copy)

```
vault/PROCESS.md                 replaces the Oct 11 version (Josh's refined process, verbatim)
vault/spec/READINESS.md          new (section 5 checklist + EZ Draft notes)
vault/spec/SIGNOFF.md            new (Phase 0 retroactive)
vault/spec/non-goals.md          new (Not in v1 + process non-goals)
vault/spec/glossary.md           new (spec glossary + code-name map; EZD-000 fills it)
vault/tickets/PHASES.md          new (Phase 0 written out; 1 to 17 marked for re-cut)
vault/tickets/BACKLOG.md         new, empty
vault/plans/TEMPLATE.md          new or replaces (header + ten sections)
vault/lessons/*.md               new, empty role files + INDEX
vault/handoff/TEMPLATE.md        new
vault/budget.json                new (ceilings null)
vault/cost/log.jsonl, README.md  new
vault/DONE.md                    new, empty
vault/handoff/PROCESS-V2-MIGRATION.md   this file
```

If the repo already has a file with one of these names (likely `plans/TEMPLATE.md` and possibly a `lessons` or `decisions` file), merge rather than overwrite: keep any entry with content, take the v2 structure.

## C. Steps for the first Mac session (orchestrator, interactive)

1. **Unzip this kit over the repo root** on `develop` (`~/Projects/ezdraft`). `git status` shows only vault files. Commit `docs(vault): process v2`.
2. **Mac migration handoff, item 5 fix:** in `vault/handoff/MAC-MIGRATION.md` (or `CURRENT.md`, wherever it landed) strike the user-setting `autoContinueAtUsageLimit: true` and replace with: leave unset; user `~/.claude/settings.json` holds only `{ "permissions": { "defaultMode": "auto" } }` (section 14). If Josh already set it on the Mac, he removes it.
3. **Decisions layout:** v2 wants `vault/spec/decisions/` as one file per spec area mirroring the spec files, plus `INDEX.md` (section 13). Check the repo: if decisions are one file (`decisions.md` or similar), split it by spec area, keeping every Q-ID; the Round 24 to 26 decisions stay in the spec's decisions section and are cited as before. Add `INDEX.md` (one line per file: what it holds, its tags).
4. **Acceptance criteria:** add `vault/spec/acceptance-criteria.md`: for every ticket in `tickets.json`, split its Done-when into testable sentences, numbered `AC-<ticket>-1`, `-2`, …, one line each with the ticket and phase. Add an `acs` array to each ticket in `tickets.json`. Do this with a script committed under `vault/tools/` so it can be re-run; hand-edit nothing. 405 tickets → expect roughly 600 to 900 ACs. `TRACE.md` is then generated from `acs` (step 7).
5. **Ledger columns:** `STATUS.md` gains `Complexity` and `Tests` columns if missing (section 13). Fill `Complexity` from each Phase 0 plan's rating; if the v1 plans have no rating, the planner adds one during step 7's re-validation (one short dispatch per plan, Opus, or the orchestrator reads the plan header and rates it with a note "rated by orchestrator").
6. **Questions ledger:** confirm `QUESTIONS.md` uses the v2 statuses (`open`, `answered-agent`, `escalated`, `answered-josh`, `confirmed-josh`). Close Q-0006 per section A. Record Q-0019's Mac re-answer when Josh gives it (suggested: Playwright workers 4, one gate at a time; the Oct 17 session recorded workers = 4).
7. **EZD-000 re-validation.** Under v2, ticket 000 also writes the process tooling (section 15). Dispatch the planner to re-validate `vault/plans/EZD-000.md` and add: `scripts/run.mjs` (launcher, section 10), `scripts/budget.mjs` (section 11), `next_ticket.mjs` flags `--ready`, `--next-unit`, `--report` (PROGRESS.md and TRACE.md), `--lessons <role> <areas>`, and the sign-off and spike rules in `--check`; `gate.mjs` summary + `gate.log` + security-path flags; the seven unit skills (`spec-check`, `plan-ticket`, `review-plans`, `questions`, `build-ticket` with `dispatch.md`, `gate-phase`, `wrap`) replacing the five v1 stage commands; the hooks list in section 14 (`guard-paths` now also protects `SIGNOFF.md`, `budget.json`, `BUDGET_HOLD.md` and signed-off spec files; add `stop-failure`); project settings env (`CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-5-5`, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS=3`, `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`, never `_FORCE`), `worktree.baseRef "head"`, `.env` deny rules; the CLI-flag confirmations in section 15. If the plan then exceeds about 8 files or 10 tests, split: EZD-000a architecture and conventions, EZD-000b process tooling (both `done` before EZD-001). `CLAUDE.md` stays under 60 lines on the section 14 template plus the one `See @docs/architecture.md` line; Q-0005 (EZD-000 does not overwrite CLAUDE.md) still holds, so the template is applied in this step by the orchestrator, not by the builder.
8. **Agent files.** Check each file in `.claude/agents/` against the section 4 roster: full model IDs (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`), `effort`, `maxTurns`, write limits, short description. Keep `calc-auditor` (section A item 6). `Explore.md` must exist on Haiku 5.5. phase-auditor on Fable with the Opus fallback (Q-0004 stands). Remove any `PowerShell` tool entries and Windows notes (harmless, but they are dead text on the Mac).
9. **EZD-001 as the pilot.** Its plan gains the eleven pilot checks from section 15 (subagents finish before `claude -p` ends; per-dispatch model override; session-start after `/clear` and in `-p`; Stop, `FORCE_STOP`, session-end; cost field names; budget hold, notify, override; preview on PR; limit-error format; `plan`/`review-plans` as the agent; the 70/80% behavior and `--api-until-reset`; resuming a subagent). One deliberate failure to exercise escalation and lesson capture.
10. **CI and hosting, verify:** `.github/workflows/ci.yml` runs on `pull_request` to `main` and `workflow_dispatch` only; Vercel Ignored Build Step is set to the section 12 command; `main` ruleset requires the `gate` check. EZD-002's ticket text ("CI runs on every push; preview deploy per branch") contradicts section 12: the orchestrator records the v2 rule as a decision (Q-ID, `confirmed-josh` once Josh confirms) and the planner re-validates EZD-002's plan to it. `vault/tickets/phase-00-*.md` keeps its text; the decision overrides it.
11. **Josh's setup decisions (section 15), ask in one numbered list:** (a) weekly build allowance `weekly_ceiling_usd_est` and `per_unit_cap_usd_est` (provisional; recommend setting the ceiling after the first week's `/usage` reading and the cap at three times the median unit after EZD-001); (b) Fable ceiling (same method); (c) ntfy topic confirmed in the untracked launcher config; (d) approval of `PHASES.md` for Phase 0 as written; the re-cut of Phases 1 to 17 is a separate approval before Phase 1. Max 20x, `plan` auth, Monday 2:00 AM Eastern reset and ntfy are already decided.
12. **Dry run:** `node vault/tools/next_ticket.mjs --check` passes; `--next-unit` prints `build EZD-000` (or `EZD-000a`); a fresh session asked "which unit is next?" gives the same answer. Commit `docs(vault): process v2 applied`, push `develop`.
13. **Then** `build EZD-000` interactively (the launcher cannot run unattended until the ceiling is set).

## D. Still open after this migration

- Weekly allowance, per-unit cap, Fable ceiling (C.11a, b).
- Re-cut of Phases 1 to 17 and Josh's approval (before Phase 1 Stage 0).
- Phase 1 Stage 0 will need: three worked examples per calculation in scope, real ACs, and mockups or waivers for unmocked screens (READINESS.md notes).
- Q-0019 re-answer (Playwright workers on the Mac); Surface model (Q-0088); Needs from Josh items.

## Applied (2026-10-18)

| Step | Result |
| --- | --- |
| C.1 kit over the repo | Done. `vault/PROCESS.md` is the v2 text plus one paragraph pointing to `vault/PROCESS-EZDRAFT.md` (the project additions; replaces the "Project-specific (EZ Draft)" section of the Oct 17 file, which is archived at `vault/archive/process/`). Root `BUILD-PROCESS.md` archived there too. |
| C.2 autoContinue | Done in `MAC-MIGRATION.md` and `SETUP.md`. |
| C.3 decisions layout | Done: `vault/spec/decisions/` (13a/13b/13c = the spec's rounds; per-area files for the 78 build answers; `INDEX.md`); `decisions.md` is a pointer so old citations resolve. |
| C.4 acceptance criteria | Done: `vault/tools/gen_acs.mjs` → `vault/spec/acceptance-criteria.md` (703 ACs) and `acs` on every ticket; `next_ticket.mjs --check` calls `gen_acs.mjs --check`. |
| C.5 ledger columns | Done: `Complexity` column; Phase 0 rated by the orchestrator from the v1 plans (21 high, 16 medium); plans carry the header lines. |
| C.6 questions ledger | Statuses already v2. Q-0006 **kept** as Josh's Oct 11 answer (phase + @smoke per ticket; PROCESS-EZDRAFT.md section 4) rather than overwritten: it is a real decision and v2 section 8 leaves gate scope to the gate script. Q-0114 (workers = 4) recorded. |
| C.7 EZD-000 re-validation | Changed: the process tooling (launcher, budget script, ledger flags, gate summary and log, seven unit skills, hooks, settings, agent files) was written by this session, not left to EZD-000's builder; EZD-000 keeps its architecture scope and confirms the CLI flags (PROCESS-EZDRAFT.md section 5). `CLAUDE.md` is on the section 14 template (under 60 lines). |
| C.8 agent files | Done: full model IDs, effort, maxTurns per the roster; `builder-senior.md` and the `PowerShell` tool removed; `Explore.md` on Haiku 5.5; phase-auditor on Fable with the Opus fallback. |
| C.9 EZD-001 pilot | `vault/handoff/PILOT.md` lists the eleven checks; noted in PROCESS-EZDRAFT.md section 5. |
| C.10 CI and hosting | CI already runs on the PR to `main` and by hand (Q-0021 answered Oct 11; EZD-002's plan matches). The Vercel Ignored Build Step conflict with EZD-003's plan is Q-0116 for Josh; EZD-003 and EZD-023b wait in `questions`. Push-triggered exceptions Q-0106/Q-0107 recorded in PROCESS-EZDRAFT.md section 7. |
| C.11 Josh's setup decisions | Asked in the chat summary and recorded as Q-0118 (PHASES.md: Phase 0, and the 53-slice re-cut now drafted in the file) and Q-0119 (budget ceilings, ntfy topic). |
| C.12 dry run | `--check` OK (405 tickets); `--next-unit` → `build EZD-000`; `--report` writes PROGRESS.md and TRACE.md. The fresh-session answer is checked in the first Mac session. |
| C.13 | `build EZD-000` interactively: `/build-ticket EZD-000` in Claude Code on the Mac. |
