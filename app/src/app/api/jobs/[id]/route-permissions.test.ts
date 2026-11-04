// EZD-145 P1, P2 and the done-when test (vault/plans/EZD-145.md section 4; AC-EZD-145-1; Q-0279 (b)): the
// job read route needs View projects and the dev enqueue route needs Edit model on the project, checked on
// the server with can(). next/headers is mocked and members sign in as in route.test.ts (EZD-009 T16, T24).
// Expected values: section 3 (status codes, bodies, order), EZD-102 section 3 (403 body), EZD-009 (404 body).
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

const NOT_SIGNED_IN_BODY = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const PERMISSION_DENIED_BODY = {
  error: { code: 'permission_denied', message_key: 'error.not_authorized' },
};
const JOB_NOT_FOUND_BODY = { error: { code: 'job_not_found', message_key: 'error.job_not_found' } };
const PROJECT_NOT_FOUND_BODY = {
  error: { code: 'project_not_found', message_key: 'error.project_not_found' },
};
const INVALID_INPUT_BODY = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };

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

async function callGet(id: string): Promise<{ res: Response; text: string }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/jobs/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { res, text: await res.text() };
}

async function callPost(body: string): Promise<{ res: Response; text: string }> {
  const { POST } = await import('../../dev/jobs/route');
  const res = await POST(
    new Request('http://localhost/api/dev/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    }),
  );
  return { res, text: await res.text() };
}

describe('EZD-145 job routes check permissions', () => {
  let tenantA = '';
  let projectP = '';
  let jobId = '';
  let tenantJobId = '';
  let nCookies: Map<string, string>;
  let vCookies: Map<string, string>;
  let lCookies: Map<string, string>;
  let eCookies: Map<string, string>;
  let release: () => Promise<void>;

  async function insertFinishedJob(projectId: string | null): Promise<string> {
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tenantA,
        project_id: projectId,
        kind: 'test',
        payload: { steps: 2, stepMs: 0 },
        max_attempts: 3,
        status: 'done',
        progress: 100,
        attempts: 1,
        result: { steps: 2 },
        finished_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    return (data as { id: string }).id;
  }

  async function countJobs(): Promise<number> {
    const { count, error } = await adminDb()
      .from('job')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantA);
    expect(error).toBeNull();
    return count ?? 0;
  }

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tenantA = await createTenant();
    const [p, q] = await createProjects(tenantA, 2);
    projectP = p;
    jobId = await insertFinishedJob(p);
    tenantJobId = await insertFinishedJob(null);

    // n: no switches at all; v: View projects only; l: listed on Q only, with both switches;
    // e: all projects, with both switches.
    const n = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, n.membershipId, []);
    const v = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, v.membershipId, ['view_projects']);
    const l = await createMember({ tenantId: tenantA, scope: 'listed', listed: [q] });
    await setPermissions(tenantA, l.membershipId, ['view_projects', 'edit_model']);
    const e = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, e.membershipId, ['view_projects', 'edit_model']);
    nCookies = await cookiesFor(n.email);
    vCookies = await cookiesFor(v.email);
    lCookies = await cookiesFor(l.email);
    eCookies = await cookiesFor(e.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    try {
      await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
      await cleanup();
    } finally {
      await closeHarness();
      await release?.();
    }
  });

  it('EZD-145 P1 read route: 403 without View projects, 200 with it, 404 for a listed member outside the project', async () => {
    // n has no switch: 403 before the id is read, so the answer is the same for a job, a bad id and a
    // tenant-level job.
    for (const id of [jobId, 'not-a-uuid', tenantJobId]) {
      state.store = new Map(nCookies);
      const r = await callGet(id);
      expect(r.res.status, id).toBe(403);
      expect(r.res.headers.get('cache-control') ?? '', id).toContain('no-store');
      expect(JSON.parse(r.text), id).toEqual(PERMISSION_DENIED_BODY);
    }

    // v has View projects on all projects: the project job, then the tenant-level job.
    state.store = new Map(vCookies);
    const vJob = await callGet(jobId);
    expect(vJob.res.status).toBe(200);
    expect((JSON.parse(vJob.text) as { job: { id: string } }).job.id).toBe(jobId);
    state.store = new Map(vCookies);
    const vTenantJob = await callGet(tenantJobId);
    expect(vTenantJob.res.status).toBe(200);
    const tenantJob = (JSON.parse(vTenantJob.text) as { job: { id: string; projectId: unknown } })
      .job;
    expect(tenantJob.id).toBe(tenantJobId);
    expect(tenantJob.projectId).toBeNull();

    // l is listed on Q only: the job on P and the tenant-level job are both 404 job_not_found.
    for (const id of [jobId, tenantJobId]) {
      state.store = new Map(lCookies);
      const r = await callGet(id);
      expect(r.res.status, id).toBe(404);
      expect(JSON.parse(r.text), id).toEqual(JOB_NOT_FOUND_BODY);
    }
  });

  it('EZD-145 P2 dev route: 403 without Edit model before the body is read, 404 for an unlisted project, 400 once past the check, 401 signed out, no job made', async () => {
    const valid = JSON.stringify({ projectId: projectP, steps: 1, stepMs: 0 });
    const before = await countJobs();

    // n has no switch: 403 for a valid body and for a body that is not JSON.
    for (const body of [valid, 'not json']) {
      state.store = new Map(nCookies);
      const r = await callPost(body);
      expect(r.res.status, body).toBe(403);
      expect(JSON.parse(r.text), body).toEqual(PERMISSION_DENIED_BODY);
    }

    // v has View projects only.
    state.store = new Map(vCookies);
    const rv = await callPost(valid);
    expect(rv.res.status).toBe(403);
    expect(JSON.parse(rv.text)).toEqual(PERMISSION_DENIED_BODY);

    // l has Edit model but is listed on Q only; the project is P.
    state.store = new Map(lCookies);
    const rl = await callPost(valid);
    expect(rl.res.status).toBe(404);
    expect(JSON.parse(rl.text)).toEqual(PROJECT_NOT_FOUND_BODY);

    // e passes the check, so the invalid body (steps 0) reaches the 400.
    state.store = new Map(eCookies);
    const re = await callPost(JSON.stringify({ projectId: projectP, steps: 0, stepMs: 0 }));
    expect(re.res.status).toBe(400);
    expect(JSON.parse(re.text)).toEqual(INVALID_INPUT_BODY);

    // Signed out.
    state.store = new Map();
    const rs = await callPost(valid);
    expect(rs.res.status).toBe(401);
    expect(JSON.parse(rs.text)).toEqual(NOT_SIGNED_IN_BODY);

    expect(await countJobs()).toBe(before);
  });

  it('EZD-145 done when: a member without the switch gets 403 from both routes', async () => {
    state.store = new Map(nCookies);
    const read = await callGet(jobId);
    expect(read.res.status).toBe(403);
    expect(JSON.parse(read.text)).toEqual(PERMISSION_DENIED_BODY);

    state.store = new Map(nCookies);
    const write = await callPost(JSON.stringify({ projectId: projectP, steps: 1, stepMs: 0 }));
    expect(write.res.status).toBe(403);
    expect(JSON.parse(write.text)).toEqual(PERMISSION_DENIED_BODY);
  });
});
