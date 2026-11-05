// EZD-118 R2 (vault/plans/EZD-118.md section 4; AC-EZD-118-4). next/headers is mocked and members sign in as in
// ./route.test.ts. Expected values: Q-0400 and Q-0414 (the Customers list and create routes also admit Create
// projects), Decided "Customers GET/POST" (archived=1 needs Company settings: 403; PATCH stays Company only),
// Q-0227 (archive stays with Company); the 403 body is `error.not_authorized`.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';

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
const ANN = {
  name: 'Ann Lee',
  email: 'ann@example.test',
  phone: '561-555-0100',
  address: '1 Main St',
};

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

describe('EZD-118 customers routes with Create projects', () => {
  let tenant = '';
  let creatorCookies: Map<string, string>;
  let plainCookies: Map<string, string>;
  let activeId = '';

  beforeAll(async () => {
    tenant = await createTenant();
    const creator = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, creator.membershipId, ['view_projects', 'create_projects']);
    const plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, []);
    creatorCookies = await cookiesFor(creator.email);
    plainCookies = await cookiesFor(plain.email);
    activeId = (
      await harnessSql()`insert into public.customer (tenant_id, name, email)
        values (${tenant}::uuid, 'Bo Diaz', 'bo@example.test') returning id`
    )[0].id as string;
    await harnessSql()`insert into public.customer (tenant_id, name, email, archived_at)
      values (${tenant}::uuid, 'Cy Archived', 'cy@example.test', now())`;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('R2 a Create projects member lists active customers and adds one; archived list and PATCH stay refused; no switch is refused', async () => {
    const { GET, POST } = await import('./route');
    const { PATCH } = await import('./[id]/route');
    const get = (query: string) =>
      GET(new Request(`http://localhost/api/settings/customers${query}`));
    const add = () =>
      POST(
        new Request('http://localhost/api/settings/customers', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(ANN),
        }),
      );

    state.store = new Map(creatorCookies);
    const active = await get('?archived=0');
    expect(active.status).toBe(200);
    const page = (await json(active)) as { rows: Array<{ id: string; email: string }> };
    expect(page.rows.map((r) => r.email)).toEqual(['bo@example.test']);

    state.store = new Map(creatorCookies);
    const archived = await get('?archived=1');
    expect(archived.status).toBe(403);
    expect(await json(archived)).toEqual(FORBIDDEN);

    state.store = new Map(creatorCookies);
    const created = await add();
    expect(created.status).toBe(201);

    state.store = new Map(creatorCookies);
    const patched = await PATCH(
      new Request(`http://localhost/api/settings/customers/${activeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Bo Changed' }),
      }),
      { params: Promise.resolve({ id: activeId }) },
    );
    expect(patched.status).toBe(403);
    expect(await json(patched)).toEqual(FORBIDDEN);

    state.store = new Map(plainCookies);
    const noList = await get('');
    expect(noList.status).toBe(403);
    expect(await json(noList)).toEqual(FORBIDDEN);
    state.store = new Map(plainCookies);
    const noAdd = await add();
    expect(noAdd.status).toBe(403);
    expect(await json(noAdd)).toEqual(FORBIDDEN);
  });
});
