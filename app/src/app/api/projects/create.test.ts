// EZD-118 R1 (vault/plans/EZD-118.md section 4; AC-EZD-118-6, -8, -9). next/headers is mocked and members sign in
// as in app/src/app/api/settings/customers/route.test.ts; emit is wrapped in vi.fn. Expected values: Decided
// "POST order" (401, 403, 400 invalid_input for unreadable or invalid bodies, 400 customer_unavailable with
// message_key error.project_customer_unavailable, 201 { project: { id } }, `project.created` emitted once with
// { projectId, source: 'standalone' } and ctx { tenantId, projectId, actorId }, a failed emit ignored,
// Cache-Control no-store on every response), "Event"; the EZD-007c 401 body; Q-0203.
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
import { emit } from '../../../server/events';

vi.mock('../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/events')>();
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
const INVALID = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };
const UNAVAILABLE = {
  error: { code: 'customer_unavailable', message_key: 'error.project_customer_unavailable' },
};

async function post(raw: string): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  );
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  return { res, json };
}

describe('EZD-118 POST /api/projects', () => {
  let tenant = '';
  let creator: Member;
  let creatorCookies: Map<string, string>;
  let plainCookies: Map<string, string>;
  let activeCustomer = '';
  let archivedCustomer = '';

  const count = async () =>
    Number(
      (
        await harnessSql()`select count(*) as n from public.project where tenant_id = ${tenant}::uuid`
      )[0].n,
    );
  const body = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      name: 'Kitchen remodel',
      address: '12 Oak Ave',
      type: 'kitchen',
      customerId: null,
      scopeOfWork: '',
      ...extra,
    });
  const noStore = (res: Response) =>
    expect(res.headers.get('cache-control') ?? '').toContain('no-store');

  beforeAll(async () => {
    tenant = await createTenant();
    creator = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, creator.membershipId, ['view_projects', 'create_projects']);
    const plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, []);
    creatorCookies = await cookiesFor(creator.email);
    plainCookies = await cookiesFor(plain.email);
    activeCustomer = (
      await harnessSql()`insert into public.customer (tenant_id, name, email)
        values (${tenant}::uuid, 'Ann Lee', 'ann@example.test') returning id`
    )[0].id as string;
    archivedCustomer = (
      await harnessSql()`insert into public.customer (tenant_id, name, email, archived_at)
        values (${tenant}::uuid, 'Cy Archived', 'cy@example.test', now()) returning id`
    )[0].id as string;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    emitMock.mockClear();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R1 POST: 401, 403, two 400s, a created project with one event, an unavailable customer, a failing emit', async () => {
    // (a) signed out
    state.store = new Map();
    const a = await post(body());
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);
    noStore(a.res);

    // (b) no Create projects
    state.store = new Map(plainCookies);
    const b = await post(body());
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);
    noStore(b.res);
    expect(await count()).toBe(0);

    // (c) a text body and a body missing fields
    state.store = new Map(creatorCookies);
    const c = await post('nope');
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(INVALID);
    noStore(c.res);
    state.store = new Map(creatorCookies);
    const d = await post(JSON.stringify({ name: 'x' }));
    expect(d.res.status).toBe(400);
    expect(d.json).toEqual(INVALID);
    noStore(d.res);
    expect(await count()).toBe(0);
    expect(emitMock).not.toHaveBeenCalled();

    // (d) a valid body with a customer
    state.store = new Map(creatorCookies);
    const e = await post(body({ customerId: activeCustomer }));
    expect(e.res.status).toBe(201);
    noStore(e.res);
    const id = (e.json as { project: { id: string } }).project.id;
    expect(Object.keys(e.json as object)).toEqual(['project']);
    const row = (
      await harnessSql()`select customer_id, tenant_id from public.project where id = ${id}::uuid`
    )[0];
    expect(row.customer_id).toBe(activeCustomer);
    expect(row.tenant_id).toBe(tenant);
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'project.created',
      { projectId: id, source: 'standalone' },
      { tenantId: tenant, projectId: id, actorId: creator.appUserId },
    );

    // (e) an archived customer
    const before = await count();
    emitMock.mockClear();
    state.store = new Map(creatorCookies);
    const f = await post(body({ customerId: archivedCustomer }));
    expect(f.res.status).toBe(400);
    expect(f.json).toEqual(UNAVAILABLE);
    noStore(f.res);
    expect(await count()).toBe(before);
    expect(emitMock).not.toHaveBeenCalled();

    // (f) the event fails once: the project is still created and the answer is still 201
    emitMock.mockImplementationOnce(async () => {
      throw new Error('ezd118 emit failure');
    });
    state.store = new Map(creatorCookies);
    const g = await post(body({ name: 'Emit fails' }));
    expect(g.res.status).toBe(201);
    noStore(g.res);
    const gid = (g.json as { project: { id: string } }).project.id;
    expect(await harnessSql()`select id from public.project where id = ${gid}::uuid`).toHaveLength(
      1,
    );
  });
});
