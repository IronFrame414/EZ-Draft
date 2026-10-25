// EZD-102 D4 (vault/plans/EZD-102.md section 4; AC-EZD-102-6; ticket row "RLS checks tenant and project scope
// only, never permission rows"). Scans every row-level security policy's USING and WITH CHECK text in
// pg_policies, and the source of every private.<name> function they call (and the private functions those
// call), for a read of permission rows: user_permission, permission_key, default_permissions or public.role.
// A control policy that reads user_permission, created and rolled back in one transaction, must be reported
// exactly once, so the scan is shown to see what it looks for. Anything the scan could not inspect (a called
// private function with no source row) is counted and must be 0 (L-019).
import { afterAll, describe, expect, it } from 'vitest';
import { withRollback, type Sql, type TransactionSql } from '../../../test-harness/rls/db';
import { closeHarness, harnessSql } from '../../../test-harness/rls/fixtures';

const PERMISSION_READ = /user_permission|permission_key|default_permissions|public\.role\b/;
const PRIVATE_CALL = /\bprivate\.([a-z_][a-z0-9_]*)/g;

type Finding = { kind: 'policy' | 'helper'; name: string };
type Scan = { findings: Finding[]; uninspected: string[]; policies: number };

const privateCalls = (text: string) => [...text.matchAll(PRIVATE_CALL)].map((m) => m[1]);

async function scan(sql: Sql | TransactionSql): Promise<Scan> {
  const policies = await sql`
    select schemaname, tablename, policyname, coalesce(qual, '') as qual,
           coalesce(with_check, '') as with_check
    from pg_policies`;
  const findings: Finding[] = [];
  const pending = new Set<string>();
  for (const p of policies) {
    const text = `${p.qual}\n${p.with_check}`;
    const name = `${p.schemaname}.${p.tablename}.${p.policyname}`;
    if (PERMISSION_READ.test(text)) findings.push({ kind: 'policy', name });
    for (const fn of privateCalls(text)) pending.add(fn);
  }
  const seen = new Set<string>();
  const uninspected: string[] = [];
  while (pending.size > 0) {
    const batch = [...pending].filter((n) => !seen.has(n));
    pending.clear();
    if (batch.length === 0) break;
    for (const n of batch) seen.add(n);
    const rows = await sql`
      select p.proname, p.prosrc
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = any(${batch}::text[])`;
    const found = new Set(rows.map((r) => r.proname as string));
    for (const n of batch) if (!found.has(n)) uninspected.push(n);
    for (const r of rows) {
      const src = String(r.prosrc ?? '');
      if (PERMISSION_READ.test(src))
        findings.push({ kind: 'helper', name: `private.${r.proname}` });
      for (const fn of privateCalls(src)) if (!seen.has(fn)) pending.add(fn);
    }
  }
  return { findings, uninspected, policies: policies.length };
}

describe('EZD-102 policies never read permission rows', () => {
  afterAll(async () => {
    await closeHarness();
  });

  it('D4 policies: no policy or helper it calls reads permission rows; the control is reported once', async () => {
    const real = await scan(harnessSql());
    expect(real.policies).toBeGreaterThan(0);
    expect(real.uninspected).toEqual([]);
    expect(real.findings.filter((f) => f.kind === 'policy')).toEqual([]);
    expect(real.findings.filter((f) => f.kind === 'helper')).toEqual([]);

    const control = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe('create table public.ezd102_probe (id int primary key)');
      await tx.unsafe('alter table public.ezd102_probe enable row level security');
      await tx.unsafe(
        'create policy ezd102_probe_select on public.ezd102_probe for select using (exists (select 1 from public.user_permission))',
      );
      return scan(tx);
    });
    expect(control.findings).toEqual([
      { kind: 'policy', name: 'public.ezd102_probe.ezd102_probe_select' },
    ]);
  });
});
