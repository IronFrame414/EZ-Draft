# Phase 0 · Questions for Josh

Written 2026-10-19 by the orchestrator (`questions 0` unit, PROCESS.md section 7). Overwrites the Oct 18 file; everything answered since then is out (answers live in `vault/questions/QUESTIONS.md` and `vault/spec/decisions/`). Answer by number, in any form ("section 2 all confirmed except 4: …", "section 3 approved", "section 4: 1 ratify, 2 reject"). Recommendation first in every item. Nothing here blocks a build: every answer below stands as written until you change it.

Q-0089 (storage limit) stays open for a later phase and is not asked here.

## 1. Decisions needed

None. All six new questions (Q-0130 to Q-0135, from the EZD-000d, EZD-000e, EZD-000f and EZD-000i plans) were answered with a citation by the orchestrator or the security-reviewer. They are in section 2.

## 2. Agent answers to confirm

Every `answered-agent` row for Phase 0 not yet confirmed (9). Each stands as written unless you override it. Reply "section 2: all confirmed" and name only the ones to change.

1. **Q-0126** · EZD-000b to EZD-000i, EZD-001 · answered by orchestrator
   - Answer: (c) PILOT.md gains only the verification items a part reports as "not testable here"; items a part verified are not re-run.
   - Source: PA3-MECHANISMS.md rule 6; PROCESS.md section 15; PROCESS-EZDRAFT.md section 5.
   - Confirm or override.

2. **Q-0127** · EZD-000h · answered by orchestrator
   - Answer: (a) the PROCESS-EZDRAFT.md budget line now records your Q-0119 answer and the values you set (ceiling 300, cap 40; dollar proxy until EZD-000h).
   - Source: Q-0119; PROCESS.md section 11; PROCESS-EZDRAFT.md section 8.
   - Confirm or override.

3. **Q-0128** · EZD-000b to EZD-000i · answered by orchestrator
   - Answer: (a) your PA3 write grant for the builder covers all eight parts through one exception in the path guard. The exception is removed after the last part merges.
   - Source: PA3-MECHANISMS.md rule 7; Q-0010; Q-0125.
   - Confirm or override.

4. **Q-0130** · EZD-000d · answered by orchestrator
   - Answer: (a) the acceptance criteria come from the "Done when" text. The ACs for EZD-000d had been built from the Scope text instead, because the tool that makes them (`vault/tools/gen_acs.mjs`) split the row at a `|` character inside the text. I fixed the tool under the tooling-fix rule (PROCESS.md rule 19) and re-ran it. EZD-000d now has four ACs that match its "Done when". No other ticket's ACs changed.
   - Source: vault/spec/acceptance-criteria.md header; vault/tools/gen_acs.mjs; PROCESS.md section 3 rule 19.
   - Confirm or override (confirming also confirms the tool fix).

5. **Q-0131** · EZD-000e · answered by orchestrator
   - Answer: (a) same fault and fix as item 4. EZD-000e now has five ACs that match its "Done when".
   - Source: Q-0130.
   - Confirm or override.

6. **Q-0132** · EZD-000f · answered by orchestrator
   - Answer: (a) PROCESS.md should name the new hook that limits which agents may start helper agents. Section 14 lists every hook, so it belongs there. Process files change only with your yes, so the edit below is applied only if you confirm. EZD-000f builds the same either way.
   - Proposed edit, section 14 Hooks, a new line after guard-reads: "**guard-agents** (before Agent): the main session may start any agent; the planner, code-reviewer, security-reviewer and phase-auditor may start only retriever-digest and retriever-web; every other agent, the retrievers included, starts none."
   - Proposed edit, section 4 Retrievers: "enforced by each agent file's `tools` line" becomes "enforced by each agent file's `tools` line and, for which agent they may start, by the guard-agents hook (section 14)".
   - Source: PROCESS.md sections 4 and 14; .claude/hooks/guard-paths.mjs line 58; Q-0127.
   - Confirm (the edit is made) or override.

7. **Q-0133** · EZD-000i · answered by orchestrator
   - Answer: (a) the usage check normally waits 15 minutes between requests. After a "too many requests" (429) reply it may retry sooner: after the wait the reply asks for (counted as at least 120 seconds), plus 30 seconds. The ticket's own AC states those waits (150 and 330 seconds), and only this reading produces them.
   - Source: AC-EZD-000i-1 and AC-EZD-000i-2; PA3-MECHANISMS.md Item 1b.
   - Confirm or override.

8. **Q-0134** · EZD-000i · answered by orchestrator
   - Answer: (a) the usage reader is built to the field names the status line uses. When the builder runs the probe, it reports the real names. If they differ, the reader returns nothing, gating stays on the dollar proxy, and a follow-up ticket fixes the names. I tried the other option (finding the names inside the installed Claude Code program) and it can't settle the question. Other likely names show up there (`utilization`, `seven_day_opus`, `seven_day_sonnet`), so a follow-up ticket is a real possibility.
   - Source: PA3-MECHANISMS.md Item 1b and Findings row 1b; vault/plans/EZD-000i.md H4.
   - Confirm or override.

9. **Q-0135** · EZD-000i · answered by security-reviewer
   - Answer: (a) EZD-000i also blocks the shell commands that would print your Claude sign-in token. That means Keychain reads with `-w` or `-g`, and any command that names `.credentials.json` other than a plain "does the file exist" test. Opening that file with the Read tool is also blocked. The script itself still reads the token inside Node and never prints it. This guards against accidents, not a determined agent.
   - Source: PA3-MECHANISMS.md rule 8 and Findings row 1b; .claude/hooks/guard-bash.mjs; PROCESS.md section 14 Settings; Q-0128.
   - Confirm or override.

## 3. Proposed wording

No app text in any Phase 0 plan awaits approval. EZD-000b to EZD-000g add only messages for agents (no approval needed, PROCESS.md section 3a). The two tables below are tooling text that you see in the terminal, on your phone (ntfy, which adds "EZ Draft: " in front) and in vault files. `<…>` is filled in at run time. Reply "section 3 approved" or edit any line.

**EZD-000h · Usage meters, five-hour pause and weekly gate**
1. Status line, meters present: `5h 42% · week 63%`
2. Status line, no meters: `usage: no data`
3. `WINDOW_PAUSE.md`: `# Five-hour window pause` / `Written by scripts/run.mjs on <time>.` / `- Five-hour window: <pct>% used (pause at <pct>%)` / `- Resets at: <time>` / `- Resume at: <time>` / `The launcher starts no unit until the resume time, then deletes this file and continues (PROCESS.md section 11). A unit already running is not interrupted. Nothing is needed from Josh.`
4. `BUDGET_HOLD.md`: `# Budget hold` / `Written by scripts/run.mjs on <time>.` / `- Reason: <reason>` / `- Weekly window: <pct>% used (hold at <pct>%), resets <time>; source: <source>` / `- Five-hour window: <pct>% · Fable weekly: <pct>% or no meter` / `- Next unit when released: <unit>` / `No new ticket starts while this file exists; a ticket already in progress finishes. To continue (PROCESS.md section 11):` then the three `node scripts/budget.mjs` commands (`--hold-at <pct>`, `--until-reset`, `--api-until-reset`) / `Each removes this file. Then start node scripts/run.mjs again.`
5. Hold reason: `weekly usage reached the hold (<pct>%)`
6. Phone, weekly warning: `weekly usage at <pct>% (<source>); hold at <pct>%. Resets <YYYY-MM-DD HH:MM UTC>.`
7. Phone, hold: `budget hold: weekly usage at <pct>% (hold at <pct>%). In-progress ticket finishes; nothing new starts. See vault/handoff/BUDGET_HOLD.md.`
8. Launcher log, no meter: `no usage meter reading fresher than 20 minutes; gating on the dollar proxy (PROCESS.md section 11)`
9. Launcher log, pause: `five-hour window at <pct>%; paused until <time> (vault/handoff/WINDOW_PAUSE.md)`
10. Launcher log, Fable: `Fable weekly window at <pct>%: Fable dispatches use Opus 5.5 until <YYYY-MM-DD HH:MM UTC>`
11. `PROGRESS.md`: a `## Usage` section with `Source: <source>, read <time> UTC.` and a table Window / Used / Resets with rows Five-hour, Weekly, Fable weekly (`no meter` when there is none).
12. `budget.mjs` report: `Meters (<source>, read <time> UTC): five-hour <pct>% (resets <time>) · weekly <pct>% (resets <time>) · Fable <pct>% or no meter` and `Thresholds: pause <n>% · warn <n>% · hold <n>% · Fable fallback <n>%`
13. `budget.mjs --hold-at` bad value: `--hold-at needs a whole percent from 1 to 100`
14. `budget.mjs --raise`: `--raise was replaced by --hold-at <pct> (PROCESS.md section 11)`
15. `budget.mjs --hold-at` success: `hold set at <pct>% (was <pct>%)`

**EZD-000i · OAuth usage fallback**
16. Phone, sign-in refused: `usage endpoint refused the sign-in (<status>); usage polling paused until <YYYY-MM-DD HH:MM UTC>. Gating uses the statusline or the dollar proxy meanwhile. Check that Claude Code is signed in on this machine.`
17. Launcher log, 401 or 403: `OAuth usage poll: <status>; no poll until <time>`
18. Launcher log, 429: `OAuth usage poll: rate-limited (429, Retry-After <value or none>); next poll after <time>`
19. Launcher log, other failure: `OAuth usage poll failed (<status or network error>); next poll after <time>`
20. Launcher log, unreadable reply: `OAuth usage poll: response had no readable five-hour and weekly windows; next poll after <time>`
21. Launcher log, no token (once): `OAuth usage fallback off: no sign-in token in ~/.claude/.credentials.json or the Keychain; gating stays on the next source`
22. Launcher log, unexpected error: `OAuth usage poll error (<error name>)`
23. Probe lines (the builder's one-time check): `credential source: file|keychain|none`; `keychain service: <name> (found, credentials JSON | found, not the credentials JSON | not found)`; `HTTP status: <n>` (or `not requested (no token)`, `network error (<name>)`); `response keys: <keys>`; `window keys: <key>{<its keys>}; …`; `model-scoped weekly window: <key>` or `none found`; `token found in files under vault/, scripts/, .run/: none` or the file paths.
24. Shell guard, Keychain (added for Q-0135; agents see it, and you see it if you hit it): `Printing a Keychain secret is not allowed (security with -w or -g, or dump-keychain -d). To check that an item exists, run security find-generic-password -s "<name>" without -w or -g (PA3 rule 8).`
25. Shell guard, sign-in file (added for Q-0135): `The Claude sign-in file is never read from the shell. Only test -f <path> or [ -f <path> ] may name it (PA3 rule 8).`

## 4. Rule candidates

Lessons with status `candidate` (PROCESS.md section 13). Nothing is applied until you answer.

1. **L-001** (reviewer; from EZD-033): a policy number that users run into (password length, retention period, a limit) goes to you with a recommendation; a reviewer does not set it. **Recommend: ratify.** Your password-length override (Q-0094) is the case it comes from, and it keeps product numbers yours (CLAUDE.md rule 3).
2. **L-002** (planner; from EZD-000): for every path in a plan's Files table, check that the path guard lets the writing role write it; if not, choose an allowed path or raise a question before Stage 2. **Recommend: ratify.** It would have prevented the EZD-000 block (Q-0124). The EZD-000b to EZD-000i plans already apply it.
