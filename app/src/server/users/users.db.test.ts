// EZD-104 D1-D5 (vault/plans/EZD-104.md section 4; AC-EZD-104-1, -2, -3, -6, -7). Expected values: Decided
// "Rows listed" (active and invited only), "Row order" (active first, then invited; lower(name or email), then
// id), "Counts" (whole company, never filtered), "Search" (case-insensitive substring of name or email, % _ \
// literal), "Paging" (50), "canCopyLink" (invited and the viewer holds the Owner preset), "15-minute rule" and
// the touch_last_active body; 09n rows 1-2 and 8; Q-0695 (03 rows 34-35); Q-0706. Calls go through the gated
// serverDb of `signIn`. Preset arrays: app/test-harness/users/fixtures.ts (migration 20261024100001).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PermissionKey } from '../../lib/permissions/catalog';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  createUnlinkedAuthUser,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import {
  addBulkMembers,
  addUser,
  deleteBulkUsers,
  hex8,
  lastActiveOf,
  PRESET_KEYS,
} from '../../../test-harness/users/fixtures';

type ListRow = {
  membershipId: string;
  status: 'active' | 'invited';
  name: string | null;
  email: string;
  language: 'en' | 'es';
  role: { name: string; preset: string | null; defaultPermissions: PermissionKey[] } | null;
  grantedKeys: PermissionKey[];
  lastActiveAt: string | null;
  invitedAt: string | null;
  canCopyLink: boolean;
};
type ListResult = {
  rows: ListRow[];
  total: number;
  active: number;
  invited: number;
  en: number;
  es: number;
};

async function listUsers(s: Session, search = '', page = 1): Promise<ListResult> {
  const { data, error } = await s.serverDb.rpc('list_users', { p_search: search, p_page: page });
  expect(error).toBeNull();
  return data as ListResult;
}
const sorted = (keys: readonly string[]) => [...keys].sort();

describe('EZD-104 list_users rows, order, counts, copy link', () => {
  let viewer: Session;
  let ids: { v: string; d: string; f: string; c: string; x: string; b: string } | null = null;

  beforeAll(async () => {
    const a = await createTenant();
    const b = await createTenant();
    const v = await addUser(a, { preset: 'owner', name: 'Zed Owner', language: 'en' });
    const d = await addUser(a, { preset: 'designer', name: 'Ann Lee', language: 'en' });
    const f = await addUser(a, {
      preset: 'foreman',
      granted: [...PRESET_KEYS.foreman, 'see_company_costs'],
      name: 'Bo Field',
      language: 'es',
      lastActiveAgo: '5 minutes',
    });
    const c = await addUser(a, {
      status: 'invited',
      preset: 'crew',
      name: null,
      language: 'es',
      invitedAgo: '2 days',
    });
    const x = await addUser(a, { status: 'deactivated', preset: 'crew', name: 'Dee Gone' });
    const other = await addUser(b, { preset: 'owner', name: 'Other Co', language: 'es' });
    ids = {
      v: v.membershipId,
      d: d.membershipId,
      f: f.membershipId,
      c: c.membershipId,
      x: x.membershipId,
      b: other.membershipId,
    };
    viewer = await signIn(v.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('D1 list_users rows, order, counts, copy link', async () => {
    const r = await listUsers(viewer);
    expect(ids).not.toBeNull();
    const id = ids!;
    expect(r.rows.map((x) => x.membershipId)).toEqual([id.d, id.f, id.v, id.c]);
    expect([r.active, r.invited, r.en, r.es, r.total]).toEqual([3, 1, 2, 2, 4]);
    expect(r.rows.map((x) => x.membershipId)).not.toContain(id.x);
    expect(r.rows.map((x) => x.membershipId)).not.toContain(id.b);

    const f = r.rows[1];
    expect(f.grantedKeys).toEqual(sorted([...PRESET_KEYS.foreman, 'see_company_costs']));
    expect(f.grantedKeys).toHaveLength(12);
    expect(f.role?.name).toBe('Foreman');
    expect(f.role?.preset).toBe('foreman');
    expect(sorted(f.role?.defaultPermissions ?? [])).toEqual(sorted(PRESET_KEYS.foreman));
    expect(f.lastActiveAt).not.toBeNull();

    const c = r.rows[3];
    expect(c.status).toBe('invited');
    expect(c.canCopyLink).toBe(true);
    expect(c.invitedAt).not.toBeNull();
    for (const row of r.rows.slice(0, 3)) expect(row.canCopyLink).toBe(false);
  });
});

describe('EZD-104 list_users search and paging', () => {
  const prefix = `bulk-${hex8()}`;
  const bobEmail = `bob.smith.${hex8()}@example.com`;
  let viewer: Session;

  beforeAll(async () => {
    const t = await createTenant();
    const v = await addUser(t, { preset: 'owner', name: 'Zed Owner' });
    await addUser(t, { preset: 'crew', name: 'Ann Lee' });
    await addUser(t, { preset: 'crew', name: null, email: bobEmail });
    await addBulkMembers(t, 52, prefix);
    await addUser(t, { preset: 'crew', name: 'Ed 100%' });
    await addUser(t, { preset: 'crew', name: 'Gil \\ Back' });
    viewer = await signIn(v.email);
  }, 180000);

  afterAll(async () => {
    try {
      await cleanup();
      await deleteBulkUsers(prefix);
    } finally {
      await closeHarness();
    }
  });

  it('D2 list_users search and paging', async () => {
    const names = (r: ListResult) => r.rows.map((x) => x.name);
    const ann = await listUsers(viewer, 'ANN');
    expect(names(ann)).toEqual(['Ann Lee']);
    const smith = await listUsers(viewer, 'smith');
    expect(smith.rows.map((x) => x.email)).toEqual([bobEmail]);
    expect(names(await listUsers(viewer, '%'))).toEqual(['Ed 100%']);
    expect(names(await listUsers(viewer, '100%'))).toEqual(['Ed 100%']);
    const underscore = await listUsers(viewer, '_');
    expect(underscore.rows).toHaveLength(0);
    expect(underscore.total).toBe(0);
    expect(names(await listUsers(viewer, '\\'))).toEqual(['Gil \\ Back']);
    const none = await listUsers(viewer, 'zzz');
    expect(none.rows).toHaveLength(0);
    expect(none.total).toBe(0);
    expect(none.active).toBe(57);

    const p1 = await listUsers(viewer, '', 1);
    const p2 = await listUsers(viewer, '', 2);
    expect(p1.rows).toHaveLength(50);
    expect(p2.rows).toHaveLength(7);
    expect(p1.total).toBe(57);
    expect(p2.total).toBe(57);
  });
});

describe('EZD-104 list_users without the Owner preset', () => {
  let viewer: Session;

  beforeAll(async () => {
    const t = await createTenant();
    const { data, error } = await adminDb()
      .from('role')
      .insert({ tenant_id: t, name: 'Office lead', default_permissions: ['settings_users'] })
      .select('id')
      .single();
    if (error || !data) throw new Error(`role insert failed: ${error?.message}`);
    const w = await addUser(t, {
      customRoleId: data.id as string,
      granted: ['settings_users'],
      name: 'Wes Lead',
    });
    await addUser(t, { status: 'invited', preset: 'crew', name: null, invitedAgo: '1 day' });
    viewer = await signIn(w.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('D3 list_users for a holder without the Owner preset', async () => {
    const r = await listUsers(viewer);
    const invited = r.rows.filter((x) => x.status === 'invited');
    expect(invited).toHaveLength(1);
    expect(invited[0].canCopyLink).toBe(false);
  });
});

describe('EZD-104 touch_last_active', () => {
  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('D4 touch_last_active writes at most once per 15 minutes', async () => {
    const t = await createTenant();
    const m = await addUser(t, { preset: 'crew', name: 'Tess Touch' });
    const s = await signIn(m.email);
    const sql = harnessSql();
    expect(await lastActiveOf(m.membershipId)).toBeNull();

    const first = await s.serverDb.rpc('touch_last_active');
    expect(first.error).toBeNull();
    expect(first.data).toBe(true);
    expect(await lastActiveOf(m.membershipId)).not.toBeNull();

    const second = await s.serverDb.rpc('touch_last_active');
    expect(second.data).toBe(false);

    await sql`update public.membership set last_active_at = now() - interval '10 minutes'
      where id = ${m.membershipId}::uuid`;
    const setTen = (await lastActiveOf(m.membershipId)) as Date;
    const third = await s.serverDb.rpc('touch_last_active');
    expect(third.data).toBe(false);
    expect((await lastActiveOf(m.membershipId))?.getTime()).toBe(setTen.getTime());

    await sql`update public.membership set last_active_at = now() - interval '16 minutes'
      where id = ${m.membershipId}::uuid`;
    const setSixteen = (await lastActiveOf(m.membershipId)) as Date;
    const fourth = await s.serverDb.rpc('touch_last_active');
    expect(fourth.data).toBe(true);
    expect(((await lastActiveOf(m.membershipId)) as Date).getTime()).toBeGreaterThan(
      setSixteen.getTime(),
    );

    const perms = await s.serverDb.rpc('current_permissions');
    expect(perms.error).toBeNull();
    const rows = perms.data as { membership_id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].membership_id).toBe(m.membershipId);
  });

  it('D5 touch_last_active writes nothing without a live active membership', async () => {
    const t = await createTenant();
    const m = await createMember({ tenantId: t, scope: 'all' });
    const s = await signIn(m.email);
    const sql = harnessSql();
    // The status trigger ends the member's sessions.
    await sql`update public.membership set status = 'deactivated', last_active_at = now() - interval '16 minutes'
      where id = ${m.membershipId}::uuid`;
    const set = (await lastActiveOf(m.membershipId)) as Date;
    const a = await s.serverDb.rpc('touch_last_active');
    expect(a.data).toBe(false);
    expect((await lastActiveOf(m.membershipId))?.getTime()).toBe(set.getTime());

    const unlinked = await createUnlinkedAuthUser();
    const u = await signIn(unlinked.email);
    const b = await u.serverDb.rpc('touch_last_active');
    expect(b.data).toBe(false);
  });
});
