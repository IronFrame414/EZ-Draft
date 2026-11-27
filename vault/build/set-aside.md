# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, run `node scripts/loop.mjs --retry <ticket>` (the loop picks it up again).

## EZD-2029 · On touch screens the editor left panel folds away so the edit bar does not cover the inspector
- When: 2026-11-27T11:03:52Z
- Reason: check red after merging newer develop (first try: check red after merging newer develop)
- Branch: t/EZD-2029 · worktree: .claude/worktrees/EZD-2029
- Last output:
```
test.mjs
full log: /Users/josh/Projects/ezdraft/.claude/worktrees/EZD-2029/check.log

== failure lines ==
not ok 50 - scripts/db/__tests__/types-check.test.mjs
  location: '/Users/josh/Projects/ezdraft/.claude/worktrees/EZD-2029/scripts/db/__tests__/types-check.test.mjs:1:1'
  error: 'test timed out after 300000ms'
  code: 'ERR_TEST_FAILURE'

== last lines ==
      type: 'test'
      ...
    # Subtest: EZD-023a T10 findUnverifiable: cascade and dynamic text (Step 3)
    ok 5 - EZD-023a T10 findUnverifiable: cascade and dynamic text (Step 3)
      ---
      duration_ms: 0.605791
      type: 'test'
      ...
    1..5
ok 578 - EZD-023a sql scan
  ---
  duration_ms: 4.005375
  type: 'suite'
  ...
# Subtest: EZD-325 scratch stack ports
    # Subtest: EZD-325 T1 scratch stack ports are bare integers below 32768 and not shared
    ok 1 - EZD-325 T1 scratch stack ports are bare integers below 32768 and not shared
      ---
      duration_ms: 13.3605
      type: 'test'
      ...
    1..1
ok 579 - EZD-325 scratch stack ports
  ---
  duration_ms: 13.851834
  type: 'suite'
  ...
# Subtest: EZD-023a release tags
    # Subtest: EZD-023a T13 Tag order: listReleaseTags sorts by phase then patch and ignores other names
    ok 1 - EZD-023a T13 Tag order: listReleaseTags sorts by phase then patch and ignores other names
      ---
      duration_ms: 1.885459
      type: 'test'
      ...
    # Subtest: EZD-360 T6 compareReleaseTags orders phase-56 after phase-5.3 and before phase-6 (AC-EZD-360-3)
    ok 2 - EZD-360 T6 compareReleaseTags orders phase-56 after phase-5.3 and before phase-6 (AC-EZD-360-3)
      ---
      duration_ms: 0.126125
      type: 'test'
      ...
    # Subtest: EZD-360 T7 a Phase 6 pull request after phase-56 gets phase-6 (AC-EZD-360-3)
    ok 3 - EZD-360 T7 a Phase 6 pull request after phase-56 gets phase-6 (AC-EZD-360-3)
      ---
      duration_ms: 0.552625
      type: 'test'
      ...
    # Subtest: EZD-360 T8 a Phase 56 pull request after phase-5 gets phase-56 (AC-EZD-360-3)
    ok 4 - EZD-360 T8 a Phase 56 pull request after phase-5 gets phase-56 (AC-EZD-360-3)
      ---
      duration_ms: 0.353125
      type: 'test'
      ...
    # Subtest: EZD-360 T9 a Phase 56 pull request after phase-6 is not_newer (AC-EZD-360-3)
    ok 5 - EZD-360 T9 a Phase 56 pull request after phase-6 is not_newer (AC-EZD-360-3)
      ---
      duration_ms: 0.147416
      type: 'test'
      ...
    1..5
ok 580 - EZD-023a release tags
  ---
  duration_ms: 3.6945
  type: 'suite
```

## History (last 20 retries)

| Ticket | Set aside | Retried | By | Reason |
| --- | --- | --- | --- | --- |
| EZD-2000 | 2026-11-27T04:12:31Z | 2026-11-27T04:29:39Z | overwatch | check red after merging newer develop (first try: check red after merging newer develop) |
