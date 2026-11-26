// EZD-123 C1-C7 (AC-EZD-123-2, -5, -6, -7, -9, -10; rule 4). Local database, real sign-in, through the helpers the
// cleanup route calls. Expected values: board S20 and S20 Cleanup sheet rows (date, author, cause, change summary,
// preview); Q-0700 05 "Cleanup sheet" (Save choices needs Edit model and the lock and deletes only rows that are
// neither snapshot nor sent; the change summary is against the parent, or "First version"; a snapshot name is trimmed
// and non-empty); Q-0700 10 (Edit model and the lock: cleanup Save choices); Q-0664 (preview_path; null shows a
// placeholder); 09p Cleanup clock row 4 (a ticked row becomes a named snapshot and is never listed again).
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import type { Database } from '../db/database.types';
import { loadModel } from '../model/model';
import type { PermissionContext } from '../permissions/context';
import { listCleanup, saveCleanupChoices } from './cleanup';

const EDITOR = ['view_projects', 'edit_model'] as const;
const db = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

const wall = (id: string, x: number) => ({
  id,
  type: 'wall',
  schema_version: 1,
  data: { geometry: { start: { x: 0, y: 0 }, end: { x, y: 0 } } },
});

async function seed(
  tenant: string,
  project: string,
  opts: {
    createdAt: string;
    shownAt?: string | null;
    objects?: unknown[];
    parent?: string | null;
    by?: string | null;
    cause?: string | null;
    sent?: boolean;
    snapshot?: boolean;
    preview?: boolean;
  },
): Promise<string> {
  const id = randomUUID();
  const doc = { objects: opts.objects ?? [] };
  const sent = opts.sent ?? false;
  await harnessSql()`
    insert into public.model_version
      (id, project_id, tenant_id, model_json, schema_version, created_at, parent_version_id, created_by, cause,
       cleanup_shown_at, is_sent, version_no, sent_at, is_snapshot, label, preview_path)
    values (${id}::uuid, ${project}::uuid, ${tenant}::uuid, ${harnessSql().json(doc as never)}, 1,
      ${opts.createdAt}::timestamptz, ${opts.parent ?? null}::uuid, ${opts.by ?? null}::uuid, ${opts.cause ?? null},
      ${opts.shownAt === undefined ? '2026-11-01T08:00:00Z' : opts.shownAt}::timestamptz,
      ${sent}, ${sent ? 1 : null}, ${sent ? opts.createdAt : null}::timestamptz,
      ${opts.snapshot ?? false}, ${opts.snapshot ? 'Kept' : null},
      ${opts.preview ? `${tenant}/${project}/thumb/${id}.webp` : null})`;
  return id;
}

async function acquire(s: Session, project: string): Promise<number> {
  const r = await s.serverDb.rpc('acquire_edit_lock', { p_project: project, p_device_id: 'dev-a' });
  if (r.error) throw new Error(`acquire failed: ${r.error.message}`);
  const d = r.data as { status: string; lock_epoch: number };
  if (d.status !== 'acquired') throw new Error(`acquire answered ${d.status}`);
  return Number(d.lock_epoch);
}

const versions = (project: string) =>
  harnessSql()<{ id: string; is_snapshot: boolean; label: string | null }[]>`
    select id, is_snapshot, label from public.model_version where project_id = ${project}::uuid order by created_at, id`;

describe('EZD-123 cleanup sheet (database)', () => {
  let tenant = '';
  let other = '';
  let pList = '';
  let pSave = '';
  let pLock = '';
  let pOther = '';
  let s: Session;
  let s2: Session;
  let viewer: Session;
  let otherS: Session;
  let editorId = '';
  let editorMembership = '';

  beforeAll(async () => {
    tenant = await createTenant();
    [pList, pSave, pLock] = await createProjects(tenant, 3);
    const editor = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, editor.membershipId, [...EDITOR]);
    editorId = editor.appUserId;
    editorMembership = editor.membershipId;
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

  it('C1 @smoke lists shown working rows newest first with date, author, cause, change summary and preview (AC-EZD-123-5, AC-EZD-123-9, AC-EZD-123-10)', async () => {
    const first = await seed(tenant, pList, {
      createdAt: '2026-09-01T10:00:00Z',
      objects: [
        wall('a0000000-0000-4000-8000-000000000001', 0),
        wall('a0000000-0000-4000-8000-000000000002', 12),
      ],
      by: editorId,
      cause: 'stop_editing',
    });
    // 09p Visual diff rows 1-3 against the parent: wall 1 moved (changed), wall 2 gone (removed), wall 3 new (added).
    const second = await seed(tenant, pList, {
      createdAt: '2026-09-02T10:00:00Z',
      parent: first,
      objects: [
        wall('a0000000-0000-4000-8000-000000000001', 6),
        wall('a0000000-0000-4000-8000-000000000003', 24),
      ],
      cause: 'lock_release',
      preview: true,
    });
    // Not listed: never shown, sent, or named.
    await seed(tenant, pList, { createdAt: '2026-09-03T10:00:00Z', shownAt: null });
    await seed(tenant, pList, { createdAt: '2026-09-04T10:00:00Z', sent: true });
    await seed(tenant, pList, { createdAt: '2026-09-05T10:00:00Z', snapshot: true });
    const up = await adminDb()
      .storage.from('media')
      .upload(`${tenant}/${pList}/thumb/${second}.webp`, new Uint8Array([82, 73, 70, 70]), {
        contentType: 'image/webp',
      });
    expect(up.error).toBeNull();

    const list = await listCleanup(db(s), pList);
    expect(list).not.toBeNull();
    expect(list!.graceDays).toBe(7);
    expect(list!.ageDays).toBe(30);
    expect(list!.rows.map((r) => r.id)).toEqual([second, first]);
    expect(list!.rows[0]).toMatchObject({
      author: null,
      cause: 'lock_release',
      summary: { added: 1, changed: 1, removed: 1 },
      shownAt: expect.stringContaining('2026-11-01'),
    });
    expect(list!.rows[0].previewUrl).toEqual(
      expect.stringContaining('/storage/v1/object/sign/media/'),
    );
    expect(list!.rows[1]).toMatchObject({
      author: 'Josh Bishop',
      cause: 'stop_editing',
      summary: null,
      previewUrl: null,
    });
    expect(JSON.stringify(list)).not.toContain('model_json');
  });

  it('C2 another company sees nothing: the list is null and Save answers project_not_found (rule 4)', async () => {
    expect(await listCleanup(db(otherS), pList)).toBeNull();
    const v = await seed(tenant, pSave, { createdAt: '2026-09-01T00:00:00Z' });
    const r = await saveCleanupChoices(db(otherS), pSave, { lockEpoch: 0, keep: [], remove: [v] });
    expect(r).toEqual({ ok: false, code: 'project_not_found' });
    // Nor through its own project.
    const epoch = await acquire(otherS, pOther);
    const r2 = await saveCleanupChoices(db(otherS), pOther, {
      lockEpoch: epoch,
      keep: [{ id: v, name: 'Mine' }],
      remove: [],
    });
    expect(r2).toMatchObject({ ok: true, kept: [], deleted: [] });
    expect((await versions(pSave)).find((x) => x.id === v)).toMatchObject({ is_snapshot: false });
  });

  it('C3 Save choices: ticked rows become named snapshots with the trimmed name; unticked shown rows are deleted (AC-EZD-123-2, -6)', async () => {
    const keep = await seed(tenant, pSave, { createdAt: '2026-09-02T00:00:00Z' });
    const keepDefault = await seed(tenant, pSave, { createdAt: '2026-09-03T00:00:00Z' });
    const drop = await seed(tenant, pSave, { createdAt: '2026-09-04T00:00:00Z' });
    const epoch = await acquire(s, pSave);
    const r = await saveCleanupChoices(db(s), pSave, {
      lockEpoch: epoch,
      keep: [
        { id: keep, name: '  Island 3-box layout ' },
        { id: keepDefault, name: 'Sep 3 · 12:00 AM' },
      ],
      remove: [drop],
    });
    expect(r).toMatchObject({ ok: true, tenantId: tenant, deleted: [drop] });
    expect((r as { kept: string[] }).kept.sort()).toEqual([keep, keepDefault].sort());
    const rows = await versions(pSave);
    expect(rows.find((x) => x.id === drop)).toBeUndefined();
    expect(rows.find((x) => x.id === keep)).toMatchObject({
      is_snapshot: true,
      label: 'Island 3-box layout',
    });
    expect(rows.find((x) => x.id === keepDefault)).toMatchObject({
      is_snapshot: true,
      label: 'Sep 3 · 12:00 AM',
    });
    // Never listed again (09p row 4).
    const listed = (await listCleanup(db(s), pSave))!.rows.map((x) => x.id);
    expect(listed).not.toContain(keep);
    expect(listed).not.toContain(keepDefault);
    const ev = await harnessSql()<{ actor_app_user_id: string; details: unknown }[]>`
      select actor_app_user_id, details from public.event_log
      where tenant_id = ${tenant}::uuid and action = 'cleanup.deleted' and object_id = ${pSave}::uuid`;
    expect(ev).toEqual([
      { actor_app_user_id: editorId, details: { versionIds: [drop], count: 1, by: 'sheet' } },
    ]);
  });

  it('C4 Save deletes only shown rows that are neither snapshot nor sent; a row named meanwhile is skipped, never an error (AC-EZD-123-6, -7)', async () => {
    const epoch = await acquire(s, pSave);
    const named = await seed(tenant, pSave, { createdAt: '2026-09-05T00:00:00Z', snapshot: true });
    const sent = await seed(tenant, pSave, { createdAt: '2026-09-06T00:00:00Z', sent: true });
    const young = await seed(tenant, pSave, { createdAt: '2026-11-20T00:00:00Z', shownAt: null });
    const r = await saveCleanupChoices(db(s), pSave, {
      lockEpoch: epoch,
      keep: [],
      remove: [named, sent, young],
    });
    expect(r).toMatchObject({ ok: true, deleted: [] });
    const ids = (await versions(pSave)).map((x) => x.id);
    for (const id of [named, sent, young]) expect(ids).toContain(id);
  });

  it('C5 Save needs the lock: another Edit model member gets stale_lock_epoch and nothing changes (AC-EZD-123-6)', async () => {
    const v = await seed(tenant, pLock, { createdAt: '2026-09-01T00:00:00Z' });
    const epoch = await acquire(s, pLock);
    const r = await saveCleanupChoices(db(s2), pLock, { lockEpoch: epoch, keep: [], remove: [v] });
    expect(r).toEqual({ ok: false, code: 'stale_lock_epoch' });
    const stale = await saveCleanupChoices(db(s), pLock, {
      lockEpoch: epoch + 1,
      keep: [],
      remove: [v],
    });
    expect(stale).toEqual({ ok: false, code: 'stale_lock_epoch' });
    expect((await versions(pLock)).map((x) => x.id)).toContain(v);
  });

  it('C6 Save needs Edit model: a viewer is refused in the function itself (AC-EZD-123-6)', async () => {
    const v = await seed(tenant, pLock, { createdAt: '2026-09-02T00:00:00Z' });
    const r = await saveCleanupChoices(db(viewer), pLock, { lockEpoch: 0, keep: [], remove: [v] });
    expect(r).toEqual({ ok: false, code: 'permission_denied' });
    expect((await versions(pLock)).map((x) => x.id)).toContain(v);
  });

  it('C7 a bad body is refused: an empty name, an id both kept and removed (Q-0700 05)', async () => {
    const v = await seed(tenant, pLock, { createdAt: '2026-09-03T00:00:00Z' });
    const epoch = await acquire(s, pLock);
    expect(
      await saveCleanupChoices(db(s), pLock, {
        lockEpoch: epoch,
        keep: [{ id: v, name: '   ' }],
        remove: [],
      }),
    ).toEqual({ ok: false, code: 'invalid_input' });
    expect(
      await saveCleanupChoices(db(s), pLock, {
        lockEpoch: epoch,
        keep: [{ id: v, name: 'A' }],
        remove: [v],
      }),
    ).toEqual({ ok: false, code: 'invalid_input' });
  });

  it('C8 the model load says cleanupDue only while a shown working row exists, so the editor reads the sheet only then (AC-EZD-123-5)', async () => {
    const [pFlag] = await createProjects(tenant, 1);
    const ctx: PermissionContext = {
      appUserId: editorId,
      membershipId: editorMembership,
      scope: 'all',
      permissions: new Set(['view_projects', 'edit_model']),
      listedProjectIds: new Set<string>(),
    };
    // Not due: no row, a row never shown, a sent row and a named row.
    await seed(tenant, pFlag, { createdAt: '2026-11-20T00:00:00Z', shownAt: null });
    await seed(tenant, pFlag, { createdAt: '2026-09-04T10:00:00Z', sent: true });
    await seed(tenant, pFlag, { createdAt: '2026-09-05T10:00:00Z', snapshot: true });
    expect((await loadModel(db(s), pFlag, ctx))!.project.cleanupDue).toBeUndefined();
    await seed(tenant, pFlag, { createdAt: '2026-09-01T00:00:00Z' });
    expect((await loadModel(db(s), pFlag, ctx))!.project.cleanupDue).toBe(true);
  });
});
