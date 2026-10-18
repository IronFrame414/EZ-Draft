# Handoff — 2026-10-17

Phase: 0 · Stage: 3 build not started (all 37 Phase 0 tickets `ready`) · Session ended because: goal met (audited build process applied to the repo)

## Completed
| Ticket | Commit | Note |
| --- | --- | --- |
| Build process update | `chore: apply audited build process` | Josh's audited `BUILD-PROCESS.md` (Oct 17) applied. No ticket status changed. |

What changed, by file:
- `BUILD-PROCESS.md` (new, repo root): Josh's audited process, saved as delivered.
- `vault/PROCESS.md`: replaced by `BUILD-PROCESS.md`; EZ Draft specifics kept at the end under "Project-specific" (commands, calc-auditor, extra write limits, harness tickets, EZD-000 steps, spikes, architecture checkpoint, gate scope Q-0006/Q-0019, production-sensitive paths Q-0112, agent PR account Q-0108, release on merge Q-0106, one-ticket limit).
- `CLAUDE.md`: rule 3 (every expected number in a test cites its source), rule 4 (wording follows the wording rule), rule 6 (structural-repair exception), rule 7 (orchestrator checkout stays on `develop`), rule 15 (FORCE_STOP escape); new "Wording rule" subsection.
- `.claude/agents/builder.md`: `wip(EZD-xxx)` commits on the ticket branch; build to the interface contract; report structural test mismatches; unplanned wording written in the approved style and reported as `needs-josh-confirm`; report plan deviations.
- `.claude/agents/builder-senior.md` (new): copy of builder with `model: opus`, used from round 2.
- `.claude/agents/test-author.md`: tests written to the interface contract; after the test review, structural repairs only (`test(EZD-xxx): structural repair - …`), never assertions or values.
- `.claude/agents/code-reviewer.md`: three modes (plans together incl. interface contracts; tests against the plan; finished ticket incl. general-case check and structural-repair diff check).
- `.claude/agents/planner.md`: interface contract, visual checklist (depends on EZD-016a), Proposed wording, `security-review: yes|no`; Stage 3 re-validation mode.
- `.claude/agents/ui-verifier.md`: checks the plan's visual checklist and the mockup; runs the app, not builds or tests.
- `.claude/skills/build-phase`: new order (re-validate → worktree with resume → tests → test review → build, builder-senior from round 2 → structural repair loop → gate → reviews, security on plan flag or gate flag → squash → STATUS deviations and `needs-josh-confirm` → push `develop` after every ticket).
- `.claude/skills/plan-phase`: new plan sections; harness ticket EZD-016a added to `depends_on` of any ticket with a visual checklist; code-reviewer mode 1.
- `.claude/skills/questions`: batch file has three sections (Decisions needed, Agent answers to confirm, Proposed wording); `confirmed-josh`; unconfirmed agent answers stand once Stage 3 starts.
- `.claude/skills/phase-gate`: auditor findings become `Fix:` tickets numbered in the phase range before the PR; PR body has a punch list, done/blocked, wording to confirm, product judgments; empty `chore: preview` commit after the PR; first-phase preview check.
- `.claude/hooks/ledger-check.mjs`: FORCE_STOP escape. Tested on a copy: without the file it blocks (exit 2); with it, it appends the failure here, deletes the file and allows the stop.
- `.claude/hooks/guard-paths.mjs`, `guard-bash.mjs`: `builder-senior` gets the same limits as `builder` (without this it would have had no write limits). No limit was loosened.
- `scripts/gate.mjs`: `SECURITY_PATHS` list at the top; prints touched paths (`git diff --name-only develop...HEAD`) and `SECURITY FLAG: <path>` lines; flags never fail the gate. Tested in a throwaway worktree: `app/api/x/route.ts` flagged, `app/oauth/z.ts` not.
- `vault/plans/TEMPLATE.md`: Interface contract, Tests (value | source), Visual checklist, Proposed wording, Security review, Dependencies, Open questions (QP-n).
- `vault/questions/QUESTIONS.md`, `vault/tickets/STATUS.md`: header notes (`confirmed-josh`; Notes holds deviations and `needs-josh-confirm`).
- `SETUP.md`: Vercel note now says `develop` is pushed after every ticket.
- `vault/tools/next_ticket.mjs`: no change needed. Confirmed on a copy of the ledger: an `in-progress` ticket prints first as `IN FLIGHT`; a fix ticket EZD-038 in phase 0 sorts after EZD-033 and passes `--check`.

How the edits were made: the session was started outside the repo, so the repo's hooks were not loaded and did not block the edits to `.claude/`, `scripts/` and `CLAUDE.md`. Josh approved these changes in the handoff of Oct 17.

## In progress
| Ticket | Done so far | Left to do | Worktree |
| --- | --- | --- | --- |
| — | — | — | none |

## Blocked / questions for Josh
- **Josh to do (settings and hosting; agents don't change these):**
  1. **Decide, then set:** Vercel → ezdraft → Settings → Git → Ignored Build Step: `[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && [ -z "$VERCEL_GIT_PULL_REQUEST_ID" ] && exit 0 || exit 1`. **Conflict:** `vault/questions/phase-00-for-josh.md` section 8 item 6 (Oct 12) says *not* to turn this on, because field checks use the `develop` preview (Q-0113; `vault/plans/EZD-023b.md` lines 298 and 431). The new process pushes `develop` after every ticket and relies on this setting to skip those builds; field checks would then use the phase PR's preview (built by the `chore: preview` commit), which shows the same code. Without the setting, every ticket push builds a preview. If you turn it on, EZD-023b's plan text about the `develop` preview needs a re-validation before that ticket builds.
  2. `~/.claude/settings.json` on the Mac: `{ "autoContinueAtUsageLimit": true, "permissions": { "defaultMode": "auto" } }` for unattended runs.
  3. Branch protection: `BUILD-PROCESS.md` says "allow no bypassing" on `main`; the Oct 12 ruleset gives Josh an admin bypass for PRs. Keep it or remove it; your call.
- Still open from before: Q-0002, Q-0038, Q-0089, Q-0096 (none block Phase 0). Mac setup: see `vault/handoff/MAC-MIGRATION.md`.

## Decisions made this session
- Josh (Oct 17): audited build process adopted (`BUILD-PROCESS.md`).
- orchestrator: browser harness ticket for the visual-checklist rule is EZD-016a (phase-00.md row "Test harness").

## Next
1. Open a fresh session in `~/Projects/ezdraft` (so the hooks load) and ask "what are the build steps for one ticket?"; it should list the new order, including the test review and the push after each ticket.
2. Finish the Mac setup in `vault/handoff/MAC-MIGRATION.md` and set the Vercel Ignored Build Step.
3. `/build-phase 0` (first ticket EZD-000), or the `/goal` line in SETUP.md step 8.
