// EZD-606 (S06 Controls "Existing panel ... panel label photo (AI reads brand, rating, spaces; user confirms) ...
// read from directory photo ... Edit model"; 03 rule 4: one company cannot reach another's rows): POST
// /api/projects/[id]/panel-read. Same sign-in and mocks as app/src/app/api/property-records/read/route.test.ts; the
// job runner kick is mocked (no run starts). Expected values: the route header order (401, 403 without Edit model,
// 404 malformed project or out of scope, 400 invalid_input, 404 file_not_found, 202 `{ jobId }`) and the job
// payload of each read.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';

vi.mock('../../../../../server/jobs/kick', () => ({ kickJobRunner: vi.fn() }));

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

async function post(project: string, json: unknown): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const req = new Request(`http://localhost/api/projects/${project}/panel-read`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof json === 'string' ? json : JSON.stringify(json),
  });
  const res = await POST(req, { params: Promise.resolve({ id: project }) });
  return { res, json: await jsonOf(res) };
}

async function sourceFile(
  tenant: string,
  project: string,
  kind: string,
  opts: { uploaded?: boolean; type?: string } = {},
): Promise<{ id: string; path: string }> {
  const id = randomUUID();
  const path = `${tenant}/${project}/${id}`;
  await harnessSql()`insert into public.source_file
    (id, tenant_id, project_id, kind, storage_path, original_name, content_type, size_bytes, uploaded_at)
    values (${id}::uuid, ${tenant}::uuid, ${project}::uuid, ${kind}, ${path},
      'label.jpg', ${opts.type ?? 'image/jpeg'}, 4, ${opts.uploaded === false ? null : new Date()})`;
  return { id, path };
}

describe('EZD-606 panel read route', () => {
  let tenant = '';
  let other = '';
  let p1 = '';
  let p2 = '';
  let p3 = '';
  let editor: Map<string, string>;
  let viewer: Map<string, string>;
  let listed: Map<string, string>;
  let release: () => Promise<void>;

  const job = async (id: string) =>
    (
      await harnessSql()<
        { project_id: string | null; kind: string; payload: unknown; tenant_id: string }[]
      >`
        select project_id, kind, payload, tenant_id from public.job where id = ${id}::uuid`
    )[0];

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tenant = await createTenant();
    other = await createTenant();
    [p1, p2] = await createProjects(tenant, 2);
    [p3] = await createProjects(other, 1);
    const e = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, e.membershipId, ['view_projects', 'edit_model']);
    const v = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, v.membershipId, ['view_projects']);
    const l = await createMember({ tenantId: tenant, scope: 'listed', listed: [p2] });
    await setPermissions(tenant, l.membershipId, ['view_projects', 'edit_model']);
    editor = await cookiesFor(e.email);
    viewer = await cookiesFor(v.email);
    listed = await cookiesFor(l.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    for (const t of [tenant, other]) {
      if (!t) continue;
      await harnessSql()`delete from public.job where tenant_id = ${t}::uuid`;
      await harnessSql()`delete from public.source_file where tenant_id = ${t}::uuid`;
    }
    await release();
    await cleanup();
    await closeHarness();
  });

  it('refuses no session, no Edit model, a bad project, out of scope and bad bodies', async () => {
    const f = await sourceFile(tenant, p1, 'panel_photo');
    expect((await post(p1, { fileId: f.id, read: 'label' })).res.status).toBe(401);
    state.store = new Map(viewer);
    expect((await post(p1, { fileId: f.id, read: 'label' })).res.status).toBe(403);
    state.store = new Map(editor);
    expect((await post('nope', { fileId: f.id, read: 'label' })).res.status).toBe(404);
    state.store = new Map(listed);
    const out = await post(p1, { fileId: f.id, read: 'label' });
    expect(out.res.status).toBe(404);
    expect(codeOf(out.json)).toBe('project_not_found');
    for (const body of [
      '{',
      { fileId: f.id },
      { fileId: 'x', read: 'label' },
      { fileId: f.id, read: 'meter' },
    ]) {
      state.store = new Map(editor);
      const r = await post(p1, body);
      expect(r.res.status, JSON.stringify(body)).toBe(400);
      expect(codeOf(r.json)).toBe('invalid_input');
    }
  }, 120000);

  it('a file that is not a finished JPEG or PNG panel photo of this project is not found and starts no job', async () => {
    const before = (
      await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.job where tenant_id = ${tenant}::uuid`
    )[0]!.n;
    const files = [
      await sourceFile(tenant, p1, 'photo'),
      await sourceFile(tenant, p1, 'panel_photo', { uploaded: false }),
      await sourceFile(tenant, p1, 'panel_photo', { type: 'image/heic' }),
      await sourceFile(tenant, p2, 'panel_photo'),
      // Another company's photo: the session client cannot read the row (RLS).
      await sourceFile(other, p3, 'panel_photo'),
      { id: randomUUID(), path: '' },
    ];
    for (const f of files) {
      state.store = new Map(editor);
      const r = await post(p1, { fileId: f.id, read: 'label' });
      expect(r.res.status).toBe(404);
      expect(codeOf(r.json)).toBe('file_not_found');
    }
    const after = (
      await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.job where tenant_id = ${tenant}::uuid`
    )[0]!.n;
    expect(after).toBe(before);
  }, 120000);

  it('a label and a directory read each start one ai_read job on the photo', async () => {
    const f = await sourceFile(tenant, p1, 'panel_photo');
    for (const [read, purpose] of [
      ['label', 'panel.label'],
      ['directory', 'panel.directory'],
    ] as const) {
      state.store = new Map(editor);
      const r = await post(p1, { fileId: f.id, read });
      expect(r.res.status).toBe(202);
      expect(await job((r.json as { jobId: string }).jobId)).toEqual({
        project_id: p1,
        kind: 'ai_read',
        tenant_id: tenant,
        payload: {
          purpose,
          input: { image: { bucket: 'sources', path: f.path }, mediaType: 'image/jpeg' },
        },
      });
    }
  }, 120000);
});
