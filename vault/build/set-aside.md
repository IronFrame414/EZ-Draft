# Set-aside tickets

Tickets the build loop could not finish. Each keeps its branch and worktree for review.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-397 · Fix: the EZD-117a B2 warm Projects page test takes just over 1,000 ms on CI
- When: 2026-11-13T05:00:06Z
- Reason: builder timed out after 90 min
- Branch: t/EZD-397 · worktree: .claude/worktrees/EZD-397
- Last output:
```
Waiting for gates 7–9; the `bbhki379n` watcher will report.

```
