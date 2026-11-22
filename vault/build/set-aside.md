# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-1418 · Field measure into Import review
- When: 2026-11-22T23:36:10Z
- Reason: check red after merging newer develop (first try: check red after merging newer develop)
- Branch: t/EZD-1418 · worktree: .claude/worktrees/EZD-1418
- Last output:
```
: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
EZD-1001a first open of 3D on the benchmark project: 265 ms
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
  ✘  586 [ipad-landscape] › e2e/settings-users.spec.ts:310:7 › EZD-104 users table › B8 touch targets @ipad (2.5s)
  1) [ipad-landscape] › e2e/settings-users.spec.ts:310:7 › EZD-104 users table › B8 touch targets @ipad 
    Error: touch targets
    expect(received).toEqual(expected) // deep equality
    - Expected  - 1
    + Received  + 3
    - Array []
    + Array [
    +   "INPUT \"\" covered at center 142x44",
    + ]
       at ../test-harness/touch-targets.ts:58
      56 |     return { failures, checked };
      57 |   }, TOUCH_TARGET_SELECTOR);
    > 58 |   expect(result.failures, 'touch targets').toEqual([]);
         |                                            ^
      59 |   return result.checked;
      60 | }
      61 |
        at expectTouchTargets (/Users/josh/Projects/ezdraft/.claude/worktrees/EZD-1418/app/test-harness/touch-targets.ts:58:44)
        at /Users/josh/Projects/ezdraft/.claude/worktrees/EZD-1418/app/e2e/settings-users.spec.ts:342:14
    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/settings-users-EZD-104-users-table-B8-touch-targets-ipad-ipad-landscape/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    Error Context: test-results/settings-users-EZD-104-users-table-B8-touch-targets-ipad-ipad-landscape/error-context.md
    Error Context: test-results/settings-users-EZD-104-users-table-B8-touch-targets-ipad-ipad-landscape/error-context.md
    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/settings-users-EZD-104-users-table-B8-touch-targets-ipad-ipad-landscape/trace.zip
    Usage:
        pnpm exec playwright show-trace test-results/settings-users-EZD-10
```
