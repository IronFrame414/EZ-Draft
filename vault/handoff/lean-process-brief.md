# Brief for session 5: Lean build process reassessment (Josh 2026-11-04)

Paste into a new Claude Code session in /Users/josh/Projects/ezdraft (title "5 Lean build process reassessment").

Josh's question (chat 2026-11-04): "What if I stripped the rules and guidelines down to the basics and gave you a simple architecture of what needs to be done from here and let you work autonomously. Would this system get built faster and still achieve what I am aiming for? I'm trying to find a way to stop having so many blocks and delays. It seems like every day completes a dozen things and adds 2 dozen more that need to get done."

Task (analysis and proposal only; change no rule, process file, skill, hook or launcher code until Josh approves):
1. Read vault/handoff/build-watch-2026-11-04.md, CLAUDE.md, and vault/PROCESS.md / vault/PROCESS-EZDRAFT.md by section (node vault/tools/outline.mjs <file> --headings, then --section). Look at phase counts (node vault/tools/next_ticket.mjs --phase N for 1-4), vault/debt.md, recent vault/DONE.md, and the tail of ~/Library/Logs/ezdraft/launcher.log.
2. Measure where time and usage go: product vs build-system tickets merged per day; the share of units that were questions, repair, re-validation or review rounds; new tickets and debt rows added per day; the main stop causes.
3. Classify every rule and mechanism as keep / simplify / drop. Keep what protects the app: tests first, a CI gate that must be green, security review on permissions, money, auth and data isolation, the secret-file guards, Josh owning product decisions. Candidates: "every finding becomes work" (rule 17), plan size caps and repeated plan reviews, re-validation churn, the records inbox/view lag, fix-mode protection of the launcher's own files, the unfrozen build-system backlog (EZD-154, 265, 268-272, 274, 279, 280), the questions chain, multi-round reviewer ladders. For each: its cost, and what is lost by dropping it.
4. Write a one-page proposal for Josh (a general contractor, not a programmer) in plain words: the lean rule set, what changes first, the cost, the risks; ask him to approve, change or reject. Put the long analysis under vault/research/ and commit only your own files, by path.

Constraints: other sessions and the launcher (launchd, lanes on) share this checkout. Never stop or restart the launcher, never edit STATUS.md or other generated views, never read .env files. EZD-279 and EZD-268 are mid-build in .claude/worktrees; don't touch those worktrees.
