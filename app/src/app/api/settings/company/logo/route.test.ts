// EZD-295 T4 (vault/plans/EZD-295.md section 4; AC-EZD-295-1), replacing EZD-112 T6. next/headers is mocked as in
// app/src/app/api/jobs/[id]/route.test.ts. Expected values: Decided D6 (route order and codes), D7 (200
// `{ logo: { path, url, kind } }`, no `upload`), `cleanLogo` (the stored SVG is its clean bytes) and
// `<tenant_id>/tenant/logo/<uuid>.<kind>`. Q-0512 (a): 4,000,000 bytes.
import { createHash } from 'node:crypto';
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
import { cleanLogo } from '../../../../../server/company/company';
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

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_100 = Uint8Array.from([...PNG_SIG, ...new Array(92).fill(0)]);
const PNG_BIG = Uint8Array.from([...PNG_SIG, ...new Array(3_999_993).fill(0)]); // 4,000,001 bytes
const SVG_SCRIPT = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
// Local copy of clean-logo.test.ts lines 12-13.
const F2 =
  '<?xml version="1.0"?>\n<!-- x -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="urn:i" xmlns:xlink="http://www.w3.org/1999/xlink" i:v="1" id="L" xml:space="preserve">\n <style>.a{fill:#231F20}</style><i:meta/><defs><path id="p" d="M0 0h9"/></defs><use xlink:href="#p" class="a"/><image xlink:href="https://e.x/a.png"/><a href="#p"><rect/></a></svg>\n';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const err = (code: string, key = `error.${code}`) => ({ error: { code, message_key: key } });

async function post(
  type: string,
  body: Uint8Array,
  extra: Record<string, string> = {},
): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/settings/company/logo', {
      method: 'POST',
      headers: { 'content-type': type, ...extra },
      body: body as BodyInit,
    }),
  );
  return { res, json: await res.json() };
}

describe('EZD-295 logo upload route', () => {
  let tenant = '';
  let owner: Member;
  let plain: Member;
  let ownerCookies: Map<string, string>;
  let plainCookies: Map<string, string>;
  const folder = () => `${tenant}/tenant/logo`;

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
    try {
      const { data } = await adminDb().storage.from('media').list(folder());
      await adminDb()
        .storage.from('media')
        .remove((data ?? []).map((o) => `${folder()}/${o.name}`));
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  const names = async () => {
    const { data, error } = await adminDb().storage.from('media').list(folder());
    expect(error).toBeNull();
    return (data ?? []).map((o) => o.name).sort();
  };
  const stored = async (path: string) => {
    const { data, error } = await adminDb().storage.from('media').download(path);
    expect(error).toBeNull();
    return new Uint8Array(await (data as Blob).arrayBuffer());
  };

  it('T4 POST /api/settings/company/logo: refusals leave no file; a png and a cleaned svg are stored by the server', async () => {
    // (a) no session
    state.store = new Map();
    const a = await post('image/png', PNG_100);
    expect(a.res.status).toBe(401);

    // (b) member without the switch
    state.store = new Map(plainCookies);
    const b = await post('image/png', PNG_100);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(err('permission_denied', 'error.not_authorized'));
    expect(await names()).toEqual([]);

    const before = await names();
    const refusals: [string, () => Promise<{ res: Response; json: unknown }>, string][] = [
      ['(c) image/gif', () => post('image/gif', PNG_100), 'logo_wrong_type'],
      [
        '(d) 4,000,001 bytes, no content-length',
        () => post('image/png', PNG_BIG),
        'logo_too_large',
      ],
      [
        '(d2) content-length 4000001',
        () => post('image/png', PNG_100, { 'content-length': '4000001' }),
        'logo_too_large',
      ],
      ['(e) svg with a script', () => post('image/svg+xml', SVG_SCRIPT), 'logo_svg_unsafe'],
      ['(f) empty png', () => post('image/png', new Uint8Array(0)), 'logo_wrong_type'],
    ];
    for (const [label, run, code] of refusals) {
      state.store = new Map(ownerCookies);
      const r = await run();
      expect(r.res.status, label).toBe(400);
      expect(r.json, label).toEqual(err(code));
      expect(await names(), label).toEqual(before);
    }

    // (g) a png
    state.store = new Map(ownerCookies);
    const g = await post('image/png', PNG_100);
    expect(g.res.status).toBe(200);
    const gj = g.json as { logo: { path: string; url: string; kind: string }; upload?: unknown };
    expect(gj.logo.kind).toBe('png');
    expect(gj.logo.path).toMatch(new RegExp(`^${tenant}/tenant/logo/[0-9a-f-]{36}\\.png$`));
    expect(sha(await stored(gj.logo.path))).toBe(sha(PNG_100));
    expect(gj.logo.url).toContain('/object/sign/media/');
    expect(Object.keys(gj)).not.toContain('upload');

    // (h) an svg is stored as its clean copy
    state.store = new Map(ownerCookies);
    const h = await post('image/svg+xml', new TextEncoder().encode(F2));
    expect(h.res.status).toBe(200);
    const hj = h.json as { logo: { path: string; kind: string } };
    expect(hj.logo.kind).toBe('svg');
    const clean = cleanLogo(new TextEncoder().encode(F2), 'svg');
    if (!clean.ok) throw new Error('F2 must clean');
    expect(await stored(hj.logo.path)).toEqual(clean.bytes);
  }, 120000);
});
