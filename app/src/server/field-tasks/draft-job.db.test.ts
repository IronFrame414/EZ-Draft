// EZD-1408 AC-EZD-1408-2 on the local stack: "with the stub AI the draft job writes unpublished field_task rows per
// phase". Expected values: S22 Draft tasks with AI (drafts per room and phase from the room's template in S15h;
// never published without review, so status draft); S15h (one template per room type; the default sequence Demo,
// Rough-in, Inspection, Drywall, Finish); the built-in stub reply (jobs/handlers/field-task-draft-recording.ts DRAFT_STUB_TASKS: r1 has one
// task per default phase, two in Rough-in). Holds the shared job-queue lock; every runJobs call passes this file's
// tenant (EZD-009 Step 8).
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectSafeToRunTwice } from '../../../test-harness/jobs/run-twice';
import { holdJobQueueShared } from '../../../test-harness/jobs/queue-lock';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  adminDb,
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { clearStubRecordings, lastStubRequests, setStubRecording } from '../ai/test-harness/stub';
import { createJobsDbClient } from '../jobs/db';
import { enqueueJob } from '../jobs/enqueue';
import { createJobQueue } from '../jobs/queue';
import { runJobs } from '../jobs/runner';
import {
  DRAFT_STUB_TASKS,
  fieldTaskDraftRecording,
} from '../jobs/handlers/field-task-draft-recording';
import { FIELD_TASK_DRAFT_PURPOSE } from '../jobs/handlers/field-task-draft-purpose';

type TaskRow = {
  room_id: string | null;
  room: string;
  phase: string;
  phase_position: number;
  position: number;
  text_en: string;
  status: string;
  job_id: string | null;
};

const room = (level: string, name: string, roomType: string | null, status = 'new') => ({
  geometry: {
    boundary: [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 120 },
    ],
  },
  status,
  level,
  attributes: {
    name,
    floorLevel: 0,
    photos: [],
    roomType,
    floorFinish: '',
    ceilingType: null,
    ceiling: null,
  },
  closureOverride: null,
});

// The Kitchen template with Rough-in moved ahead of Demo (AC-EZD-1408-1's saved template).
const KITCHEN_PHASES = [
  { id: 'p2', name: 'Rough-in', tasks: [] },
  { id: 'p1', name: 'Demo', tasks: [] },
  { id: 'p3', name: 'Inspection', tasks: [] },
  { id: 'p4', name: 'Drywall', tasks: [] },
  { id: 'p5', name: 'Finish', tasks: [] },
];

describe('EZD-1408 field_task_draft job', () => {
  let tenantA = '';
  let tenantB = '';
  let pA = '';
  let pEmpty = '';
  let kitchenId = '';
  let hallId = '';
  let session: Session;
  let crewSession: Session;
  let officeUserId = '';
  let queue: ReturnType<typeof createJobQueue>;
  let release: () => Promise<void>;

  const addObject = async (projectId: string, type: string, data: unknown, seq: number) => {
    const id = randomUUID();
    await harnessSql()`insert into public.model_object
      (project_id, object_id, tenant_id, type, data, schema_version, updated_seq, deleted)
      values (${projectId}::uuid, ${id}::uuid, ${tenantA}::uuid, ${type}, ${harnessSql().json(data as never)},
        1, ${seq}, false)`;
    return id;
  };

  const rowsOf = async (projectId: string): Promise<TaskRow[]> => {
    const { data, error } = await adminDb()
      .from('field_task')
      .select('room_id, room, phase, phase_position, position, text_en, status, job_id')
      .eq('project_id', projectId)
      .order('room')
      .order('phase_position')
      .order('position')
      // EZD-1409: a published task and a later draft can share a position; oldest first, so the order is fixed.
      .order('created_at');
    expect(error).toBeNull();
    return data as TaskRow[];
  };

  const enqueue = async (projectId: string) =>
    (
      await enqueueJob(
        session.serverDb,
        { kind: 'field_task_draft', projectId, payload: { projectId } },
        { kick: () => {} },
      )
    ).id;

  const jobRow = async (id: string) => {
    const { data } = await adminDb()
      .from('job')
      .select('status, error, result')
      .eq('id', id)
      .single();
    return data as { status: string; error: string | null; result: unknown };
  };

  beforeAll(async () => {
    release = await holdJobQueueShared();
    queue = createJobQueue(createJobsDbClient());
    tenantA = await createTenant();
    tenantB = await createTenant();
    [pA, pEmpty] = await createProjects(tenantA, 2);
    const office = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, office.membershipId, ['view_projects', 'edit_field_tasks']);
    session = await signIn(office.email);
    officeUserId = office.appUserId;
    const crew = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, crew.membershipId, ['view_projects', 'check_off_tasks']);
    crewSession = await signIn(crew.email);

    // Every live object names a floor of its project (EZD-202 level check).
    const [floor] = await harnessSql()<{ object_id: string }[]>`
      select object_id from public.model_object where project_id = ${pA}::uuid and type = 'floor'`;
    const level = floor?.object_id ?? (await addObject(pA, 'floor', { name: 'F1', order: 1 }, 1));
    // Rooms in model order: the Kitchen (r1), then a room with no type (r2, the Other template).
    kitchenId = await addObject(pA, 'room', room(level, 'Kitchen', 'kitchen'), 1);
    await new Promise((r) => setTimeout(r, 5));
    hallId = await addObject(pA, 'room', room(level, 'Hall', null), 2);
    await addObject(pA, 'wall', { level, status: 'demo', attributes: { name: 'Wall A' } }, 3);
    await addObject(pA, 'wall', { level, status: 'existing', attributes: { name: 'Wall B' } }, 4);

    await harnessSql()`insert into public.library_item (tenant_id, kind, name, data) values
      (${tenantA}::uuid, 'task_template', 'Kitchen',
        ${JSON.stringify({ roomType: 'kitchen', phases: KITCHEN_PHASES })}::text::jsonb),
      (${tenantA}::uuid, 'task_template', 'Other',
        ${JSON.stringify({
          roomType: 'other',
          phases: [{ id: 'p1', name: 'Prep', tasks: ['Protect the floors'] }],
        })}::text::jsonb),
      (${tenantB}::uuid, 'task_template', 'Kitchen',
        ${JSON.stringify({
          roomType: 'kitchen',
          phases: [{ id: 'p1', name: 'Other company phase', tasks: [] }],
        })}::text::jsonb)`;
  }, 180000);

  beforeEach(() => clearStubRecordings());

  afterEach(async () => {
    await harnessSql()`delete from public.field_task where tenant_id = ${tenantA}::uuid`;
    await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
  });

  afterAll(async () => {
    await harnessSql()`delete from public.job where tenant_id = ${tenantA}::uuid`;
    await cleanup();
    await closeHarness();
    await release?.();
  });

  it('AC-EZD-1408-2 with the stub AI the draft job writes unpublished field_task rows per phase @smoke', async () => {
    const id = await enqueue(pA);
    await runJobs({ queue, onlyTenantId: tenantA });
    const job = await jobRow(id);
    expect(job.status).toBe('done');
    expect(job.result).toEqual({ projectId: pA, rooms: 2, tasks: 7 });

    const rows = await rowsOf(pA);
    const kitchen = (phase: string, phasePosition: number, position: number, text: string) => ({
      room_id: kitchenId,
      room: 'Kitchen',
      phase,
      phase_position: phasePosition,
      position,
      text_en: text,
      status: 'draft',
      job_id: id,
    });
    expect(rows).toEqual([
      // The Hall has no room type: the Other template, whose phase the reply left empty, so its starter task.
      {
        room_id: hallId,
        room: 'Hall',
        phase: 'Prep',
        phase_position: 0,
        position: 0,
        text_en: 'Protect the floors',
        status: 'draft',
        job_id: id,
      },
      // The Kitchen in its template's order: Rough-in first.
      kitchen('Rough-in', 0, 0, DRAFT_STUB_TASKS[1].text),
      kitchen('Rough-in', 0, 1, DRAFT_STUB_TASKS[2].text),
      kitchen('Demo', 1, 0, DRAFT_STUB_TASKS[0].text),
      kitchen('Inspection', 2, 0, DRAFT_STUB_TASKS[3].text),
      kitchen('Drywall', 3, 0, DRAFT_STUB_TASKS[4].text),
      kitchen('Finish', 4, 0, DRAFT_STUB_TASKS[5].text),
    ]);

    // One Claude call with the rooms, their phases and the Demo and New objects only.
    const requests = lastStubRequests('anthropic');
    expect(requests).toHaveLength(1);
    const prompt = JSON.stringify(JSON.parse(requests[0].bodyText ?? '{}').messages);
    expect(prompt).toContain('Rough-in');
    expect(prompt).toContain('Wall A');
    expect(prompt).not.toContain('Wall B');
    expect(prompt).not.toContain('Other company phase');
  });

  it('a rerun replaces the drafts but keeps published tasks; unknown rooms and phases are dropped', async () => {
    await adminDb().from('field_task').insert({
      tenant_id: tenantA,
      project_id: pA,
      room: 'Kitchen',
      phase: 'Demo',
      phase_position: 1,
      position: 0,
      text_en: 'Published by the office',
      status: 'published',
    });
    await enqueue(pA);
    await runJobs({ queue, onlyTenantId: tenantA });
    expect((await rowsOf(pA)).filter((r) => r.status === 'draft')).toHaveLength(7);

    setStubRecording(
      'anthropic',
      FIELD_TASK_DRAFT_PURPOSE,
      fieldTaskDraftRecording([
        { room: 'r1', phase: 'demo', text: ' Pull the old range hood ' },
        { room: 'r9', phase: 'Demo', text: 'No such room' },
        { room: 'r1', phase: 'Framing', text: 'No such phase' },
      ]),
    );
    const second = await enqueue(pA);
    await runJobs({ queue, onlyTenantId: tenantA });
    expect((await jobRow(second)).result).toEqual({ projectId: pA, rooms: 2, tasks: 2 });
    expect((await rowsOf(pA)).map((r) => [r.room, r.phase, r.text_en, r.status])).toEqual([
      ['Hall', 'Prep', 'Protect the floors', 'draft'],
      ['Kitchen', 'Demo', 'Published by the office', 'published'],
      ['Kitchen', 'Demo', 'Pull the old range hood', 'draft'],
    ]);
  });

  it('a project with no rooms writes nothing and makes no AI call', async () => {
    const id = await enqueue(pEmpty);
    await runJobs({ queue, onlyTenantId: tenantA });
    expect((await jobRow(id)).result).toEqual({ projectId: pEmpty, rooms: 0, tasks: 0 });
    expect(await rowsOf(pEmpty)).toEqual([]);
    expect(lastStubRequests('anthropic')).toHaveLength(0);
  });

  it('a job run for another company is refused before it reads or writes anything', async () => {
    const id = await enqueue(pA);
    await expect(
      expectSafeToRunTwice('field_task_draft', {
        payload: { projectId: pA },
        job: { id, tenant_id: tenantB, project_id: pA, created_by: officeUserId },
      }),
    ).rejects.toThrow('permission_denied');
    expect(await rowsOf(pA)).toEqual([]);
    expect(lastStubRequests('anthropic')).toHaveLength(0);
  });

  it('a job queued by a member without Edit field tasks fails and leaves the drafts alone', async () => {
    await enqueue(pA);
    await runJobs({ queue, onlyTenantId: tenantA });
    expect(await rowsOf(pA)).toHaveLength(7);
    clearStubRecordings();
    const { id } = await enqueueJob(
      crewSession.serverDb,
      { kind: 'field_task_draft', projectId: pA, payload: { projectId: pA } },
      { kick: () => {} },
    );
    await runJobs({ queue, onlyTenantId: tenantA });
    const job = await jobRow(id);
    expect(job.status).toBe('failed');
    expect(job.error).toBe('permission_denied');
    expect(lastStubRequests('anthropic')).toHaveLength(0);
    expect(await rowsOf(pA)).toHaveLength(7);
  });

  it('the field_task_draft handler is safe to run twice', async () => {
    const id = await enqueue(pA);
    await expectSafeToRunTwice('field_task_draft', {
      payload: { projectId: pA },
      job: { id, tenant_id: tenantA, project_id: pA, created_by: officeUserId },
    });
    expect(await rowsOf(pA)).toHaveLength(7);
  });

  it('a payload naming another project than the job’s fails without writing', async () => {
    const { id } = await enqueueJob(
      session.serverDb,
      { kind: 'field_task_draft', projectId: pEmpty, payload: { projectId: pA } },
      { kick: () => {} },
    );
    await runJobs({ queue, onlyTenantId: tenantA });
    const job = await jobRow(id);
    expect(job.status).toBe('failed');
    expect(job.error).toBe('field_task_draft_project_mismatch');
    expect(await rowsOf(pA)).toEqual([]);
  });
});
