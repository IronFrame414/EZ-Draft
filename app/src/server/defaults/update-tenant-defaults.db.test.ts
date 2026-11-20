// EZD-116 (AC-EZD-116-3, -5, -7; CLAUDE.md rule 4). Expected values: the migration header (settings_defaults
// checked, 42501 without it; a key outside the registry or of the wrong JSON type 22023; only the keys sent are
// written; `changed` sorted; one company cannot read or change another's defaults); create_project stores the
// per-project copy under project.settings.defaults and a later company change leaves it alone (S15d Decision
// 4; 09o Copy at creation row 1). Calls go through the gated serverDb of `signIn`, as a route does.
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

type Row = { tenant_id: string; tenant_defaults: Record<string, unknown>; changed: string[] };

describe('EZD-116 update_tenant_defaults', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Session;
  let plain: Session;
  let ownerB: Session;

  const call = (s: Session, set: Record<string, unknown>, remove: string[] = []) =>
    s.serverDb.rpc('update_tenant_defaults', { p_set: set as never, p_remove: remove });
  const stored = async (id: string) =>
    (await harnessSql()`select defaults from public.tenant where id = ${id}::uuid`)[0]
      .defaults as Record<string, unknown>;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['settings_defaults', 'create_projects']);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, []);
    const m3 = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, m3.membershipId, ['settings_defaults']);
    owner = await signIn(m1.email);
    plain = await signIn(m2.email);
    ownerB = await signIn(m3.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('writes only the keys sent, removes keys, reports changed keys sorted', async () => {
    const first = await call(owner, { waste_tile: 10, measurement_tolerance: 0.125 });
    expect(first.error).toBeNull();
    const r1 = (first.data as Row[])[0];
    expect(r1.tenant_id).toBe(tenantA);
    expect(r1.changed).toEqual(['measurement_tolerance', 'waste_tile']);
    expect(await stored(tenantA)).toEqual({ waste_tile: 10, measurement_tolerance: 0.125 });

    // a second save of one key leaves the other alone
    const second = await call(owner, { waste_tile: 12 });
    expect((second.data as Row[])[0].changed).toEqual(['waste_tile']);
    expect(await stored(tenantA)).toEqual({ waste_tile: 12, measurement_tolerance: 0.125 });

    // nothing changed
    const same = await call(owner, { waste_tile: 12 });
    expect((same.data as Row[])[0].changed).toEqual([]);

    // removing a key
    const removed = await call(owner, {}, ['measurement_tolerance']);
    expect((removed.data as Row[])[0].changed).toEqual(['measurement_tolerance']);
    expect(await stored(tenantA)).toEqual({ waste_tile: 12 });
  });

  it('refuses a member without settings_defaults (42501) and leaves the row alone', async () => {
    const before = await stored(tenantA);
    const r = await call(plain, { waste_tile: 50 });
    expect(r.error?.code).toBe('42501');
    expect(await stored(tenantA)).toEqual(before);
  });

  it('refuses a key outside the registry, a value of the wrong type and a key both set and removed (22023)', async () => {
    const before = await stored(tenantA);
    expect((await call(owner, { not_a_key: 1 })).error?.code).toBe('22023');
    expect((await call(owner, { waste_tile: '10' })).error?.code).toBe('22023');
    expect((await call(owner, { ipad_input: 1 })).error?.code).toBe('22023');
    expect((await call(owner, {}, ['not_a_key'])).error?.code).toBe('22023');
    expect((await call(owner, { waste_tile: 1 }, ['waste_tile'])).error?.code).toBe('22023');
    expect(await stored(tenantA)).toEqual(before);
  });

  it('one company cannot change or read another company\'s defaults', async () => {
    const aBefore = await stored(tenantA);
    const r = await call(ownerB, { waste_tile: 33 });
    expect(r.error).toBeNull();
    expect((r.data as Row[])[0].tenant_id).toBe(tenantB);
    expect(await stored(tenantA)).toEqual(aBefore);
    expect(await stored(tenantB)).toEqual({ waste_tile: 33 });
    const read = await ownerB.serverDb.from('tenant').select('id, defaults').eq('id', tenantA);
    expect(read.data ?? []).toEqual([]);
  });

  it('create_project stores the copy under settings.defaults; a later company change leaves it alone (09o row 1)', async () => {
    await call(owner, { waste_tile: 10 });
    const made = await owner.serverDb.rpc('create_project', {
      p_name: 'Copy P',
      p_address: '1 Test St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
      p_defaults: { waste_tile: 10, overhang_standard: 1.5 },
    });
    expect(made.error).toBeNull();
    const pid = (made.data as { project_id: string }[])[0].project_id;
    await call(owner, { waste_tile: 12 });
    const p = (await harnessSql()`select settings from public.project where id = ${pid}::uuid`)[0];
    expect(p.settings).toEqual({ defaults: { waste_tile: 10, overhang_standard: 1.5 } });

    // a copy key outside the per-project list (pattern adjustment) or not a number is refused
    for (const bad of [{ pattern_straight: 5 }, { waste_tile: '10' }, { waste_tile: -1 }, [1]]) {
      const r = await owner.serverDb.rpc('create_project', {
        p_name: 'Bad',
        p_address: '1 Test St',
        p_type: 'kitchen',
        p_customer_id: null as never,
        p_scope_of_work: null as never,
        p_defaults: bad as never,
      });
      expect(r.error?.code, JSON.stringify(bad)).toBe('22023');
    }
  });

  // EZD-222 (S15d Keyboard shortcuts; migration 20261120170000): the key map changes are one JSON object; any other
  // JSON type is refused; another company's save leaves this company's map alone.
  it('EZD-222 keyboard_shortcuts is stored as an object and refused as anything else', async () => {
    const r = await call(owner, { keyboard_shortcuts: { wall: 'B' } });
    expect(r.error).toBeNull();
    expect((r.data as Row[])[0].changed).toEqual(['keyboard_shortcuts']);
    expect((await stored(tenantA)).keyboard_shortcuts).toEqual({ wall: 'B' });
    expect((await call(owner, { keyboard_shortcuts: 'B' })).error?.code).toBe('22023');
    expect((await call(owner, { keyboard_shortcuts: ['B'] })).error?.code).toBe('22023');
    expect((await call(plain, { keyboard_shortcuts: { wall: 'J' } })).error?.code).toBe('42501');
    expect((await call(ownerB, { keyboard_shortcuts: { wall: 'J' } })).error).toBeNull();
    expect((await stored(tenantA)).keyboard_shortcuts).toEqual({ wall: 'B' });
    expect((await stored(tenantB)).keyboard_shortcuts).toEqual({ wall: 'J' });
  });
});
