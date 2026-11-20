// EZD-124 (AC-EZD-124-5, -6; CLAUDE.md rules 4, 5). Expected values: Q-0700 decisions 03 "Project Delete" (with the
// secret key the purge job removes everything under the tenant/project path in all five buckets, sources, renders,
// exports, media and jobs, sent files included, and is safe to run twice); Q-0201 (storage is freed at once).
// The job never touches a live project's files or another project's. The local Storage API only; nothing live.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expectSafeToRunTwice } from '../../../test-harness/jobs/run-twice';
import {
  adminDb,
  cleanup,
  closeHarness,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../test-harness/rls/fixtures';
import { getHandlers } from './handlers';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const BUCKETS = ['sources', 'renders', 'exports', 'media', 'jobs'] as const;

describe('EZD-124 project_purge job', () => {
  let tenant = '';
  let other = '';
  let gone = '';
  let keep = '';
  let otherTenant = '';

  const count = async (prefix: string) =>
    (
      await harnessSql()<{ n: number }[]>`
        select count(*)::int as n from storage.objects
        where bucket_id in ('sources', 'renders', 'exports', 'media', 'jobs') and starts_with(name, ${prefix})`
    )[0].n;
  const seed = async (t: string, p: string) => {
    for (const bucket of BUCKETS) {
      const names = [`${t}/${p}/a/${randomUUID()}.png`, `${t}/${p}/b/c/${randomUUID()}.png`];
      if (bucket === 'exports') names.push(`${t}/${p}/sent/${randomUUID()}/set.png`);
      for (const name of names) {
        const r = await adminDb().storage.from(bucket).upload(name, PNG, { contentType: 'image/png' });
        expect(r.error, `${bucket} ${name}`).toBeNull();
      }
    }
  };

  beforeAll(async () => {
    tenant = await createTenant();
    otherTenant = await createTenant();
    [gone, keep] = await createProjects(tenant, 2);
    [other] = await createProjects(otherTenant, 1);
    await seed(tenant, gone);
    await seed(tenant, keep);
    // The same project id under another company's prefix is never the job's.
    await seed(otherTenant, gone);
    await seed(otherTenant, other);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('is registered in production too', () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    try {
      expect(getHandlers().project_purge).toBeDefined();
    } finally {
      if (prev === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = prev;
    }
  });

  it('removes nothing while the project row exists', async () => {
    await expectSafeToRunTwice('project_purge', {
      payload: { projectId: keep },
      job: { tenant_id: tenant, project_id: null },
    });
    expect(await count(`${tenant}/${keep}/`)).toBe(11);
  });

  it('removes every file of a deleted project in all five buckets, sent files included, and is safe to run twice', async () => {
    expect(await count(`${tenant}/${gone}/`)).toBe(11);
    await harnessSql()`delete from public.project where id = ${gone}::uuid`;
    await expectSafeToRunTwice('project_purge', {
      payload: { projectId: gone },
      job: { tenant_id: tenant, project_id: null },
    });
    expect(await count(`${tenant}/${gone}/`)).toBe(0);
    expect(await count(`${tenant}/${keep}/`)).toBe(11);
    expect(await count(`${otherTenant}/${gone}/`)).toBe(11);
    expect(await count(`${otherTenant}/${other}/`)).toBe(11);
  });

  it('refuses a payload without a uuid project id', () => {
    const h = getHandlers().project_purge;
    expect(h?.payload.safeParse({ projectId: 'x' }).success).toBe(false);
    expect(h?.payload.safeParse({}).success).toBe(false);
  });

  it('the file list is the secret key only', async () => {
    const sql = harnessSql();
    const grants = await sql<{ anon: boolean; auth: boolean; service: boolean }[]>`
      select has_function_privilege('anon', 'public.list_project_purge_files(uuid, uuid, integer)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.list_project_purge_files(uuid, uuid, integer)', 'execute') as auth,
        has_function_privilege('service_role', 'public.list_project_purge_files(uuid, uuid, integer)', 'execute') as service`;
    expect(grants[0]).toEqual({ anon: false, auth: false, service: true });
  });
});
