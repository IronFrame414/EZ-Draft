// EZD-102 D4 (vault/plans/EZD-102.md section 4; AC-EZD-102-6; ticket row "RLS checks tenant and project scope
// only, never permission rows"). Scans every row-level security policy's USING and WITH CHECK text in
// pg_policies, and the source of every private.<name> function they call (and the private functions those
// call), for a read of permission rows: user_permission, permission_key, default_permissions or public.role.
// A control policy that reads user_permission, created and rolled back in one transaction, must be reported
// exactly once, so the scan is shown to see what it looks for. Anything the scan could not inspect (a called
// private function with no source row) is counted and must be 0 (L-019).
// EZD-189 (Q-0323 (1)): policies in the storage schema, and helpers only they call, are skipped; the scan runs
// with an empty search_path so public.role reads back qualified.
import { afterAll, describe, expect, it } from 'vitest';
import { withRollback, type TransactionSql } from '../../../test-harness/rls/db';
import { closeHarness, harnessSql } from '../../../test-harness/rls/fixtures';

const PERMISSION_READ = /user_permission|permission_key|default_permissions|public\.role\b/;
const PRIVATE_CALL = /\bprivate\.([a-z_][a-z0-9_]*)/g;

type Finding = { kind: 'policy' | 'helper'; name: string };
type Scan = { findings: Finding[]; uninspected: string[]; policies: number; skipped: string[] };

const sortFindings = (f: Finding[]) =>
  [...f].sort((a, b) => `${a.kind}:${a.name}`.localeCompare(`${b.kind}:${b.name}`));

const privateCalls = (text: string) => [...text.matchAll(PRIVATE_CALL)].map((m) => m[1]);

async function scan(sql: TransactionSql): Promise<Scan> {
  const skipped: string[] = [];
  await sql.unsafe("set local search_path to ''");
  const all = await sql`
    select schemaname, tablename, policyname, coalesce(qual, '') as qual,
           coalesce(with_check, '') as with_check
    from pg_policies`;
  const policies = all.filter((p) => {
    if (p.schemaname !== 'storage') return true;
    skipped.push(`storage.${p.tablename}.${p.policyname}`);
    return false;
  });
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
  return { findings, uninspected, policies: policies.length, skipped };
}

describe('EZD-102 policies never read permission rows', () => {
  afterAll(async () => {
    await closeHarness();
  });

  it('D4 policies: no table policy or helper it calls reads permission rows; the control is reported once', async () => {
    const real = await withRollback(harnessSql(), (tx) => scan(tx));
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

const HELPER_SQL =
  'create function private.ezd189_probe_helper() returns boolean language sql stable as $$select exists (select 1 from public.user_permission)$$';
const TABLE_SQL = [
  'create table public.ezd189_probe (id int primary key)',
  'alter table public.ezd189_probe enable row level security',
];
const STORAGE_HELPER_POLICY =
  'create policy ezd189_storage_helper on storage.objects for select to authenticated using ((select private.ezd189_probe_helper()))';
const TABLE_HELPER_POLICY =
  'create policy ezd189_probe_helper on public.ezd189_probe for select using ((select private.ezd189_probe_helper()))';

describe('EZD-189 Storage policies may read their screen switch', () => {
  afterAll(async () => {
    await closeHarness();
  });

  it('T1 table policy reads permission rows', async () => {
    const r = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(HELPER_SQL);
      for (const q of TABLE_SQL) await tx.unsafe(q);
      await tx.unsafe(
        'create policy ezd189_probe_role on public.ezd189_probe for select using (exists (select 1 from public.role))',
      );
      await tx.unsafe(TABLE_HELPER_POLICY);
      return scan(tx);
    });
    expect(sortFindings(r.findings)).toEqual([
      { kind: 'helper', name: 'private.ezd189_probe_helper' },
      { kind: 'policy', name: 'public.ezd189_probe.ezd189_probe_role' },
    ]);
    expect(r.uninspected).toEqual([]);
  });

  it('T2 storage.objects policies read permission rows', async () => {
    const r = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(HELPER_SQL);
      await tx.unsafe(
        'create policy ezd189_storage_direct on storage.objects for select to authenticated using (exists (select 1 from public.user_permission))',
      );
      await tx.unsafe(STORAGE_HELPER_POLICY);
      return scan(tx);
    });
    expect(r.findings).toEqual([]);
    expect(r.uninspected).toEqual([]);
    expect(r.skipped).toContain('storage.objects.ezd189_storage_direct');
    expect(r.skipped).toContain('storage.objects.ezd189_storage_helper');
  });

  it('T3 helper shared by a storage and a table policy', async () => {
    const r = await withRollback(harnessSql(), async (tx) => {
      await tx.unsafe(HELPER_SQL);
      for (const q of TABLE_SQL) await tx.unsafe(q);
      await tx.unsafe(STORAGE_HELPER_POLICY);
      await tx.unsafe(TABLE_HELPER_POLICY);
      return scan(tx);
    });
    expect(r.findings).toEqual([{ kind: 'helper', name: 'private.ezd189_probe_helper' }]);
    expect(r.skipped).toContain('storage.objects.ezd189_storage_helper');
  });
});
