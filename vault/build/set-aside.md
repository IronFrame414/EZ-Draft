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

## EZD-122 · Versions panel
- When: 2026-11-18T22:06:50Z
- Reason: check still red after 2 fix rounds (first try: builder timed out after 90 min with no commits)
- Branch: t/EZD-122 · worktree: .claude/worktrees/EZD-122
- Last output:
```
cting trace data of a different context than the active one is not supported. Skipping injection.
EZD-423 editor route compressed JavaScript: 477096 bytes
  ✘  197 [desktop] › e2e/net-guard.spec.ts:14:7 › EZD-021 net guard in browser tests › EZD-021 T14 (a) a page request to a live host fails the test (60ms)
  ✘  198 [desktop] › e2e/net-guard.spec.ts:22:9 › EZD-021 net guard in browser tests › server log › EZD-021 T14 (b) a line in the server guard log fails the test (4ms)
  ✘  200 [desktop] › e2e/net-guard.spec.ts:40:7 › EZD-159 net guard blocks page WebSockets › EZD-159 T7 a page WebSocket to a live host fails the test (118ms)
  ✘  176 [desktop] › e2e/jobs.spec.ts:33:7 › EZD-009 background jobs › EZD-009 done when: a test job runs, reports progress and result, and the UI stays usable (1.0m)
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
  1) [desktop] › e2e/jobs.spec.ts:33:7 › EZD-009 background jobs › EZD-009 done when: a test job runs, reports progress and result, and the UI stays usable 
    Test timeout of 60000ms exceeded.
    attachment #1: screenshot (image/png) ──────────────────────────────────────────────────────────
    test-results/jobs-EZD-009-background-jo-74c6d-ult-and-the-UI-stays-usable-desktop/test-failed-1.png
    ────────────────────────────────────────────────────────────────────────────────────────────────
    Error Context: test-results/jobs-EZD-009-background-jo-74c6d-ult-and-the-UI-stays-usable-desktop/error-context.md
    Error Context: test-results/jobs-EZD-009-background-jo-74c6d-ult-and-the-UI-stays-usable-desktop/error-context.md
    attachment #4: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/jobs-EZD-009-background-jo-74c6d-ult-and-the-UI-stays-usable-desktop/trace.zip
    Usage:
        pnpm exec playwright show-trace test-results/jobs-EZD-009-background-jo-74c6d-ult-and-the-UI-stays-usable-desktop/t
```
