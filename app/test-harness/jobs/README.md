# Job test harness (EZD-009)

- `fake-clock.ts`: `createFakeClock(startMs?)` returns `{ now, sleep }`; `sleep` advances `now` at once.
- Every test that calls `runJobs` against the database passes `onlyTenantId` = its own fresh tenant, so
  parallel test files never claim each other's jobs (vault/plans/EZD-009.md Step 8). Later job tickets
  (EZD-021) do the same. The sweep-route tests are the exception and live in one file, run in order.
- Delete a tenant's jobs before `cleanup()`.
- Queue lock (`queue-lock.ts`): a file that inserts or enqueues `job` rows calls `holdJobQueueShared()`
  first in `beforeAll` (hook timeout 180000 ms) and releases last in `afterAll`, after deleting its jobs.
  The unscoped sweep tests (`sweep.db.test.ts`) hold `holdJobQueueExclusive()`, so they see only their own rows.
