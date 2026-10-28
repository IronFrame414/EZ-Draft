# Start-up context of a dispatch (EZD-244, AC-EZD-244-5)

Start-up tokens = input + cache creation + cache read of the transcript's first assistant message (usage-by-agent.mjs exports; command in vault/plans/EZD-244.md Block M). Before = last build before EZD-244 with a builder and a code-reviewer transcript (EZD-163, log row 2026-10-28T01:37:51Z).

| Dispatch | Ticket | Run time | Model | Start-up tokens |
| --- | --- | --- | --- | ---: |
| builder (round 1) | EZD-163 | 2026-10-28T01:37:51Z | claude-sonnet-5-5 | 119,642 |
| builder (round 2) | EZD-163 | 2026-10-28T01:37:51Z | claude-sonnet-5-5 | 119,540 |
| code-reviewer | EZD-163 | 2026-10-28T01:37:51Z | claude-opus-5-5 | 114,446 |

After rows (builder, code-reviewer) are added by the orchestrator of the first build unit after the EZD-244 merge, as its first step (Q-0363 (a)).

## Characters loaded at start (architecture)

| Moment | Characters | Command |
| --- | ---: | --- |
| before | 256,022 | `git show develop:CLAUDE.md | wc -c` plus `git show develop:docs/architecture.md | wc -c` |
| after | 41446 | `wc -c < CLAUDE.md` (    6477) plus the core printed by the Architecture line of `next_ticket.mjs --reads EZD-244 builder` (   34969) |
