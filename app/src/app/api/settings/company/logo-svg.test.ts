// EZD-290 T5 (vault/plans/EZD-290.md section 4; AC-EZD-290-1, -2). Setup, `put` and `exists` as in
// logo/check/route.test.ts; the emit mock as in route.test.ts. Expected values: Decided D-store (a rewritten SVG
// is stored at a new `<tenant_id>/tenant/logo/<uuid>.svg`, the request path is removed; an already clean SVG keeps
// its path and bytes; an unsafe SVG is removed with 400 `logo_svg_unsafe`; the save route saves the path the check
// returned), build steps 5 and 6; signed link prefix as EZD-112 T7. Fixtures F1, F2, O2, U a-d: section 4.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
import { logoPathFor } from '../../../../server/company/company';

vi.mock('../../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});

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

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const S = (x: string) => `<svg ${NS}>${x}</svg>`;
const enc = (s: string) => new TextEncoder().encode(s);
const F1 = `<svg ${NS} width="120" height="40" viewBox="0 0 120 40"><rect width="120" height="40" fill="#1f6feb"/></svg>`;
const F2 =
  '<?xml version="1.0"?>\n<!-- x -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:i="urn:i" xmlns:xlink="http://www.w3.org/1999/xlink" i:v="1" id="L" xml:space="preserve">\n <style>.a{fill:#231F20}</style><i:meta/><defs><path id="p" d="M0 0h9"/></defs><use xlink:href="#p" class="a"/><image xlink:href="https://e.x/a.png"/><a href="#p"><rect/></a></svg>\n';
const O2 =
  '<svg xmlns="http://www.w3.org/2000/svg" id="L" xml:space="preserve">\n <style>.a{fill:#231F20}</style><defs><path id="p" d="M0 0h9"/></defs><use href="#p" class="a"/><image/></svg>';
const UNSAFE = [
  `<svg ${NS} xmlns:svg="http://www.w3.org/2000/svg"><svg:script>x</svg:script></svg>`,
  S('<a href="&#106;avascript:x"/>'),
  S('<rect ONCLICK="x"/>'),
  `<s:svg xmlns:s="http://www.w3.org/2000/svg"><s:foreignObject/></s:svg>`,
];
const EMPTY_CONTACT = { phone: '', email: '', website: '', address: '' };

async function check(path: string): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./logo/check/route');
  const res = await POST(
    new Request('http://localhost/api/settings/company/logo/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  );
  return { res, json: await res.json() };
}

async function patchSet(path: string): Promise<{ res: Response; json: unknown }> {
  const { PATCH } = await import('./route');
  const res = await PATCH(
    new Request('http://localhost/api/settings/company', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'EZD-290 T5',
        licenseNo: '',
        contact: EMPTY_CONTACT,
        logo: { action: 'set', path },
      }),
    }),
  );
  return { res, json: await res.json() };
}

describe('EZD-290 stored SVG logo', () => {
  let tenant = '';
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
  const read = async (path: string) => {
    const { data, error } = await adminDb().storage.from('media').download(path);
    expect(error, `download ${path}`).toBeNull();
    return new Uint8Array(await data!.arrayBuffer());
  };
  const logoPathInDb = async () =>
    (await harnessSql()`select logo_path from public.tenant where id = ${tenant}::uuid`)[0]
      .logo_path as string | null;

  beforeAll(async () => {
    tenant = await createTenant();
    owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, ['settings_company']);
    ownerSession = await signIn(owner.email);
    ownerCookies = await cookiesFor(owner.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    const { data } = await adminDb().storage.from('media').list(`${tenant}/tenant/logo`);
    const names = (data ?? []).map((o) => `${tenant}/tenant/logo/${o.name}`);
    await adminDb()
      .storage.from('media')
      .remove([...uploaded, ...names]);
    await cleanup();
    await closeHarness();
  });

  it('T5 the check route stores a rebuilt SVG at a new path, keeps a clean one, removes unsafe ones; the save route saves the new path', async () => {
    // (a) F2 is rewritten to a new path
    const p = logoPathFor(tenant, 'svg');
    await put(p, enc(F2), 'image/svg+xml');
    state.store = new Map(ownerCookies);
    const a = await check(p);
    expect(a.res.status).toBe(200);
    const logo = (a.json as { logo: { path: string; url: string; kind: string } }).logo;
    expect(logo.kind).toBe('svg');
    expect(logo.path).not.toBe(p);
    expect(logo.path).toMatch(new RegExp(`^${tenant}/tenant/logo/[0-9a-f-]{36}\\.svg$`));
    expect(new TextDecoder().decode(await read(logo.path))).toBe(O2);
    expect(
      logo.url.startsWith(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/sign/media/${logo.path}?token=`,
      ),
    ).toBe(true);
    expect(await exists(p)).toBe(false);

    // (b) F1 is already clean: same path, same bytes
    const q = logoPathFor(tenant, 'svg');
    await put(q, enc(F1), 'image/svg+xml');
    state.store = new Map(ownerCookies);
    const b = await check(q);
    expect(b.res.status).toBe(200);
    expect((b.json as { logo: { path: string } }).logo.path).toBe(q);
    expect(new TextDecoder().decode(await read(q))).toBe(F1);

    // (c) unsafe SVGs: 400 and the object is gone
    for (const [i, svg] of UNSAFE.entries()) {
      const u = logoPathFor(tenant, 'svg');
      await put(u, enc(svg), 'image/svg+xml');
      state.store = new Map(ownerCookies);
      const c = await check(u);
      expect(c.res.status, `U ${'abcd'[i]}`).toBe(400);
      expect(c.json, `U ${'abcd'[i]}`).toEqual({
        error: { code: 'logo_svg_unsafe', message_key: 'error.logo_svg_unsafe' },
      });
      expect(await exists(u), `U ${'abcd'[i]} object`).toBe(false);
    }

    // (d) F2 saved without a prior check: the saved path is the rebuilt copy
    const r = logoPathFor(tenant, 'svg');
    await put(r, enc(F2), 'image/svg+xml');
    state.store = new Map(ownerCookies);
    const d = await patchSet(r);
    expect(d.res.status).toBe(200);
    const saved = await logoPathInDb();
    expect(saved).not.toBeNull();
    expect(saved).not.toBe(r);
    expect(new TextDecoder().decode(await read(saved as string))).toBe(O2);
    expect(await exists(r)).toBe(false);
  }, 120000);
});
