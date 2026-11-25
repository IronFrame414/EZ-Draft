// EZD-1402 on the local stack (AC-EZD-1402-2 "a task check and a photo queued offline arrive after reconnect"; 03c
// offline_change; 10 Permissions Check off tasks, Photo notes, Send field measurement; CLAUDE.md rule 4: one company
// cannot read or change another company's offline_change rows). Expected values: a recorded action is one row with
// the caller as app_user_id, the device's time as queued_at and synced_at set; a resend is `duplicate` and adds no
// row; a photo is stored at <tenant>/<project>/field-photos/<id>.jpg as the caller's JPEG before its action is
// recorded; a photo pin needs its photo; the kind's switch is required; members cannot write the table directly.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
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
import { uploadFile, UploadError } from '../../lib/storage/upload';
import type { DbClient } from '../storage/objects';
import { startFieldPhoto, syncFieldAction, type SyncBody } from './field-actions';

const DEVICE = '22222222-2222-4222-8222-222222222222';
const QUEUED_AT = Date.UTC(2026, 10, 21, 14, 30, 0);
const uploaded: string[] = [];

type Who = { session: Session; appUserId: string };
const db = (w: Who) => w.session.serverDb as unknown as DbClient;

async function memberWith(tenant: string, permissions: string[]): Promise<Who> {
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return { session: await signIn(m.email), appUserId: m.appUserId };
}

const body = (over: Partial<SyncBody>): SyncBody => ({
  id: crypto.randomUUID(),
  deviceId: DEVICE,
  kind: 'task_check',
  ops: { taskId: crypto.randomUUID(), done: true },
  baseVersionId: null,
  queuedAt: QUEUED_AT,
  photo: null,
  ...over,
});

// A 1x1 JPEG's bytes are not needed: Storage checks the declared type and size, the database checks the metadata.
const JPEG = new Uint8Array(1200).fill(0xff);

const rowOf = async (id: string) =>
  (
    await harnessSql()<
      {
        tenant_id: string;
        project_id: string;
        app_user_id: string;
        device_id: string;
        kind: string;
        ops: unknown;
        photo_path: string | null;
        queued_at: Date;
        synced_at: Date | null;
      }[]
    >`select tenant_id, project_id, app_user_id, device_id, kind, ops, photo_path, queued_at, synced_at
      from public.offline_change where id = ${id}::uuid`
  )[0];

const objectExists = async (path: string) => {
  const slash = path.lastIndexOf('/');
  const name = path.slice(slash + 1);
  const { data } = await adminDb()
    .storage.from('media')
    .list(path.slice(0, slash), { search: name });
  return (data ?? []).some((o) => o.name === name);
};

describe('EZD-1402 offline_change', () => {
  let tenantA = '';
  let tenantB = '';
  let pA = '';
  let crew: Who;
  let viewer: Who;
  let other: Who;

  beforeAll(async () => {
    tenantA = await createTenant();
    [pA] = await createProjects(tenantA, 1);
    crew = await memberWith(tenantA, [
      'view_projects',
      'check_off_tasks',
      'photo_notes',
      'send_field_measurement',
    ]);
    viewer = await memberWith(tenantA, ['view_projects']);
    tenantB = await createTenant();
    other = await memberWith(tenantB, [
      'view_projects',
      'check_off_tasks',
      'photo_notes',
      'send_field_measurement',
    ]);
  }, 180000);

  afterAll(async () => {
    try {
      if (uploaded.length > 0) await adminDb().storage.from('media').remove(uploaded);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('AC-EZD-1402-2 a task check queued offline arrives with its user, device and time', async () => {
    const b = body({ kind: 'task_check' });
    const r = await syncFieldAction(db(crew), pA, b);
    expect(r).toMatchObject({ ok: true, status: 'synced', tenantId: tenantA });
    const row = await rowOf(b.id);
    expect(row).toMatchObject({
      tenant_id: tenantA,
      project_id: pA,
      app_user_id: crew.appUserId,
      device_id: DEVICE,
      kind: 'task_check',
      ops: b.ops,
      photo_path: null,
    });
    expect(row!.queued_at.getTime()).toBe(QUEUED_AT);
    expect(row!.synced_at).not.toBeNull();

    // A resend after a lost answer is recorded once.
    const again = await syncFieldAction(db(crew), pA, b);
    expect(again).toMatchObject({ ok: true, status: 'duplicate' });
    const n = await harnessSql()`select 1 from public.offline_change where id = ${b.id}::uuid`;
    expect(n).toHaveLength(1);
  });

  it('AC-EZD-1402-2 a photo pin queued offline arrives with its photo in Storage', async () => {
    const id = crypto.randomUUID();
    const path = `${tenantA}/${pA}/field-photos/${id}.jpg`;
    uploaded.push(path);
    // Recording before the photo is stored is refused.
    const early = await syncFieldAction(db(crew), pA, body({ id, kind: 'photo_pin', photo: 'jpg' }));
    expect(early).toEqual({ ok: false, code: 'photo_missing' });

    const started = await startFieldPhoto(db(crew), pA, { id, kind: 'photo_pin', photo: 'jpg' });
    if (!started.ok || started.upload === null) throw new Error('start refused');
    expect(started.upload.path).toBe(path);
    await uploadFile(started.upload, new Blob([JPEG as BlobPart]), { contentType: 'image/jpeg' });
    expect(await objectExists(path)).toBe(true);

    // A resend of the start once stored: no new upload.
    expect(await startFieldPhoto(db(crew), pA, { id, kind: 'photo_pin', photo: 'jpg' })).toEqual({
      ok: true,
      upload: null,
    });

    const r = await syncFieldAction(
      db(crew),
      pA,
      body({ id, kind: 'photo_pin', ops: { x: 0.25, y: 0.75 }, photo: 'jpg' }),
    );
    expect(r).toMatchObject({ ok: true, status: 'synced' });
    expect(await rowOf(id)).toMatchObject({ kind: 'photo_pin', photo_path: path, app_user_id: crew.appUserId });

    // A resend after a lost answer: the start answers stored (no upload), the record answers duplicate.
    expect(await startFieldPhoto(db(crew), pA, { id, kind: 'photo_pin', photo: 'jpg' })).toEqual({
      ok: true,
      upload: null,
    });
    expect(
      await syncFieldAction(db(crew), pA, body({ id, kind: 'photo_pin', ops: { x: 0.25, y: 0.75 }, photo: 'jpg' })),
    ).toMatchObject({ ok: true, status: 'duplicate' });
    // Someone else, or another kind, cannot reuse the id.
    expect(await startFieldPhoto(db(crew), pA, { id, kind: 'measurement', photo: 'jpg' })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
  });

  it('a photo stored with another type than its name is refused, and Storage refuses a non-image', async () => {
    const id = crypto.randomUUID();
    const path = `${tenantA}/${pA}/field-photos/${id}.jpg`;
    uploaded.push(path);
    const started = await startFieldPhoto(db(crew), pA, { id, kind: 'photo_pin', photo: 'jpg' });
    if (!started.ok || started.upload === null) throw new Error('start refused');
    const html = await uploadFile(started.upload, new Blob([JPEG as BlobPart]), {
      contentType: 'text/html',
    }).catch((e: unknown) => e);
    expect((html as UploadError).code).toBe('upload_rejected');
    await uploadFile(started.upload, new Blob([JPEG as BlobPart]), { contentType: 'image/png' });
    const r = await syncFieldAction(db(crew), pA, body({ id, kind: 'photo_pin', photo: 'jpg' }));
    expect(r).toEqual({ ok: false, code: 'photo_missing' });
  });

  it('a photo pin without a photo, an unknown base version and a future time', async () => {
    expect(await syncFieldAction(db(crew), pA, body({ kind: 'photo_pin', photo: null }))).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(
      await syncFieldAction(db(crew), pA, body({ kind: 'measurement', baseVersionId: crypto.randomUUID() })),
    ).toEqual({ ok: false, code: 'invalid_input' });
    // A device clock ahead of the server is recorded at the server's time.
    const ahead = body({ kind: 'measurement', queuedAt: Date.now() + 86_400_000 });
    expect(await syncFieldAction(db(crew), pA, ahead)).toMatchObject({ ok: true, status: 'synced' });
    const row = await rowOf(ahead.id);
    expect(row!.queued_at.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);
  });

  it('without the kind\'s switch the action is refused (42501)', async () => {
    for (const kind of ['task_check', 'measurement', 'field_measure_send'] as const) {
      expect(await syncFieldAction(db(viewer), pA, body({ kind }))).toEqual({
        ok: false,
        code: 'permission_denied',
      });
    }
    expect(
      await startFieldPhoto(db(viewer), pA, { id: crypto.randomUUID(), kind: 'photo_pin', photo: 'jpg' }),
    ).toEqual({ ok: false, code: 'permission_denied' });
  });

  it("another company can neither read nor record this project's actions, nor reuse an id", async () => {
    const mine = body({ kind: 'task_check' });
    await syncFieldAction(db(crew), pA, mine);
    expect(await syncFieldAction(db(other), pA, body({}))).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect(
      await startFieldPhoto(db(other), pA, { id: crypto.randomUUID(), kind: 'photo_pin', photo: 'jpg' }),
    ).toEqual({ ok: false, code: 'project_not_found' });
    const direct = await other.session.serverDb.from('offline_change').select('id').eq('project_id', pA);
    expect(direct.data ?? []).toEqual([]);
    // The same id under another person is not a duplicate.
    const [pB] = await createProjects(tenantB, 1);
    expect(await syncFieldAction(db(other), pB!, { ...mine })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
  });

  it('a member cannot write the table directly', async () => {
    const { error } = await crew.session.serverDb
      .from('offline_change')
      .insert({
        id: crypto.randomUUID(),
        tenant_id: tenantA,
        project_id: pA,
        app_user_id: crew.appUserId,
        device_id: DEVICE,
        kind: 'task_check',
        ops: {},
        queued_at: new Date().toISOString(),
      } as never)
      .select('id');
    expect(error?.code).toBe('42501');
  });

  describeTenantIsolation('offline_change', {
    makeRow: (t, ctx) => ({
      id: crypto.randomUUID(),
      tenant_id: t,
      project_id: ctx.projectIds[0],
      app_user_id: ctx.member.appUserId,
      device_id: DEVICE,
      kind: 'task_check',
      ops: { taskId: 'x' },
      queued_at: new Date(QUEUED_AT).toISOString(),
    }),
    update: { ops: { taskId: 'changed' } },
  });
});
