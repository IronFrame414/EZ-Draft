# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-222 · Keyboard shortcuts and Help
- When: 2026-11-18T18:21:56Z
- Reason: builder crashed (no result) (first try: builder timed out after 90 min with no commits)
- Branch: t/EZD-222 · worktree: .claude/worktrees/EZD-222
- Last output:
```


```

## EZD-403 · Cabinet library panel
- When: 2026-11-20T09:26:14Z
- Reason: check red after merging newer develop (first try: check still red after 2 fix rounds)
- Branch: t/EZD-403 · worktree: .claude/worktrees/EZD-403
- Last output:
```
 EZD-021 net guard in browser tests › EZD-021 T14 (a) a page request to a live host fails the test (78ms)
  ✘  217 [desktop] › e2e/net-guard.spec.ts:22:9 › EZD-021 net guard in browser tests › server log › EZD-021 T14 (b) a line in the server guard log fails the test (4ms)
  ✘  219 [desktop] › e2e/net-guard.spec.ts:40:7 › EZD-159 net guard blocks page WebSockets › EZD-159 T7 a page WebSocket to a live host fails the test (116ms)
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] Error: aborted
[WebServer]     at ignore-listed frames {
[WebServer]   code: 'ECONNRESET'
[WebServer] }
  1) [desktop] › e2e/move.spec.ts:165:7 › EZD-212b Move tool › EZD-212b B1 Move the host wall away from a door 
    Error: expect(received).toEqual(expected) // deep equality
    - Expected  - 3
    + Received  + 1
    - Array [
    -   "ae7e5749-80ac-4ca5-8887-0d83f3ee4978",
    - ]
    + Array []
      175 |
      176 |     await clickAt(page, 144, 100);
    > 177 |     expect(await selectedIds(page)).toEqual([seed.E]);
          |                                     ^
      178 |     const before = geoOf(await objects(page), seed.E);
      179 |     near(before.start.x, 144, 9);
      180 |     near(before.end.x, 144, 9);
        at /Users/josh/Projects/ezdraft/.claude/worktrees/EZD-403/app/e2e/move.spec.ts:177:37
    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/move-EZD-212b-Move-tool-EZ-62e2d--host-wall-away-from-a-door-desktop/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    Error Context: test-results/move-EZD-212b-Move-tool-EZ-62e2d--host-wall-away-from-a-door-desktop/error-context.md
    Error Context: test-results/move-EZD-212b-Move-tool-EZ-62e2d--host-wall-away-from-a-door-desktop/error-context.md
    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/move-EZD-212b-Move-tool-EZ-62e2d--host-wall-away-from-a-door-desktop/trace.zip
    Usage:
        pnpm exec playwright show-trace test-results/move-EZD-212b-Move-tool-E
```
