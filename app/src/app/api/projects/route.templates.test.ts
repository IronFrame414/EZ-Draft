// EZD-221a R1 (vault/plans/EZD-221a.md section 4; AC-EZD-221-2, -3, -6; the ticket's Done when). Pattern
// create.test.ts: next/headers is mocked, members sign in, emit is wrapped in vi.fn. Expected values: section 3
// route row (201 { project: { id } }; a bad template 400 invalid_input with message_key error.invalid_input),
// Decided "parseNewProject", "createProject", "Route" (route.ts unchanged); Q-0566 (Create projects, not Edit
// model); M1 (walls at the Ceiling height, one room named after the template); the floor from trigger
// project_first_floor. The base body is the EZD-118 valid body (new-project-input.test.ts:9-15).
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

const INVALID = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };

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

describe('EZD-221a POST /api/projects with a template', () => {
  let tenant = '';
  let creator: Member;
  let creatorCookies: Map<string, string>;

  const count = async () =>
    Number(
      (
        await harnessSql()`select count(*) as n from public.project where tenant_id = ${tenant}::uuid`
      )[0].n,
    );
  const body = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      name: '  Kitchen remodel ',
      address: ' 12 Oak Ave  ',
      type: 'kitchen',
      customerId: null,
      scopeOfWork: '  ',
      ...extra,
    });
  const objectsOf = async (projectId: string) =>
    harnessSql()`select type, data->'attributes'->>'height' as height, data->'attributes'->>'name' as name
      from public.model_object where project_id = ${projectId}::uuid`;

  beforeAll(async () => {
    tenant = await createTenant();
    creator = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, creator.membershipId, ['create_projects']);
    creatorCookies = await cookiesFor(creator.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    emitMock.mockClear();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-221a R1 route: an L-kitchen template makes four walls at the Ceiling height and the room, a bad one writes nothing', async () => {
    // (a) the L-kitchen template, ceiling 108, by a member with Create projects and not Edit model
    state.store = new Map(creatorCookies);
    const a = await post(
      body({ template: { key: 'l_kitchen', width: 141.5, length: 168, ceilingHeight: 108 } }),
    );
    expect(a.res.status).toBe(201);
    expect(Object.keys(a.json as object)).toEqual(['project']);
    const id = (a.json as { project: { id: string } }).project.id;
    const objs = await objectsOf(id);
    const walls = objs.filter((o) => o.type === 'wall');
    expect(walls).toHaveLength(4);
    for (const w of walls) expect(w.height).toBe('108');
    const rooms = objs.filter((o) => o.type === 'room');
    expect(rooms).toHaveLength(1);
    expect(rooms[0].name).toBe('L-kitchen');

    // (b) a refused template: 400 and no project written
    const before = await count();
    state.store = new Map(creatorCookies);
    const b = await post(
      body({ template: { key: 'l_kitchen', width: 0, length: 168, ceilingHeight: 108 } }),
    );
    expect(b.res.status).toBe(400);
    expect(b.json).toEqual(INVALID);
    expect(await count()).toBe(before);

    // (c) no template: 201 and only the floor
    state.store = new Map(creatorCookies);
    const c = await post(body());
    expect(c.res.status).toBe(201);
    const cid = (c.json as { project: { id: string } }).project.id;
    const cobjs = await objectsOf(cid);
    expect(cobjs).toHaveLength(1);
    expect(cobjs[0].type).toBe('floor');
  });
});
