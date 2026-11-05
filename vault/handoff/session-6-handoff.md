# Session 6 hand-over · 2026-11-05 (interactive orchestrator, fix mode)

Worked the session 5 "Open" list. Josh was present for the first part and then left for 10+ hours. He gave a standing rule, authorized the safety-guard builds and phase 4, and lifted the 30% context cap for this session.

## Josh's decisions (chat)
- Standing rule: only design and user-interface questions that cannot be resolved internally reach Josh. Recorded in 16e26c7f: CLAUDE.md rules 3 and 17, the questions skill step 2, the code-reviewer question kind, and a decisions/process.md row.
- Q-0579 (b): the Projects page budget is 220 KB (3ff58bad), after the bell fix EZD-332 (built by the launcher, 26e41274). EZD-117b was set ready behind EZD-332 and is building.
- Q-0580: "Yes, file it". Filed as EZD-331.
- Phase 4 authorized: the picker now looks two signed-off phases ahead. The second phase's plans run only when no build is free (dfe0af6d; EZD-278 O10, O10b, O10c).
- LAUNCHER_FIX.md: "Yes, close it". Removed at the end of this session.
- Launcher pause: yes, used only while EZD-279 merged; STOP was removed at about 01:30 UTC.

## Tickets
- EZD-279 done 1b320982 (1898 tests).
- EZD-154 done 31ade158 (1900): shrunk to removing the PA3 grant. The dropped guard-bash work is kept on t/EZD-154-dropped-guard-bash. The feat commit kept the old title; tickets.json and the phase row carry the new one.
- EZD-280 done d058154c (1911): 2 rounds. Round 1 security FAIL (a wildcard `cd` target) was fixed in place.
- EZD-331 done f7e7803a (1914): the gate-lock tests use their own npm stand-in, and a dead gate step says why. V2 mutation and V1 soak (10 of 10 with lanes 2 and 3 live) are recorded in its STATUS note.

## Item answers
- 6 (one lane idle): the cause was the dependency chain. Every phase 3 ticket waited on EZD-117b, which waited on Q-0579. It was not a lane fault.
- 7: written as tooling note D-085. D-086 (the squash stops on a tracked, modified plan) was added too.
- 8: LAUNCHER_FIX.md closed on Josh's yes.
- 9: 2026-11-11 check is still due (product merges a day, Josh's questions a day; analysis section 1).

## Open
- No fix-mode ticket is left open from this session. LAUNCHER_FIX.md is removed, so the next guarded-file change needs a new fix-mode note.
- Launcher state at hand-over: lane 1 builds EZD-117b, lane 2 plans phase 4 (EZD-201, 203 and 205 planned; 206 in progress). Next in the chain: EZD-118, then phase 3 (EZD-120a and on).
- Q-0579 needs no further step; EZD-332 and then EZD-117b carry it.
- The live shell guard now refuses any command whose text names a secret file, including commit messages and ledger notes. Write around it (KNOWN-LIMITS shell-guard entry).
