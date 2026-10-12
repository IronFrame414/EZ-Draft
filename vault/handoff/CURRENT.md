# Handoff — 2026-10-12

Phase: 0 · Stage: 2 questions done; ready for 3 build · Session ended because: goal met (all Phase 0 questions answered; build not started: EZ Binder is building on this PC)

## Completed
| Ticket | Commit | Note |
| --- | --- | --- |
| Phase 0 plans | 56ad715 | 36 plans, revised after the cross-ticket review |
| Stage 2, first round | 993bf73 | 26 agent answers; 48 escalated to Josh |
| Stage 2, Josh's answers | this commit | Josh answered the batch in chat on Oct 12, plus follow-ups Q-0088 to Q-0105; all plans updated; new ticket EZD-033 (password sign-in, Q-0095); all 37 Phase 0 tickets `ready` |

## In progress
| Ticket | Done so far | Left to do | Worktree |
| --- | --- | --- | --- |
| — | — | — | none |

## Blocked / questions for Josh
- Not blocking Phase 0: Q-0002 (deferred until tested; R14, R17, R18, R21, R24 stand), Q-0038 (Phase 2), Q-0089 (per-company storage limit, later phase), Q-0096 (Phase 1 password choices: ask at Phase 1 Stage 2).
- **Josh steps before Stage 3** (from `vault/questions/phase-00-for-josh.md` section 8, walked through in chat):
  1. New `scripts/gate.mjs` applied by Josh (Q-0006 scope + one-gate lock). Done.
  2. Build-phase skill step 8 uses `--phase <N>`, applied by Josh. Done.
  3. Docker Desktop running; approve the Playwright browser install when the build reaches EZD-007/EZD-016a.
  4. Account setup walked through on Oct 12 and verified: Supabase project (one, Q-0113), Vercel project `ezdraft` (root `app`, branch main, env vars), DNS CNAME at Spaceship (resolves, HTTPS valid), Resend keys and Supabase SMTP, GitHub secret SUPABASE_DEV_DB_URL, agent GitHub account `ironframe414-agent` (Write; this PC now signed in as it, Q-0108).
  5. G2 repo settings done Oct 12 and verified from the agent account: rulesets main (PR, 1 approval, latest-push approval, stale dismissed; agent cannot bypass; Josh admin bypass for PRs), develop and phase-* tags; environments dev (develop only, holds SUPABASE_DEV_DB_URL; repository copy deleted) and release (main only, no admin bypass, empty). Actions settings and secret scanning set by Josh (admin-only pages, not verifiable from the agent account).
  6. Everything production-only is in EZD-023b's "Before launch checklist" (Q-0113).
- Josh to confirm his Surface model (Settings → System → About); tests use Surface Pro 1440 × 960 until then (Q-0088).

## Decisions made this session
- Josh (Oct 12): Q-0013, Q-0020, Q-0024, Q-0026, Q-0027, Q-0029 to Q-0033, Q-0035 to Q-0037, Q-0039 to Q-0041, Q-0043, Q-0046 to Q-0051, Q-0053 to Q-0059, Q-0065, Q-0067 to Q-0070, Q-0074 to Q-0084 (Q-0076, Q-0082, Q-0084 deferred to after Phase 10), Q-0086, Q-0088 (Surface + iPad), Q-0090 (passwords too), Q-0091 to Q-0093, Q-0097 to Q-0102. Eight answers used the batch file's letters; the ledger rows note the original option.
- security-reviewer: Q-0094 (password rules), Q-0103 to Q-0105 (Q-0105 recorded in KNOWN-LIMITS.md).
- orchestrator: Q-0095 (EZD-033). Dependencies added: EZD-007→EZD-022, EZD-021→EZD-023b, EZD-033→EZD-024.

## Notes for the next session
- EZD-003 goes `blocked` after its commit until the Phase 0 merge (Q-0032). EZD-027 goes `blocked` after merge until Josh's Surface run (Q-0064, Q-0097). EZD-009 starts only once EZD-003's commit is on develop (Q-0060).
- After EZD-000 merges: append `See @docs/architecture.md` to CLAUDE.md, copy `docs/architecture.md` to `vault/architecture.md`, and re-copy on every merge that changes it (Q-0012).
- Phase 1 planning: EZD-105b (owner sets a member's password) needs a row; EZD-108 gains "change password"; Q-0096; EZD-101 must switch EZD-024's Owner lookup; EZD-102/133, EZD-129, EZD-132, EZD-114/119/1305 notes in the plans.
- Phase 0 ticket rows still say iPad for EZD-013's field check; plans use Josh's iPhone and Surface (Q-0088).

- Build PC: WSL installed for Docker Desktop, memory capped at 6 GB in C:UsersJSBis.wslconfig until Josh installs more RAM (ordered Oct 12). Reminder task `ezdraft-remove-wsl-memory-cap` fires Oct 15, 9:00. After the upgrade, revisit Q-0019 (workers = 2, one gate at a time).

## Next
1. Setup is complete. Josh starts Docker Desktop.
2. When EZ Binder's build on this PC is finished: `/build-phase 0` (first ticket EZD-000).
