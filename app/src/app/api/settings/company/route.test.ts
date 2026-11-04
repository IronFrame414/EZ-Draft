// EZD-112 T5 (vault/plans/EZD-112.md section 4; AC-EZD-112-2, -3, -8).
// next/headers is mocked and members sign in as in app/src/app/api/jobs/[id]/route.test.ts; emit is wrapped
// in vi.fn as in app/src/server/auth/password-sign-in.test.ts. Expected values: Decided "Save route" (401
// body of EZD-007c, 403 `permission_denied` / `error.not_authorized`, 400 codes, `emit('tenant.updated',
// { fields: changed }, { tenantId, actorId })` only when something changed, `Cache-Control: no-store`) and
// "Error bodies" (`message_key: 'error.<code>'`).
import * as Sentry from '@sentry/nextjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import { holdErrorAlertLock } from '../../../../../test-harness/errors/alert-lock';
import { eventsIn } from '../../../../../test-harness/sentry-outbox';
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
import { errorFingerprint } from '../../../../server/errors/fingerprint';
import { initErrorReporting } from '../../../../server/errors/sentry-options';
import {
  clearSentryStubOutbox,
  readSentryStubOutbox,
} from '../../../../server/errors/test-harness/sentry-stub-transport';
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

// EZD-283 (vault/plans/EZD-283.md sections 3-4; AC-EZD-283-1): a Company save whose tenant.updated emit fails
// still answers 200 and reports the failure once through reportError. Setup copies route-failure.test.ts
// (EZD-169) lines 115-145; the report checks copy its expectReportedOnce and expectNothingReported.
describe('EZD-283 company save reports a failed tenant.updated event', () => {
  let tenant = '';
  let owner: Member;
  let ownerCookies: Map<string, string>;
  let releaseLock: () => Promise<void> = async () => {};

  const nameInDb = async () =>
    (await harnessSql()`select name from public.tenant where id = ${tenant}::uuid`)[0]
      .name as string;

  // Nothing reported: no stub event and no error_alert row.
  async function expectNothingReported() {
    await Sentry.flush(2000);
    expect(eventsIn(readSentryStubOutbox())).toHaveLength(0);
    const { data, error } = await adminDb().from('error_alert').select('kind');
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  }

  beforeAll(async () => {
    releaseLock = await holdErrorAlertLock();
    await harnessSql()`delete from public.error_alert`;
    initErrorReporting({ SENTRY_TRANSPORT: 'stub' }, 'function');
    tenant = await createTenant();
    owner = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, owner.membershipId, ['settings_company']);
    ownerCookies = await cookiesFor(owner.email);
  }, 180000);

  beforeEach(async () => {
    clearSentryStubOutbox();
    await harnessSql()`delete from public.error_alert`;
    emitMock.mockClear();
  });

  afterEach(() => {
    state.store = new Map();
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

  it('EZD-283 T1 a save whose tenant.updated emit succeeds reports nothing', async () => {
    state.store = new Map(ownerCookies);
    const r = await patch(body({ name: 'EZD-283 T1 Renamed' }));
    expect(r.res.status).toBe(200);
    expect((r.json as { company: { name: string } }).company.name).toBe('EZD-283 T1 Renamed');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'tenant.updated',
      { fields: ['name'] },
      { tenantId: tenant, actorId: owner.appUserId },
    );
    await expectNothingReported();
  });

  it('EZD-283 T2 a save whose tenant.updated emit fails still answers 200 and reports once', async () => {
    emitMock.mockRejectedValueOnce(
      Object.assign(new Error('ezd283-probe-detail'), { name: 'ProbeEmitError' }),
    );
    state.store = new Map(ownerCookies);
    const r = await patch(body({ name: 'EZD-283 T2 Renamed' }));
    expect(r.res.status).toBe(200);
    expect(r.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect((r.json as { company: { name: string } }).company.name).toBe('EZD-283 T2 Renamed');
    expect(await nameInDb()).toBe('EZD-283 T2 Renamed');
    expect(emitMock).toHaveBeenCalledTimes(1);
    // The response scan is only meaningful if the body was read: the saved name must be in it.
    const responseText = JSON.stringify(r.json);
    expect(responseText).toContain('EZD-283 T2 Renamed');
    expect(responseText).not.toContain('ezd283-probe-detail');

    await Sentry.flush(2000);
    const events = eventsIn(readSentryStubOutbox());
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event.exception.values[0].type).toBe('Error');
    expect(event.exception.values[0].value).toBe('company_tenant_event_failed');
    expect(event.tags['ezd.source']).toBe('function');
    expect(event.tags['ezd.location']).toBe('/api/settings/company');
    expect(event.tags['ezd.cause']).toBe('ProbeEmitError');
    // The event scan is only meaningful if the event was read: its cause tag must be in it.
    const eventText = JSON.stringify(event);
    expect(eventText).toContain('ProbeEmitError');
    expect(eventText).not.toContain('ezd283-probe-detail');

    const { data, error } = await adminDb()
      .from('error_alert')
      .select('kind, source, title, fingerprint, ref, occurrences');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toEqual({
      kind: 'error',
      source: 'function',
      title: 'Error: company_tenant_event_failed',
      fingerprint: await errorFingerprint({
        source: 'function',
        type: 'Error',
        message: 'company_tenant_event_failed',
        location: '/api/settings/company',
      }),
      ref: event.event_id,
      occurrences: 1,
    });
  });
});
