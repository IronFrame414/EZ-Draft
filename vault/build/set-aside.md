# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-410 · Cabinet flags and states
- When: 2026-11-17T13:21:15Z
- Reason: check still red after 2 fix rounds (first try: builder timed out after 90 min with no commits)
- Branch: t/EZD-410 · worktree: .claude/worktrees/EZD-410
- Last output:
```
  code: 'ECONNRESET'
[WebServer] }
[WebServer] Error: aborted
[WebServer]     at ignore-listed frames {
[WebServer]   code: 'ECONNRESET'
[WebServer] }
  1) [desktop] › e2e/editor.spec.ts:368:7 › EZD-120c editor route › EZD-120c B11 the editor route loads no code past the editor entry rules and stays within 500,000 compressed bytes 
    Error: expect(received).toBeLessThanOrEqual(expected)
    Expected: <= 500000
    Received:    500041
      382 |     const size = await signedInJsSize(browser, state, url);
      383 |     expect('error' in size).toBe(false);
    > 384 |     expect('value' in size ? size.value : Infinity).toBeLessThanOrEqual(500_000);
          |                                                     ^
      385 |   });
      386 | });
      387 |
        at /Users/josh/Projects/ezdraft/.claude/worktrees/EZD-410/app/e2e/editor.spec.ts:384:53
    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    attachment #2: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/test-failed-3.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    attachment #3: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/test-failed-2.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    Error Context: test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/error-context.md
    Error Context: test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/error-context.md
    attachment #6: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/trace.zip
    Usage:
        pnpm exec playwright show-trace test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/trace.zip
    ────────────────────────────────────────────────────────────────────────────────────────────────
  2) [desktop] › e2e/plan-canvas.spec.
```

## EZD-422 · Fix: every fixture kind draws its own standard plan symbol, not the same box with diagonals
- When: 2026-11-17T23:16:03Z
- Reason: check red after merging newer develop (first try: builder crashed (no result))
- Branch: t/EZD-422 · worktree: .claude/worktrees/EZD-422
- Last output:
```
   code: 'ECONNRESET'
[WebServer] }
[WebServer] Error: aborted
[WebServer]     at ignore-listed frames {
[WebServer]   code: 'ECONNRESET'
[WebServer] }
  1) [desktop] › e2e/editor.spec.ts:368:7 › EZD-120c editor route › EZD-120c B11 the editor route loads no code past the editor entry rules and stays within 500,000 compressed bytes 
    Error: expect(received).toBeLessThanOrEqual(expected)
    Expected: <= 500000
    Received:    500012
      382 |     const size = await signedInJsSize(browser, state, url);
      383 |     expect('error' in size).toBe(false);
    > 384 |     expect('value' in size ? size.value : Infinity).toBeLessThanOrEqual(500_000);
          |                                                     ^
      385 |   });
      386 | });
      387 |
        at /Users/josh/Projects/ezdraft/.claude/worktrees/EZD-422/app/e2e/editor.spec.ts:384:53
    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    attachment #2: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/test-failed-3.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    attachment #3: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/test-failed-2.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    Error Context: test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/error-context.md
    Error Context: test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/error-context.md
    attachment #6: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/trace.zip
    Usage:
        pnpm exec playwright show-trace test-results/editor-EZD-120c-editor-rou-eb0ff-in-500-000-compressed-bytes-desktop/trace.zip
    ────────────────────────────────────────────────────────────────────────────────────────────────
  2) [desktop] › e2e/plan-canvas.spec
```
