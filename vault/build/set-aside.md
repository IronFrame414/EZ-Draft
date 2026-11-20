# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-701 · Sheet model and default set
- When: 2026-11-20T17:59:20Z
- Reason: check red after merging newer develop (first try: check red after merging newer develop)
- Branch: t/EZD-701 · worktree: .claude/worktrees/EZD-701
- Last output:
```
ontext than the active one is not supported. Skipping injection.
(node:25781) [THREE_CJS_DEPRECATED] DeprecationWarning: `require("three")` is deprecated and will be removed.
Replace `const THREE = require("three")` with `import * as THREE from "three"`.
(Use `node --trace-deprecation ...` to show where the warning was created)
EZD-423 editor route compressed JavaScript: 499911 bytes
  ✘  221 [desktop] › e2e/net-guard.spec.ts:14:7 › EZD-021 net guard in browser tests › EZD-021 T14 (a) a page request to a live host fails the test (76ms)
  ✘  222 [desktop] › e2e/net-guard.spec.ts:22:9 › EZD-021 net guard in browser tests › server log › EZD-021 T14 (b) a line in the server guard log fails the test (3ms)
  ✘  224 [desktop] › e2e/net-guard.spec.ts:40:7 › EZD-159 net guard blocks page WebSockets › EZD-159 T7 a page WebSocket to a live host fails the test (162ms)
  ✘  193 [desktop] › e2e/jobs.spec.ts:33:7 › EZD-009 background jobs › EZD-009 done when: a test job runs, reports progress and result, and the UI stays usable (1.0m)
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
[WebServer] SentryPropagator: Injecting trace data of a different context than the active one is not supported. Skipping injection.
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
