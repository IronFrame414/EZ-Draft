// EZD-009 Step 8 (vault/plans/EZD-009.md): a Postgres advisory lock so the unscoped sweep tests run while no
// other test file has a due job. Files that insert or enqueue job rows hold it shared; sweep.db.test.ts holds
// it exclusive. Each call opens its own connection, because session-level locks live on one backend; a
// crashed worker's closed connection frees its lock. Pattern: test-harness/rls/db.ts.
import postgres from 'postgres';

export const JOB_QUEUE_TEST_LOCK_KEY = 9009;

async function hold(kind: 'shared' | 'exclusive'): Promise<() => Promise<void>> {
  const url = process.env.EZD_TEST_DB_URL;
  if (!url) throw new Error('EZD_TEST_DB_URL is not set: the app Vitest global setup reads it');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  if (kind === 'shared') await sql`select pg_advisory_lock_shared(${JOB_QUEUE_TEST_LOCK_KEY})`;
  else await sql`select pg_advisory_lock(${JOB_QUEUE_TEST_LOCK_KEY})`;
  return async () => {
    try {
      if (kind === 'shared')
        await sql`select pg_advisory_unlock_shared(${JOB_QUEUE_TEST_LOCK_KEY})`;
      else await sql`select pg_advisory_unlock(${JOB_QUEUE_TEST_LOCK_KEY})`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
}

export const holdJobQueueShared = () => hold('shared');
export const holdJobQueueExclusive = () => hold('exclusive');
