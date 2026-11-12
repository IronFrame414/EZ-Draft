// EZD-299a T10, T11 (vault/plans/EZD-299a.md section 3 route row and section 4; Decided D-Order of checks,
// D-Cap, D-Fit, D-Labels, D-Link, D-Notify, D-Errors; AC-EZD-299-13, -15). next/headers is mocked and members
// sign in as in objects/route.test.ts; kickJobRunner is mocked as in api/dev/notifications/route.test.ts (no job
// runs there); the email job is run with runJobs({ onlyTenantId }) under the shared job-queue lock.
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
  type Member,
} from '../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../server/auth/supabase-server';
import { clearStubOutbox, readStubOutbox } from '../../../../../server/email/test-harness/stub-transport';
import { runJobs } from '../../../../../server/jobs/runner';

const state = vi.hoisted(() => ({ store: new Map<string, string>() }));
const kick = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('../../../../../server/jobs/kick', () => ({ kickJobRunner: kick.fn }));

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
const NOT_SIGNED_IN = { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } };
const FORBIDDEN = { error: { code: 'permission_denied', message_key: 'error.not_authorized' } };
const noStore = (r: Response) => expect(r.headers.get('cache-control') ?? '').toContain('no-store');

async function post(
  id: string,
  raw: string,
  membershipId?: string,
): Promise<{ res: Response; json: unknown }> {
  const { POST } = await import('./route');
  const res = await POST(
    new Request(`http://localhost/api/projects/${id}/sync-conflicts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(membershipId === undefined ? {} : { 'x-ezdraft-membership': membershipId }),
      },
      body: raw,
    }),
    { params: Promise.resolve({ id }) },
  );
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON: keep the text
  }
  return { res, json };
}

const wallChange = (number: number) => ({
  id: randomUUID(),
  baseSeq: 0,
  reason: 'conflict',
  deleted: false,
  type: 'wall',
  schemaVersion: 3,
  data: { attributes: { number } },
});
const body = (changes: unknown[]) => JSON.stringify({ changes });

type NotificationRow = { kind: string; payload: unknown; link: string };

describe('EZD-299a record route', () => {
  let release: () => Promise<void>;
  let tenant = '';
  let project = '';
  let unlistedProject = '';
  let member: Member;
  let plain: Member;
  let listed: Member;
  let memberCookies: Map<string, string>;
  let plainCookies: Map<string, string>;
  let listedCookies: Map<string, string>;

  const notifications = (projectId: string) =>
    harnessSql()<NotificationRow[]>`
      select kind, payload, link from public.notification
      where tenant_id = ${tenant}::uuid and project_id = ${projectId}::uuid
      order by created_at, id`;

  beforeAll(async () => {
    release = await holdJobQueueShared();
    tenant = await createTenant();
    [project, unlistedProject] = await createProjects(tenant, 2);
    member = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, member.membershipId, ['view_projects']);
    plain = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, plain.membershipId, []);
    listed = await createMember({ tenantId: tenant, scope: 'listed', listed: [project] });
    await setPermissions(tenant, listed.membershipId, ['view_projects']);
    memberCookies = await cookiesFor(member.email);
    plainCookies = await cookiesFor(plain.email);
    listedCookies = await cookiesFor(listed.email);
  }, 180000);

  afterEach(() => {
    state.store = new Map();
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

  it('EZD-299a T10 refuses in the contract order and answers 201 for 1000 changes', async () => {
    const one = body([wallChange(1)]);
    const before = (await notifications(project)).length;

    state.store = new Map();
    const a = await post(project, one);
    expect(a.res.status).toBe(401);
    expect(a.json).toEqual(NOT_SIGNED_IN);
    noStore(a.res);

    state.store = new Map(memberCookies);
    const b = await post(project, one, randomUUID());
    expect(b.res.status).toBe(401);
    expect(b.json).toEqual(NOT_SIGNED_IN);
    noStore(b.res);

    state.store = new Map(plainCookies);
    const c = await post(project, one, plain.membershipId);
    expect(c.res.status).toBe(403);
    expect(c.json).toEqual(FORBIDDEN);
    noStore(c.res);

    state.store = new Map(memberCookies);
    const d = await post('x', one, member.membershipId);
    expect(d.res.status).toBe(404);
    expect(d.json).toEqual(err('project_not_found'));
    noStore(d.res);

    state.store = new Map(listedCookies);
    const e = await post(unlistedProject, one, listed.membershipId);
    expect(e.res.status).toBe(404);
    expect(e.json).toEqual(err('project_not_found'));
    noStore(e.res);

    for (const raw of [
      'this is not json',
      body([]),
      body(Array.from({ length: 1001 }, (_, i) => wallChange(i + 1))),
    ]) {
      state.store = new Map(memberCookies);
      const f = await post(project, raw, member.membershipId);
      expect(f.res.status).toBe(400);
      expect(f.json).toEqual(err('invalid_input'));
      noStore(f.res);
    }
    expect((await notifications(project)).length).toBe(before);
    expect(kick.fn).not.toHaveBeenCalled();

    state.store = new Map(memberCookies);
    const ok = await post(
      project,
      body(Array.from({ length: 1000 }, (_, i) => wallChange(i + 1))),
      member.membershipId,
    );
    expect(ok.res.status).toBe(201);
    noStore(ok.res);
    const result = ok.json as { ids: string[]; notificationId: string | null };
    expect(result.ids).toHaveLength(1000);
    expect(result.notificationId).not.toBeNull();
    const rows = await notifications(project);
    expect(rows).toHaveLength(before + 1);
    const payload = rows[rows.length - 1].payload as { count: string; names: string; more: string };
    expect(payload.count).toBe('1000');
    expect(payload.more).toBe('585');
    expect(payload.names.endsWith('Wall 415')).toBe(true);
  }, 180000);

  it('EZD-299a T11 one record call makes one notification naming every refused object, and one email', async () => {
    const [P] = await createProjects(tenant, 1);
    const floor = (
      await harnessSql()<{ object_id: string }[]>`
        select object_id from public.model_object where project_id = ${P}::uuid and type = 'floor'`
    )[0].object_id;
    clearStubOutbox();
    state.store = new Map(memberCookies);
    const res = await post(
      P,
      body([
        {
          id: randomUUID(),
          baseSeq: 0,
          reason: 'conflict',
          deleted: false,
          type: 'wall',
          schemaVersion: 3,
          data: { attributes: { number: 4 } },
        },
        {
          id: randomUUID(),
          baseSeq: 0,
          reason: 'conflict',
          deleted: false,
          type: 'opening',
          schemaVersion: 3,
          data: { attributes: { kind: 'door', number: 2 } },
        },
        { id: floor, baseSeq: 1, reason: 'conflict', deleted: true },
      ]),
      member.membershipId,
    );
    expect(res.res.status).toBe(201);
    expect(kick.fn).toHaveBeenCalledTimes(1);

    const rows = await notifications(P);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('sync_conflict');
    expect(rows[0].payload).toEqual({
      count: '3',
      names: 'Wall 4, Door 2, Floor 1',
      more: '0',
    });
    expect(rows[0].link).toBe(`/projects/${P}?conflicts=open`);

    const jobs = await harnessSql()<{ n: number }[]>`
      select count(*)::int as n from public.job
      where kind = 'notification_email' and tenant_id = ${tenant}::uuid
        and payload ->> 'notificationId' = ${(res.json as { notificationId: string }).notificationId}`;
    expect(jobs[0].n).toBe(1);

    await runJobs({ onlyTenantId: tenant });
    // T10's 201 left its own email job in this tenant; runJobs sends it too, so count only T11's subject.
    const subject = "Couldn't save 3 changes: Wall 4, Door 2, Floor 1";
    const sent = readStubOutbox().filter((x) => x.to === member.email && x.subject === subject);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe(subject);
  }, 180000);
});
