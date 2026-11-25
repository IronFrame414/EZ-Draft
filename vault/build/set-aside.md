# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-1944 · Loop: a retry command that keeps a history of set-asides
- When: 2026-11-25T00:49:35Z
- Reason: check red after a review fix (first try: check red after merging newer develop)
- Branch: t/EZD-1944 · worktree: .claude/worktrees/EZD-1944
- Last output:
```
njecting trace data of a different context than the active one is not supported. Skipping injection.
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
 ❯ src/server/db/permissions.test.ts (18 tests | 1 failed) 1461
```
