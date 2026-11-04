// EZD-112 T4 (vault/plans/EZD-112.md section 1 SQL and body steps 1-9, section 4; AC-EZD-112-2, -3).
// Expected values: the function body in order (permission 42501, empty name 22023, bad contact 22023, bad
// logo path 22023, `changed` in the order name, logo, license_no, contact, no update when nothing changed),
// ARCH Function grants convention (anon and service_role cannot execute: 42501). Calls go through the gated
// serverDb of `signIn`, as a route does.
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
  type Session,
} from '../../../test-harness/rls/fixtures';
import { logoPathFor } from './company';

type Row = {
  tenant_id: string;
  tenant_name: string;
  tenant_logo_path: string | null;
  tenant_license_no: string | null;
  tenant_contact: Record<string, string>;
  tenant_updated_at: string;
  changed: string[];
};

describe('EZD-112 update_tenant_identity', () => {
  let tenantA = '';
  let tenantB = '';
  let s1: Session;
  let s2: Session;

  const call = (
    s: Session,
    a: {
      name?: string;
      license?: string | null;
      contact?: unknown;
      set?: boolean;
      path?: string | null;
    },
  ) =>
    s.serverDb.rpc('update_tenant_identity', {
      p_name: a.name ?? 'x',
      p_license_no: a.license ?? null,
      p_contact: a.contact ?? {},
      p_set_logo: a.set ?? false,
      p_logo_path: a.path ?? null,
    });
  const rowOf = async (id: string) =>
    (
      await harnessSql()`select name, logo_path, license_no, contact, updated_at from public.tenant where id = ${id}::uuid`
    )[0];

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const m1 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m1.membershipId, ['settings_company']);
    const m2 = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, m2.membershipId, []);
    s1 = await signIn(m1.email);
    s2 = await signIn(m2.email);
  }, 120000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T4 sets the identity for the claim tenant only, refuses a missing switch, empty name, bad logo path, anon and service_role', async () => {
    const bBefore = await rowOf(tenantB);

    // (a) first change: name, license and contact
    const first = await call(s1, {
      name: 'EZD-112 T4 Co',
      license: 'LIC-T4',
      contact: { phone: '555-0100' },
    });
    expect(first.error).toBeNull();
    const r1 = (first.data as Row[])[0];
    expect(r1.tenant_id).toBe(tenantA);
    expect(r1.tenant_name).toBe('EZD-112 T4 Co');
    expect(r1.tenant_license_no).toBe('LIC-T4');
    expect(r1.tenant_contact).toEqual({ phone: '555-0100' });
    expect(r1.tenant_logo_path).toBeNull();
    expect(r1.changed).toEqual(['name', 'license_no', 'contact']);
    const saved = await rowOf(tenantA);
    expect(saved.name).toBe('EZD-112 T4 Co');
    expect(saved.license_no).toBe('LIC-T4');
    expect(saved.contact).toEqual({ phone: '555-0100' });

    // (b) the same call again: nothing changed, no update (updated_at stays)
    const again = await call(s1, {
      name: 'EZD-112 T4 Co',
      license: 'LIC-T4',
      contact: { phone: '555-0100' },
    });
    expect(again.error).toBeNull();
    const r2 = (again.data as Row[])[0];
    expect(r2.changed).toEqual([]);
    expect(new Date(r2.tenant_updated_at).getTime()).toBe(new Date(r1.tenant_updated_at).getTime());
    expect(new Date((await rowOf(tenantA)).updated_at).getTime()).toBe(
      new Date(r1.tenant_updated_at).getTime(),
    );

    // (c) a member without settings_company
    const denied = await call(s2, { name: 'EZD-112 T4 Denied' });
    expect(denied.error?.code).toBe('42501');
    expect((await rowOf(tenantA)).name).toBe('EZD-112 T4 Co');

    // (d) empty name
    const blank = await call(s1, { name: ' ' });
    expect(blank.error?.code).toBe('22023');
    expect(blank.error?.message).toContain('company_name_required');
    expect((await rowOf(tenantA)).name).toBe('EZD-112 T4 Co');

    // (e) a logo path of another company
    const foreign = await call(s1, {
      name: 'EZD-112 T4 Co',
      license: 'LIC-T4',
      contact: { phone: '555-0100' },
      set: true,
      path: logoPathFor(tenantB, 'png'),
    });
    expect(foreign.error?.code).toBe('22023');
    expect((await rowOf(tenantA)).logo_path).toBeNull();

    // (f) set the logo to the company's own path, then remove it (set with null)
    const own = logoPathFor(tenantA, 'png');
    const setOwn = await call(s1, {
      name: 'EZD-112 T4 Co',
      license: 'LIC-T4',
      contact: { phone: '555-0100' },
      set: true,
      path: own,
    });
    expect(setOwn.error).toBeNull();
    expect((setOwn.data as Row[])[0].tenant_logo_path).toBe(own);
    expect((setOwn.data as Row[])[0].changed).toEqual(['logo']);
    const removed = await call(s1, {
      name: 'EZD-112 T4 Co',
      license: 'LIC-T4',
      contact: { phone: '555-0100' },
      set: true,
      path: null,
    });
    expect(removed.error).toBeNull();
    expect((removed.data as Row[])[0].tenant_logo_path).toBeNull();
    expect((removed.data as Row[])[0].changed).toEqual(['logo']);

    // (g) anon and service_role cannot execute the function
    for (const role of ['anon', 'service_role']) {
      await expect(
        withRollback(harnessSql(), async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          await tx.unsafe(
            "select * from public.update_tenant_identity('x', null, '{}'::jsonb, false, null)",
          );
        }),
        role,
      ).rejects.toMatchObject({ code: '42501' });
    }

    // (h) the other company's row never changed
    const bAfter = await rowOf(tenantB);
    expect(bAfter).toEqual(bBefore);
  });
});
