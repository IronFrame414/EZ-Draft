// EZD-112 T5 (vault/plans/EZD-112.md section 4; AC-EZD-112-2, -3, -8).
// next/headers is mocked and members sign in as in app/src/app/api/jobs/[id]/route.test.ts; emit is wrapped
// in vi.fn as in app/src/server/auth/password-sign-in.test.ts. Expected values: Decided "Save route" (401
// body of EZD-007c, 403 `permission_denied` / `error.not_authorized`, 400 codes, `emit('tenant.updated',
// { fields: changed }, { tenantId, actorId })` only when something changed, `Cache-Control: no-store`) and
// "Error bodies" (`message_key: 'error.<code>'`).
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
import { emit } from '../../../../server/events';

vi.mock('../../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/events')>();
  const inner = actual.createEmitter({ sinks: [] }).emit;
  return { ...actual, emit: vi.fn((...args: Parameters<typeof inner>) => inner(...args)) };
});
const emitMock = vi.mocked(emit);

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

const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const KEEP = { action: 'keep' };
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_100 = Uint8Array.from([...PNG_SIG, ...new Array(92).fill(0)]);
const SVG_SCRIPT = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
const EMPTY_CONTACT = { phone: '', email: '', website: '', address: '' };

async function patch(raw: string): Promise<{ res: Response; json: unknown }> {
  const { PATCH } = await import('./route');
  const res = await PATCH(
    new Request('http://localhost/api/settings/company', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  );
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { res, json };
}
const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: 'EZD-112 T5 Renamed',
    licenseNo: '',
    contact: EMPTY_CONTACT,
    logo: KEEP,
    ...over,
  });

describe('EZD-112 company save route', () => {
  let tenant = '';
  let owner: Member;
  let plain: Member;
  let ownerCookies: Map<string, string>;
  let plainCookies: Map<string, string>;
  let originalName = '';
  let ownerSession: Session;
  const uploaded: string[] = [];

  const nameInDb = async () =>
    (await harnessSql()`select name from public.tenant where id = ${tenant}::uuid`)[0]
      .name as string;

  beforeAll(async () => {
    tenant = await createTenant();
    owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, ['settings_company']);
    plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, []);
    ownerCookies = await cookiesFor(owner.email);
    plainCookies = await cookiesFor(plain.email);
    ownerSession = await signIn(owner.email);
    originalName = await nameInDb();
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
    emitMock.mockClear();
  });

  afterAll(async () => {
    await adminDb().storage.from('media').remove(uploaded);
    await cleanup();
    await closeHarness();
  });

  it('T5 PATCH /api/settings/company: 401, 403, 400s, a saved change with one event, a repeat with none', async () => {
    // (a) signed out
    state.store = new Map();
    const a = await patch(body());
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    // (b) a member without settings_company
    state.store = new Map(plainCookies);
    const b = await patch(body());
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual({
      error: { code: 'permission_denied', message_key: 'error.not_authorized' },
    });
    expect(await nameInDb()).toBe(originalName);

    // (c) empty name
    state.store = new Map(ownerCookies);
    const c = await patch(body({ name: '' }));
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual({
      error: { code: 'company_name_required', message_key: 'error.company_name_required' },
    });
    expect(await nameInDb()).toBe(originalName);

    // (d) a body that is not JSON
    state.store = new Map(ownerCookies);
    const d = await patch('{');
    expect(d.res.status).toBe(400);
    expect(d.json).toEqual({
      error: { code: 'invalid_input', message_key: 'error.invalid_input' },
    });

    // (e) a valid change of the name
    state.store = new Map(ownerCookies);
    emitMock.mockClear();
    const e = await patch(body());
    expect(e.res.status).toBe(200);
    expect(e.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect((e.json as { company: { name: string } }).company.name).toBe('EZD-112 T5 Renamed');
    expect(await nameInDb()).toBe('EZD-112 T5 Renamed');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'tenant.updated',
      { fields: ['name'] },
      { tenantId: tenant, actorId: owner.appUserId },
    );

    // (f) the same body again: saved, nothing changed, no event
    state.store = new Map(ownerCookies);
    emitMock.mockClear();
    const f = await patch(body());
    expect(f.res.status).toBe(200);
    expect((f.json as { company: { name: string } }).company.name).toBe('EZD-112 T5 Renamed');
    expect(emitMock).not.toHaveBeenCalled();

    // (g) a bad email
    state.store = new Map(ownerCookies);
    const g = await patch(body({ contact: { ...EMPTY_CONTACT, email: 'bad' } }));
    expect(g.res.status).toBe(400);
    expect(g.json).toEqual({
      error: { code: 'invalid_email', message_key: 'error.invalid_email' },
    });

    const logoPathInDb = async () =>
      (await harnessSql()`select logo_path from public.tenant where id = ${tenant}::uuid`)[0]
        .logo_path as string | null;
    const put = async (path: string, bytes: Uint8Array, contentType: string) => {
      const { error } = await ownerSession.serverDb.storage
        .from('media')
        .upload(path, bytes, { contentType });
      expect(error, `upload ${path}`).toBeNull();
      uploaded.push(path);
    };
    const objectExists = async (path: string) => {
      const slash = path.lastIndexOf('/');
      const name = path.slice(slash + 1);
      const { data } = await adminDb()
        .storage.from('media')
        .list(path.slice(0, slash), { search: name });
      return (data ?? []).some((o) => o.name === name);
    };

    // (h) a logo path that was never uploaded
    state.store = new Map(ownerCookies);
    emitMock.mockClear();
    const never = logoPathFor(tenant, 'png');
    const h = await patch(body({ logo: { action: 'set', path: never } }));
    expect(h.res.status).toBe(400);
    expect(h.json).toEqual({
      error: { code: 'invalid_input', message_key: 'error.invalid_input' },
    });
    expect(await logoPathInDb()).toBeNull();
    expect(emitMock).not.toHaveBeenCalled();

    // (i) a script SVG: refused, object removed
    const svgPath = logoPathFor(tenant, 'svg');
    await put(svgPath, SVG_SCRIPT, 'image/svg+xml');
    state.store = new Map(ownerCookies);
    emitMock.mockClear();
    const i = await patch(body({ logo: { action: 'set', path: svgPath } }));
    expect(i.res.status).toBe(400);
    expect(i.json).toEqual({
      error: { code: 'logo_svg_unsafe', message_key: 'error.logo_svg_unsafe' },
    });
    expect(await objectExists(svgPath)).toBe(false);
    expect(await logoPathInDb()).toBeNull();
    expect(emitMock).not.toHaveBeenCalled();

    // (j) a good PNG: saved, one logo event
    const pngPath = logoPathFor(tenant, 'png');
    await put(pngPath, PNG_100, 'image/png');
    state.store = new Map(ownerCookies);
    emitMock.mockClear();
    const j = await patch(body({ logo: { action: 'set', path: pngPath } }));
    expect(j.res.status).toBe(200);
    expect((j.json as { company: { logo: { kind: string } } }).company.logo.kind).toBe('png');
    expect(await logoPathInDb()).toBe(pngPath);
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'tenant.updated',
      { fields: ['logo'] },
      { tenantId: tenant, actorId: owner.appUserId },
    );
  });
});
