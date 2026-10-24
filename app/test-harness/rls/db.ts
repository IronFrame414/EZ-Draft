// EZD-006 Step 7 (vault/plans/EZD-006.md): the harness's direct database client (postgres.js) to the
// local stack, from EZD_TEST_DB_URL set by test-harness/supabase-env.global-setup.ts. Test-only; never
// imported by app code. max 2 connections per client (Q-0019).
import postgres from 'postgres';

export type Sql = postgres.Sql;
export type TransactionSql = postgres.TransactionSql;

export function adminSql(): Sql {
  const url = process.env.EZD_TEST_DB_URL;
  if (!url) {
    throw new Error(
      'EZD_TEST_DB_URL is not set: the app Vitest global setup reads it from the local stack',
    );
  }
  return postgres(url, { max: 2, onnotice: () => {} });
}

// Runs fn inside one transaction and always rolls it back; returns fn's result. Other connections never
// see the changes (T16, T22 (i), T23 (e)).
export async function withRollback<T>(
  sql: Sql,
  fn: (tx: TransactionSql) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let ran = false;
  try {
    await sql.begin(async (tx) => {
      result = await fn(tx);
      ran = true;
      throw new RollbackSignal();
    });
  } catch (e) {
    if (!(e instanceof RollbackSignal)) throw e;
  }
  if (!ran) throw new Error('withRollback: transaction body did not complete');
  return result as T;
}

class RollbackSignal extends Error {
  constructor() {
    super('rollback');
  }
}
