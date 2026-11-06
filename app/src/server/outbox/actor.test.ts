// EZD-120d U4 (vault/plans/EZD-120d.md sections 3 and 4; AC-EZD-120d-3): `loadOutboxActor()` answers the signed-in
// member's app user id, company id and membership id, and null when signed out. Same sign-in and mocks as
// app/src/app/api/projects/[id]/checkpoints/route.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../auth/supabase-server';

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));

function jarOver(store: Map<string, string>): SessionCookieJar {
  return {
    getAll: () => [...store].map(([name, value]) => ({ name, value })),
    set: (name, value, options) => {
      if (value === '' || options?.maxAge === 0) store.delete(name);
      else store.set(name, value);
    },
    isHttps: () => false,
  };
}

async function cookiesFor(email: string): Promise<Map<string, string>> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const store = new Map<string, string>();
  const { error } = await createSessionClient(jarOver(store)).auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return store;
}

describe('EZD-120d outbox actor', () => {
  let tenant = '';
  let member: Member;
  let memberCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    memberCookies = await cookiesFor(member.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('U4 answers the member ids when signed in and null when signed out', async () => {
    const { loadOutboxActor } = await import('./actor');

    state.store = new Map(memberCookies);
    expect(await loadOutboxActor()).toEqual({
      appUserId: member.appUserId,
      tenantId: tenant,
      membershipId: member.membershipId,
    });

    state.store = new Map();
    expect(await loadOutboxActor()).toBeNull();
  }, 120000);
});
