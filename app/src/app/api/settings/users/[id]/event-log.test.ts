// EZD-109 R1 (AC-EZD-109-1, AC-EZD-109-3): the real Users page Save route, with the real emitter and event log
// sink, writes exactly one event_log row for a permission change: company, actor, actor name, action, object
// type and id, details, time and the first x-forwarded-for address (Q-0695 decisions 03 row 33). One row, not
// two: the definer function writes it in the change's transaction and the sink skips the emitted event
// (`transaction`). A Save that changes nothing writes no row. next/headers is mocked with the session cookies
// and the forwarded header, as app/src/app/api/settings/users/[id]/route.test.ts does.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import { addUser, PRESET_KEYS, roleId } from '../../../../../../test-harness/users/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';

const state = vi.hoisted(() => ({
  store: new Map<string, string>(),
  forwarded: '203.0.113.9, 10.0.0.1',
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...state.store].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: unknown) => {
      const maxAge = (options as { maxAge?: number } | undefined)?.maxAge;
      if (value === '' || maxAge === 0) state.store.delete(name);
      else state.store.set(name, value);
    },
  }),
  headers: async () => new Headers({ 'x-forwarded-for': state.forwarded }),
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

async function patch(id: string, payload: unknown): Promise<Response> {
  const { PATCH } = await import('./route');
  return PATCH(
    new Request(`http://localhost/api/settings/users/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ id }) },
  );
}

type LogRow = {
  tenant_id: string;
  actor_app_user_id: string | null;
  actor_name: string | null;
  action: string;
  object_type: string;
  object_id: string;
  details: unknown;
  ip: string | null;
  at: Date;
};

const rowsFor = (objectId: string) => harnessSql()<LogRow[]>`
  select tenant_id, actor_app_user_id, actor_name, action, object_type, object_id, details,
    host(ip) as ip, at
  from public.event_log where object_id = ${objectId}::uuid order by at`;

describe('EZD-109 event log on the Users page Save route', () => {
  let t: string;
  let owner: Member;
  let ownerCookies: Map<string, string>;

  beforeAll(async () => {
    t = await createTenant();
    owner = await addUser(t, { preset: 'owner', name: 'Route Owner' });
    ownerCookies = await cookiesFor(owner.email);
  }, 180000);

  afterEach(() => {
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 a permission change writes one row with actor and the request IP; no change writes none', async () => {
    const c = await addUser(t, { preset: 'crew', name: 'Target Crew' });
    const crew = await roleId(t, 'crew');
    state.store = new Map(ownerCookies);

    const unchanged = await patch(c.membershipId, {
      roleId: crew,
      language: 'en',
      grantedKeys: PRESET_KEYS.crew,
    });
    expect(unchanged.status).toBe(200);
    expect(await rowsFor(c.membershipId)).toHaveLength(0);

    const started = Date.now();
    const res = await patch(c.membershipId, {
      roleId: crew,
      language: 'en',
      grantedKeys: [...PRESET_KEYS.crew, 'see_company_costs'],
    });
    expect(res.status).toBe(200);
    const rows = await rowsFor(c.membershipId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenant_id: t,
      actor_app_user_id: owner.appUserId,
      actor_name: 'Route Owner',
      action: 'user_permission.updated',
      object_type: 'membership',
      object_id: c.membershipId,
      details: {
        membershipId: c.membershipId,
        appUserId: c.appUserId,
        changedKeys: ['see_company_costs'],
        roleId: crew,
        roleChanged: false,
      },
      ip: '203.0.113.9',
    });
    expect(rows[0].at.getTime()).toBeGreaterThanOrEqual(started - 5000);
  }, 120000);
});
