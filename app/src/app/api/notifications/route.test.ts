// EZD-110a T10, list route (vault/plans/EZD-110a.md section 4; Decided D8, D9). next/headers is mocked and
// members sign in as in app/src/app/api/settings/customers/route.test.ts. Expected values: D8 (401, 403, 400
// bodies `{ error: { code, message_key } }`, permission_denied is error.not_authorized, Cache-Control:
// no-store), D9 (a malformed cursor is 400 invalid_input), section 3 (200 NotificationPage).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../server/auth/supabase-server';

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

const err = (code: string, key = code) => ({ error: { code, message_key: `error.${key}` } });

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function get(query = ''): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/notifications${query}`));
  return { res, json: await parse(res) };
}

describe('EZD-110a notifications list route', () => {
  let tenant = '';
  let member: Member;
  let plain: Member;
  let memberCookies: Map<string, string>;
  let plainCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, []);
    memberCookies = await cookiesFor(member.email);
    plainCookies = await cookiesFor(plain.email);
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

  it('EZD-110a T10 GET /api/notifications: 401, 403, 400 for a bad cursor, 200 with a NotificationPage, always no-store', async () => {
    state.store = new Map();
    const a = await get();
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(err('not_signed_in'));
    expect(a.res.headers.get('cache-control') ?? '').toContain('no-store');

    state.store = new Map(plainCookies);
    const b = await get();
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(err('permission_denied', 'not_authorized'));
    expect(b.res.headers.get('cache-control') ?? '').toContain('no-store');

    state.store = new Map(memberCookies);
    const c = await get('?before=x');
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(err('invalid_input'));
    expect(c.res.headers.get('cache-control') ?? '').toContain('no-store');

    state.store = new Map(memberCookies);
    const d = await get();
    expect(d.res.status).toBe(200);
    expect(d.res.headers.get('cache-control') ?? '').toContain('no-store');
    const page = d.json as {
      items: Record<string, unknown>[];
      unreadCount: number;
      hasMore: boolean;
    };
    expect(Object.keys(page).sort()).toEqual(['hasMore', 'items', 'unreadCount']);
    expect(page.items).toHaveLength(1);
    expect(page.unreadCount).toBe(1);
    expect(page.hasMore).toBe(false);
    expect(Object.keys(page.items[0]).sort()).toEqual([
      'clientName',
      'createdAt',
      'id',
      'kind',
      'link',
      'params',
      'projectId',
      'projectName',
      'readAt',
    ]);
  }, 120000);
});
