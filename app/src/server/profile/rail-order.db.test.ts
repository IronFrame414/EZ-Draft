// EZD-230 (Q-0038, Q-0122; CLAUDE.md rule 4): public.update_my_rail_order and app_user.rail_order on the local stack.
// Expected values come from the migration 20261120200000_add_app_user_rail_order.sql: the caller's own row only,
// 22023 invalid_input for a bad list, 42501 without the gate header, and the existing app_user_select policy (own
// row and own company's members), so another company's member can neither read nor change the order.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
} from '../../../test-harness/rls/fixtures';

const orderOf = async (id: string): Promise<string[]> =>
  (
    (await harnessSql()`select rail_order from public.app_user where id = ${id}::uuid`)[0] as {
      rail_order: string[];
    }
  ).rail_order;

describe('EZD-230 rail order', () => {
  let a: Member;
  let b: Member;
  let other: Member;

  beforeAll(async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant();
    a = await createMember({ tenantId: tenant, scope: 'all' });
    b = await createMember({ tenantId: tenant, scope: 'all' });
    other = await createMember({ tenantId: otherTenant, scope: 'all' });
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('update_my_rail_order writes the caller own row only and refuses bad lists', async () => {
    expect(await orderOf(a.appUserId)).toEqual([]);
    const sA = await signIn(a.email);
    const r = await sA.serverDb.rpc('update_my_rail_order', { p_order: ['wall', 'select'] });
    expect(r.error).toBeNull();
    expect(r.data).toEqual(['wall', 'select']);
    expect(await orderOf(a.appUserId)).toEqual(['wall', 'select']);
    expect(await orderOf(b.appUserId)).toEqual([]);
    expect(await orderOf(other.appUserId)).toEqual([]);

    for (const bad of [
      ['wall', 'wall'],
      ['Wall'],
      ['1wall'],
      [''],
      Array.from({ length: 65 }, (_, i) => `t${i}`),
    ]) {
      const x = await sA.serverDb.rpc('update_my_rail_order', { p_order: bad });
      expect(x.error?.code, JSON.stringify(bad)).toBe('22023');
    }
    expect(await orderOf(a.appUserId)).toEqual(['wall', 'select']);

    // Without the gate header (a browser call straight to PostgREST): 42501.
    const noGate = await sA.browserDb.rpc('update_my_rail_order', { p_order: ['move'] });
    expect(noGate.error?.code).toBe('42501');
    expect(await orderOf(a.appUserId)).toEqual(['wall', 'select']);
  });

  it('another company cannot read or change the order; app_user stays not writable', async () => {
    const sOther = await signIn(other.email);
    const read = await sOther.serverDb
      .from('app_user')
      .select('id, rail_order')
      .eq('id', a.appUserId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const write = await sOther.serverDb
      .from('app_user')
      .update({ rail_order: ['move'] })
      .eq('id', a.appUserId)
      .select();
    expect(write.data ?? []).toEqual([]);
    // The other company's own save changes only their row.
    expect(
      (await sOther.serverDb.rpc('update_my_rail_order', { p_order: ['move'] })).error,
    ).toBeNull();
    expect(await orderOf(other.appUserId)).toEqual(['move']);
    expect(await orderOf(a.appUserId)).toEqual(['wall', 'select']);
    // A member of the same company cannot change A's order directly either.
    const sB = await signIn(b.email);
    const direct = await sB.serverDb
      .from('app_user')
      .update({ rail_order: ['move'] })
      .eq('id', a.appUserId)
      .select();
    expect(direct.data ?? []).toEqual([]);
    expect(await orderOf(a.appUserId)).toEqual(['wall', 'select']);
  });
});
