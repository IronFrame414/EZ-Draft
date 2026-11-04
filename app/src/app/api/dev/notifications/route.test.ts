// EZD-110a T11 (vault/plans/EZD-110a.md section 4; Decided D12; AC-EZD-110-8). next/headers is mocked and the
// member signs in as in app/src/app/api/settings/customers/route.test.ts; kickJobRunner is mocked (no job
// runs). The file creates jobs through the real function, so it holds the shared job-queue lock. Expected
// values: D12 (production bare 404; 401; 400 invalid_input; 201 { notification: { id, link: '/' } } with one
// kickJobRunner per success; an RPC 42501 is 404 project_not_found). Refused projects: another company's
// project (all-scope member) and an unlisted same-company project (listed member with view_projects).
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../test-harness/rls/fixtures';
import { NOTIFICATION_KINDS } from '../../../../lib/notifications/kinds';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
import { DEV_SAMPLE_PARAMS } from '../../../dev/notifications/NotificationsProbe';

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));
const kick = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('../../../../server/jobs/kick', () => ({ kickJobRunner: kick.fn }));

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

const err = (code: string) => ({ error: { code, message_key: `error.${code}` } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function send(body: unknown): Promise<{ res: Response; text: string }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request('http://localhost/api/dev/notifications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { res, text: await res.text() };
}

describe('EZD-110a dev notifications route', () => {
  let release: () => Promise<void>;
  let tenant = '';
  let foreignProject = '';
  let cookies: Map<string, string>;
  let listedCookies: Map<string, string>;
  let unlistedProject = '';

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tenant = await createTenant();
    const other = await createTenant();
    [foreignProject] = await createProjects(other, 1);
    const member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    cookies = await cookiesFor(member.email);
    [unlistedProject] = await createProjects(tenant, 1);
    const listed = await createMember({ tenantId: tenant, scope: 'listed', listed: [] });
    await setPermissions(tenant, listed.membershipId, ['view_projects']);
    listedCookies = await cookiesFor(listed.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.unstubAllEnvs();
    vi.resetModules();
    kick.fn.mockClear();
  });

  afterAll(async () => {
    try {
      if (tenant) await harnessSql()`delete from public.job where tenant_id = ${tenant}::uuid`;
      await cleanup();
      await closeHarness();
    } finally {
      await release();
    }
  }, 180000);

  it('EZD-110a T11 production answers a bare 404 before any session work (EZD-323)', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    state.store = new Map(cookies);
    const r = await send({ kind: 'render_finished', params: {} });
    expect(r.res.status).toBe(404);
    expect(r.text).toBe('');
    expect(kick.fn).not.toHaveBeenCalled();
  });

  it('EZD-110a T11 signed out is 401 and bad input is 400 invalid_input (EZD-323)', async () => {
    state.store = new Map();
    const a = await send({ kind: 'render_finished', params: {} });
    expect(a.res.status).toBe(401);
    expect(JSON.parse(a.text)).toEqual(err('not_signed_in'));

    state.store = new Map(cookies);
    const b = await send({ kind: 'x', params: {} });
    expect(b.res.status).toBe(400);
    expect(JSON.parse(b.text)).toEqual(err('invalid_input'));

    state.store = new Map(cookies);
    const c = await send({ kind: 'edit_request', params: {} });
    expect(c.res.status).toBe(400);
    expect(JSON.parse(c.text)).toEqual(err('invalid_input'));
    expect(kick.fn).not.toHaveBeenCalled();
  }, 60000);

  it('EZD-110a T11 each of the nine kinds answers 201 with the new id and link "/", kicking the job runner once each (EZD-323)', async () => {
    for (const kind of NOTIFICATION_KINDS) {
      state.store = new Map(cookies);
      kick.fn.mockClear();
      const r = await send({ kind, params: DEV_SAMPLE_PARAMS[kind] });
      expect(r.res.status, kind).toBe(201);
      const body = JSON.parse(r.text) as { notification: { id: string; link: string } };
      expect(Object.keys(body)).toEqual(['notification']);
      expect(body.notification.id).toMatch(UUID);
      expect(body.notification.link).toBe('/');
      expect(kick.fn, kind).toHaveBeenCalledTimes(1);
    }
  }, 120000);

  it('EZD-110a T11 a project the caller cannot see answers 404 project_not_found and creates nothing (EZD-323)', async () => {
    const counts = async () =>
      (
        await harnessSql()<{ n: number; j: number }[]>`
          select (select count(*) from public.notification where tenant_id = ${tenant}::uuid)::int as n,
                 (select count(*) from public.job where tenant_id = ${tenant}::uuid)::int as j`
      )[0];
    const before = await counts();

    state.store = new Map(cookies);
    const foreign = await send({ kind: 'render_finished', projectId: foreignProject, params: {} });
    expect(foreign.res.status).toBe(404);
    expect(JSON.parse(foreign.text)).toEqual(err('project_not_found'));

    state.store = new Map(listedCookies);
    const unlisted = await send({
      kind: 'render_finished',
      projectId: unlistedProject,
      params: {},
    });
    expect(unlisted.res.status).toBe(404);
    expect(JSON.parse(unlisted.text)).toEqual(err('project_not_found'));

    expect(kick.fn).not.toHaveBeenCalled();
    expect(await counts()).toEqual(before);
  }, 60000);
});
