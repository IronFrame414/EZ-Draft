# Usage efficiency plan, 2026-10-20

Sources: `vault/cost/usage-report-2026-10-19.md`; `vault/cost/log.jsonl` (89 runs); `vault/cost/usage.json`; `vault/cost/oauth-poll.json`; `vault/handoff/BUDGET_HOLD.md`; `scripts/budget.mjs`; and the saved transcripts of all 89 runs and their sub-agents (`~/.claude/projects/-Users-josh-Projects-ezdraft/`), totalled by role. Shares below weight tokens by type (fresh input 1, cache write 1.25 to 2, cache read 0.1, output 5) and treat every model alike, so Fable rows read low and Haiku rows read high.

## What the data says

**1. The budget hold is a measuring error, not real usage.**
- At 00:34 UTC the real meter (`usage.json`, source oauth) read **weekly 25%**, after $351 of logged runs this week.
- After that the launcher logged $6 more ($357 total). At 09:08 the real meter could not be read (`oauth-poll.json`: 401), so the launcher fell back to the dollar estimate: $357 ÷ the $300 ceiling = 119%, and it wrote the hold.
- So $351 of logged runs used at most 25% of the week. The real capacity is about $1,400 per week in the log's dollar terms, not $300.

**2. Most tokens go to coordinating, not to building.**

| Who | Share |
|---|---|
| Plan units (planner writing a plan) | 28% |
| Build orchestrator (the main thread of a build) | 26% |
| Planner inside builds (splitting, re-checking plans) | 10% |
| Questions units | 8% |
| Builder (all models) | 7% |
| Test-author (all models) | 7% |
| Code-reviewer | 9% |
| Security-reviewer | 3% |
| Web lookups (Haiku) | 2% |

The agents that write code and tests take about 14%.

**3. Big plans are read over and over.** Phase-0 plans run 60,000 to 128,000 characters. In builds, the orchestrator alone read plan files 41 times (558,000 characters), and every sub-agent reads the plan again. In plan units, planners read plan files 86 times (1.96 million characters), many of them other tickets' plans. Re-reading long context is 43% of all tokens (cache reads); writing it into the cache is another 35%.

**4. Paying twice for splits.** Eight builds stopped to split a ticket ($31). On 13 of 32 tickets, planning plus questions cost more than the build.

**5. The log's times are wrong.** For example, the log shows 1.5 minutes for EZD-023a, but its transcript runs from 16:11 to 16:47 local time. The "1 turn, 0.1 minute" rows are the same fault, so the times and turn counts in the 10-19 report can't be trusted.

## The method

Keep the same agents, models for hard work, reviews and gate. Cut what every agent has to read, and stop the main thread from doing work a script can do. Measure each chunk against the 10-19 baseline before the next one: cost per built ticket, review FAILs per ticket (12 of 32), build rounds (6 of 32 needed two).

## Chunks (small, in order; each one is its own session)

**C0. Release the false hold (Josh, 5 minutes, now).**
Check the weekly bar in the Claude app (Settings → Usage). If it is well under 80%, set the weekly ceiling to a calibrated value and release the hold with `node scripts/budget.mjs --set-ceiling <usd>`. From the numbers above: 25% ≈ $351, so the 80% hold falls near $1,100. Chat and other Claude use also draw from that bar, so a ceiling around $1,000 to $1,200 leaves some room. The figure is your money decision. Restart `node scripts/run.mjs`.

**C1. Fix the meter so a hold only comes from real data (fix ticket, small).**
- The OAuth read returned 401 (macOS token). Fix how the token is read or refreshed.
- On 401, show a clear "meter unavailable" warning and pause instead of trusting the dollar estimate.
- Log the meter source and real duration on each `log.jsonl` row.
Done when a test proves a 401 never writes a hold from the dollar estimate alone.

**C2. Per-agent cost report as a tool (small).**
Save this session's transcript totalling as `vault/tools/usage-by-agent.mjs`, priced with real per-model rates. The wrap cost report (and these checks) use it. Done when it reproduces the table above for 10-19.

**C3. Role-sized plan reading (biggest lever, medium).**
- Give each plan fixed sections, marked so `outline.mjs` can find them.
- In the dispatch, each role is told the line ranges it reads:
  - test-author: interface contract and test table
  - builder: steps and contract
  - reviewers: acceptance criteria, test table and the diff
  - orchestrator: header, complexity, reviewers line
- Done when one build's sub-agents read under half of today's plan characters (measured with C2).

**C4. Shorter plans (medium).**
- Add a length target to `vault/plans/TEMPLATE.md`, for example 25,000 characters. Above it, the planner splits at plan time. This also removes the "split during build" cost (finding 4).
- The planner reads other plans only by outline and line range, never whole.
- Done when phase-1 plans average under the target and no build stops to split.

**C5. Lean build orchestrator (medium).**
- Move the mechanical steps into one script: pre-flight, worktree, gate, squash merge, cleanup, STATUS line, push. The orchestrator calls one command per step and reads a 5-line result instead of `git status` / `git show` / `sed` output (about 600,000 characters on 10-19).
- Done when the orchestrator's share of a build falls by half.

**C6. Batch planning for small siblings (small).**
One plan unit plans 3 to 5 small sibling tickets (for example 026a/c/d), so the spec is loaded once. Done when overhead is less than the build on small tickets.

**C7. Model routing review (after C2 to C5, decision for Josh).**
Fable-built tickets failed review less often (3 of 9 against 9 of 23), so keep Fable for high tickets. With real per-model prices from C2, decide whether reviewers on high tickets stay on Fable or move to Opus. Not changed until the data is in.

**C8. Check the result (after each chunk).**
- Run the next 3 to 5 builds and compare against the baseline with C2.
- If FAILs or build rounds go up, undo that chunk.

## Who changes what

- C0 and C7 are Josh's (money and model choices).
- C1, C2 and C5 change `scripts/` or `vault/tools/`.
- C3, C4 and C6 change `vault/PROCESS.md`, the skills and the template. Those are process files: Josh approves each change before it lands.
