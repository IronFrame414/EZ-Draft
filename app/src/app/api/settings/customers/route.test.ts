// EZD-113 T4 and T5 (vault/plans/EZD-113.md section 4; AC-EZD-113-1, -2, -4, -6). next/headers is mocked and
// members sign in as in app/src/app/api/settings/company/route.test.ts; emit is wrapped in vi.fn as in
// app/src/server/auth/password-sign-in.test.ts. Expected values: Decided "List route", "Create route",
// "Error bodies" (`{ error: { code, message_key: 'error.<code>' } }`, `permission_denied` is
// `error.not_authorized`, `Cache-Control: no-store`), the EZD-007c 401 body, Q-0228 (email texts).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
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
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const err = (code: string) => ({ error: { code, message_key: `error.${code}` } });
const ANN = {
  name: 'Ann Lee',
  email: 'ann@example.test',
  phone: '561-555-0100',
  address: '1 Main St',
};

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function list(query = ''): Promise<{ res: Response; json: unknown }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/settings/customers${query}`));
  return { res, json: await parse(res) };
}
async function create(raw: string): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/settings/customers', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  );
  return { res, json: await parse(res) };
}

describe('EZD-113 customers list and create routes', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Member;
  let plain: Member;
  let ownerCookies: Map<string, string>;
  let plainCookies: Map<string, string>;

  const rowsFor = async (tenant: string, email: string) =>
    harnessSql()`select id, tenant_id from public.customer where tenant_id = ${tenant}::uuid and lower(email) = ${email.toLowerCase()}`;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    owner = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, owner.membershipId, ['settings_company']);
    plain = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, plain.membershipId, []);
    ownerCookies = await cookiesFor(owner.email);
    plainCookies = await cookiesFor(plain.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
    emitMock.mockClear();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('T4 GET /api/settings/customers: 401, 403, 400 for page 0, and a 200 with exactly the decided keys', async () => {
    const sql = harnessSql();
    await sql`insert into public.customer (tenant_id, name, email) values (${tenantA}::uuid, 'T4 Row', 't4@example.test')`;

    state.store = new Map();
    const a = await list();
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(plainCookies);
    const b = await list();
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    state.store = new Map(ownerCookies);
    const c = await list('?page=0');
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(err('invalid_input'));

    state.store = new Map(ownerCookies);
    const d = await list();
    expect(d.res.status).toBe(200);
    expect(d.res.headers.get('cache-control') ?? '').toContain('no-store');
    const page = d.json as { rows: Record<string, unknown>[] };
    expect(Object.keys(page).sort()).toEqual(
      ['active', 'archived', 'page', 'pageSize', 'rows', 'total'].sort(),
    );
    expect(page.rows.length).toBeGreaterThan(0);
    for (const row of page.rows)
      expect(Object.keys(row).sort()).toEqual(
        ['address', 'archivedAt', 'email', 'id', 'name', 'phone', 'projectCount'].sort(),
      );
  });

  it('T5 POST /api/settings/customers: 401, 403, the 400 codes, a created customer with one event, a taken email', async () => {
    // (a) signed out
    state.store = new Map();
    const a = await create(JSON.stringify(ANN));
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    // (b) no switch
    state.store = new Map(plainCookies);
    const b = await create(JSON.stringify(ANN));
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);
    expect(await rowsFor(tenantA, ANN.email)).toHaveLength(0);

    // (c) empty name and email: the name comes first
    state.store = new Map(ownerCookies);
    const c = await create(JSON.stringify({ name: '', email: '', phone: '', address: '' }));
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(err('customer_name_required'));

    // (d) name ok, email empty
    state.store = new Map(ownerCookies);
    const d = await create(JSON.stringify({ ...ANN, email: '' }));
    expect(d.res.status).toBe(400);
    expect(d.json).toEqual(err('customer_email_required'));

    // (e) bad email
    state.store = new Map(ownerCookies);
    const e = await create(JSON.stringify({ ...ANN, email: 'x@' }));
    expect(e.res.status).toBe(400);
    expect(e.json).toEqual(err('invalid_email'));

    // (f) not JSON
    state.store = new Map(ownerCookies);
    const f = await create('{');
    expect(f.res.status).toBe(400);
    expect(f.json).toEqual(err('invalid_input'));
    expect(emitMock).not.toHaveBeenCalled();

    // (g) a valid customer
    state.store = new Map(ownerCookies);
    const g = await create(JSON.stringify(ANN));
    expect(g.res.status).toBe(201);
    expect(g.res.headers.get('cache-control') ?? '').toContain('no-store');
    const made = (g.json as { customer: Record<string, unknown> }).customer;
    expect(Object.keys(made).sort()).toEqual(
      ['address', 'archivedAt', 'email', 'id', 'name', 'phone'].sort(),
    );
    expect(made).toMatchObject({ ...ANN, archivedAt: null });
    const stored = await rowsFor(tenantA, ANN.email);
    expect(stored).toHaveLength(1);
    expect(stored[0].tenant_id).toBe(tenantA);
    expect(stored[0].id).toBe(made.id);
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'customer.created',
      { customerId: made.id },
      { tenantId: tenantA, actorId: owner.appUserId },
    );

    // (h) the same email in capitals is refused, with no new event
    emitMock.mockClear();
    state.store = new Map(ownerCookies);
    const h = await create(JSON.stringify({ ...ANN, name: 'Ann Two', email: 'ANN@EXAMPLE.TEST' }));
    expect(h.res.status).toBe(400);
    expect(h.json).toEqual(err('customer_email_taken'));
    expect(emitMock).not.toHaveBeenCalled();

    // (i) the email of an archived customer is refused too
    await harnessSql()`insert into public.customer (tenant_id, name, email, archived_at)
      values (${tenantA}::uuid, 'Old', 'old@example.test', now())`;
    state.store = new Map(ownerCookies);
    const i = await create(JSON.stringify({ ...ANN, name: 'Old Two', email: 'old@example.test' }));
    expect(i.res.status).toBe(400);
    expect(i.json).toEqual(err('customer_email_taken'));
    expect(emitMock).not.toHaveBeenCalled();

    // (j) an email used only in another company is free
    await harnessSql()`insert into public.customer (tenant_id, name, email)
      values (${tenantB}::uuid, 'Other Co', 'shared@example.test')`;
    state.store = new Map(ownerCookies);
    const j = await create(
      JSON.stringify({ ...ANN, name: 'Shared', email: 'shared@example.test' }),
    );
    expect(j.res.status).toBe(201);
  });
});
