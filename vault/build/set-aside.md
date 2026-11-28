# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, run `node scripts/loop.mjs --retry <ticket>` (the loop picks it up again).

## EZD-2045 · The sink draws a single basin
- When: 2026-11-28T17:54:51Z
- Reason: check red after merging newer develop (first try: check red after merging newer develop)
- Branch: t/EZD-2045 · worktree: .claude/worktrees/EZD-2045
- Last output:
```
results/traffic-EZD-353-traffic-ca-45f5b-ltime-token-is-fetched-once-desktop/error-context.md
    Error: auth createUser failed: Database error creating new user
    > 119 |     if (error || !data.user) throw new Error(`auth createUser failed: ${error?.message}`);
    test-results/upload-step-EZD-301-Upload-aa0a9-d-byte-identical-AC-1-AC-2--desktop/test-failed-1.png
    Error Context: test-results/upload-step-EZD-301-Upload-aa0a9-d-byte-identical-AC-1-AC-2--desktop/error-context.md
    Error Context: test-results/upload-step-EZD-301-Upload-aa0a9-d-byte-identical-AC-1-AC-2--desktop/error-context.md
    Error: auth createUser failed: Database error creating new user
    > 119 |     if (error || !data.user) throw new Error(`auth createUser failed: ${error?.message}`);
    test-results/upload-step-EZD-301-Upload-3da36-rd-directly-with-Blank-only-desktop/test-failed-1.png
    Error Context: test-results/upload-step-EZD-301-Upload-3da36-rd-directly-with-Blank-only-desktop/error-context.md
    Error Context: test-results/upload-step-EZD-301-Upload-3da36-rd-directly-with-Blank-only-desktop/error-context.md
    Error: auth createUser failed: Database error creating new user
    > 119 |     if (error || !data.user) throw new Error(`auth createUser failed: ${error?.message}`);
    test-results/version-cleanup-EZD-123-ve-bc6e3-apshot-and-deletes-the-rest-desktop/test-failed-1.png
    Error Context: test-results/version-cleanup-EZD-123-ve-bc6e3-apshot-and-deletes-the-rest-desktop/error-context.md
    Error Context: test-results/version-cleanup-EZD-123-ve-bc6e3-apshot-and-deletes-the-rest-desktop/error-context.md
    Error: auth createUser failed: Database error creating new user
    > 119 |     if (error || !data.user) throw new Error(`auth createUser failed: ${error?.message}`);
    test-results/version-cleanup-EZD-123-ve-c72bc-t-Edit-model-it-never-shows-desktop/test-failed-1.png
    Error Context: test-results/version-cleanup-EZD-123-ve-c72bc-t-Edit-model-it-never-shows-desktop/error-context.md
    Error Context: test-results/version-cleanup-EZD-123-ve-c72bc-t-Edit-model-it-never-shows-desktop/error-context.md
    Error: auth createUser failed: Database error creating new user
    > 119 |     if (error || !data.user) throw new Error(`auth createUser failed: ${error?.message}`);
    test-results/versions-panel-EZD-122-Ver-4b4fb--reloads-the-chosen-version-desktop/test-failed-1.png
    Error Context: test-results/versions-panel-EZD-122-Ver-4b4fb--reloads-the-chosen-ve
```

## History (last 20 retries)

| Ticket | Set aside | Retried | By | Reason |
| --- | --- | --- | --- | --- |
| EZD-1921 | 2026-11-28T10:04:15Z | 2026-11-28T10:29:23Z | overwatch | squash merge failed (first try: check red after a review fix) |
| EZD-2014 | 2026-11-28T09:23:32Z | 2026-11-28T09:29:13Z | overwatch | develop kept moving: 3 merge rounds (first try: check red after merging newer develop) |
| EZD-2019 | 2026-11-28T02:52:47Z | 2026-11-28T02:59:32Z | overwatch | check red after merging newer develop (first try: check red after a review fix) |
| EZD-2021 | 2026-11-28T01:16:32Z | 2026-11-28T01:29:16Z | overwatch | check red after a review fix (first try: check red after merging newer develop) |
| EZD-2019 | 2026-11-27T23:09:37Z | 2026-11-27T23:29:45Z | overwatch | check red after merging newer develop (first try: check red after a review fix) |
| EZD-2019 | 2026-11-27T19:09:41Z | 2026-11-27T19:29:19Z | overwatch | develop kept moving: 3 merge rounds (first try: check red after a review fix) |
| EZD-2030 | 2026-11-27T12:57:50Z | 2026-11-27T12:59:35Z | overwatch | check red after merging newer develop (first try: check red after a review fix) |
| EZD-2029 | 2026-11-27T11:03:52Z | 2026-11-27T11:14:41Z | overwatch | check red after merging newer develop (first try: check red after merging newer develop) |
| EZD-2000 | 2026-11-27T04:12:31Z | 2026-11-27T04:29:39Z | overwatch | check red after merging newer develop (first try: check red after merging newer develop) |
