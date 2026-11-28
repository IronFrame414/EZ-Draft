# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, run `node scripts/loop.mjs --retry <ticket>` (the loop picks it up again).

## EZD-2021 · Security: signed-out sign-in and invite answers do not reveal who is a member or has an invite
- When: 2026-11-28T01:16:32Z
- Reason: check red after a review fix (first try: check red after merging newer develop)
- Branch: t/EZD-2021 · worktree: .claude/worktrees/EZD-2021
- Last output:
```
/release/__tests__/tags.test.mjs scripts/release/__tests__/vercel-api.test.mjs scripts/release/__tests__/workflow.test.mjs scripts/test-harness/db-lock.test.mjs
full log: /Users/josh/Projects/ezdraft/.claude/worktrees/EZD-2021/check.log

== failure lines ==
not ok 124 - scripts/release/__tests__/scratch-check-local.test.mjs
  location: '/Users/josh/Projects/ezdraft/.claude/worktrees/EZD-2021/scripts/release/__tests__/scratch-check-local.test.mjs:1:1'
  error: 'test timed out after 300000ms'
  code: 'ERR_TEST_FAILURE'

== last lines ==
      type: 'test'
      ...
    # Subtest: EZD-023a T10 findUnverifiable: cascade and dynamic text (Step 3)
    ok 5 - EZD-023a T10 findUnverifiable: cascade and dynamic text (Step 3)
      ---
      duration_ms: 0.779417
      type: 'test'
      ...
    1..5
ok 587 - EZD-023a sql scan
  ---
  duration_ms: 4.512875
  type: 'suite'
  ...
# Subtest: EZD-325 scratch stack ports
    # Subtest: EZD-325 T1 scratch stack ports are bare integers below 32768 and not shared
    ok 1 - EZD-325 T1 scratch stack ports are bare integers below 32768 and not shared
      ---
      duration_ms: 21.301833
      type: 'test'
      ...
    1..1
ok 588 - EZD-325 scratch stack ports
  ---
  duration_ms: 21.946291
  type: 'suite'
  ...
# Subtest: EZD-023a release tags
    # Subtest: EZD-023a T13 Tag order: listReleaseTags sorts by phase then patch and ignores other names
    ok 1 - EZD-023a T13 Tag order: listReleaseTags sorts by phase then patch and ignores other names
      ---
      duration_ms: 5.216292
      type: 'test'
      ...
    # Subtest: EZD-360 T6 compareReleaseTags orders phase-56 after phase-5.3 and before phase-6 (AC-EZD-360-3)
    ok 2 - EZD-360 T6 compareReleaseTags orders phase-56 after phase-5.3 and before phase-6 (AC-EZD-360-3)
      ---
      duration_ms: 0.299
      type: 'test'
      ...
    # Subtest: EZD-360 T7 a Phase 6 pull request after phase-56 gets phase-6 (AC-EZD-360-3)
    ok 3 - EZD-360 T7 a Phase 6 pull request after phase-56 gets phase-6 (AC-EZD-360-3)
      ---
      duration_ms: 0.924834
      type: 'test'
      ...
    # Subtest: EZD-360 T8 a Phase 56 pull request after phase-5 gets phase-56 (AC-EZD-360-3)
    ok 4 - EZD-360 T8 a Phase 56 pull request after phase-5 gets phase-56 (AC-EZD-360-3)
      ---
      duration_ms: 2.14775
      type: 'test'
      ...
    # Subtest: EZD-360 T9 a Phase 56 pull request after phase-6 is not_newer (AC-EZD-360-3)
    ok 5 - EZD-360 T9 a Phase 56 pull request after phase-6 
```

## History (last 20 retries)

| Ticket | Set aside | Retried | By | Reason |
| --- | --- | --- | --- | --- |
| EZD-2019 | 2026-11-27T23:09:37Z | 2026-11-27T23:29:45Z | overwatch | check red after merging newer develop (first try: check red after a review fix) |
| EZD-2019 | 2026-11-27T19:09:41Z | 2026-11-27T19:29:19Z | overwatch | develop kept moving: 3 merge rounds (first try: check red after a review fix) |
| EZD-2030 | 2026-11-27T12:57:50Z | 2026-11-27T12:59:35Z | overwatch | check red after merging newer develop (first try: check red after a review fix) |
| EZD-2029 | 2026-11-27T11:03:52Z | 2026-11-27T11:14:41Z | overwatch | check red after merging newer develop (first try: check red after merging newer develop) |
| EZD-2000 | 2026-11-27T04:12:31Z | 2026-11-27T04:29:39Z | overwatch | check red after merging newer develop (first try: check red after merging newer develop) |
