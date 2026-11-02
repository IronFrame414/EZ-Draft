// EZD-286 Step 1 (vault/plans/EZD-286.md D1): a Postgres advisory lock so the root test file that truncates
// the main database (tenancy-bootstrap) runs while no other root test file touches it. Files that run SQL,
// the local API or a `--local` CLI hold it shared; tenancy-bootstrap holds it exclusive. Each call opens its
// own connection, because session-level locks live on one backend; a crashed process's closed connection
// frees its lock. Pattern: app/test-harness/jobs/queue-lock.ts.
import postgres from 'postgres';
import { stackStatus } from '../backup/__tests__/local-fixture.mjs';

export const ROOT_DB_TEST_LOCK_KEY = 286;

async function hold(kind) {
  const sql = postgres(stackStatus().dbUrl, { max: 1, onnotice: () => {} });
  try {
    if (kind === 'shared') await sql`select pg_advisory_lock_shared(${ROOT_DB_TEST_LOCK_KEY})`;
    else await sql`select pg_advisory_lock(${ROOT_DB_TEST_LOCK_KEY})`;
  } catch (e) {
    await sql.end({ timeout: 5 });
    throw e;
  }
  return async () => {
    try {
      if (kind === 'shared') await sql`select pg_advisory_unlock_shared(${ROOT_DB_TEST_LOCK_KEY})`;
      else await sql`select pg_advisory_unlock(${ROOT_DB_TEST_LOCK_KEY})`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
}

export const holdRootDbShared = () => hold('shared');
export const holdRootDbExclusive = () => hold('exclusive');
