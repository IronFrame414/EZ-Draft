// EZD-421 (Q-0753 (a); Q-0052 (c); AC-EZD-421-1, AC-EZD-421-2): route bodies that call the database after
// the session read. The session read and the permission read succeed; then the token's exp passes and Auth
// refuses the refresh, so the route's own call goes out as anon and fails 42501 (the EZD-395 window). The
// route answers 401 not_signed_in with Cache-Control: no-store and writes no error alert. A live session
// whose call fails 42501 keeps its 500 db_unavailable and its one alert write. Runs on the local stack;
// next/headers is mocked to an in-memory cookie store. Expected bodies: requireApiSession (EZD-349), the
// route 500 body (EZD-169, Q-0168 (b)).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  type Member,
} from '../../../test-harness/rls/fixtures';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { createSessionClient, type SessionCookieJar } from '../../server/auth/supabase-server';
import { GET as projectCounts } from './projects/counts/route';
import { GET as notifications } from './notifications/route';
import { GET as roles } from './settings/roles/route';
import { GET as profile } from './profile/route';

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

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const DB_UNAVAILABLE = { error: { code: 'db_unavailable', message_key: 'error.db_unavailable' } };
const DENIED_BODY = JSON.stringify({
  code: '42501',
  details: null,
  hint: null,
  message: 'permission denied',
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

const macrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function signInCookies(email: string): Promise<{ cookies: Map<string, string>; exp: number }> {
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link.properties) throw new Error(`generateLink failed: ${linkError?.message}`);
  const cookies = new Map<string, string>();
  const client = createSessionClient(jarOver(cookies));
  const { error } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (error) throw new Error(`verifyOtp failed: ${error.message}`);
  await macrotask();
  const { data } = await client.auth.getSession();
  const token = data.session!.access_token;
  const exp = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).exp;
  return { cookies, exp: exp as number };
}

type Counts = { alertWrites: number; anonRouteCalls: number; afterTrigger: boolean };

// The session and permission reads run with the live token. When `trigger` has answered: 'ended' moves the
// clock past exp and Auth refuses every refresh from then on; 'live' answers the route's next database call
// with a 42501 while the token stays valid.
function arm(exp: number, trigger: string, mode: 'ended' | 'live'): Counts {
  const counts: Counts = { alertWrites: 0, anonRouteCalls: 0, afterTrigger: false };
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(exp * 1000 - 600_000);
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const req = new Request(input as RequestInfo | URL, init as RequestInit | undefined);
    if (req.url.startsWith(`${url()}/rest/v1/rpc/record_error_alert`)) {
      counts.alertWrites += 1;
      return new Response('', { status: 503 });
    }
    if (
      req.method === 'POST' &&
      req.url.startsWith(`${url()}/auth/v1/token?grant_type=refresh_token`) &&
      counts.afterTrigger &&
      mode === 'ended'
    ) {
      return new Response(
        JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    }
    const isRest = req.url.startsWith(`${url()}/rest/v1/`);
    if (counts.afterTrigger && isRest && mode === 'live' && !req.url.includes('/rpc/touch_last_active')) {
      if (!req.url.includes('/rpc/current_app_user_id')) {
        return new Response(DENIED_BODY, {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }
    }
    if (counts.afterTrigger && isRest && req.headers.get('authorization') === `Bearer ${publishable}`) {
      counts.anonRouteCalls += 1;
    }
    const res = await realFetch(input, init);
    if (!counts.afterTrigger && req.url.startsWith(`${url()}/rest/v1/rpc/${trigger}`)) {
      counts.afterTrigger = true;
      if (mode === 'ended') vi.setSystemTime(exp * 1000 + 1000);
    }
    return res;
  });
  return counts;
}

const ALL_KEYS_ROUTES = [
  {
    name: 'GET /api/projects/counts',
    trigger: 'current_permissions',
    call: () => projectCounts(new Request('http://localhost/api/projects/counts')),
  },
  {
    name: 'GET /api/notifications',
    trigger: 'current_permissions',
    call: () => notifications(new Request('http://localhost/api/notifications')),
  },
  {
    name: 'GET /api/settings/roles',
    trigger: 'current_permissions',
    call: () => roles(),
  },
  {
    name: 'GET /api/profile',
    trigger: 'current_app_user_id',
    call: () => profile(new Request('http://localhost/api/profile')),
  },
] as const;

describe('EZD-421 route bodies after the session read', () => {
  let tenantId: string;
  let m: Member;
  let cookies: Map<string, string>;
  let exp: number;

  beforeAll(async () => {
    tenantId = await createTenant();
    m = await createMember({ tenantId, scope: 'all' });
    await setPermissions(tenantId, m.membershipId, ['view_projects', 'settings_users']);
    ({ cookies, exp } = await signInCookies(m.email));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    state.store = new Map();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  for (const route of ALL_KEYS_ROUTES) {
    it(`AC-EZD-421-1 ${route.name}: an ended session answers 401 no-store and writes no alert`, async () => {
      state.store = new Map(cookies);
      const counts = arm(exp, route.trigger, 'ended');
      const res = await route.call();
      expect(counts.afterTrigger).toBe(true);
      expect(counts.anonRouteCalls).toBeGreaterThan(0);
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual(NOT_SIGNED_IN);
      expect(counts.alertWrites).toBe(0);
    });

    it(`AC-EZD-421-2 ${route.name}: a live session's 42501 keeps its 500 and its alert`, async () => {
      state.store = new Map(cookies);
      const counts = arm(exp, route.trigger, 'live');
      const res = await route.call();
      expect(counts.afterTrigger).toBe(true);
      expect(res.status).toBe(500);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual(DB_UNAVAILABLE);
      expect(counts.alertWrites).toBe(1);
    });
  }
});
