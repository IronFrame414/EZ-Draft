# Set-aside tickets

Tickets the build loop could not finish. Each keeps its branch and worktree for review.
To retry one, delete its entry from vault/build/state.json `set_aside` (the loop picks it up again).

## EZD-421 · Fix: route bodies that call an RPC after the session read can answer 500 and alert for an ended session
- When: 2026-11-13T06:08:05Z
- Reason: check red after a review fix
- Branch: t/EZD-421 · worktree: .claude/worktrees/EZD-421
- Last output:
```
test-harness/e2e/perf-profile.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/lib/app-version.test.ts [2m([22m[2m3 tests[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/app/dev/errors/page.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/editor/editor-messages.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/lib/company/company-keys.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/server/messages/terms-messages.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/lib/projects/projects-search.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 1[2mms[22m[39m

 [32m✓[39m src/lib/pwa/sw-file.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 1[2mms[22m[39m

 [32m✓[39m src/components/outbox/OutboxDrain.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/server/messages/length-message.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/app/dev/notifications/page.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/components/auth/SignOutButton.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 1[2mms[22m[39m


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m


[41m[1m FAIL [22m[49m src/app/api/projects/[id]/assistant/route-photo.test.ts[2m > [22mEZD-5603b assistant route photo[2m > [22mT20 the photo is kept nowhere: no table, no storage object, no job, no report, no log line

[31m[1mAssertionError[22m: expected 1 to be +0 // Object.is equality[39m

[32m- Expected[39m
[31m+ Received[39m

[32m- 0[39m
[31m+ 1[39m


[36m [2m❯[22m src/app/api/projects/[id]/assistant/route-photo.test.ts:[2m455:29[22m[39m

    [90m453|[39m     }
    [90m454|[39m     expect(await storageCount()).toBe(objectsBefore);
    [90m455|[39m     expect(await allJobs()).toBe(jobsBefore);
    [90m   |[39m                             [31m^[39m
    [90m456|[39m   }, 180000);
    [90m457|[39m });



[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m




[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m430 passed[39m[22m[90m (431)[39m

[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m2064 passed[39m[22m[90m (2065)[39m

[2m   Start at [22m 01:06:55

[2m   Duration [22m 69.80s[2m (tests 88%, import
```

## EZD-105 · Invite user
- When: 2026-11-13T07:41:47Z
- Reason: check still red after 2 fix rounds
- Branch: t/EZD-105 · worktree: .claude/worktrees/EZD-105
- Last output:
```
m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/server/jobs/kick.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 3[2mms[22m[39m

 [32m✓[39m src/components/states/async-state.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/app/dev/storage/page.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 1[2mms[22m[39m

 [32m✓[39m src/app/dev/jobs/page.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/lib/errors/browser-options.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/components/auth/SignOutButton.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 2[2mms[22m[39m

 [32m✓[39m src/server/messages/length-message.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 1[2mms[22m[39m

 [32m✓[39m src/app/dev/notifications/page.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 1[2mms[22m[39m

 [32m✓[39m src/app/dev/realtime/page.test.tsx [2m([22m[2m1 test[22m[2m)[22m[32m 1[2mms[22m[39m


[31m⎯⎯⎯⎯⎯⎯⎯[39m[1m[41m Failed Tests 1 [49m[22m[31m⎯⎯⎯⎯⎯⎯⎯[39m


[41m[1m FAIL [22m[49m src/server/db/rls.audit.test.ts[2m > [22mEZD-006 RLS audit[2m > [22mT18 exemption and grant lists match the catalog @smoke

[31m[1mAssertionError[22m: expected [ 'ai_assistant_slot', …(23) ] to deeply equal [ 'ai_assistant_slot', …(21) ][39m

[32m- Expected[39m
[31m+ Received[39m

[33m@@ -6,10 +6,12 @@[39m
[2m    "backup_run",[22m
[2m    "customer",[22m
[2m    "edit_lock",[22m
[2m    "error_alert",[22m
[2m    "error_tunnel_throttle",[22m
[31m+   "event_log",[39m
[31m+   "invite",[39m
[2m    "job",[22m
[2m    "membership",[22m
[2m    "membership_project",[22m
[2m    "model_object",[22m
[2m    "model_version",[22m


[36m [2m❯[22m src/server/db/rls.audit.test.ts:[2m205:46[22m[39m

    [90m203|[39m     }
    [90m204|[39m
    [90m205|[39m     expect(Object.keys(TABLE_GRANTS).sort()).toEqual([
    [90m   |[39m                                              [31m^[39m
    [90m206|[39m       'ai_assistant_slot',
    [90m207|[39m       'ai_key_attempt',



[31m[2m⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯[22m[39m




[2m Test Files [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m433 passed[39m[22m[90m (434)[39m

[2m      Tests [22m [1m[31m1 failed[39m[22m[2m | [22m[1m[32m2101 passed[39m[22m[90m (2102)[39m

[2m   Start at [22m 02:40:38

[2m   Duration [22m 68.51s[2m (tests 88%, import
```
