# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, run `node scripts/loop.mjs --retry <ticket>` (the loop picks it up again).

## EZD-2019 · Security: a junk captcha token can no longer lock a member out of Email me a code
- When: 2026-11-28T02:52:47Z
- Reason: check red after merging newer develop (first try: check red after a review fix)
- Branch: t/EZD-2019 · worktree: .claude/worktrees/EZD-2019
- Last output:
```
p to D-Map with one request, no usage row and no model change
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
stderr | src/app/api/projects/[id]/assistant/route.test.ts > EZD-5602 assistant route > T18 provider errors map to D-Map with one request, no usage row and no model change
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
stderr | src/app/api/projects/[id]/assistant/route.test.ts > EZD-5602 assistant route > T18 provider errors map to D-Map with one request, no usage row and no model change
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
stderr | src/app/api/projects/[id]/assistant/route.test.ts > EZD-5602 assistant route > T19 a reply that does not parse is billed when usage came back, and free when it did not
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
stderr | src/app/api/projects/[id]/assistant/route.test.ts > EZD-5602 assistant route > T19 a reply that does not parse is billed when usage came back, and free when it did not
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
stderr | src/app/api/projects/[id]/assistant/route.test.ts > EZD-5602 assistant route > T20 one prompt in flight, 30 a minute, and the time budget and a closed tab end the call
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
stderr | src/app/api/projects/[id]/assistant/route.test.ts > EZD-5602 assistant route > T20 one prompt in flight, 30 a minute, and the time budget and a closed tab end the call
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
stderr | src/app/api/projects/[id]/assistant/route.test.ts > EZD-5602 assistant route > T20 one prompt in flight, 30 a minute, and the time budget and a closed tab end the call
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
stderr | src/app/api/projects/[id]/assistant/route.test.ts > EZD-5602 assistant route > T22 a failed usage write is reported and the answer stands
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Sk
```

## History (last 20 retries)

| Ticket | Set aside | Retried | By | Reason |
| --- | --- | --- | --- | --- |
| EZD-2021 | 2026-11-28T01:16:32Z | 2026-11-28T01:29:16Z | overwatch | check red after a review fix (first try: check red after merging newer develop) |
| EZD-2019 | 2026-11-27T23:09:37Z | 2026-11-27T23:29:45Z | overwatch | check red after merging newer develop (first try: check red after a review fix) |
| EZD-2019 | 2026-11-27T19:09:41Z | 2026-11-27T19:29:19Z | overwatch | develop kept moving: 3 merge rounds (first try: check red after a review fix) |
| EZD-2030 | 2026-11-27T12:57:50Z | 2026-11-27T12:59:35Z | overwatch | check red after merging newer develop (first try: check red after a review fix) |
| EZD-2029 | 2026-11-27T11:03:52Z | 2026-11-27T11:14:41Z | overwatch | check red after merging newer develop (first try: check red after merging newer develop) |
| EZD-2000 | 2026-11-27T04:12:31Z | 2026-11-27T04:29:39Z | overwatch | check red after merging newer develop (first try: check red after merging newer develop) |
