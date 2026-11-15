# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-116 · Defaults framework
- When: 2026-11-14T21:01:14Z
- Reason: review still failing after 2 fix rounds (first try: check red after a review fix)
- Branch: t/EZD-116 · worktree: .claude/worktrees/EZD-116
- Last output:
```
[
 {
  "file": "app/src/editor/defaults-store.ts",
  "line": 68,
  "problem": "AC-EZD-116-8 not met: the editor does not re-read the defaults on the project channel resync. createDefaultsStore and rereadOnResync are defined and unit-tested but nothing in the editor session or ProjectEditor imports them, and ProjectEditor never joins the project channel (confirmed by grep; stated in vault/build/assumptions.md and docs/architecture.md). A company Defaults change never reaches an open editor without a full reload.",
  "fix": "Create the defaults store in the editor session from model.defaults, join the project channel in ProjectEditor and call rereadOnResync(handle, store), keeping the editor route within its 500,000-byte budget (for example load the Realtime hub lazily after first paint or trim other editor code; do not raise the budget without a decision). Add a test that a resync triggers GET /api/projects/<id>/defaults and updates the session's values."
 }
]
```
