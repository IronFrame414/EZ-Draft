// EZD-108 T3 and T4 (vault/plans/EZD-108.md section 1 Data, section 4; AC-EZD-108-3, -4, -5, -8):
// public.update_my_profile and public.current_user_has_password on the local stack. Expected values come
// from section 1 Data (22023 invalid_input, 42501 for no gate header, language_changed, updated_at kept)
// and Q-0412 (code-only members have no password).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  anonDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
} from '../../../test-harness/rls/fixtures';

type Row = { saved_language: string; saved_ipad_input_mode: string; language_changed: boolean };

async function appUserRow(id: string) {
  const rows = await harnessSql()`
    select language, ipad_input_mode, updated_at from public.app_user where id = ${id}::uuid`;
  return rows[0] as { language: string; ipad_input_mode: string | null; updated_at: Date };
}

describe('EZD-108 own-profile functions', () => {
  let tenant = '';
  let a: Member;
  let b: Member;

  beforeAll(async () => {
    tenant = await createTenant();
    a = await createMember({ tenantId: tenant, scope: 'all' });
    b = await createMember({ tenantId: tenant, scope: 'all' });
  }, 60000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T3 update_my_profile: first call changes, second does not touch updated_at, B and bad input untouched', async () => {
    const sessionA = await signIn(a.email);
    const beforeB = await appUserRow(b.appUserId);

    const first = await sessionA.serverDb.rpc('update_my_profile', {
      p_language: 'es',
      p_ipad_input_mode: 'pencil',
    });
    expect(first.error).toBeNull();
    expect(first.data as Row[]).toEqual([
      { saved_language: 'es', saved_ipad_input_mode: 'pencil', language_changed: true },
    ]);
    const afterFirst = await appUserRow(a.appUserId);
    expect(afterFirst.language).toBe('es');
    expect(afterFirst.ipad_input_mode).toBe('pencil');

    const second = await sessionA.serverDb.rpc('update_my_profile', {
      p_language: 'es',
      p_ipad_input_mode: 'pencil',
    });
    expect(second.error).toBeNull();
    expect(second.data as Row[]).toEqual([
      { saved_language: 'es', saved_ipad_input_mode: 'pencil', language_changed: false },
    ]);
    expect((await appUserRow(a.appUserId)).updated_at.getTime()).toBe(
      afterFirst.updated_at.getTime(),
    );

    const afterB = await appUserRow(b.appUserId);
    expect(afterB.language).toBe(beforeB.language);
    expect(afterB.ipad_input_mode).toBe(beforeB.ipad_input_mode);
    expect(afterB.updated_at.getTime()).toBe(beforeB.updated_at.getTime());

    const bad = await sessionA.serverDb.rpc('update_my_profile', {
      p_language: 'xx',
      p_ipad_input_mode: 'pencil',
    });
    expect(bad.error?.code).toBe('22023');
    const badMode = await sessionA.serverDb.rpc('update_my_profile', {
      p_language: 'en',
      p_ipad_input_mode: 'stylus',
    });
    expect(badMode.error?.code).toBe('22023');
    expect((await appUserRow(a.appUserId)).language).toBe('es');

    const anon = await anonDb({ gate: true }).rpc('update_my_profile', {
      p_language: 'en',
      p_ipad_input_mode: 'finger',
    });
    expect(anon.error).not.toBeNull();
    expect(anon.data).toBeNull();

    const noGate = await sessionA.browserDb.rpc('update_my_profile', {
      p_language: 'en',
      p_ipad_input_mode: 'finger',
    });
    expect(noGate.error?.code).toBe('42501');
    expect((await appUserRow(a.appUserId)).language).toBe('es');
  }, 60000);

  it('T4 current_user_has_password: false for a code-only member, true once an admin sets a password', async () => {
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    const before = await (await signIn(member.email)).serverDb.rpc('current_user_has_password');
    expect(before.error).toBeNull();
    expect(before.data).toBe(false);

    const set = await adminDb().auth.admin.updateUserById(member.authUserId, {
      password: 'a-long-test-password-qwerty',
    });
    expect(set.error).toBeNull();

    const sessionAfter = await signIn(member.email);
    const after = await sessionAfter.serverDb.rpc('current_user_has_password');
    expect(after.error).toBeNull();
    expect(after.data).toBe(true);

    const noGate = await sessionAfter.browserDb.rpc('current_user_has_password');
    expect(noGate.error?.code).toBe('42501');
  }, 60000);
});
