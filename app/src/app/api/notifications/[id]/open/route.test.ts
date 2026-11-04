// EZD-110a T10, open route (vault/plans/EZD-110a.md section 4; Decided D8, D10, AC-7, Q-0086). Same sign-in
// pattern as the list route test. Expected values: D10 (200 { link }; `gone` is 404 project_gone with message
// key error.job_not_found; no row or a bad id is 404 notification_not_found; a member whose view_projects was
// removed gets 403 permission_denied (error.not_authorized) from the guard before the function runs, so the
// row stays unread), D8 (Cache-Control: no-store).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';

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

const err = (code: string, key = code) => ({ error: { code, message_key: `error.${key}` } });

async function open(id: string): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/notifications/${id}/open`, { method: 'POST' }),
    { params: Promise.resolve({ id }) },
  );
  return { res, json: JSON.parse(await res.text()) as unknown };
}

describe('EZD-110a notification open route', () => {
  let tenant = '';
  let project = '';
  let a: Member;
  let b: Member;
  let c: Member;
  let aCookies: Map<string, string>;
  let cCookies: Map<string, string>;

  const addRow = async (user: Member, projectId: string | null) =>
    (
      await harnessSql()<{ id: string }[]>`
        insert into public.notification (tenant_id, user_id, kind, link, project_id)
        values (${tenant}::uuid, ${user.appUserId}::uuid, 'render_finished', '/', ${projectId})
        returning id`
    )[0].id;
  const readAt = async (id: string) =>
    (
      await harnessSql()<{ read_at: Date | null }[]>`
        select read_at from public.notification where id = ${id}::uuid`
    )[0].read_at;

  beforeAll(async () => {
    tenant = await createTenant();
    [project] = await createProjects(tenant, 1);
    a = await createMember({ tenantId: tenant, scope: 'all' });
    b = await createMember({ tenantId: tenant, scope: 'all' });
    c = await createMember({ tenantId: tenant, scope: 'all' });
    for (const m of [a, b, c]) await setPermissions(tenant, m.membershipId, ['view_projects']);
    aCookies = await cookiesFor(a.email);
    cCookies = await cookiesFor(c.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-110a T10 POST open: 200 { link }, 404 project_gone, 404 notification_not_found, always no-store', async () => {
    const visible = await addRow(a, project);
    const [doomed] = await createProjects(tenant, 1);
    const gone = await addRow(a, doomed);
    await harnessSql()`delete from public.project where id = ${doomed}::uuid`;
    const notMine = await addRow(b, null);

    state.store = new Map(aCookies);
    const r1 = await open(visible);
    expect(r1.res.status).toBe(200);
    expect(r1.json).toEqual({ link: '/' });
    expect(r1.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(await readAt(visible)).not.toBeNull();

    state.store = new Map(aCookies);
    const r2 = await open(gone);
    expect(r2.res.status).toBe(404);
    expect(r2.json).toEqual(err('project_gone', 'job_not_found'));
    expect(r2.res.headers.get('cache-control') ?? '').toContain('no-store');

    state.store = new Map(aCookies);
    const r3 = await open(notMine);
    expect(r3.res.status).toBe(404);
    expect(r3.json).toEqual(err('notification_not_found'));
    expect(r3.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(await readAt(notMine)).toBeNull();

    state.store = new Map(aCookies);
    const r4 = await open('not-a-uuid');
    expect(r4.res.status).toBe(404);
    expect(r4.json).toEqual(err('notification_not_found'));
    expect(r4.res.headers.get('cache-control') ?? '').toContain('no-store');
  }, 120000);

  it('EZD-110a T10 POST open after view_projects was removed answers 403 and leaves the row unread', async () => {
    const id = await addRow(c, project);
    await setPermissions(tenant, c.membershipId, []);

    state.store = new Map(cCookies);
    const r = await open(id);
    expect(r.res.status).toBe(403);
    expect(r.json).toEqual(err('permission_denied', 'not_authorized'));
    expect(r.res.headers.get('cache-control') ?? '').toContain('no-store');
    expect(await readAt(id)).toBeNull();
  }, 120000);
});
