// EZD-711 (S01 Property appraiser link; S13 Decision 9; vault/build/assumptions.md EZD-711 "Which appraiser sites the
// server reads"): POST /api/property-records/read. Same sign-in and mocks as
// app/src/app/api/projects/[id]/plan-scale/route.test.ts; the job runner kick is mocked (no run starts). Expected
// values: the route header order (401, 403 without Edit model, 400 invalid_input, 403 in the wizard without Create
// projects or all-projects scope, 404 out of scope, 202 `{ jobId }`, 200 unreadable for another site) and the job
// payloads of the three purposes.
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
import { createSessionClient, type SessionCookieJar } from '../../../../server/auth/supabase-server';

vi.mock('../../../../server/jobs/kick', () => ({ kickJobRunner: vi.fn() }));

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

async function jsonOf(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const codeOf = (json: unknown) => (json as { error?: { code?: string } }).error?.code;

async function post(init: { json?: unknown; form?: FormData; raw?: string }): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const req =
    init.form !== undefined
      ? new Request('http://localhost/api/property-records/read', { method: 'POST', body: init.form })
      : new Request('http://localhost/api/property-records/read', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: init.raw ?? JSON.stringify(init.json),
        });
  const res = await POST(req);
  return { res, json: await jsonOf(res) };
}

const URL_PBC = 'https://pbcpao.gov/Property/Details?parcelId=00434421010000010';

describe('EZD-711 appraiser read route', () => {
  let tenant = '';
  let p1 = '';
  let p2 = '';
  let editor: Map<string, string>;
  let viewer: Map<string, string>;
  let listed: Map<string, string>;
  let noCreate: Map<string, string>;
  let release: () => Promise<void>;

  const job = async (id: string) =>
    (
      await harnessSql()<{ project_id: string | null; kind: string; payload: unknown; tenant_id: string }[]>`
        select project_id, kind, payload, tenant_id from public.job where id = ${id}::uuid`
    )[0];

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tenant = await createTenant();
    [p1, p2] = await createProjects(tenant, 2);
    const e = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, e.membershipId, ['view_projects', 'create_projects', 'edit_model']);
    const v = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, v.membershipId, ['view_projects', 'create_projects']);
    const l = await createMember({ tenantId: tenant, scope: 'listed', listed: [p1] });
    await setPermissions(tenant, l.membershipId, ['view_projects', 'create_projects', 'edit_model']);
    const n = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, n.membershipId, ['view_projects', 'edit_model']);
    editor = await cookiesFor(e.email);
    viewer = await cookiesFor(v.email);
    listed = await cookiesFor(l.email);
    noCreate = await cookiesFor(n.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    if (tenant) await harnessSql()`delete from public.job where tenant_id = ${tenant}::uuid`;
    await release();
    await cleanup();
    await closeHarness();
  });

  it('refuses no session, no Edit model and bad bodies', async () => {
    expect((await post({ json: { projectId: p1, url: URL_PBC } })).res.status).toBe(401);
    state.store = new Map(viewer);
    const b = await post({ json: { projectId: p1, url: URL_PBC } });
    expect(b.res.status).toBe(403);
    for (const body of [
      '{',
      JSON.stringify({ url: URL_PBC }),
      JSON.stringify({ projectId: 'x', url: URL_PBC }),
      JSON.stringify({ projectId: p1, url: URL_PBC, text: 'both' }),
      JSON.stringify({ projectId: p1, text: '  ' }),
      JSON.stringify({ projectId: p1, text: 'x'.repeat(12_001) }),
    ]) {
      state.store = new Map(editor);
      const r = await post({ raw: body });
      expect(r.res.status, body).toBe(400);
      expect(codeOf(r.json), body).toBe('invalid_input');
    }
    state.store = new Map(editor);
    const form = new FormData();
    form.set('projectId', p1);
    form.set('screenshot', new Blob(['%PDF'], { type: 'application/pdf' }), 'page.pdf');
    expect((await post({ form })).res.status).toBe(400);
  }, 120000);

  it('a link to another site answers unreadable with no job', async () => {
    state.store = new Map(editor);
    const r = await post({ json: { projectId: p1, url: 'https://example.com/parcel' } });
    expect(r.res.status).toBe(200);
    expect(r.json).toEqual({ output: { status: 'unreadable' } });
  });

  it('a link, pasted text and a screenshot each start one ai_read job', async () => {
    state.store = new Map(editor);
    const a = await post({ json: { projectId: p1, url: URL_PBC } });
    expect(a.res.status).toBe(202);
    const aJob = await job((a.json as { jobId: string }).jobId);
    expect(aJob).toEqual({
      project_id: p1,
      kind: 'ai_read',
      tenant_id: tenant,
      payload: { purpose: 'property_appraiser.read', input: { url: URL_PBC } },
    });

    state.store = new Map(editor);
    const b = await post({ json: { projectId: null, text: 'Owner(s) HENDRICKS FAMILY TRUST' } });
    expect(b.res.status).toBe(202);
    expect(await job((b.json as { jobId: string }).jobId)).toEqual({
      project_id: null,
      kind: 'ai_read',
      tenant_id: tenant,
      payload: { purpose: 'property_appraiser.text', input: { text: 'Owner(s) HENDRICKS FAMILY TRUST' } },
    });

    state.store = new Map(editor);
    const form = new FormData();
    form.set('projectId', p1);
    form.set('screenshot', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'page.png');
    const c = await post({ form });
    expect(c.res.status).toBe(202);
    const cJob = await job((c.json as { jobId: string }).jobId);
    const input = (cJob.payload as { input: { image: { bucket: string; path: string }; mediaType: string } }).input;
    expect(input.mediaType).toBe('image/png');
    expect(input.image.bucket).toBe('jobs');
    expect(input.image.path).toMatch(new RegExp(`^${tenant}/${p1}/property-appraiser/[0-9a-f-]{36}/in/screenshot\\.png$`));
    const stored = await adminDb().storage.from('jobs').download(input.image.path);
    expect(new Uint8Array(await stored.data!.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
    await adminDb().storage.from('jobs').remove([input.image.path]);
  }, 120000);

  it('the wizard read needs Create projects and all-projects scope; a project read needs it in scope', async () => {
    state.store = new Map(noCreate);
    expect((await post({ json: { projectId: null, url: URL_PBC } })).res.status).toBe(403);
    state.store = new Map(listed);
    expect((await post({ json: { projectId: null, url: URL_PBC } })).res.status).toBe(403);
    state.store = new Map(listed);
    const out = await post({ json: { projectId: p2, url: URL_PBC } });
    expect(out.res.status).toBe(404);
    state.store = new Map(listed);
    expect((await post({ json: { projectId: p1, url: URL_PBC } })).res.status).toBe(202);
  }, 120000);
});
