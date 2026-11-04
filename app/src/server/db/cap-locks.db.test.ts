// EZD-321 C1-C4 (vault/plans/EZD-321.md section 4; D3-D6), local stack.
// auditCapLocks / capLockProblems (app/test-harness/rls/cap-locks.ts): a function that counts rows for a cap
// locks before its first count(...); no policy counts; read-only counters are a listed allow-list.
import { afterAll, describe, expect, it } from 'vitest';
import { adminSql, withRollback } from '../../../test-harness/rls/db';
import {
  auditCapLocks,
  CAP_LOCK_READ_ONLY,
  capLockProblems,
} from '../../../test-harness/rls/cap-locks';

const sql = adminSql();
const PROBE = 'private.ezd321_pn()';
const COUNT_EXPR = '(select count(*) from public.error_alert) < 100';
const body = (x: string) => `begin ${x} return ${COUNT_EXPR}; end`;

type Probe = { returns?: string; language?: string; volatility?: string; body: string };

// Creates the probe in the open transaction and returns the audit problems for it alone.
async function probeProblems(p: Probe) {
  return withRollback(sql, async (tx) => {
    await tx.unsafe(
      `create function private.ezd321_pn() returns ${p.returns ?? 'boolean'} language ${
        p.language ?? 'plpgsql'
      } ${p.volatility ?? 'volatile'} as $$${p.body}$$`,
    );
    const all = await auditCapLocks(tx);
    return all.filter((x) => x.fn === PROBE);
  });
}

const COUNTS = [{ fn: PROBE, code: 'count_without_lock' }];

describe('EZD-321 cap lock audit', () => {
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it('EZD-321 every counting function locks first or is a listed read-only counter @smoke', async () => {
    expect(await auditCapLocks(sql)).toEqual([]);
  }, 30000);

  it('EZD-321 done when: a function that counts without a lock first makes the audit fail', async () => {
    const probes: Record<string, Probe> = {
      p1: { body: body('') },
      p2: { body: body('perform pg_advisory_lock(321);') },
      p3: {
        body: `begin if (select count(*) from public.error_alert) < 100 then perform pg_advisory_xact_lock(321); end if; return true; end`,
      },
      p4: { body: body('-- perform pg_advisory_xact_lock(321);\n') },
      p5: { body: body(`raise notice 'pg_advisory_xact_lock(321)';`) },
      p6: { body: `begin return (SELECT COUNT (*) FROM public.error_alert) < 100; end` },
      p7: {
        body: `declare n bigint; begin execute 'select count(*) from public.error_alert' into n; return n < 100; end`,
      },
      p8: { language: 'sql', volatility: 'volatile', body: `select ${COUNT_EXPR}` },
      p9: {
        returns: 'trigger',
        body: `begin if (select count(*) from public.error_alert) >= 100 then raise exception 'cap'; end if; return new; end`,
      },
      p10: { language: 'sql', volatility: 'stable', body: `select ${COUNT_EXPR}` },
      p15: { body: `begin return (select "count"(*) from public.error_alert) < 100; end` },
    };
    for (const [name, p] of Object.entries(probes)) {
      expect(await probeProblems(p), name).toEqual(COUNTS);
    }
  }, 30000);

  it('EZD-321 C2 a begin atomic (SQL-standard) body that counts without a lock is found', async () => {
    const found = await withRollback(sql, async (tx) => {
      await tx.unsafe(
        `create function private.ezd321_pn() returns boolean language sql begin atomic select ${COUNT_EXPR}; end`,
      );
      const all = await auditCapLocks(tx);
      return all.filter((x) => x.fn === PROBE);
    });
    expect(found).toEqual(COUNTS);
  }, 30000);

  it('EZD-321 C3 a lock before the count, or a count only in a comment, passes', async () => {
    const probes: Record<string, Probe> = {
      p11: { body: body('perform pg_advisory_xact_lock(321);') },
      p12: { body: body('lock table public.error_alert in share row exclusive mode;') },
      p13: {
        body: body(
          `perform 1 from public.tenant t where t.id = '00000000-0000-0000-0000-000000000000' for update;`,
        ),
      },
      p14: { body: `begin /* count(*) */ return true; end` },
    };
    for (const [name, p] of Object.entries(probes)) {
      expect(await probeProblems(p), name).toEqual([]);
    }
  }, 30000);

  it('EZD-321 C4 read-only list, policies and unreadable text', async () => {
    // (a) a listed read-only counter that is no longer stable/immutable
    const a = await withRollback(sql, async (tx) => {
      await tx.unsafe('alter function public.list_customers(text, boolean, integer) volatile');
      return auditCapLocks(tx);
    });
    expect(a).toEqual([
      { fn: 'public.list_customers(text, boolean, integer)', code: 'listed_counter_volatile' },
    ]);

    // (b) a listed entry with no counting function
    const b = await auditCapLocks(sql, {
      readOnly: [...CAP_LOCK_READ_ONLY, { fn: 'private.ezd321_missing()', reason: 'x' }],
    });
    expect(b).toEqual([{ fn: 'private.ezd321_missing()', code: 'stale_read_only_counter' }]);

    // (c) policies that count, directly or through a counting function
    const c = await withRollback(sql, async (tx) => {
      await tx.unsafe('create table private.ezd321_t (id int)');
      await tx.unsafe('alter table private.ezd321_t enable row level security');
      await tx.unsafe(
        `create policy ezd321_a on private.ezd321_t for insert to authenticated with check ((select count(*) from public.error_alert) < 100)`,
      );
      await tx.unsafe(
        `create policy ezd321_b on private.ezd321_t for select to authenticated using ((public.list_customers(null, false, 1)) is not null)`,
      );
      return auditCapLocks(tx);
    });
    expect(c).toEqual([
      { fn: 'policy private.ezd321_t ezd321_a', code: 'policy_counts' },
      { fn: 'policy private.ezd321_t ezd321_b', code: 'policy_counts' },
    ]);

    // (d) pure: unreadable text
    expect(
      capLockProblems([{ fn: 'x.f()', name: 'f', volatility: 'v', body: "select 'abc" }], []),
    ).toEqual([{ fn: 'x.f()', code: 'unreadable_body' }]);
  }, 30000);
});
