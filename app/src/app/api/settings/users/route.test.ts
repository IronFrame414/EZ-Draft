// EZD-104 R1-R3 (vault/plans/EZD-104.md section 4; AC-EZD-104-5, -6, -7). next/headers is mocked and members
// sign in as in app/src/app/api/settings/customers/route.test.ts. Expected values: Decided "Route" (401
// not_signed_in, 403 permission_denied / error.not_authorized, 400 invalid_input, 200 UserPage, 500
// db_unavailable / error.db_unavailable reported once; every answer Cache-Control no-store), "Where the touch
// runs" (the caller's last_active_at moves after a signed-in request), architecture "Errors and logging".
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdErrorAlertLock } from '../../../../../test-harness/errors/alert-lock';
import { expectReportedOnce } from '../../../../../test-harness/errors/expect-reported';
import {
  adminDb,
  cleanup,
  closeHarness,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../test-harness/rls/fixtures';
import { addUser, lastActiveOf } from '../../../../../test-harness/users/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
import { initErrorReporting } from '../../../../server/errors/sentry-options';
import { clearSentryStubOutbox } from '../../../../server/errors/test-harness/sentry-stub-transport';

const state = vi.hoisted(() => ({ store: new Map<string, string>(), failList: false }));

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

// listUsers passes through to the real one except when a test asks for one rejection (R3).
vi.mock('../../../../server/users/users', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/users/users')>();
  return {
    ...actual,
    listUsers: vi.fn(async (...args: Parameters<typeof actual.listUsers>) => {
      if (state.failList) {
        state.failList = false;
        throw new Error('list_users secret detail');
      }
      return actual.listUsers(...args);
    }),
  };
});

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

const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const INVALID = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };

async function get(query = ''): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/settings/users${query}`));
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { res, json };
}
const noStore = (res: Response) =>
  expect(res.headers.get('cache-control') ?? '').toContain('no-store');

describe('EZD-104 users route', () => {
  let owner: Member;
  let crew: Member;
  let ownerCookies: Map<string, string>;
  let crewCookies: Map<string, string>;

  beforeAll(async () => {
    const t = await createTenant();
    owner = await addUser(t, { preset: 'owner', name: 'Zed Owner' });
    crew = await addUser(t, { preset: 'crew', name: 'Cal Crew' });
    await addUser(t, { status: 'invited', preset: 'crew', name: null, invitedAgo: '1 day' });
    ownerCookies = await cookiesFor(owner.email);
    crewCookies = await cookiesFor(crew.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 401, 403, 400', async () => {
    state.store = new Map();
    const a = await get();
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);
    noStore(a.res);

    state.store = new Map(crewCookies);
    const b = await get();
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);
    noStore(b.res);

    state.store = new Map(ownerCookies);
    const c = await get(`?q=${'a'.repeat(1001)}`);
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(INVALID);
    noStore(c.res);

    state.store = new Map(ownerCookies);
    const d = await get('?page=0');
    expect(d.res.status).toBe(400);
    expect(d.json).toEqual(INVALID);
    noStore(d.res);
  });

  it("R2 200 page and the caller's last active", async () => {
    const t = await createTenant();
    const o = await addUser(t, { preset: 'owner', name: 'Olive Owner' });
    await addUser(t, { status: 'invited', preset: 'crew', name: null, invitedAgo: '1 day' });
    expect(await lastActiveOf(o.membershipId)).toBeNull();
    state.store = new Map(await cookiesFor(o.email));
    const r = await get();
    expect(r.res.status).toBe(200);
    noStore(r.res);
    const page = r.json as {
      rows: unknown[];
      active: number;
      invited: number;
      pageSize: number;
      page: number;
    };
    expect(page.rows).toHaveLength(2);
    expect(page.active).toBe(1);
    expect(page.invited).toBe(1);
    expect(page.pageSize).toBe(50);
    expect(page.page).toBe(1);
    await expect.poll(async () => (await lastActiveOf(o.membershipId)) !== null).toBe(true);
  });
});

describe('EZD-104 users route failure report', () => {
  let ownerCookies: Map<string, string>;
  let releaseLock: () => Promise<void> = async () => {};

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    const t = await createTenant();
    const o = await addUser(t, { preset: 'owner', name: 'Olive Owner' });
    ownerCookies = await cookiesFor(o.email);
  }, 180000);

  beforeEach(async () => {
    clearSentryStubOutbox();
    await harnessSql()`delete from public.error_alert`;
  });

  afterEach(() => {
    state.store = new Map();
    state.failList = false;
    vi.resetModules();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.error_alert`;
      await cleanup();
      await closeHarness();
      await Sentry.close(2000);
    } finally {
      await releaseLock();
    }
  }, 180000);

  it('R3 500 reported once', async () => {
    state.failList = true;
    state.store = new Map(ownerCookies);
    const r = await get();
    expect(r.res.status).toBe(500);
    expect(r.json).toEqual({
      error: { code: 'db_unavailable', message_key: 'error.db_unavailable' },
    });
    await expectReportedOnce({
      message: 'db_unavailable',
      location: '/api/settings/users',
      cause: 'Error',
      hidden: 'list_users secret detail',
    });
  });
});
