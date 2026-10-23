// EZD-024 Re-validation V7 (vault/plans/EZD-024.md): the error_alert caps (100 new error rows per hour, 20
// emailed alerts per rolling hour) are global and Vitest runs 4 files at once (Q-0114), so every file that
// writes error_alert rows or counts alert emails holds this exclusive advisory lock from the start of its
// beforeAll to the end of its afterAll, after deleting all error_alert rows. Copy of
// test-harness/jobs/queue-lock.ts: each call opens its own connection, because session-level locks live on
// one backend; a crashed worker's closed connection frees its lock.
import postgres from 'postgres';

export const ERROR_ALERT_TEST_LOCK_KEY = 9024;

export async function holdErrorAlertLock(): Promise<() => Promise<void>> {
  const url = process.env.EZD_TEST_DB_URL;
  if (!url) throw new Error('EZD_TEST_DB_URL is not set: the app Vitest global setup reads it');
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`select pg_advisory_lock(${ERROR_ALERT_TEST_LOCK_KEY})`;
  return async () => {
    try {
      await sql`select pg_advisory_unlock(${ERROR_ALERT_TEST_LOCK_KEY})`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  };
}
