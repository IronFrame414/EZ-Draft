# Handoff · 2026-10-18 evening · Mac setup audit, PROCESS.md v2.3, PA3 handoff (interactive, Josh present)

- Phase and stage: Phase 0 · Stage 3 not started (35 `ready`, EZD-003 and EZD-023b in `questions` on Q-0116). Process is now **v2.3** (`vault/PROCESS.md`, commit eea4fd7). `vault/PROCESS-EZDRAFT.md` is still the v2 text and wins where it differs; its disagreements with v2.3 are questions, not guesses.
- Why the session ended: Josh is clearing to run `/questions 0`.
- Completed this session: Mac setup audit (node 22, pnpm, Docker, `gh` as `ironframe414-agent` all pass; user settings `defaultMode auto`, ntfy hook, no `autoContinueAtUsageLimit`); new ntfy topic and `scripts/launcher.config.json` (gitignored, notify set); `develop` pushed and equal to origin; `vault/handoff/PA3-MECHANISMS.md` (the EZD-000b handoff, with Josh's answers and the setting checks); `vault/PROCESS.md` v2.3.
- In progress: none. No worktrees.
- Blocked: EZD-003, EZD-023b until Q-0116 is recorded (Josh answered: a).
- **Josh's answers given in chat on 2026-10-18, not yet recorded in QUESTIONS.md** (the `/questions 0` unit records them):
  - Q-0116: (a) set the Vercel Ignored Build Step per PROCESS.md section 12. Re-validate EZD-003 Step 3 and EZD-023b, then set both `ready`.
  - Q-0002: keep R14, R18, R24 as written. R21 settled by Q-0016. **R17 changed:** Spanish is not the default; each user can switch their own interface language to Spanish, and the owner can switch it for another user. Open: whether that switch covers the whole app or only the crew phone screens (R17 kept the office editor and client link English in v1). Ask Josh.
  - Q-0038: (b) a "More tools" button at the end of the rail opens the tools that do not fit. **New requirement:** each user can set the order of the tools. Josh may group tools into categories later (idea, not a decision; BACKLOG).
  - Q-0089: stays open for a later phase (storage cost not explored yet).
  - Q-0096: agree with every recommendation; P7 stands as decided.
  - Q-0118: (a) Phase 0 approved as written. (b) the 53-slice re-cut: Josh has seen slices 1 to 3 only; ask whether he approves the whole re-cut now or reviews it before Phase 1. Not needed before Phase 0 builds.
  - Q-0119: superseded for the ceilings by PROCESS.md v2.3 section 11 (real usage meters, built by EZD-000b). ntfy topic done. Nothing left for Josh unless the meters fail (then proxy mode needs a ceiling).
- Decisions made this session: EZD-000b (PA3 mechanisms, complexity medium) runs after EZD-000 and before EZD-001; handoff `vault/handoff/PA3-MECHANISMS.md`. Builder may edit `.claude/`, `CLAUDE.md`, `scripts/`, `vault/tools/` for EZD-000b only. Honesty rules become CLAUDE.md 14 to 16. `Agent(name, …)` in agent `tools:` does not restrict spawning; use `permissions.deny` `Agent(<name>)` instead (see the handoff's Findings table).
- Next unit: `questions 0` (`/questions 0`): record the answers above, ask the two open items (R17 scope, re-cut approval), add EZD-000b to `tickets.json` and `STATUS.md` (depends on EZD-000, complexity medium, handoff as its source), set EZD-003 and EZD-023b `ready`. Then `build EZD-000`.
