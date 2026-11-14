// EZD-131 (S15h Controls, Permissions, Decisions 1, Events emitted; 03e library_item; AC-EZD-131-1). The list,
// add, change and delete routes for Settings > Libraries, signed in as in
// app/src/app/api/settings/customers/route.test.ts. Expected values: the Libraries switch opens the routes
// (S15h Permissions: Manage users and settings, split per page by Q-0210 as settings_libraries); only
// abbreviations are added here and saved groups are renamed or deleted (S15h Controls, Layout); one event
// per write (library.item_created, library.item_updated, library.item_deleted); error bodies
// `{ error: { code, message_key: 'error.<code>' } }` with `permission_denied` as `error.not_authorized`.
import { randomUUID } from 'node:crypto';
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

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function list(query: string) {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/settings/libraries${query}`));
  return { res, json: await parse(res) };
}
async function create(raw: string) {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/settings/libraries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
  );
  return { res, json: await parse(res) };
}
async function patch(id: string, raw: string) {
  const { PATCH } = await import('./[id]/route');
  const res = await PATCH(
    new Request(`http://localhost/api/settings/libraries/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
    { params: Promise.resolve({ id }) },
  );
  return { res, json: await parse(res) };
}
async function remove(id: string) {
  const { DELETE } = await import('./[id]/route');
  const res = await DELETE(
    new Request(`http://localhost/api/settings/libraries/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) },
  );
  return { res, json: await parse(res) };
}

const insertItem = async (tenant: string, kind: string, name: string, data: unknown = {}) =>
  (
    await harnessSql()<{ id: string }[]>`
      insert into public.library_item (tenant_id, kind, name, data)
      values (${tenant}::uuid, ${kind}, ${name}, ${JSON.stringify(data)}::text::jsonb)
      returning id`
  )[0].id;

const rowOf = async (id: string) =>
  (
    await harnessSql()<{ tenant_id: string; kind: string; name: string; data: unknown }[]>`
      select tenant_id, kind, name, data from public.library_item where id = ${id}::uuid`
  )[0] ?? null;

describe('EZD-131 library routes', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Member;
  let plain: Member;
  let ownerCookies: Map<string, string>;
  let plainCookies: Map<string, string>;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    owner = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, owner.membershipId, ['settings_libraries']);
    // Every other Settings switch, but not Libraries.
    plain = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, plain.membershipId, ['settings_company', 'settings_users']);
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

  it('GET: 401, 403 without the Libraries switch, 400 for a missing or unknown kind, then only own-company items of the kind', async () => {
    const mine = await insertItem(tenantA, 'saved_group', 'Vanity set');
    await insertItem(tenantA, 'part', 'Threaded rod');
    await insertItem(tenantB, 'saved_group', 'Other company group');

    state.store = new Map();
    const a = await list('?kind=saved_group');
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(plainCookies);
    const b = await list('?kind=saved_group');
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    state.store = new Map(ownerCookies);
    expect((await list('')).json).toEqual(err('invalid_input'));
    state.store = new Map(ownerCookies);
    const c = await list('?kind=detail');
    expect(c.res.status).toBe(400);
    expect(c.json).toEqual(err('invalid_input'));

    state.store = new Map(ownerCookies);
    const d = await list('?kind=saved_group');
    expect(d.res.status).toBe(200);
    expect(d.res.headers.get('cache-control') ?? '').toContain('no-store');
    const items = (d.json as { items: Record<string, unknown>[] }).items;
    expect(items.map((i) => i.id)).toEqual([mine]);
    expect(Object.keys(items[0]).sort()).toEqual(['id', 'kind', 'meaning', 'name', 'updatedAt']);
    expect(items[0]).toMatchObject({ kind: 'saved_group', name: 'Vanity set', meaning: null });

    // A tab with nothing in it lists nothing (its empty state).
    state.store = new Map(ownerCookies);
    expect((await list('?kind=note')).json).toEqual({ items: [] });
  });

  it('POST: an added abbreviation is stored for the company with one library.item_created; problems are 400', async () => {
    const GFCI = {
      kind: 'abbreviation',
      name: ' GFCI ',
      meaning: 'Ground-fault circuit interrupter',
    };

    state.store = new Map();
    expect((await create(JSON.stringify(GFCI))).res.status).toBe(401);

    state.store = new Map(plainCookies);
    const b = await create(JSON.stringify(GFCI));
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    const bad: [unknown, string][] = [
      [{ ...GFCI, name: '' }, 'library_name_required'],
      [{ ...GFCI, name: 'x'.repeat(121) }, 'library_name_too_long'],
      [{ ...GFCI, meaning: ' ' }, 'library_meaning_required'],
      [{ ...GFCI, meaning: 'm'.repeat(201) }, 'library_meaning_too_long'],
      // Only abbreviations are added from this page.
      [{ kind: 'saved_group', name: 'Group', meaning: 'x' }, 'invalid_input'],
      [{ kind: 'abbreviation', name: 'GFCI' }, 'invalid_input'],
    ];
    for (const [body, code] of bad) {
      state.store = new Map(ownerCookies);
      const r = await create(JSON.stringify(body));
      expect(r.res.status, code).toBe(400);
      expect(r.json, code).toEqual(err(code));
    }
    state.store = new Map(ownerCookies);
    expect((await create('{')).json).toEqual(err('invalid_input'));
    expect(emitMock).not.toHaveBeenCalled();

    state.store = new Map(ownerCookies);
    const g = await create(JSON.stringify(GFCI));
    expect(g.res.status).toBe(201);
    const made = (g.json as { item: { id: string } }).item;
    expect(made).toMatchObject({
      kind: 'abbreviation',
      name: 'GFCI',
      meaning: 'Ground-fault circuit interrupter',
    });
    expect(await rowOf(made.id)).toEqual({
      tenant_id: tenantA,
      kind: 'abbreviation',
      name: 'GFCI',
      data: { meaning: 'Ground-fault circuit interrupter' },
    });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'library.item_created',
      { itemId: made.id, kind: 'abbreviation' },
      { tenantId: tenantA, actorId: owner.appUserId },
    );

    // The same abbreviation in lower case is refused, with no event.
    emitMock.mockClear();
    state.store = new Map(ownerCookies);
    const h = await create(JSON.stringify({ ...GFCI, name: 'gfci' }));
    expect(h.res.status).toBe(400);
    expect(h.json).toEqual(err('library_abbreviation_taken'));
    expect(emitMock).not.toHaveBeenCalled();

    // The added abbreviation is listed afterwards.
    state.store = new Map(ownerCookies);
    const listed = (await list('?kind=abbreviation')).json as { items: { id: string }[] };
    expect(listed.items.map((i) => i.id)).toContain(made.id);
  });

  it('PATCH: renames a saved group keeping its data, edits an abbreviation, and refuses other kinds and companies', async () => {
    const group = await insertItem(tenantA, 'saved_group', 'Old group', { objects: [1, 2] });
    const abbr = await insertItem(tenantA, 'abbreviation', 'AFF', { meaning: 'Above finish' });
    const part = await insertItem(tenantA, 'part', 'Anchor');
    const foreign = await insertItem(tenantB, 'saved_group', 'Theirs');

    state.store = new Map(plainCookies);
    expect((await patch(group, JSON.stringify({ name: 'New group' }))).json).toEqual(FORBIDDEN);

    state.store = new Map(ownerCookies);
    const notUuid = await patch('nope', JSON.stringify({ name: 'x' }));
    expect(notUuid.res.status).toBe(404);
    expect(notUuid.json).toEqual(err('library_item_not_found'));

    state.store = new Map(ownerCookies);
    const other = await patch(foreign, JSON.stringify({ name: 'Mine now' }));
    expect(other.res.status).toBe(404);
    expect(other.json).toEqual(err('library_item_not_found'));
    expect((await rowOf(foreign))?.name).toBe('Theirs');

    state.store = new Map(ownerCookies);
    const ro = await patch(part, JSON.stringify({ name: 'Bolt' }));
    expect(ro.res.status).toBe(400);
    expect(ro.json).toEqual(err('library_item_read_only'));

    // A saved group takes a name only.
    state.store = new Map(ownerCookies);
    expect((await patch(group, JSON.stringify({ name: 'x', meaning: 'y' }))).json).toEqual(
      err('invalid_input'),
    );
    state.store = new Map(ownerCookies);
    expect((await patch(group, JSON.stringify({ name: ' ' }))).json).toEqual(
      err('library_name_required'),
    );
    expect(emitMock).not.toHaveBeenCalled();

    state.store = new Map(ownerCookies);
    const renamed = await patch(group, JSON.stringify({ name: 'New group' }));
    expect(renamed.res.status).toBe(200);
    expect(await rowOf(group)).toMatchObject({ name: 'New group', data: { objects: [1, 2] } });
    expect(emitMock).toHaveBeenCalledWith(
      'library.item_updated',
      { itemId: group, kind: 'saved_group', fields: ['name'] },
      { tenantId: tenantA, actorId: owner.appUserId },
    );

    // Nothing changed: 200, no event.
    emitMock.mockClear();
    state.store = new Map(ownerCookies);
    expect((await patch(group, JSON.stringify({ name: 'New group' }))).res.status).toBe(200);
    expect(emitMock).not.toHaveBeenCalled();

    state.store = new Map(ownerCookies);
    const edited = await patch(
      abbr,
      JSON.stringify({ name: 'AFF', meaning: 'Above finished floor' }),
    );
    expect(edited.res.status).toBe(200);
    expect(await rowOf(abbr)).toMatchObject({ data: { meaning: 'Above finished floor' } });
    expect(emitMock).toHaveBeenCalledWith(
      'library.item_updated',
      { itemId: abbr, kind: 'abbreviation', fields: ['data'] },
      { tenantId: tenantA, actorId: owner.appUserId },
    );
  });

  it('DELETE: removes an own saved group with one library.item_deleted; another company keeps its item', async () => {
    const group = await insertItem(tenantA, 'saved_group', 'Gone group');
    const foreign = await insertItem(tenantB, 'saved_group', 'Kept group');
    const template = await insertItem(tenantA, 'task_template', 'Kitchen');

    state.store = new Map(plainCookies);
    expect((await remove(group)).json).toEqual(FORBIDDEN);

    state.store = new Map(ownerCookies);
    expect((await remove(foreign)).json).toEqual(err('library_item_not_found'));
    expect(await rowOf(foreign)).not.toBeNull();

    state.store = new Map(ownerCookies);
    expect((await remove(template)).json).toEqual(err('library_item_read_only'));
    expect(await rowOf(template)).not.toBeNull();

    state.store = new Map(ownerCookies);
    expect((await remove(randomUUID())).res.status).toBe(404);
    expect(emitMock).not.toHaveBeenCalled();

    state.store = new Map(ownerCookies);
    const d = await remove(group);
    expect(d.res.status).toBe(200);
    expect(await rowOf(group)).toBeNull();
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith(
      'library.item_deleted',
      { itemId: group, kind: 'saved_group', name: 'Gone group' },
      { tenantId: tenantA, actorId: owner.appUserId },
    );
  });
});
