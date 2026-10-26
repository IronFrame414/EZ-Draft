// EZD-112 T7 (vault/plans/EZD-112.md section 4; AC-EZD-112-4, -5, -6).
// next/headers is mocked as in app/src/app/api/jobs/[id]/route.test.ts. Objects are put by the calling member
// through the gated `serverDb` of `signIn` (the `media` insert policy, EZD-132). Expected values: Decided
// "Check route" (400 `logo_too_large` and `logo_svg_unsafe` remove the object; `invalid_input` for a path of
// another company or an object that is not there; 200 `{ logo: { path, url, kind } }`) and "Signed link"
// (900 s default, EZD-132 T12); Q-0232. The URL prefix is storage-js's `object/sign/<bucket>/<path>?token=`.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  claimsOf,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  signIn,
  type Member,
  type Session,
} from '../../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../../server/auth/supabase-server';
import { logoPathFor } from '../../../../../../server/company/company';

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

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_100 = Uint8Array.from([...PNG_SIG, ...new Array(92).fill(0)]);
const PNG_6MB = Uint8Array.from([...PNG_SIG, ...new Array(5_999_992).fill(0)]);
const SVG_SCRIPT = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const INVALID_INPUT = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };

async function check(path: string): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/settings/company/logo/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  );
  return { res, json: await res.json() };
}

describe('EZD-112 logo check route', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Member;
  let ownerSession: Session;
  let ownerCookies: Map<string, string>;

  const uploaded: string[] = [];
  const put = async (path: string, bytes: Uint8Array, contentType: string) => {
    const { error } = await ownerSession.serverDb.storage
      .from('media')
      .upload(path, bytes, { contentType });
    expect(error, `upload ${path}`).toBeNull();
    uploaded.push(path);
  };
  const exists = async (path: string) => {
    const slash = path.lastIndexOf('/');
    const name = path.slice(slash + 1);
    const { data, error } = await adminDb()
      .storage.from('media')
      .list(path.slice(0, slash), { search: name });
    expect(error).toBeNull();
    return (data ?? []).some((o) => o.name === name);
  };

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    owner = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, owner.membershipId, ['settings_company']);
    ownerSession = await signIn(owner.email);
    ownerCookies = await cookiesFor(owner.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await adminDb().storage.from('media').remove(uploaded);
    await cleanup();
    await closeHarness();
  });

  it('T7 POST /api/settings/company/logo/check: 400 too large and unsafe SVG remove the object, 200 signed link, 400 for a foreign or missing path', async () => {
    // (a) 6,000,000 bytes: too large, the object is removed
    const bigPath = logoPathFor(tenantA, 'png');
    await put(bigPath, PNG_6MB, 'image/png');
    state.store = new Map(ownerCookies);
    const a = await check(bigPath);
    expect(a.res.status).toBe(400);
    expect(a.json).toEqual({
      error: { code: 'logo_too_large', message_key: 'error.logo_too_large' },
    });
    expect(await exists(bigPath)).toBe(false);

    // (b) an SVG with a script: unsafe, removed
    const svgPath = logoPathFor(tenantA, 'svg');
    await put(svgPath, SVG_SCRIPT, 'image/svg+xml');
    state.store = new Map(ownerCookies);
    const b = await check(svgPath);
    expect(b.res.status).toBe(400);
    expect(b.json).toEqual({
      error: { code: 'logo_svg_unsafe', message_key: 'error.logo_svg_unsafe' },
    });
    expect(await exists(svgPath)).toBe(false);

    // (c) a good PNG: a signed link that lives 900 seconds
    const okPath = logoPathFor(tenantA, 'png');
    await put(okPath, PNG_100, 'image/png');
    state.store = new Map(ownerCookies);
    const c = await check(okPath);
    expect(c.res.status).toBe(200);
    const logo = (c.json as { logo: { path: string; url: string; kind: string } }).logo;
    expect(logo.path).toBe(okPath);
    expect(logo.kind).toBe('png');
    expect(
      logo.url.startsWith(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/media/${okPath}?token=`,
      ),
    ).toBe(true);
    const claims = claimsOf(new URL(logo.url).searchParams.get('token') ?? '');
    expect(Number(claims.exp) - Number(claims.iat)).toBe(900);
    expect(await exists(okPath)).toBe(true);

    // (d) a path of another company
    state.store = new Map(ownerCookies);
    const d = await check(logoPathFor(tenantB, 'png'));
    expect(d.res.status).toBe(400);
    expect(d.json).toEqual(INVALID_INPUT);

    // (e) an own path that was never uploaded
    state.store = new Map(ownerCookies);
    const e = await check(logoPathFor(tenantA, 'png'));
    expect(e.res.status).toBe(400);
    expect(e.json).toEqual(INVALID_INPUT);
  }, 60000);
});
