// EZD-1409 on the local stack (AC-EZD-1409-1 "Seeded published tasks show grouped by phase"; AC-EZD-1409-2 "A task
// checked offline syncs with its user and time"; S17 Task row: checkbox "records user and time", add photo (Photo
// notes), edit text (Edit field tasks; online only); S22 Decisions 2 drafts hidden from crew; CLAUDE.md rule 4: one
// company cannot read or change another company's tasks). Expected values come from the seeds: a check queued at
// 2026-11-21 14:30 UTC makes the task done by the member who checked it at that time; the first check wins; a draft,
// another project's or another company's task is left as it was; the pack lists published and done tasks in phase
// order (Demo, Rough-in, Finish) and counts the published ones as open.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFieldPack } from '../../../e2e/fixtures/field-pack';
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
import { uploadFile } from '../../lib/storage/upload';
import { readFieldPack } from '../field-pack/read';
import { startFieldPhoto, syncFieldAction, type SyncBody } from '../outbox/field-actions';
import type { DbClient } from '../storage/objects';
import { editFieldTask } from './edit';

const DEVICE = '33333333-3333-4333-8333-333333333333';
const QUEUED_AT = Date.UTC(2026, 10, 21, 14, 30, 0);
const CREW = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'];
const uploaded: string[] = [];

type Who = { session: Session; appUserId: string };
const db = (w: Who) => w.session.serverDb as unknown as DbClient;

async function memberWith(tenant: string, permissions: string[], name?: string): Promise<Who> {
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions as never);
  if (name) await harnessSql()`update public.app_user set name = ${name} where id = ${m.appUserId}::uuid`;
  return { session: await signIn(m.email), appUserId: m.appUserId };
}

const check = (taskId: string, over: Partial<SyncBody> = {}): SyncBody => ({
  id: crypto.randomUUID(),
  deviceId: DEVICE,
  kind: 'task_check',
  ops: { taskId, done: true },
  baseVersionId: null,
  queuedAt: QUEUED_AT,
  photo: null,
  ...over,
});

type TaskRow = {
  status: string;
  done_by: string | null;
  done_at: Date | null;
  done_change_id: string | null;
  photos: Array<Record<string, unknown>>;
  text_en: string;
  text_es: string | null;
  edited_on_phone_at: Date | null;
};

const taskRow = async (id: string): Promise<TaskRow> =>
  (
    await harnessSql()<TaskRow[]>`
      select status, done_by, done_at, done_change_id, photos, text_en, text_es, edited_on_phone_at
      from public.field_task where id = ${id}::uuid`
  )[0]!;

describe('EZD-1409 field tasks', () => {
  let tA = '';
  let pA = '';
  let pA2 = '';
  let pB = '';
  let crew: Who;
  let viewer: Who;
  let office: Who;
  let spanish: Who;
  let otherCrew: Who;
  let tasks: string[] = [];

  beforeAll(async () => {
    tA = await createTenant();
    [pA, pA2] = await createProjects(tA, 2);
    crew = await memberWith(tA, CREW, 'Luis Ortega');
    viewer = await memberWith(tA, ['view_projects']);
    office = await memberWith(tA, ['view_projects', 'edit_field_tasks']);
    spanish = await memberWith(tA, ['view_projects', 'edit_field_tasks']);
    await harnessSql()`update public.app_user set language = 'es' where id = ${spanish.appUserId}::uuid`;
    const tB = await createTenant();
    [pB] = await createProjects(tB, 1);
    otherCrew = await memberWith(tB, [...CREW, 'edit_field_tasks']);
    const seeded = await seedFieldPack(harnessSql(), {
      tenantId: tA,
      projectId: pA!,
      rooms: ['Kitchen', 'Pantry'],
      tasks: [
        { text: 'Hang drywall', phase: 'Drywall', phasePosition: 3, position: 0 },
        { text: 'Remove upper cabinets', phase: 'Demo', phasePosition: 0, position: 0 },
        { text: 'Pull the old sink', phase: 'Demo', phasePosition: 0, position: 1, room: 'Pantry' },
        { text: 'Rough in the sink drain', phase: 'Rough-in', phasePosition: 1, position: 0 },
        { text: 'Draft not for crew', phase: 'Demo', phasePosition: 0, position: 2, status: 'draft' },
        { text: 'Set the vanity', phase: 'Finish', phasePosition: 4, position: 0, textEs: 'Colocar el tocador' },
      ],
    });
    tasks = seeded.taskIds;
  }, 180000);

  afterAll(async () => {
    try {
      if (uploaded.length > 0) await adminDb().storage.from('media').remove(uploaded);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('AC-EZD-1409-1 the pack lists published tasks by phase order, drafts hidden, open count', async () => {
    const view = await readFieldPack(db(crew) as never, pA);
    const list = view!.pack!.tasks!;
    expect(list.map((t) => [t.phase, t.textEn])).toEqual([
      ['Demo', 'Remove upper cabinets'],
      ['Demo', 'Pull the old sink'],
      ['Rough-in', 'Rough in the sink drain'],
      ['Drywall', 'Hang drywall'],
      ['Finish', 'Set the vanity'],
    ]);
    expect(list.find((t) => t.textEn === 'Set the vanity')?.textEs).toBe('Colocar el tocador');
    expect(list.find((t) => t.textEn === 'Pull the old sink')?.room).toBe('Pantry');
    expect(list.every((t) => t.done === null && t.photos === 0)).toBe(true);
    expect(view!.pack!.openTasks).toBe(5);
  });

  it('AC-EZD-1409-2 a check records the member and the time the phone queued it; the first check wins', async () => {
    const task = tasks[1]!;
    const first = check(task);
    expect(await syncFieldAction(db(crew), pA, first)).toMatchObject({ ok: true, status: 'synced' });
    const row = await taskRow(task);
    expect(row.status).toBe('done');
    expect(row.done_by).toBe(crew.appUserId);
    expect(row.done_at?.getTime()).toBe(QUEUED_AT);
    expect(row.done_change_id).toBe(first.id);

    // A second check of the same task, later, is recorded and changes nothing.
    const later = check(task, { queuedAt: QUEUED_AT + 60_000 });
    expect(await syncFieldAction(db(crew), pA, later)).toMatchObject({ ok: true, status: 'synced' });
    expect(await taskRow(task)).toMatchObject({ done_by: crew.appUserId, done_change_id: first.id });

    const view = await readFieldPack(db(crew) as never, pA);
    const done = view!.pack!.tasks!.find((t) => t.id === task)!;
    expect(done.done?.by).toBe('Luis Ortega');
    expect(Date.parse(done.done!.at)).toBe(QUEUED_AT);
    expect(view!.pack!.openTasks).toBe(4);
  });

  it('a draft, a task of another project and ops naming no task are recorded and change nothing', async () => {
    const draft = tasks[4]!;
    expect(await syncFieldAction(db(crew), pA, check(draft))).toMatchObject({ ok: true });
    expect((await taskRow(draft)).status).toBe('draft');
    // The task belongs to pA; a check sent for pA2 leaves it open.
    expect(await syncFieldAction(db(crew), pA2, check(tasks[3]!))).toMatchObject({ ok: true });
    expect((await taskRow(tasks[3]!)).status).toBe('published');
    expect(await syncFieldAction(db(crew), pA, check('T1'))).toMatchObject({ ok: true });
    expect(await syncFieldAction(db(crew), pA, check(tasks[3]!, { ops: { taskId: tasks[3]!, done: false } })))
      .toMatchObject({ ok: true });
    expect((await taskRow(tasks[3]!)).status).toBe('published');
  });

  it('a check needs Check off tasks', async () => {
    expect(await syncFieldAction(db(viewer), pA, check(tasks[3]!))).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect((await taskRow(tasks[3]!)).status).toBe('published');
  });

  it("rule 4: another company's member cannot check, photograph or edit this company's tasks", async () => {
    const task = tasks[3]!;
    // On this company's project: not found for them.
    expect(await syncFieldAction(db(otherCrew), pA, check(task))).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    // On their own project, naming this company's task: recorded, applies nothing.
    expect(await syncFieldAction(db(otherCrew), pB, check(task))).toMatchObject({ ok: true });
    expect(await editFieldTask(db(otherCrew) as never, pA, task, 'Changed')).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect(await editFieldTask(db(otherCrew) as never, pB, task, 'Changed')).toEqual({
      ok: false,
      code: 'task_not_found',
    });
    expect(await taskRow(task)).toMatchObject({
      status: 'published',
      done_by: null,
      text_en: 'Rough in the sink drain',
      edited_on_phone_at: null,
    });
    // They read none of them either.
    const read = await otherCrew.session.serverDb.from('field_task').select('id').in('id', tasks);
    expect(read.data ?? []).toEqual([]);
  });

  it('a task photo is stored and added to the task (Photo notes)', async () => {
    const task = tasks[0]!;
    const id = crypto.randomUUID();
    const path = `${tA}/${pA}/field-photos/${id}.jpg`;
    uploaded.push(path);
    const started = await startFieldPhoto(db(crew), pA, { id, kind: 'task_photo', photo: 'jpg' });
    if (!started.ok || started.upload === null) throw new Error('start refused');
    await uploadFile(started.upload, new Blob([new Uint8Array(1200).fill(0xff) as BlobPart]), {
      contentType: 'image/jpeg',
    });
    const r = await syncFieldAction(
      db(crew),
      pA,
      check(task, { id, kind: 'task_photo', ops: { taskId: task }, photo: 'jpg' }),
    );
    expect(r).toMatchObject({ ok: true, status: 'synced' });
    const row = await taskRow(task);
    expect(row.photos).toHaveLength(1);
    expect(row.photos[0]).toMatchObject({ path, by: crew.appUserId, changeId: id });
    expect(row.status).toBe('published');
    const view = await readFieldPack(db(crew) as never, pA);
    expect(view!.pack!.tasks!.find((t) => t.id === task)?.photos).toBe(1);

    // A task photo with no photo is refused; Check off tasks alone cannot add one.
    expect(
      await syncFieldAction(db(crew), pA, check(task, { kind: 'task_photo', ops: { taskId: task } })),
    ).toEqual({ ok: false, code: 'invalid_input' });
    const noPhotoSwitch = await memberWith(tA, ['view_projects', 'check_off_tasks']);
    expect(
      await startFieldPhoto(db(noPhotoSwitch), pA, { id: crypto.randomUUID(), kind: 'task_photo', photo: 'jpg' }),
    ).toEqual({ ok: false, code: 'permission_denied' });
  });

  it('edit text needs Edit field tasks, writes the editor language and marks the task edited on the phone', async () => {
    const task = tasks[5]!;
    expect(await editFieldTask(db(crew) as never, pA, task, 'Set the vanity level')).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await editFieldTask(db(office) as never, pA, task, '   ')).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(await editFieldTask(db(office) as never, pA, tasks[4]!, 'A draft')).toEqual({
      ok: false,
      code: 'task_not_found',
    });
    const r = await editFieldTask(db(office) as never, pA, task, '  Set the vanity level  ');
    expect(r).toMatchObject({ ok: true, textEn: 'Set the vanity level', textEs: 'Colocar el tocador' });
    const s = await editFieldTask(db(spanish) as never, pA, task, 'Colocar el tocador nivelado');
    expect(s).toMatchObject({ ok: true, textEn: 'Set the vanity level', textEs: 'Colocar el tocador nivelado' });
    const row = await taskRow(task);
    expect(row.text_en).toBe('Set the vanity level');
    expect(row.text_es).toBe('Colocar el tocador nivelado');
    expect(row.edited_on_phone_at).not.toBeNull();
  });

  it('members still cannot write field_task directly', async () => {
    const { data } = await crew.session.serverDb
      .from('field_task')
      .update({ status: 'done' })
      .eq('id', tasks[3]!)
      .select('id');
    expect(data ?? []).toEqual([]);
    expect((await taskRow(tasks[3]!)).status).toBe('published');
  });
});
