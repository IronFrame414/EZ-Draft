// EZD-118 D1 (vault/plans/EZD-118.md section 1 SQL M1, section 4; AC-EZD-118-6, -9). Expected values: the
// function body in order (Create projects check 42501, bad input 22023 invalid_input, archived or other-company
// customer 22023 customer_unavailable, status draft, settings {}, code_edition and submittal_profile_id null,
// client_name unwritten, one membership_project row for a listed member only, for the member of the session's
// membership_id claim, never a parameter: Q-0451), Q-0403, Q-0399, ARCH Function grants (anon and service_role
// cannot execute: 42501; precedent EZD-112 T4). Calls go through the gated serverDb of `signIn`, as a route does.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { withRollback } from '../../../test-harness/rls/db';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';

type Row = { project_id: string; tenant_id: string };

describe('EZD-118 create_project', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Session;
  let listedA: Session;
  let noKey: Session;
  let memberA: Member;
  let memberB: Member;
  let activeCustomer = '';
  let archivedCustomer = '';
  let otherTenantCustomer = '';

  const call = (s: Session, a: Record<string, unknown> = {}) =>
    s.serverDb.rpc('create_project', {
      p_name: 'Kitchen remodel',
      p_address: '12 Oak Ave',
      p_type: 'kitchen',
      p_customer_id: null,
      p_scope_of_work: null,
      ...a,
    });
  const projectCount = async () =>
    Number(
      (
        await harnessSql()`select count(*) as n from public.project where tenant_id = ${tenantA}::uuid`
      )[0].n,
    );
  const listings = async (membershipId: string) =>
    Number(
      (
        await harnessSql()`select count(*) as n from public.membership_project where membership_id = ${membershipId}::uuid`
      )[0].n,
    );
  const insertCustomer = async (tenant: string, name: string, archived: boolean) =>
    (
      await harnessSql()`insert into public.customer (tenant_id, name, email, archived_at)
        values (${tenant}::uuid, ${name}, ${`${name.toLowerCase().replace(/ /g, '.')}@example.test`}, ${archived ? new Date().toISOString() : null})
        returning id`
    )[0].id as string;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const o = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, o.membershipId, ['create_projects']);
    memberA = await createMember({ tenantId: tenantA, scope: 'listed' });
    await setPermissions(tenantA, memberA.membershipId, ['create_projects']);
    memberB = await createMember({ tenantId: tenantA, scope: 'listed' });
    await setPermissions(tenantA, memberB.membershipId, ['create_projects']);
    const n = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, n.membershipId, ['view_projects']);
    activeCustomer = await insertCustomer(tenantA, 'Ann Lee', false);
    archivedCustomer = await insertCustomer(tenantA, 'Cy Archived', true);
    otherTenantCustomer = await insertCustomer(tenantB, 'Other Company', false);
    owner = await signIn(o.email);
    listedA = await signIn(memberA.email);
    noKey = await signIn(n.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('D1 creates a draft project for the claim company, lists it for a listed member only, refuses the rest', async () => {
    // (a) owner, scope all: one row, no listing
    const made = await call(owner, { p_customer_id: activeCustomer, p_scope_of_work: 'Demo' });
    expect(made.error).toBeNull();
    const rows = made.data as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(tenantA);
    const p = (
      await harnessSql()`select status, settings, code_edition, submittal_profile_id, client_name, customer_id, scope_of_work, tenant_id
        from public.project where id = ${rows[0].project_id}::uuid`
    )[0];
    expect(p.status).toBe('draft');
    expect(p.settings).toEqual({});
    expect(p.code_edition).toBeNull();
    expect(p.submittal_profile_id).toBeNull();
    expect(p.client_name).toBeNull();
    expect(p.customer_id).toBe(activeCustomer);
    expect(p.scope_of_work).toBe('Demo');
    expect(p.tenant_id).toBe(tenantA);
    expect(
      Number(
        (
          await harnessSql()`select count(*) as n from public.membership_project where project_id = ${rows[0].project_id}::uuid`
        )[0].n,
      ),
    ).toBe(0);

    // (b) listed member A: one row and exactly one listing, A's, none for B
    const listed = await call(listedA);
    expect(listed.error).toBeNull();
    const listedId = (listed.data as Row[])[0].project_id;
    const mp =
      await harnessSql()`select membership_id from public.membership_project where project_id = ${listedId}::uuid`;
    expect(mp).toHaveLength(1);
    expect(mp[0].membership_id).toBe(memberA.membershipId);
    expect(await listings(memberB.membershipId)).toBe(0);

    // (c) a membership id passed as a parameter is never accepted
    const before = await projectCount();
    const spoof = await call(listedA, { p_membership_id: memberB.membershipId });
    expect(spoof.error).not.toBeNull();
    expect(await projectCount()).toBe(before);
    expect(await listings(memberB.membershipId)).toBe(0);

    // (d) a member without Create projects
    const denied = await call(noKey);
    expect(denied.error?.code).toBe('42501');
    expect(await projectCount()).toBe(before);

    // (e) an archived customer and a customer of another company
    for (const id of [archivedCustomer, otherTenantCustomer]) {
      const r = await call(owner, { p_customer_id: id });
      expect(r.error?.code, id).toBe('22023');
      expect(r.error?.message, id).toContain('customer_unavailable');
    }

    // (f) a type outside the three and a blank name
    for (const bad of [{ p_type: 'garage' }, { p_name: ' ' }]) {
      const r = await call(owner, bad);
      expect(r.error?.code).toBe('22023');
      expect(r.error?.message).toContain('invalid_input');
    }
    expect(await projectCount()).toBe(before);

    // (g) anon and service_role cannot execute the function
    for (const role of ['anon', 'service_role']) {
      await expect(
        withRollback(harnessSql(), async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          await tx.unsafe("select * from public.create_project('x', 'x', 'kitchen', null, null)");
        }),
        role,
      ).rejects.toMatchObject({ code: '42501' });
    }
  });
});
