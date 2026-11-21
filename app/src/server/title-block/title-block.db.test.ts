// EZD-709 (AC-EZD-709-1; CLAUDE.md rule 4). Expected values: S15b Decision 1 (the company-block switch is the
// one setting), S15b Permissions (Manage users and settings: settings_title_block) and the migration header
// (20261121170000_create_title_block_settings.sql: a missing value reads as on; nothing changed is no update).
// Calls go through the gated serverDb of `signIn`, as the routes do.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { loadTitleBlockSettings } from './title-block';

type Row = { tenant_id: string; title_block: unknown; changed: string[] };

describe('EZD-709 update_tenant_title_block', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Session; // settings_title_block
  let plain: Session; // no settings_title_block
  let ownerB: Session; // another company, settings_title_block

  const setShow = (s: Session, show: boolean | null) =>
    s.serverDb.rpc('update_tenant_title_block', { p_show_company: show as never });
  const tenantRow = async (id: string) =>
    (await harnessSql()`select title_block, updated_at from public.tenant where id = ${id}::uuid`)[0];

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['view_projects', 'settings_title_block']);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, ['view_projects', 'settings_company']);
    const m3 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m3.membershipId, ['settings_title_block']);
    owner = await signIn(m1.email);
    plain = await signIn(m2.email);
    ownerB = await signIn(m3.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('a new company reads the switch as on; on again is no change and no update', async () => {
    expect((await tenantRow(tenantA)).title_block).toEqual({});
    expect((await loadTitleBlockSettings(owner.serverDb))?.config).toEqual({ showCompany: true });
    const before = await tenantRow(tenantA);
    const same = await setShow(owner, true);
    expect(same.error).toBeNull();
    expect((same.data as Row[])[0].changed).toEqual([]);
    expect(await tenantRow(tenantA)).toEqual(before);
  });

  it('switching off stores show_company false, keeps other keys and reads back off', async () => {
    await harnessSql()`update public.tenant set title_block = '{"other": 1}'::jsonb where id = ${tenantA}::uuid`;
    const r = await setShow(owner, false);
    expect(r.error).toBeNull();
    const row = (r.data as Row[])[0];
    expect(row.tenant_id).toBe(tenantA);
    expect(row.changed).toEqual(['show_company']);
    expect(row.title_block).toEqual({ other: 1, show_company: false });
    expect((await loadTitleBlockSettings(owner.serverDb))?.config).toEqual({ showCompany: false });

    const back = await setShow(owner, true);
    expect((back.data as Row[])[0].changed).toEqual(['show_company']);
    expect((await tenantRow(tenantA)).title_block).toEqual({ other: 1, show_company: true });
  });

  it('refuses a member without settings_title_block (42501) and a null value (22023)', async () => {
    const before = await tenantRow(tenantA);
    expect((await setShow(plain, false)).error?.code).toBe('42501');
    expect((await setShow(owner, null)).error?.code).toBe('22023');
    expect(await tenantRow(tenantA)).toEqual(before);
  });

  it("one company cannot change or read another company's title block", async () => {
    const aBefore = await tenantRow(tenantA);
    const r = await setShow(ownerB, false);
    expect(r.error).toBeNull();
    expect((r.data as Row[])[0].tenant_id).toBe(tenantB);
    expect(await tenantRow(tenantA)).toEqual(aBefore);
    expect((await tenantRow(tenantB)).title_block).toEqual({ show_company: false });
    const read = await ownerB.serverDb.from('tenant').select('id, title_block').eq('id', tenantA);
    expect(read.data ?? []).toEqual([]);
  });
});
