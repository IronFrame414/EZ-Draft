// EZD-112 T6 (vault/plans/EZD-112.md section 4; AC-EZD-112-4, -6).
// next/headers is mocked as in app/src/app/api/jobs/[id]/route.test.ts. Expected values: Decided "Upload
// route" (400 `logo_too_large` / `logo_wrong_type` from `checkLogoFile`, 403 `permission_denied`, 200
// `{ upload: SignedUpload }` in bucket `media`) and "Logo path" (`<tenant_id>/tenant/logo/<uuid>.<kind>`).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';

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

async function post(payload: unknown): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/settings/company/logo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  return { res, json: await res.json() };
}

describe('EZD-112 logo upload route', () => {
  let tenant = '';
  let owner: Member;
  let plain: Member;
  let ownerCookies: Map<string, string>;
  let plainCookies: Map<string, string>;

  beforeAll(async () => {
    tenant = await createTenant();
    owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, ['settings_company']);
    plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, []);
    ownerCookies = await cookiesFor(owner.email);
    plainCookies = await cookiesFor(plain.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T6 POST /api/settings/company/logo: 400 too large, 400 wrong type, 200 signed upload, 403 without the switch', async () => {
    state.store = new Map(ownerCookies);
    const big = await post({ fileName: 'big.png', size: 6_000_000 });
    expect(big.res.status).toBe(400);
    expect(big.json).toEqual({
      error: { code: 'logo_too_large', message_key: 'error.logo_too_large' },
    });

    state.store = new Map(ownerCookies);
    const gif = await post({ fileName: 'a.gif', size: 10 });
    expect(gif.res.status).toBe(400);
    expect(gif.json).toEqual({
      error: { code: 'logo_wrong_type', message_key: 'error.logo_wrong_type' },
    });

    state.store = new Map(ownerCookies);
    const svg = await post({ fileName: 'a.svg', size: 100 });
    expect(svg.res.status).toBe(200);
    const upload = (svg.json as { upload: { bucket: string; path: string; token: string } }).upload;
    expect(upload.bucket).toBe('media');
    expect(upload.path).toMatch(new RegExp(`^${tenant}/tenant/logo/[0-9a-f-]{36}\\.svg$`));
    expect(typeof upload.token).toBe('string');

    state.store = new Map(plainCookies);
    const denied = await post({ fileName: 'a.svg', size: 100 });
    expect(denied.res.status).toBe(403);
    expect(denied.json).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });
  });
});
