# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-1418 · Field measure into Import review
- When: 2026-11-23T05:12:16Z
- Reason: check red after merging newer develop (first try: check red after merging newer develop)
- Branch: t/EZD-1418 · worktree: .claude/worktrees/EZD-1418
- Last output:
```
Server] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
EZD-1001a first open of 3D on the benchmark project: 276 ms
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] Error: aborted
[WebServer]     at ignore-listed frames {
[WebServer]   code: 'ECONNRESET'
[WebServer] }
[WebServer] Error: aborted
[WebServer]     at ignore-listed frames {
[WebServer]   code: 'ECONNRESET'
[WebServer] }
  1) [desktop] › e2e/drawing-tools.spec.ts:485:7 › EZD-210b drawing tools › EZD-210b B9 pointer moves update the band with no React commit 
    Error: expect(received).toBe(expected) // Object.is equality
    Expected: 71
    Received: 73
      517 |     for (let i = 0; i < 50; i++) await moveTo(page, i % 2 === 0 ? 60 : 96, i % 2 === 0 ? 30 : 72);
      518 |     await expect(id(page, 'tool-band')).toHaveAttribute('d', 'M 128 384 L 384 192');
    > 519 |     expect(await stable()).toBe(before);
          |                            ^
      520 |   });
      521 |
      522 |   test(
        at /Users/josh/Projects/ezdraft/.claude/worktrees/EZD-1418/app/e2e/drawing-tools.spec.ts:519:28
    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/drawing-tools-EZD-210b-dra-07385-e-band-with-no-React-commit-desktop/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    Error Context: test-results/drawing-tools-EZD-210b-dra-07385-e-band-with-no-React-commit-desktop/error-context.md
    Error Context: test-results/drawing-tools-EZD-210b-dra-07385-e-band-with-no-React-commit-desktop/error-context.md
    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/drawing-tools-EZD-210b-dra-07385-e-band-with-no-React-commit-desktop/trace.zip
    Usage:
        pnpm exec playwright show-trace test-results/drawing-tools-EZD-210b-dra-07385-e-band-with-no-React-
```
