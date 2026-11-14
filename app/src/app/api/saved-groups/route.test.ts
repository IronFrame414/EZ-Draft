// EZD-233 (S03 Decisions "Save as group"; R26; 03e library_item; vault/build/assumptions.md EZD-233): the Plan
// editor's saved groups route, signed in as in app/src/app/api/settings/libraries/routes.test.ts. Expected values: Edit
// model opens it (the editor makes and places groups); only the caller's company's groups are listed; error bodies
// `{ error: { code, message_key: 'error.<code>' } }` with `permission_denied` as `error.not_authorized`; one
// library.item_created per save.
import { randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
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
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../server/auth/supabase-server';
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
const err = (code: string) => ({ error: { code, message_key: `error.${code}` } });

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}


async function list() {
  const { GET } = await import('./route');
  const res = await GET();
  return { res, json: await parse(res) };
}
async function create(raw: string) {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/saved-groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: raw,
    }),
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

const LEVEL = '11111111-1111-4111-8111-111111111111';
const lavatory = () => ({
  id: randomUUID(),
  type: 'fixture',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: {
    geometry: { center: { x: 10, y: 50 }, axis: { x: 1, y: 0 } },
    status: 'new',
    level: LEVEL,
    attributes: { kind: 'lavatory', width: 20, depth: 18 },
  },
});

describe('EZD-233 saved groups route', () => {
  let tenantA = '';
  let tenantB = '';
  let editor: Member;
  let viewer: Member;
  let editorCookies: Map<string, string>;
  let viewerCookies: Map<string, string>;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    // Edit model without the Settings > Libraries switch is enough.
    editor = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, editor.membershipId, ['view_projects', 'edit_model']);
    viewer = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, viewer.membershipId, ['view_projects', 'settings_libraries']);
    editorCookies = await cookiesFor(editor.email);
    viewerCookies = await cookiesFor(viewer.email);
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

  it('GET: 401, 403 without Edit model, then only own-company saved groups that still read, with their objects', async () => {
    const item = lavatory();
    const mine = await insertItem(tenantA, 'saved_group', 'Vanity set', { items: [item] });
    await insertItem(tenantA, 'saved_group', 'Broken', { items: [{ nope: true }] });
    await insertItem(tenantA, 'part', 'Threaded rod');
    await insertItem(tenantB, 'saved_group', 'Other company group', { items: [lavatory()] });

    state.store = new Map();
    const a = await list();
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);

    state.store = new Map(viewerCookies);
    const b = await list();
    expect(b.res.status).toBe(403);
    expect(b.json).toEqual(FORBIDDEN);

    state.store = new Map(editorCookies);
    const c = await list();
    expect(c.res.status).toBe(200);
    expect(c.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(c.json).toEqual({ groups: [{ id: mine, name: 'Vanity set', data: { items: [item] } }] });
  });

  it('POST: 401, 403, 400 for a bad name, body or object, then 201 into own company with one event', async () => {
    const good = { name: '  Hall bath vanity  ', data: { items: [lavatory(), lavatory()] } };

    state.store = new Map();
    expect((await create(JSON.stringify(good))).res.status).toBe(401);

    state.store = new Map(viewerCookies);
    const f = await create(JSON.stringify(good));
    expect(f.res.status).toBe(403);
    expect(f.json).toEqual(FORBIDDEN);

    state.store = new Map(editorCookies);
    expect((await create('{')).json).toEqual(err('invalid_input'));
    state.store = new Map(editorCookies);
    expect((await create(JSON.stringify({ ...good, name: '  ' }))).json).toEqual(
      err('library_name_required'),
    );
    state.store = new Map(editorCookies);
    expect((await create(JSON.stringify({ ...good, name: 'x'.repeat(121) }))).json).toEqual(
      err('library_name_too_long'),
    );
    state.store = new Map(editorCookies);
    expect((await create(JSON.stringify({ ...good, data: { items: [] } }))).json).toEqual(
      err('invalid_input'),
    );
    // An object the model would refuse (a lavatory 0 wide).
    const bad = lavatory();
    (bad.data.attributes as { width: number }).width = 0;
    state.store = new Map(editorCookies);
    expect((await create(JSON.stringify({ ...good, data: { items: [bad] } }))).json).toEqual(
      err('invalid_input'),
    );
    // A type that cannot be saved.
    state.store = new Map(editorCookies);
    expect(
      (await create(JSON.stringify({ ...good, data: { items: [{ ...lavatory(), type: 'pin' }] } })))
        .json,
    ).toEqual(err('invalid_input'));
    expect(emitMock).not.toHaveBeenCalled();

    state.store = new Map(editorCookies);
    const ok = await create(JSON.stringify(good));
    expect(ok.res.status).toBe(201);
    const group = (ok.json as { group: { id: string; name: string } }).group;
    expect(group.name).toBe('Hall bath vanity');
    const row = await rowOf(group.id);
    expect(row).toEqual({
      tenant_id: tenantA,
      kind: 'saved_group',
      name: 'Hall bath vanity',
      data: good.data,
    });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0]![0]).toBe('library.item_created');
    expect(emitMock.mock.calls[0]![1]).toEqual({ itemId: group.id, kind: 'saved_group' });

    // Listed again for the editor, never for the other company.
    state.store = new Map(editorCookies);
    const names = ((await list()).json as { groups: { name: string }[] }).groups.map((g) => g.name);
    expect(names).toContain('Hall bath vanity');
    const other = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.library_item
      where tenant_id = ${tenantB}::uuid and name = 'Hall bath vanity'`;
    expect(other[0]!.n).toBe(0);
  });
});
