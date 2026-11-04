// EZD-110a T10, read-all route (vault/plans/EZD-110a.md section 4; Decided D8, D11). Same sign-in pattern as the
// list route test. Expected values: D11 (`200 { marked: <integer> }`), D8 (Cache-Control: no-store).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';

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

async function readAll(): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/notifications/read-all', { method: 'POST' }),
  );
  return { res, json: JSON.parse(await res.text()) as unknown };
}

describe('EZD-110a notifications read-all route', () => {
  let cookies: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    cookies = await cookiesFor(member.email);
    for (let i = 0; i < 2; i++)
      await harnessSql()`
        insert into public.notification (tenant_id, user_id, kind, link)
        values (${tenant}::uuid, ${member.appUserId}::uuid, 'render_finished', '/')`;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-110a T10 POST /api/notifications/read-all answers 200 { marked: n } with no-store, then 0', async () => {
    state.store = new Map(cookies);
    const a = await readAll();
    expect(a.res.status).toBe(200);
    expect(a.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(a.json).toEqual({ marked: 2 });

    state.store = new Map(cookies);
    const b = await readAll();
    expect(b.res.status).toBe(200);
    expect(b.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(b.json).toEqual({ marked: 0 });
  }, 120000);
});
