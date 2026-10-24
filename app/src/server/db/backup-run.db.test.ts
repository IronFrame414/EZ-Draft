// EZD-025 T10 (vault/plans/EZD-025.md Tests, Step 1): backup_run is locked down. Tenant-less table, RLS with
// one deny-all policy, no API role holds a privilege, service_role holds all four, the checks refuse bad rows.
// Local database through the EZD-006 harness. Expected values: plan Step 1 and EZD-006 Steps 5 and 6.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminSql, type Sql } from '../../../test-harness/rls/db';
import { auditRls } from '../../../test-harness/rls/audit';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  signIn,
} from '../../../test-harness/rls/fixtures';
import { TABLE_GRANTS } from '../../../test-harness/rls/table-grants';
import { TENANTLESS_TABLES } from '../../../test-harness/rls/tenancy-exemptions';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('EZD-025 backup_run is locked down', () => {
  let sql: Sql;

  beforeAll(() => {
    sql = adminSql();
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
    await cleanup();
    await closeHarness();
  });

  it('EZD-025 T10 the audit is clean and the exemption and grant entries have reasons', async () => {
    const problems = await auditRls(sql, { repoRoot });
    expect(problems).toEqual([]);

    const exempt = TENANTLESS_TABLES.find((t) => t.table === 'backup_run');
    expect(exempt?.reason.length ?? 0).toBeGreaterThan(0);
    expect(TABLE_GRANTS.backup_run?.privileges).toEqual([]);
    expect(TABLE_GRANTS.backup_run?.reason.length ?? 0).toBeGreaterThan(0);
  });

  it('EZD-025 T10 anon and authenticated hold no privilege, service_role holds all four', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['select', 'insert']) {
        const r = await sql`select has_table_privilege(${role}, 'public.backup_run', ${priv}) as ok`;
        expect(r[0].ok, `${role} ${priv}`).toBe(false);
      }
    }
    for (const priv of ['select', 'insert', 'update', 'delete']) {
      const r =
        await sql`select has_table_privilege('service_role', 'public.backup_run', ${priv}) as ok`;
      expect(r[0].ok, `service_role ${priv}`).toBe(true);
    }
  });

  it('EZD-025 T10 a signed-in member cannot read or write backup_run', async () => {
    const tenantId = await createTenant();
    const member = await createMember({ tenantId, scope: 'all' });
    const session = await signIn(member.email);

    const read = await session.serverDb.from('backup_run').select('*');
    const refused = read.error?.code === '42501';
    const empty = read.error === null && (read.data ?? []).length === 0;
    expect(refused || empty, `select: ${JSON.stringify(read.error)}`).toBe(true);

    const write = await session.serverDb.from('backup_run').insert({ kind: 'files' });
    expect(write.error?.code).toBe('42501');
  });

  it('EZD-025 T10 the table checks refuse a bad kind, a running row with an end time and a message error', async () => {
    await expect(sql`insert into public.backup_run (kind) values ('x')`).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      sql`insert into public.backup_run (kind, status, finished_at) values ('files', 'running', now())`,
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`insert into public.backup_run (kind, status, finished_at, error)
          values ('files', 'failed', now(), 'Bad Message')`,
    ).rejects.toMatchObject({ code: '23514' });
  });
});
