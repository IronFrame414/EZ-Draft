// EZD-426 (AC-EZD-426-1): harness cleanups run on several browser-test workers against one database, and
// two of them deleting at once can deadlock (Postgres 40P01; a tenant or project delete cascades through
// many tables in an order no caller controls). Postgres aborts one side; this reruns the whole unit of
// work (one transaction or one statement) at most DEADLOCK_TRIES times in total, with a short jittered
// wait so the two sides do not collide again. Any other error is thrown at once. Test-only.

export const DEADLOCK_CODE = '40P01';
export const DEADLOCK_TRIES = 3;

const isDeadlock = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === DEADLOCK_CODE;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Wait before try n+1 (n = 1, 2): 25-75 ms, then 50-150 ms.
const defaultWait = (attempt: number): number => attempt * (25 + Math.random() * 50);

export async function retryOnDeadlock<T>(
  fn: () => Promise<T>,
  opts: { waitMs?: (attempt: number) => number } = {},
): Promise<T> {
  const waitMs = opts.waitMs ?? defaultWait;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isDeadlock(e) || attempt >= DEADLOCK_TRIES) throw e;
      await sleep(waitMs(attempt));
    }
  }
}
