// EZD-113 T6 (vault/plans/EZD-113.md section 4; AC-EZD-113-1, -3, -6). next/headers is mocked and members
// sign in as in app/src/app/api/settings/company/route.test.ts; emit is wrapped in vi.fn. Expected values:
// Decided "Change route" (404 `customer_not_found` for a non-UUID, an unknown id or another company's id;
// `changedFields` in name, email, phone, address order; archive changes only when the state differs;
// nothing changed is a 200 with no write and no event; `emit('customer.updated', { customerId, fields },
// { tenantId, actorId })`; no DELETE export), Q-0227, "Error bodies".
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import { emit } from '../../../../../server/events';

vi.mock('../../../../../server/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../server/events')>();
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

const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const err = (code: string) => ({ error: { code, message_key: `error.${code}` } });
const EDIT = {
  name: 'Ann',
  email: 'ann@example.test',
  phone: '561-555-0199',
  address: '',
};

async function patch(id: string, body: unknown): Promise<{ res: Response; json: unknown }> {
  const { PATCH } = await import('./route');
  const res = await PATCH(
    new Request(`http://localhost/api/settings/customers/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
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

describe('EZD-113 customer change route', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Member;
  let plain: Member;
  let ownerCookies: Map<string, string>;
  let plainCookies: Map<string, string>;
  let annId = '';
  let otherBId = '';

  const asOwner = () => {
    state.store = new Map(ownerCookies);
  };
  const row = async () =>
    (
      await harnessSql()`select name, email, phone, address, archived_at from public.customer where id = ${annId}::uuid`
    )[0];
  const updated = (fields: string[]) => [
    'customer.updated',
    { customerId: annId, fields },
    { tenantId: tenantA, actorId: owner.appUserId },
  ];

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    owner = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, owner.membershipId, ['settings_company']);
    plain = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, plain.membershipId, []);
    ownerCookies = await cookiesFor(owner.email);
    plainCookies = await cookiesFor(plain.email);
    const sql = harnessSql();
    annId = (
      await sql<{ id: string }[]>`insert into public.customer (tenant_id, name, email)
        values (${tenantA}::uuid, 'Ann', 'ann@example.test') returning id`
    )[0].id;
    await sql`insert into public.customer (tenant_id, name, email)
      values (${tenantA}::uuid, 'Other', 'other@example.test')`;
    otherBId = (
      await sql<{ id: string }[]>`insert into public.customer (tenant_id, name, email)
        values (${tenantB}::uuid, 'Other Co', 'co@example.test') returning id`
    )[0].id;
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

  it('T6 PATCH edits: the changed fields in order, a repeat with no event, a taken email refused', async () => {
    asOwner();
    const a = await patch(annId, EDIT);
    expect(a.res.status).toBe(200);
    expect(a.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect((a.json as { customer: { phone: string } }).customer.phone).toBe('561-555-0199');
    expect((await row()).phone).toBe('561-555-0199');
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(...updated(['phone']));

    emitMock.mockClear();
    asOwner();
    const b = await patch(annId, EDIT);
    expect(b.res.status).toBe(200);
    expect(emitMock).not.toHaveBeenCalled();

    asOwner();
    const c = await patch(annId, { ...EDIT, name: 'Ann Lee', email: 'ann.lee@example.test' });
    expect(c.res.status).toBe(200);
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(...updated(['name', 'email']));
    expect((await row()).email).toBe('ann.lee@example.test');

    emitMock.mockClear();
    asOwner();
    const d = await patch(annId, {
      ...EDIT,
      name: 'Ann Lee',
      email: 'other@example.test',
    });
    expect(d.res.status).toBe(400);
    expect(d.json).toEqual(err('customer_email_taken'));
    expect(emitMock).not.toHaveBeenCalled();
    expect((await row()).email).toBe('ann.lee@example.test');
  });

  it('T6 PATCH archive and restore: the state changes once, a repeat changes nothing', async () => {
    asOwner();
    const a = await patch(annId, { archived: true });
    expect(a.res.status).toBe(200);
    expect(
      (a.json as { customer: { archivedAt: string | null } }).customer.archivedAt,
    ).not.toBeNull();
    expect((await row()).archived_at).not.toBeNull();
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(...updated(['archived']));

    emitMock.mockClear();
    asOwner();
    const b = await patch(annId, { archived: true });
    expect(b.res.status).toBe(200);
    expect(emitMock).not.toHaveBeenCalled();

    asOwner();
    const c = await patch(annId, { archived: false });
    expect(c.res.status).toBe(200);
    expect((c.json as { customer: { archivedAt: string | null } }).customer.archivedAt).toBeNull();
    expect((await row()).archived_at).toBeNull();
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(...updated(['archived']));
  });

  it("T6 PATCH refusals: an unknown id, a non-UUID and another company's customer are 404; no switch 403; bad body 400", async () => {
    for (const id of [randomUUID(), 'abc', otherBId]) {
      asOwner();
      const r = await patch(id, EDIT);
      expect(r.res.status, id).toBe(404);
      expect(r.json, id).toEqual(err('customer_not_found'));
    }
    const before =
      await harnessSql()`select name from public.customer where id = ${otherBId}::uuid`;
    expect(before[0].name).toBe('Other Co');

    state.store = new Map(plainCookies);
    const b = await patch(annId, EDIT);
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    asOwner();
    const c = await patch(annId, { archived: 'x' });
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(err('invalid_input'));
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('T6 neither route module exports DELETE', async () => {
    const one = (await import('./route')) as Record<string, unknown>;
    const all = (await import('../route')) as Record<string, unknown>;
    expect('DELETE' in one).toBe(false);
    expect('DELETE' in all).toBe(false);
  });
});
