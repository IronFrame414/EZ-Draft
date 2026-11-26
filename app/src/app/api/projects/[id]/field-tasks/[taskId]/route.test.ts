// EZD-1409 (S17 Task row "edit text: Edits the task text. Edit field tasks; online only"; 07 field_task.completed
// "task, room, photos, by, at"; CLAUDE.md rule 4). next/headers is mocked and members sign in as in
// ../../field-actions/route.test.ts. Expected values: the edit route order (no session 401, no switch 403, another
// company's project 404, empty text 400, a draft 404, then 200 with the saved text); a synced task check that
// completes its task writes one field_task.completed with the task, room, photo count, member and the phone's time;
// a resend or a second check of a done task writes none.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedFieldPack } from '../../../../../../../e2e/fixtures/field-pack';
import { setPermissions } from '../../../../../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
} from '../../../../../../../test-harness/rls/fixtures';
import {
  createSessionClient,
  type SessionCookieJar,
} from '../../../../../../server/auth/supabase-server';

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

async function edit(id: string, taskId: string, body: unknown) {
  const route = await import('./route');
  const req = new Request(`http://localhost/api/projects/${id}/field-tasks/${taskId}`, {
    method: 'PATCH',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const res = await route.PATCH(req, { params: Promise.resolve({ id, taskId }) });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

async function sync(id: string, body: unknown, membership: string) {
  const route = await import('../../field-actions/route');
  const req = new Request(`http://localhost/api/projects/${id}/field-actions`, {
    method: 'POST',
    headers: { 'x-ezdraft-membership': membership },
    body: JSON.stringify(body),
  });
  const res = await route.POST(req, { params: Promise.resolve({ id }) });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

const DEVICE = '44444444-4444-4444-8444-444444444444';
const QUEUED_AT = Date.UTC(2026, 10, 21, 14, 30, 0);
const checkAction = (taskId: string) => ({
  id: crypto.randomUUID(),
  deviceId: DEVICE,
  kind: 'task_check',
  ops: { taskId, done: true },
  baseVersionId: null,
  queuedAt: QUEUED_AT,
  photo: null,
});

describe('EZD-1409 field task routes', () => {
  let tenantA = '';
  let project = '';
  let tasks: string[] = [];
  type Who = { cookies: Map<string, string>; membershipId: string; appUserId: string };
  let crew: Who;
  let office: Who;
  let officeB: Who;

  const member = async (tenant: string, permissions: string[]): Promise<Who> => {
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, permissions as never);
    return { cookies: await cookiesFor(m.email), membershipId: m.membershipId, appUserId: m.appUserId };
  };

  beforeAll(async () => {
    tenantA = await createTenant();
    const tenantB = await createTenant();
    [project] = await createProjects(tenantA, 1);
    crew = await member(tenantA, ['view_projects', 'check_off_tasks', 'photo_notes']);
    office = await member(tenantA, ['view_projects', 'edit_field_tasks']);
    officeB = await member(tenantB, ['view_projects', 'edit_field_tasks']);
    const seeded = await seedFieldPack(harnessSql(), {
      tenantId: tenantA,
      projectId: project!,
      rooms: ['Kitchen'],
      tasks: [
        { text: 'Remove upper cabinets', phase: 'Demo', phasePosition: 0, position: 0 },
        { text: 'Rough in the sink drain', phase: 'Rough-in', phasePosition: 1, position: 0 },
        { text: 'A draft', phase: 'Demo', phasePosition: 0, position: 1, status: 'draft' },
      ],
    });
    tasks = seeded.taskIds;
  }, 180000);

  afterEach(() => {
    state.store = new Map();
    vi.resetModules();
  });

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('edit text: refusals in order, then the saved text', async () => {
    const task = tasks[1]!;
    expect((await edit(project, task, { text: 'x' })).res.status).toBe(401);
    state.store = new Map(crew.cookies);
    expect((await edit(project, task, { text: 'x' })).res.status).toBe(403);
    state.store = new Map(officeB.cookies);
    expect((await edit(project, task, { text: 'x' })).res.status).toBe(404);
    state.store = new Map(office.cookies);
    expect((await edit('not-a-uuid', task, { text: 'x' })).res.status).toBe(404);
    expect((await edit(project, 'not-a-uuid', { text: 'x' })).res.status).toBe(404);
    expect((await edit(project, task, '{')).res.status).toBe(400);
    expect((await edit(project, task, { text: '  ' })).res.status).toBe(400);
    expect((await edit(project, task, { text: 'a'.repeat(1001) })).res.status).toBe(400);
    const draft = await edit(project, tasks[2]!, { text: 'x' });
    expect(draft.res.status).toBe(404);
    expect(draft.body).toMatchObject({ error: { code: 'task_not_found' } });
    const ok = await edit(project, task, { text: ' Rough in the sink drain and vent ' });
    expect(ok.res.status).toBe(200);
    expect(ok.body).toMatchObject({ textEn: 'Rough in the sink drain and vent', textEs: null });
    const [row] = await harnessSql()<{ text_en: string }[]>`
      select text_en from public.field_task where id = ${task}::uuid`;
    expect(row!.text_en).toBe('Rough in the sink drain and vent');
  });

  it('a synced check that completes its task logs field_task.completed once', async () => {
    const task = tasks[0]!;
    state.store = new Map(crew.cookies);
    const a = checkAction(task);
    expect((await sync(project, a, crew.membershipId)).res.status).toBe(200);
    expect((await sync(project, a, crew.membershipId)).body).toMatchObject({ status: 'duplicate' });
    expect((await sync(project, checkAction(task), crew.membershipId)).res.status).toBe(200);
    const logged = await harnessSql()<{ object_type: string; object_id: string; details: Record<string, unknown> }[]>`
      select object_type, object_id, details from public.event_log
      where action = 'field_task.completed' and tenant_id = ${tenantA}::uuid`;
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatchObject({ object_type: 'project', object_id: project });
    expect(logged[0]!.details).toMatchObject({
      projectId: project,
      taskId: task,
      room: 'Kitchen',
      photos: 0,
      by: crew.appUserId,
    });
    expect(Date.parse(logged[0]!.details.at as string)).toBe(QUEUED_AT);
  });
});
