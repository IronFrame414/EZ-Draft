# Set-aside tickets

Tickets that failed twice (a first failure is retried automatically). These need Josh. Each keeps its branch and worktree.
To retry one, run `node scripts/loop.mjs --retry <ticket>` (the loop picks it up again).

## EZD-2000 · Gate rules that keep pages small and fast as the app grows
- When: 2026-11-27T04:12:31Z
- Reason: check red after merging newer develop (first try: check red after merging newer develop)
- Branch: t/EZD-2000 · worktree: .claude/worktrees/EZD-2000
- Last output:
```
release/__tests__/workflow.test.mjs scripts/test-harness/db-lock.test.mjs
full log: /Users/josh/Projects/ezdraft/.claude/worktrees/EZD-2000/check.log

== failure lines ==
not ok 321 - EZD-1953 T6 the 2574 rows of the old assumptions.md are all in the ticket files, each once (AC-EZD-1953-1)
  location: '/Users/josh/Projects/ezdraft/.claude/worktrees/EZD-2000/vault/tools/assumptions-index.test.mjs:169:1'
  error: 'row 2342aac9 missing from vault/build/assumptions/'
  name: 'AssertionError'
  expected: true

== last lines ==
      type: 'test'
      ...
    # Subtest: EZD-023a T10 findUnverifiable: cascade and dynamic text (Step 3)
    ok 5 - EZD-023a T10 findUnverifiable: cascade and dynamic text (Step 3)
      ---
      duration_ms: 1.227667
      type: 'test'
      ...
    1..5
ok 571 - EZD-023a sql scan
  ---
  duration_ms: 7.192125
  type: 'suite'
  ...
# Subtest: EZD-325 scratch stack ports
    # Subtest: EZD-325 T1 scratch stack ports are bare integers below 32768 and not shared
    ok 1 - EZD-325 T1 scratch stack ports are bare integers below 32768 and not shared
      ---
      duration_ms: 10.794584
      type: 'test'
      ...
    1..1
ok 572 - EZD-325 scratch stack ports
  ---
  duration_ms: 11.274167
  type: 'suite'
  ...
# Subtest: EZD-023a release tags
    # Subtest: EZD-023a T13 Tag order: listReleaseTags sorts by phase then patch and ignores other names
    ok 1 - EZD-023a T13 Tag order: listReleaseTags sorts by phase then patch and ignores other names
      ---
      duration_ms: 3.400417
      type: 'test'
      ...
    # Subtest: EZD-360 T6 compareReleaseTags orders phase-56 after phase-5.3 and before phase-6 (AC-EZD-360-3)
    ok 2 - EZD-360 T6 compareReleaseTags orders phase-56 after phase-5.3 and before phase-6 (AC-EZD-360-3)
      ---
      duration_ms: 0.272458
      type: 'test'
      ...
    # Subtest: EZD-360 T7 a Phase 6 pull request after phase-56 gets phase-6 (AC-EZD-360-3)
    ok 3 - EZD-360 T7 a Phase 6 pull request after phase-56 gets phase-6 (AC-EZD-360-3)
      ---
      duration_ms: 2.20075
      type: 'test'
      ...
    # Subtest: EZD-360 T8 a Phase 56 pull request after phase-5 gets phase-56 (AC-EZD-360-3)
    ok 4 - EZD-360 T8 a Phase 56 pull request after phase-5 gets phase-56 (AC-EZD-360-3)
      ---
      duration_ms: 0.144334
      type: 'test'
      ...
    # Subtest: EZD-360 T9 a Phase 56 pull request after phase-6 is not_newer (AC-EZD-360-3)
    ok 5 - EZD-360 T9 a Phase 56 pull request after phase-6 is not_new
```

## History (last 20 retries)

None yet.
