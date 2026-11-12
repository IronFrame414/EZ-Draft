// EZD-135 D3 (vault/plans/EZD-135.md section 4; AC-EZD-135-2, AC-EZD-135-4; Q-0664; Q-0672 (b)). Local stack.
// Every case runs in one rolled-back transaction as role authenticated with the token's claims (pattern:
// app/test-harness/rls/fixtures.ts asClaims, lines 219-230). Expected values: plan section 1 Database functions
// and Decided "Backup rows counted"; 20261019170003_create_rls_helpers.sql lines 21-33 (private.tenant_id()).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withRollback, type TransactionSql } from '../../../test-harness/rls/db';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  claimsOf,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
} from '../../../test-harness/rls/fixtures';

type Probe = { token: string | null; seed: boolean };

async function statusRows(p: Probe): Promise<Record<string, unknown>[]> {
  return withRollback(harnessSql(), async (tx: TransactionSql) => {
    await tx.unsafe('lock table public.backup_run in exclusive mode');
    await tx`delete from public.backup_run`;
    if (p.seed) {
      await tx`insert into public.backup_run (kind, scope, status, started_at, finished_at, bytes_copied, location) values
        ('files', 'all', 'succeeded', '2999-01-02T00:00:00Z', '2999-01-02T00:00:00Z', 7340032, null),
        ('files', 'all', 'succeeded', '2999-01-01T00:00:00Z', '2999-01-01T00:00:00Z', 1, null),
        ('files', 'all', 'failed', '2999-01-03T00:00:00Z', '2999-01-03T00:00:00Z', 0, null),
        ('files', 'buckets:ezd135', 'succeeded', '2999-01-04T00:00:00Z', '2999-01-04T00:00:00Z', 5, null),
        ('db_dump', 'all', 'succeeded', '2999-01-02T00:00:00Z', '2999-01-02T00:00:00Z', 123456789, 'db/29990102T080000Z'),
        ('restore_drill', 'all', 'succeeded', '2999-01-05T00:00:00Z', '2999-01-05T00:00:00Z', 0, 'db/29990102T080000Z'),
        ('restore_drill', 'all', 'failed', '2999-01-06T00:00:00Z', '2999-01-06T00:00:00Z', 0, null)`;
      await tx`insert into public.backup_run (kind, scope) values ('files', 'all'), ('restore_drill', 'all')`;
    }
    await tx.unsafe('set local role authenticated');
    if (p.token !== null) {
      const claims = JSON.stringify(claimsOf(p.token));
      await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    }
    return [
      ...(await tx`select kind, status, finished_at::text as finished_at, bytes_copied::text as bytes_copied, location from public.system_backup_status() order by kind`),
    ];
  });
}

describe('EZD-135 system_backup_status', () => {
  let token: string;
  let tokenOther: string;

  beforeAll(async () => {
    const tenant = await createTenant();
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['settings_system_status']);
    token = (await signIn(m.email)).accessToken;
    const m2 = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m2.membershipId, ['settings_company']);
    tokenOther = (await signIn(m2.email)).accessToken;
  }, 180000);

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('D3 (a) latest rows per kind', async () => {
    expect(await statusRows({ token, seed: true })).toEqual([
      {
        kind: 'db_dump',
        status: 'succeeded',
        finished_at: '2999-01-02 00:00:00+00',
        bytes_copied: '123456789',
        location: 'db/29990102T080000Z',
      },
      {
        kind: 'files',
        status: 'succeeded',
        finished_at: '2999-01-02 00:00:00+00',
        bytes_copied: '7340032',
        location: null,
      },
      {
        kind: 'restore_drill',
        status: 'failed',
        finished_at: '2999-01-06 00:00:00+00',
        bytes_copied: '0',
        location: null,
      },
    ]);
  });

  it('D3 (b) no rows', async () => {
    expect(await statusRows({ token, seed: false })).toEqual([]);
  });

  it('D3 (c) refused without the switch', async () => {
    await expect(statusRows({ token: tokenOther, seed: false })).rejects.toMatchObject({
      code: '42501',
      message: 'permission_denied',
    });
  });

  it('D3 (d) refused without claims', async () => {
    await expect(statusRows({ token: null, seed: false })).rejects.toMatchObject({
      code: '42501',
      message: 'session_ended',
    });
  });

  it('D3 (e) execute grants', async () => {
    const rows =
      await harnessSql()`select has_function_privilege('anon', 'public.system_backup_status()', 'execute') as anon, has_function_privilege('service_role', 'public.system_backup_status()', 'execute') as service, has_function_privilege('authenticated', 'public.system_backup_status()', 'execute') as auth`;
    expect({ ...rows[0] }).toEqual({ anon: false, service: false, auth: true });
  });
});
