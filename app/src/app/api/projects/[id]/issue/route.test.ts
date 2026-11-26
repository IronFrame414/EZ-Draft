// EZD-717 (AC-EZD-717-1; S13 Controls "Issue Rev n": "Runs the code check, generates the PDF, freezes the version,
// numbers the revision ... Result shows the PDF link with Copy link. Disabled while a gate is open. Hidden without
// Issue permit sets (Rev 0) or Issue revisions (Rev 1+)"): the issue route over HTTP. next/headers is mocked and
// members sign in as in ../code-check/route.checklist.test.ts. The job runner's kick is stubbed (no job runs here;
// the export job itself is pdf-export.db.test.ts). The checklist is the real one unless a test makes it pass, so the
// route's own steps after the gate run against the local database. Expected values: the route header.
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
  signIn,
  type Session,
} from '../../../../../../test-harness/rls/fixtures';
import { createSessionClient, type SessionCookieJar } from '../../../../../server/auth/supabase-server';

const state = vi.hoisted(() => ({ store: new Map<string, string>(), pass: false }));

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

vi.mock('../../../../../server/jobs/kick', () => ({ kickJobRunner: vi.fn() }));

vi.mock('../../../../../server/sheets/issue-checklist', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../../server/sheets/issue-checklist')>();
  return {
    loadIssueChecklist: async (...args: Parameters<typeof real.loadIssueChecklist>) => {
      const out = await real.loadIssueChecklist(...args);
      if (out === null || !state.pass) return out;
      return { ...out, checklist: { ...out.checklist, blocked: false, gates: [] } };
    },
  };
});

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
  const { data: link, error: linkError } = await adminDb().auth.admin.generateLink({ type: 'magiclink', email });
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

async function created(s: Session, name: string): Promise<string> {
  const r = await s.serverDb.rpc('create_project', {
    p_name: name,
    p_address: '336 Golfview Rd',
    p_type: 'kitchen',
    p_customer_id: null as never,
    p_scope_of_work: null as never,
  });
  if (r.error) throw new Error(`create_project failed: ${r.error.message}`);
  return (r.data as { project_id: string }[])[0].project_id;
}

async function post(id: string, body: unknown = {}) {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/issue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { res, json: (await res.json()) as Record<string, unknown> & { error?: { code: string } } };
}

async function get(id: string, query = '') {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/projects/${id}/issue${query}`), {
    params: Promise.resolve({ id }),
  });
  const text = await res.text();
  return { res, json: (text === '' ? {} : JSON.parse(text)) as Record<string, unknown> & { error?: { code: string } } };
}

describe('EZD-717 /api/projects/[id]/issue', () => {
  let project = '';
  let blockedProject = '';
  let uncheckedProject = '';
  let issuer: Map<string, string>;
  let rev0Only: Map<string, string>;
  let viewer: Map<string, string>;
  let otherCompany: Map<string, string>;

  beforeAll(async () => {
    const tenant = await createTenant();
    const tenantB = await createTenant();
    const a = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, a.membershipId, [
      'view_projects',
      'create_projects',
      'edit_model',
      'run_code_check',
      'issue_permit_sets',
      'issue_revisions',
    ]);
    const s = await signIn(a.email);
    project = await created(s, 'Issue route');
    blockedProject = await created(s, 'Issue route blocked');
    uncheckedProject = await created(s, 'Issue route unchecked');
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, b.membershipId, ['view_projects', 'issue_permit_sets']);
    const v = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, v.membershipId, ['view_projects']);
    const o = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, o.membershipId, ['view_projects', 'issue_permit_sets', 'issue_revisions']);
    issuer = await cookiesFor(a.email);
    rev0Only = await cookiesFor(b.email);
    viewer = await cookiesFor(v.email);
    otherCompany = await cookiesFor(o.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    state.pass = false;
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('401 with no session, 403 without an issue key, 404 for a malformed id or another company', async () => {
    expect((await post(project)).res.status).toBe(401);
    state.store = viewer;
    expect((await post(project)).res.status).toBe(403);
    state.store = issuer;
    expect((await post('not-a-uuid')).res.status).toBe(404);
    expect((await post(project, { password: 'x' })).res.status).toBe(400);
    state.store = otherCompany;
    expect((await post(project)).res.status).toBe(404);
    expect((await get(project)).res.status).toBe(404);
  });

  it('a blocked checklist is 409 with its gates, runs the code check, and issues nothing', async () => {
    state.store = issuer;
    const r = await post(blockedProject);
    expect(r.res.status).toBe(409);
    expect(r.json.error?.code).toBe('issue_blocked');
    // The bare project has no title block fields (S13 Issue gates "title block complete").
    expect(r.json.gates).toContain('title_block');
    const runs = await harnessSql()<{ n: string }[]>`
      select count(*)::text as n from public.code_check_run where project_id = ${blockedProject}::uuid`;
    expect(runs[0]!.n).toBe('1');
    const revs = await harnessSql()<{ n: string }[]>`
      select count(*)::text as n from public.permit_revision where project_id = ${blockedProject}::uuid`;
    expect(revs[0]!.n).toBe('0');
  });

  it('AC-EZD-717-1: Issue freezes Rev 0, queues its PDF from the frozen version, and the next issue is Rev 1', async () => {
    state.store = viewer;
    const before = await get(project);
    expect(before.res.status).toBe(200);
    expect(before.json).toEqual({ revisions: [], nextRev: 0, canIssue: false });
    state.store = rev0Only;
    expect((await get(project)).json).toMatchObject({ nextRev: 0, canIssue: true });

    state.pass = true;
    state.store = issuer;
    const r0 = await post(project);
    expect(r0.res.status).toBe(201);
    expect(r0.res.headers.get('Cache-Control')).toBe('no-store');
    expect(r0.json).toMatchObject({ revNo: 0 });
    const jobId = r0.json.jobId as string;
    const [job] = await harnessSql()<{ kind: string; payload: unknown }[]>`
      select kind, payload from public.job where id = ${jobId}::uuid`;
    expect(job).toEqual({
      kind: 'export',
      payload: { set: 'permit', revision: 0, modelVersionId: r0.json.modelVersionId },
    });
    const [rev] = await harnessSql()<{ export_job_id: string; model_version_id: string }[]>`
      select export_job_id, model_version_id from public.permit_revision where id = ${r0.json.permitRevisionId as string}::uuid`;
    expect(rev).toEqual({ export_job_id: jobId, model_version_id: r0.json.modelVersionId });

    // The PDF is not made yet (no runner here): its state is the job's, and the download waits for it.
    const pdf = await get(project, '?rev=0');
    expect(pdf.res.status).toBe(200);
    expect(pdf.json.pdf).toEqual({ revNo: 0, status: 'queued', progress: 0, file: null });
    expect((await get(project, '?rev=0&download=1')).res.status).toBe(409);
    expect((await get(project, '?rev=5')).res.status).toBe(404);
    expect((await get(project, '?rev=x')).res.status).toBe(400);

    // After Rev 0 the next issue is Rev 1, which needs Issue revisions.
    state.store = rev0Only;
    expect((await get(project)).json).toMatchObject({ nextRev: 1, canIssue: false });
    const refused = await post(project);
    expect(refused.res.status).toBe(403);
    state.store = issuer;
    const after = await get(project);
    expect(after.json).toMatchObject({ nextRev: 1, canIssue: true });
    expect((after.json.revisions as { revNo: number }[]).map((x) => x.revNo)).toEqual([0]);
    const r1 = await post(project);
    expect(r1.res.status).toBe(201);
    expect(r1.json.revNo).toBe(1);
    expect(r1.json.modelVersionId).not.toBe(r0.json.modelVersionId);
  });

  it('without Run code check, a project whose check never ran is 409 code_check and issues nothing', async () => {
    state.pass = true;
    state.store = rev0Only;
    const r = await post(uncheckedProject);
    expect(r.res.status).toBe(409);
    expect(r.json.gates).toEqual(['code_check']);
    const revs = await harnessSql()<{ n: string }[]>`
      select count(*)::text as n from public.permit_revision where project_id = ${uncheckedProject}::uuid`;
    expect(revs[0]!.n).toBe('0');
  });

  it('a malformed load calc is 400 and issues nothing', async () => {
    state.pass = true;
    state.store = issuer;
    const r = await post(project, { electrical: { case: 'proposed', method: 'standard', inputs: [], results: {} } });
    expect(r.res.status).toBe(400);
    const id = randomUUID();
    expect((await post(id)).res.status).toBe(404);
  });
});
