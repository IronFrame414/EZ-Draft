# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, run `node scripts/loop.mjs --retry <ticket>` (the loop picks it up again).

## EZD-1980 · Touch targets of at least 44 px on iPad in Settings, Libraries, Sheets and tool panels
- When: 2026-11-25T13:35:20Z
- Reason: check red after merging newer develop (first try: builder timed out after 90 min with no commits)
- Branch: t/EZD-1980 · worktree: .claude/worktrees/EZD-1980
- Last output:
```
Injecting trace data of a different context than the active one is not supported. Skipping injection.
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
SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
 ❯ src/server/db/permissions.test.ts (18 tests | 1 failed) 138
```

## History (last 20 retries)

None yet.
