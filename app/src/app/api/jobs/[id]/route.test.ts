// EZD-009 T16 and T23 (vault/plans/EZD-009.md Tests; Step 6): the job read route and the route error keys.
// next/headers is mocked and members sign in as in app/src/app/api/realtime/token/route.test.ts (EZD-018
// T17). The finished job is inserted with the admin client, so this file needs no runner. Expected values:
// Step 6 (field list, 404 shape), EZD-000 Errors and logging, EZD-007c 401 body, Q-0086 (a), Q-0030 (a).
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { holdJobQueueShared } from '../../../../../test-harness/jobs/queue-lock';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  type Member,
} from '../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../server/auth/supabase-server';
import { en } from '../../../../server/messages/catalogs/en';
import { es } from '../../../../server/messages/catalogs/es';

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
const NOT_FOUND_BODY = { error: { code: 'job_not_found', message_key: 'error.job_not_found' } };

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

async function call(id: string): Promise<{ res: Response; text: string }> {
  const { GET } = await import('./route');
  const res = await GET(new Request(`http://localhost/api/jobs/${id}`), {
    params: Promise.resolve({ id }),
  });
  return { res, text: await res.text() };
}

describe('EZD-009 job read route', () => {
  let tenantA = '';
  let o: Member;
  let oCookies: Map<string, string>;
  let bCookies: Map<string, string>;
  let jobId = '';
  let projectA = '';
  let release: () => Promise<void>;

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tenantA = await createTenant();
    const tenantB = await createTenant();
    const [p] = await createProjects(tenantA, 1);
    projectA = p;
    o = await createMember({ tenantId: tenantA, scope: 'all' });
    const b = await createMember({ tenantId: tenantB, scope: 'all' });
    oCookies = await cookiesFor(o.email);
    bCookies = await cookiesFor(b.email);
    const { data, error } = await adminDb()
      .from('job')
      .insert({
        tenant_id: tenantA,
        project_id: p,
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
    jobId = (data as { id: string }).id;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
    await cleanup();
    await closeHarness();
    await release?.();
  });

  it('EZD-009 T16 job read route: 401 signed out, 200 own job, 404 other tenant or bad id', async () => {
    // (a) no session
    state.store = new Map();
    const a = await call(jobId);
    expect(a.res.status).toBe(401);
    expect(JSON.parse(a.text)).toEqual(NOT_SIGNED_IN_BODY);

    // (b) the owner reads its own finished job
    state.store = new Map(oCookies);
    const b = await call(jobId);
    expect(b.res.status).toBe(200);
    expect(b.res.headers.get('cache-control') ?? '').toContain('no-store');
    const job = (JSON.parse(b.text) as { job: Record<string, unknown> }).job;
    expect(Object.keys(job).sort()).toEqual([
      'attempts',
      'createdAt',
      'error',
      'finishedAt',
      'id',
      'kind',
      'progress',
      'projectId',
      'result',
      'status',
      'updatedAt',
    ]);
    expect(job.result).toEqual({ steps: 2 });
    expect(job.id).toBe(jobId);

    // (c) a member of another tenant
    state.store = new Map(bCookies);
    const c = await call(jobId);
    expect(c.res.status).toBe(404);
    expect(JSON.parse(c.text)).toEqual(NOT_FOUND_BODY);

    // (d) not a uuid, and a uuid with no row
    state.store = new Map(oCookies);
    const d1 = await call('not-a-uuid');
    expect(d1.res.status).toBe(404);
    expect(JSON.parse(d1.text)).toEqual(NOT_FOUND_BODY);
    state.store = new Map(oCookies);
    const d2 = await call(randomUUID());
    expect(d2.res.status).toBe(404);
    expect(JSON.parse(d2.text)).toEqual(NOT_FOUND_BODY);
  });

  it('EZD-009 T24 the dev enqueue route refuses bad input with 400 and makes no job', async () => {
    const { POST } = await import('../../dev/jobs/route');
    const invalid = { error: { code: 'invalid_input', message_key: 'error.invalid_input' } };
    const countJobs = async () => {
      const { count, error } = await adminDb()
        .from('job')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantA);
      expect(error).toBeNull();
      return count ?? 0;
    };
    const before = await countJobs();
    const bodies = [
      'not json',
      JSON.stringify({ projectId: 'not-a-uuid', steps: 3, stepMs: 0 }),
      JSON.stringify({ projectId: projectA, steps: 0, stepMs: 0 }),
    ];
    for (const body of bodies) {
      state.store = new Map(oCookies);
      const res = await POST(
        new Request('http://localhost/api/dev/jobs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        }),
      );
      expect(res.status, body).toBe(400);
      expect(await res.json(), body).toEqual(invalid);
    }
    expect(await countJobs()).toBe(before);
  });
});

describe('EZD-009 route error keys', () => {
  it('EZD-009 T23 en holds the verbatim text and es holds non-English text for all three keys', () => {
    const english = en as Record<string, unknown>;
    const spanish = es as Record<string, unknown>;
    expect(english['error.not_authorized']).toBe("You don't have permission to do that.");
    expect(english['error.job_not_found']).toBe('That job no longer exists.');
    expect(english['error.invalid_input']).toBe(
      "Some of that information isn't valid. Check it and try again.",
    );
    for (const key of ['error.not_authorized', 'error.job_not_found', 'error.invalid_input']) {
      const value = spanish[key];
      expect(typeof value, key).toBe('string');
      expect((value as string).trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toBe(english[key]);
    }
  });
});
