// EZD-321 R1-R3 (vault/plans/EZD-321.md section 4; D1, D8), local stack.
// record_error_alert takes a transaction lock per source group before counting the 100-row hourly cap, so
// parallel first-time errors never write more than the cap. Holds the error-alert lock from the start of
// beforeAll to the end of afterAll and clears error_alert in beforeAll, beforeEach and afterAll (D8).
// record, fillErrorRows, rowByFingerprint and fingerprint are copied from tunnel-limits.db.test.ts.
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { holdErrorAlertLock } from '../../../test-harness/errors/alert-lock';
import { adminSql } from '../../../test-harness/rls/db';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  harnessSql,
} from '../../../test-harness/rls/fixtures';

const fingerprint = () => randomBytes(32).toString('hex');
type Row = Record<string, unknown>;

async function clearRows() {
  await harnessSql()`delete from public.error_alert`;
}

async function rowByFingerprint(f: string): Promise<Row | null> {
  const { data, error } = await adminDb()
    .from('error_alert')
    .select('*')
    .eq('fingerprint', f)
    .maybeSingle();
  expect(error).toBeNull();
  return (data as Row | null) ?? null;
}

async function record(
  f: string,
  over: Row = {},
): Promise<{ data: Row[] | null; error: { code?: string } | null }> {
  const { data, error } = await anonDb({ gate: true }).rpc('record_error_alert', {
    p_kind: 'error',
    p_source: 'browser',
    p_fingerprint: f,
    p_title: 'Error: x',
    p_ref: null,
    p_tenant_id: null,
    p_project_id: null,
    ...over,
  });
  return { data: data as Row[] | null, error };
}

async function fillErrorRows(n: number, extra: Row = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({
    kind: 'error',
    source: 'browser',
    fingerprint: fingerprint(),
    title: `Error: filler ${i}`,
    ...extra,
  }));
  const { error } = await adminDb().from('error_alert').insert(rows);
  expect(error, 'admin insert into error_alert').toBeNull();
}

async function group(sources: string[]): Promise<number> {
  const sql = harnessSql();
  const rows = await sql`
    select count(*)::int as n from public.error_alert
    where kind = 'error' and first_seen_at > now() - interval '1 hour'
      and source in ${sql(sources)}`;
  return rows[0].n as number;
}

const CALL =
  "select * from public.record_error_alert('error', 'browser', $1, 'Error: x', null, null, null)";

describe('EZD-321 row cap locks before counting', () => {
  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await holdErrorAlertLock();
    await clearRows();
  }, 180000);

  beforeEach(async () => {
    await clearRows();
  });

  afterAll(async () => {
    try {
      await clearRows();
      await cleanup();
      await closeHarness();
    } finally {
      await release();
    }
  }, 180000);

  it('EZD-321 done when: a first-time error waits for the row cap lock and sees the earlier row', async () => {
    await fillErrorRows(99);
    const fa = fingerprint();
    const fb = fingerprint();
    const sqlA = adminSql();
    const sqlB = adminSql();
    try {
      let resolvePid!: (pid: number) => void;
      const pidReady = new Promise<number>((r) => (resolvePid = r));
      let settled = false;
      let bPromise: Promise<Row[]> | undefined;
      let waited = false;

      const a = await sqlA.begin(async (txA) => {
        await txA`set local role anon`;
        const rowsA = await txA.unsafe(CALL, [fa]);
        bPromise = sqlB.begin(async (txB) => {
          await txB`set local role anon`;
          const [{ pid }] = await txB`select pg_backend_pid() as pid`;
          resolvePid(pid as number);
          return (await txB.unsafe(CALL, [fb])) as unknown as Row[];
        });
        bPromise.then(
          () => (settled = true),
          () => (settled = true),
        );
        const pid = await Promise.race([
          pidReady,
          bPromise.then(
            () => -1,
            () => -1,
          ),
        ]);
        const deadline = Date.now() + 5000;
        while (pid > 0 && !settled && !waited && Date.now() < deadline) {
          const rows = await harnessSql()`
            select 1 from pg_stat_activity
            where pid = ${pid} and wait_event_type = 'Lock' and wait_event = 'advisory'`;
          if (rows.length > 0) waited = true;
          else await new Promise((r) => setTimeout(r, 50));
        }
        return rowsA as unknown as Row[];
      });
      const b = await bPromise!;

      expect(waited, 'B waits on the row cap advisory lock while A holds it').toBe(true);
      expect(a[0].capped).toBe(false);
      expect(a[0].alert_id).not.toBeNull();
      expect(b[0].capped).toBe(true);
      expect(b[0].alert_id).toBeNull();
      expect(await rowByFingerprint(fb)).toBeNull();
      expect(await group(['browser', 'worker'])).toBe(100);
    } finally {
      await sqlA.end({ timeout: 5 });
      await sqlB.end({ timeout: 5 });
    }
  }, 30000);

  it('EZD-321 R2 30 parallel first-time browser and worker errors on 90 rows write exactly 10', async () => {
    await fillErrorRows(90);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        record(fingerprint(), { p_source: i % 2 === 0 ? 'browser' : 'worker' }),
      ),
    );
    for (const r of results) expect(r.error).toBeNull();
    const rows = results.map((r) => r.data![0]);
    expect(rows.filter((r) => r.capped === false && r.alert_id).length).toBe(10);
    expect(rows.filter((r) => r.capped === true && r.alert_id === null).length).toBe(20);
    expect(await group(['browser', 'worker'])).toBe(100);
  }, 30000);

  it('EZD-321 R3 20 parallel first-time function errors on 95 rows write exactly 5', async () => {
    await fillErrorRows(95, { source: 'function' });
    await fillErrorRows(100);
    const results = await Promise.all(
      Array.from({ length: 20 }, () => record(fingerprint(), { p_source: 'function' })),
    );
    for (const r of results) expect(r.error).toBeNull();
    const rows = results.map((r) => r.data![0]);
    expect(rows.filter((r) => r.capped === false).length).toBe(5);
    expect(rows.filter((r) => r.capped === true).length).toBe(15);
    expect(await group(['function'])).toBe(100);
    expect(await group(['browser', 'worker'])).toBe(100);
  }, 30000);
});
