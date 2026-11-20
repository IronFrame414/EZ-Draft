// EZD-122 X1-X9 (AC-EZD-122-1, -2, -4, -5, -9; rule 4 company isolation). Local database, real sign-in, through the
// helpers the routes call. Expected values: S20 Version rules ("Sent versions stay unchanged"; "Versions are
// immutable"); Q-0700 03 "Revert" (Edit model, holder and lock_epoch as save_objects step 7; checkpoint of the
// current working copy first, cause revert_from; objects in the version deleted false, others deleted true, every
// touched row's updated_seq up; a second checkpoint, cause revert, label "Revert from" plus the version's label;
// broadcast); Q-0700 05 (snapshot name trimmed, non-empty, no maximum); Q-0700 10 (Name snapshot: Edit model, no
// lock); S20 Events emitted (version.snapshot_named, version.reverted).
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createProjects,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import { listVersions, nameSnapshot, readVersion, revertToVersion } from './versions';

const EDITOR = ['view_projects', 'edit_model'] as const;
const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

const wallData = (level: string, x: number) => ({
  geometry: { start: { x: 0, y: 0 }, end: { x, y: 0 } },
  status: 'new',
  level,
  attributes: {
    thickness: 4.5,
    thicknessSide: 'right',
    height: 96,
    topCutToCeiling: false,
    bearing: false,
  },
});

type ObjRow = {
  object_id: string;
  deleted: boolean;
  updated_seq: number;
  data: { geometry: { end: { x: number } } };
};
type VerRow = {
  id: string;
  cause: string | null;
  label: string | null;
  is_sent: boolean;
  is_snapshot: boolean;
  version_no: number | null;
  sent_at: string | null;
  model_json: { objects: { id: string; data: { geometry?: { end: { x: number } } } }[] };
};

const objects = (project: string) =>
  harnessSql()<ObjRow[]>`
    select object_id, deleted, updated_seq, data from public.model_object
    where project_id = ${project}::uuid and type = 'wall' order by object_id`;
const versions = (project: string) =>
  harnessSql()<VerRow[]>`
    select id, cause, label, is_sent, is_snapshot, version_no, sent_at, model_json from public.model_version
    where project_id = ${project}::uuid order by created_at, id`;

async function floorOf(project: string): Promise<string> {
  const [f] = await harnessSql()<{ object_id: string }[]>`
    select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
  return f.object_id;
}

async function save(s: Session, project: string, epoch: number, changes: unknown[]) {
  const r = await s.serverDb.rpc('save_objects', {
    p_project: project,
    p_lock_epoch: epoch,
    p_changes: changes,
  });
  if (r.error || (r.data as { status: string }).status !== 'saved')
    throw new Error(`save failed: ${r.error?.message ?? JSON.stringify(r.data)}`);
}

async function acquire(s: Session, project: string): Promise<number> {
  const r = await s.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-a' });
  if (r.error) throw new Error(`acquire failed: ${r.error.message}`);
  const d = r.data as { status: string; lock_epoch: number };
  if (d.status !== 'acquired') throw new Error(`acquire answered ${d.status}`);
  return Number(d.lock_epoch);
}

async function checkpoint(s: Session, project: string): Promise<string> {
  const r = await s.serverDb.rpc('create_checkpoint', { p_project: project });
  if (r.error) throw new Error(`checkpoint failed: ${r.error.message}`);
  return r.data as string;
}

// A sent row as send_to_client leaves it (EZD-121), written straight to the table.
async function seedSent(tenant: string, project: string, no: number): Promise<string> {
  const [r] = await harnessSql()<{ id: string }[]>`
    insert into public.model_version
      (project_id, tenant_id, model_json, schema_version, is_sent, version_no, sent_to, sent_at, cause)
    values (${project}::uuid, ${tenant}::uuid, '{"objects":[]}'::jsonb, 1, true, ${no}, 'Zed Co', now(), 'send')
    returning id`;
  return r.id;
}

describe('EZD-122 Versions panel (database)', () => {
  let tenant = '';
  let other = '';
  let pList = '';
  let pName = '';
  let pRevert = '';
  let pLock = '';
  let pOther = '';
  let editor: Member;
  let s: Session;
  let s2: Session;
  let viewer: Session;
  let otherS: Session;
  const w1 = randomUUID();
  const w2 = randomUUID();

  beforeAll(async () => {
    tenant = await createTenant();
    [pList, pName, pRevert, pLock] = await createProjects(tenant, 4);
    editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, [...EDITOR]);
    const b = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, b.membershipId, [...EDITOR]);
    const v = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, v.membershipId, ['view_projects']);
    other = await createTenant();
    [pOther] = await createProjects(other, 1);
    const o = await createMember({ tenantId: other, scope: 'all' });
    await setPermissions(other, o.membershipId, [...EDITOR]);
    await harnessSql()`update public.app_user set name = 'Josh Bishop' where id = ${editor.appUserId}::uuid`;
    s = await signIn(editor.email);
    s2 = await signIn(b.email);
    viewer = await signIn(v.email);
    otherS = await signIn(o.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('X1 @smoke the list holds every version newest first, with label, cause, author and no document (AC-EZD-122-2)', async () => {
    const sent = await seedSent(tenant, pList, 1);
    const working = await checkpoint(s, pList);
    await harnessSql()`update public.model_version set cause = 'stop_editing' where id = ${working}::uuid`;
    const rows = await listVersions(db(s), pList);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.id)).toEqual([working, sent]);
    expect(rows![0]).toMatchObject({
      isSent: false,
      isSnapshot: false,
      cause: 'stop_editing',
      author: 'Josh Bishop',
      versionNo: null,
    });
    expect(rows![1]).toMatchObject({
      isSent: true,
      versionNo: 1,
      sentTo: 'Zed Co',
      cause: 'send',
      author: null,
    });
    expect(JSON.stringify(rows)).not.toContain('model_json');
    expect(JSON.stringify(rows)).not.toContain('@');
  });

  it('X2 a project with no checkpoint lists no versions; another company sees none (AC-EZD-122-9; rule 4)', async () => {
    expect(await listVersions(db(s), pName)).toEqual([]);
    expect(await listVersions(db(otherS), pList)).toBeNull();
    expect(await readVersion(db(otherS), pList, (await versions(pList))[0].id)).toBeNull();
  });

  it('X3 Name snapshot without the lock trims the name, sets is_snapshot and the label and broadcasts (AC-EZD-122-4)', async () => {
    // Someone else holds the lock: naming needs no lock (Q-0700 10).
    await acquire(s2, pName);
    const id = await checkpoint(s, pName);
    const r = await nameSnapshot(db(s), pName, id, '  Before island resize  ');
    expect(r).toMatchObject({ ok: true, id, label: 'Before island resize' });
    const [row] = (await versions(pName)).filter((v) => v.id === id);
    expect(row.is_snapshot).toBe(true);
    expect(row.label).toBe('Before island resize');
    const casts = await harnessSql()<{ payload: Record<string, unknown> }[]>`
      select payload from realtime.messages
      where topic = ${'project:' + pName} and event = 'version.snapshot_named'`;
    expect(casts).toHaveLength(1);
    expect(casts[0].payload).toMatchObject({ modelVersionId: id });
  });

  it('X4 Name snapshot refuses an empty name, a sent or named row, a viewer, and another project or company (AC-EZD-122-4, -6)', async () => {
    const id = await checkpoint(s, pName);
    expect(await nameSnapshot(db(s), pName, id, '   ')).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    const sent = await seedSent(tenant, pName, 1);
    expect(await nameSnapshot(db(s), pName, sent, 'Kept')).toEqual({
      ok: false,
      code: 'not_working',
    });
    expect(await nameSnapshot(db(viewer), pName, id, 'Kept')).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    // A version of pName named through pList: never another project's version.
    expect(await nameSnapshot(db(s), pList, id, 'Kept')).toEqual({
      ok: false,
      code: 'version_not_found',
    });
    expect(await nameSnapshot(db(otherS), pName, id, 'Kept')).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect(await nameSnapshot(db(otherS), pOther, id, 'Kept')).toEqual({
      ok: false,
      code: 'version_not_found',
    });
    const [row] = (await versions(pName)).filter((v) => v.id === id);
    expect(row).toMatchObject({ is_snapshot: false, label: null });
    const [sentRow] = (await versions(pName)).filter((v) => v.id === sent);
    expect(sentRow).toMatchObject({
      is_snapshot: false,
      label: null,
      is_sent: true,
      version_no: 1,
    });
  });

  it('X5 @smoke Revert checkpoints the working copy, restores the version, labels the new row and leaves sent versions unchanged (AC-EZD-122-1, -5)', async () => {
    const floor = await floorOf(pRevert);
    const epoch = await acquire(s, pRevert);
    await save(s, pRevert, epoch, [
      {
        id: w1,
        base_seq: 0,
        deleted: false,
        type: 'wall',
        schema_version: 1,
        data: wallData(floor, 120),
      },
    ]);
    const v1 = await checkpoint(s, pRevert);
    await save(s, pRevert, epoch, [
      {
        id: w1,
        base_seq: 1,
        deleted: false,
        type: 'wall',
        schema_version: 1,
        data: wallData(floor, 126),
      },
      {
        id: w2,
        base_seq: 0,
        deleted: false,
        type: 'wall',
        schema_version: 1,
        data: wallData(floor, 48),
      },
    ]);
    const sent = await seedSent(tenant, pRevert, 1);
    const sentBefore = (await versions(pRevert)).find((v) => v.id === sent)!;
    const seqBefore = new Map((await objects(pRevert)).map((o) => [o.object_id, o.updated_seq]));

    const r = await revertToVersion(db(s), pRevert, v1, {
      lockEpoch: epoch,
      label: 'Oct 3 · 2:40 PM',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const objs = new Map((await objects(pRevert)).map((o) => [o.object_id, o]));
    expect(objs.get(w1)).toMatchObject({ deleted: false });
    expect(objs.get(w1)!.data.geometry.end.x).toBe(120);
    expect(objs.get(w2)).toMatchObject({ deleted: true });
    expect(objs.get(w1)!.updated_seq).toBe(seqBefore.get(w1)! + 1);
    expect(objs.get(w2)!.updated_seq).toBe(seqBefore.get(w2)! + 1);

    const all = await versions(pRevert);
    const before = all.find((v) => v.id === r.beforeVersionId)!;
    expect(before.cause).toBe('revert_from');
    // The project's floor, w1 and w2.
    expect(before.model_json.objects.map((o) => o.id).sort()).toEqual([floor, w1, w2].sort());
    expect(before.model_json.objects.find((o) => o.id === w1)!.data.geometry!.end.x).toBe(126);
    const after = all.find((v) => v.id === r.versionId)!;
    expect(after).toMatchObject({
      cause: 'revert',
      label: 'Revert from Oct 3 · 2:40 PM',
      is_snapshot: false,
      is_sent: false,
    });
    const ids = (row: VerRow) => row.model_json.objects.map((o) => o.id).sort();
    expect(ids(after)).toEqual(ids(all.find((v) => v.id === v1)!));
    expect(all.find((v) => v.id === sent)).toEqual(sentBefore);
    // The chosen version itself never changes.
    expect(
      all.find((v) => v.id === v1)!.model_json.objects.find((o) => o.id === w1)!.data.geometry!.end
        .x,
    ).toBe(120);

    const casts = await harnessSql()<{ payload: Record<string, unknown> }[]>`
      select payload from realtime.messages
      where topic = ${'project:' + pRevert} and event = 'version.reverted'`;
    expect(casts).toHaveLength(1);
    expect(casts[0].payload).toMatchObject({ modelVersionId: r.versionId, fromVersionId: v1 });
  });

  it('X6 Revert to a sent version restores it and leaves the sent row as it was (AC-EZD-122-1)', async () => {
    const epoch = Number(
      (
        (await s.serverDb.rpc('read_edit_lock', { p_project: pRevert })).data as {
          lock_epoch: number;
        }
      ).lock_epoch,
    );
    // A send freezes a checkpoint of the working copy (EZD-121); here w1 is at 120.
    const sent = await checkpoint(s, pRevert);
    await harnessSql()`
      update public.model_version
      set is_sent = true, version_no = 2, sent_to = 'Zed Co', sent_at = now(), cause = 'send'
      where id = ${sent}::uuid`;
    const floor = await floorOf(pRevert);
    const seq = (await objects(pRevert)).find((o) => o.object_id === w1)!.updated_seq;
    await save(s, pRevert, epoch, [
      {
        id: w1,
        base_seq: seq,
        deleted: false,
        type: 'wall',
        schema_version: 1,
        data: wallData(floor, 130),
      },
    ]);
    const sentBefore = (await versions(pRevert)).find((v) => v.id === sent)!;
    const r = await revertToVersion(db(s), pRevert, sent, { lockEpoch: epoch, label: 'Version 2' });
    expect(r.ok).toBe(true);
    const w = (await objects(pRevert)).find((o) => o.object_id === w1)!;
    expect(w.deleted).toBe(false);
    expect(w.data.geometry.end.x).toBe(120);
    const all = await versions(pRevert);
    expect(all.find((v) => v.id === sent)).toEqual(sentBefore);
    expect(all[all.length - 1]).toMatchObject({ cause: 'revert', label: 'Revert from Version 2' });
  });

  it('X7 Revert needs the lock and the current lock_epoch; refused, it writes nothing (AC-EZD-122-5)', async () => {
    const epoch = await acquire(s, pLock);
    const v = await checkpoint(s, pLock);
    const count = (await versions(pLock)).length;
    expect(await revertToVersion(db(s), pLock, v, { lockEpoch: epoch + 1, label: 'x' })).toEqual({
      ok: false,
      code: 'stale_lock_epoch',
    });
    // s2 has Edit model but does not hold the lock.
    expect(await revertToVersion(db(s2), pLock, v, { lockEpoch: epoch, label: 'x' })).toEqual({
      ok: false,
      code: 'stale_lock_epoch',
    });
    expect(await revertToVersion(db(viewer), pLock, v, { lockEpoch: epoch, label: 'x' })).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect((await versions(pLock)).length).toBe(count);
  });

  it("X8 Revert refuses another project's version, another company, and objects that are not the version's (rule 4)", async () => {
    const epoch = Number(
      (
        (await s.serverDb.rpc('read_edit_lock', { p_project: pLock })).data as {
          lock_epoch: number;
        }
      ).lock_epoch,
    );
    const foreign = (await versions(pRevert))[0].id;
    expect(await revertToVersion(db(s), pLock, foreign, { lockEpoch: epoch, label: 'x' })).toEqual({
      ok: false,
      code: 'version_not_found',
    });
    // Straight to the function: a version of pRevert through pLock, and a wrong object list.
    const direct = await s.serverDb.rpc('revert_to_version', {
      p_project: pLock,
      p_version: foreign,
      p_lock_epoch: epoch,
      p_objects: [],
      p_label: 'x',
    });
    expect(direct.error?.code).toBe('P0002');
    const own = (await versions(pLock))[0].id;
    const wrong = await s.serverDb.rpc('revert_to_version', {
      p_project: pLock,
      p_version: own,
      p_lock_epoch: epoch,
      p_objects: [{ id: randomUUID(), type: 'wall', schema_version: 1, data: {} }],
      p_label: 'x',
    });
    expect(wrong.error?.code).toBe('22023');
    const cross = await otherS.serverDb.rpc('revert_to_version', {
      p_project: pLock,
      p_version: own,
      p_lock_epoch: epoch,
      p_objects: [],
      p_label: 'x',
    });
    expect(cross.error?.code).toBe('P0002');
    const crossOwn = await otherS.serverDb.rpc('revert_to_version', {
      p_project: pOther,
      p_version: own,
      p_lock_epoch: 0,
      p_objects: [],
      p_label: 'x',
    });
    expect(crossOwn.error?.code).toBe('P0002');
  });

  it("X9 another company can neither read nor change this company's versions (rule 4)", async () => {
    const own = (await versions(pList))[0].id;
    const read = await otherS.serverDb.from('model_version').select('id').eq('id', own);
    expect(read.data).toEqual([]);
    const upd = await otherS.serverDb
      .from('model_version')
      .update({ label: 'x' })
      .eq('id', own)
      .select('id');
    expect(upd.data ?? []).toEqual([]);
    const [row] = (await versions(pList)).filter((v) => v.id === own);
    expect(row.label).toBeNull();
  });
});
