// EZD-124 (AC-EZD-124-2, -3, -4, -5 events, -7, -8; CLAUDE.md rule 4). Expected values: Q-0201 (Archive hides the
// project behind Archived and keeps everything; Restore brings it back); Q-0202 and Q-0700 decisions 10 (Rename
// and Set status need Edit model and not the lock; Archive and Restore need Delete projects; every check also runs
// inside the database function); Q-0199 (the five hand-moved statuses; Complete is not one); Q-0708 (project.renamed,
// project.status_changed, project.archived, project.restored with projectId and, where it applies, from and to);
// Q-0700 decisions 05 (an archived project opens and edits like any other). Calls go through the gated serverDb of
// `signIn`, as the routes do.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import { applyCardChange } from './project-card-actions';
import { countProjects, listProjects } from './projects';

const typed = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

describe('EZD-124 project card actions', () => {
  let tenantA = '';
  let tenantB = '';
  let editor: Session; // view_projects, edit_model
  let deleter: Session; // view_projects, delete_projects
  let viewer: Session; // view_projects only
  let scoped: Session; // edit_model and delete_projects, listed scope with no projects
  let ownerB: Session; // another company, every switch used here
  let lockHolder: Session; // edit_model, holds the edit lock

  const create = async (s: Session, name: string) => {
    const r = await s.serverDb.rpc('create_project', {
      p_name: name,
      p_address: '1 Card St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    expect(r.error).toBeNull();
    return (r.data as { project_id: string }[])[0].project_id;
  };
  const row = async (id: string) =>
    (
      await harnessSql()<{ name: string; status: string; archived_at: Date | null }[]>`
        select name, status, archived_at from public.project where id = ${id}::uuid`
    )[0];
  const events = async (id: string) =>
    harnessSql()<{ action: string; details: Record<string, unknown>; object_type: string }[]>`
      select action, details, object_type from public.event_log
      where object_id = ${id}::uuid and action like 'project.%' order by at, id`;

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    const grants: [string, 'all' | 'listed', string[]][] = [
      [tenantA, 'all', ['view_projects', 'edit_model', 'create_projects']],
      [tenantA, 'all', ['view_projects', 'delete_projects']],
      [tenantA, 'all', ['view_projects']],
      [tenantA, 'listed', ['view_projects', 'edit_model', 'delete_projects']],
      [tenantB, 'all', ['view_projects', 'edit_model', 'delete_projects', 'create_projects']],
      [tenantA, 'all', ['view_projects', 'edit_model']],
    ];
    const sessions: Session[] = [];
    for (const [tenant, scope, perms] of grants) {
      const m = await createMember({ tenantId: tenant, scope });
      await setPermissions(tenant, m.membershipId, perms as never);
      sessions.push(await signIn(m.email));
    }
    [editor, deleter, viewer, scoped, ownerB, lockHolder] = sessions;
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-3 Rename is trimmed and non-empty, needs Edit model and not the lock, and writes project.renamed', async () => {
    const p = await create(editor, 'Kitchen remodel');
    // Another member holds the lock; Rename does not need it.
    const lock = await lockHolder.serverDb.rpc('acquire_edit_lock', {
      p_project: p,
      p_device_id: 'device-ezd124',
    });
    expect(lock.error).toBeNull();

    const r = await applyCardChange(typed(editor), p, { kind: 'rename', name: '  Hall bath  ' });
    expect(r).toEqual({ ok: true, tenantId: tenantA, changed: true });
    expect((await row(p)).name).toBe('Hall bath');

    for (const name of ['', '   ']) {
      const blank = await editor.serverDb.rpc('rename_project', { p_project: p, p_name: name });
      expect(blank.error?.code).toBe('22023');
    }
    expect((await row(p)).name).toBe('Hall bath');

    // The same name again changes nothing and writes nothing.
    expect(await applyCardChange(typed(editor), p, { kind: 'rename', name: 'Hall bath' })).toEqual({
      ok: true,
      tenantId: tenantA,
      changed: false,
    });

    // Delete projects alone, View projects alone: refused inside the function.
    expect(await applyCardChange(typed(deleter), p, { kind: 'rename', name: 'X' })).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await applyCardChange(typed(viewer), p, { kind: 'rename', name: 'X' })).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect((await row(p)).name).toBe('Hall bath');

    expect(await events(p)).toEqual([
      {
        action: 'project.renamed',
        object_type: 'project',
        details: { projectId: p, from: 'Kitchen remodel', to: 'Hall bath' },
      },
    ]);
  });

  it('AC-4 Set status offers the five hand-moved statuses, needs Edit model and not the lock; Complete is refused', async () => {
    const p = await create(editor, 'Status project');
    const lock = await lockHolder.serverDb.rpc('acquire_edit_lock', {
      p_project: p,
      p_device_id: 'device-ezd124',
    });
    expect(lock.error).toBeNull();
    const order = ['client_review', 'permit_submitted', 'approved', 'in_build', 'draft'] as const;
    for (const status of order) {
      expect(await applyCardChange(typed(editor), p, { kind: 'status', status })).toEqual({
        ok: true,
        tenantId: tenantA,
        changed: true,
      });
      expect((await row(p)).status).toBe(status);
    }
    for (const bad of ['complete', 'archived', 'Draft', '']) {
      const r = await editor.serverDb.rpc('set_project_status', { p_project: p, p_status: bad });
      expect(r.error?.code, bad).toBe('22023');
    }
    expect(await applyCardChange(typed(deleter), p, { kind: 'status', status: 'approved' })).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect((await row(p)).status).toBe('draft');
    const log = await events(p);
    expect(log.map((e) => e.details)).toEqual([
      { projectId: p, from: 'draft', to: 'client_review' },
      { projectId: p, from: 'client_review', to: 'permit_submitted' },
      { projectId: p, from: 'permit_submitted', to: 'approved' },
      { projectId: p, from: 'approved', to: 'in_build' },
      { projectId: p, from: 'in_build', to: 'draft' },
    ]);
    expect(new Set(log.map((e) => e.action))).toEqual(new Set(['project.status_changed']));
  });

  it('AC-2 Archive leaves every tab, count and search and appears under Archived; Restore brings it back', async () => {
    const tenantC = await createTenant();
    const m = await createMember({ tenantId: tenantC, scope: 'all' });
    await setPermissions(tenantC, m.membershipId, [
      'view_projects',
      'create_projects',
      'delete_projects',
    ]);
    const s = await signIn(m.email);
    const keep = await create(s, 'Laundry room');
    const p = await create(s, 'Oak kitchen');
    await harnessSql()`update public.project set status = 'approved' where id = ${p}::uuid`;
    const ids = async (tab: 'all' | 'approved' | 'archived', search?: string) =>
      (await listProjects(typed(s), { tab, sort: 'edited', after: null }, search)).items.map(
        (i) => i.id,
      );

    expect(await ids('all')).toEqual([p, keep]);
    expect(await countProjects(typed(s))).toEqual({
      all: 2,
      draft: 1,
      client_review: 0,
      permit_submitted: 0,
      approved: 1,
      in_build: 0,
      archived: 0,
    });

    expect(await applyCardChange(typed(s), p, { kind: 'archive' })).toEqual({
      ok: true,
      tenantId: tenantC,
      changed: true,
    });
    expect((await row(p)).archived_at).not.toBeNull();
    expect(await ids('all')).toEqual([keep]);
    expect(await ids('approved')).toEqual([]);
    expect(await ids('all', 'oak')).toEqual([]);
    expect(await ids('archived')).toEqual([p]);
    expect(await ids('archived', 'oak')).toEqual([p]);
    const archivedPage = await listProjects(typed(s), { tab: 'archived', sort: 'edited', after: null });
    expect(archivedPage.items[0].archived).toBe(true);
    expect(archivedPage.items[0].status).toBe('approved');
    expect(await countProjects(typed(s))).toEqual({
      all: 1,
      draft: 1,
      client_review: 0,
      permit_submitted: 0,
      approved: 0,
      in_build: 0,
      archived: 1,
    });
    expect(await countProjects(typed(s), 'oak')).toEqual({
      all: 0,
      draft: 0,
      client_review: 0,
      permit_submitted: 0,
      approved: 0,
      in_build: 0,
      archived: 1,
    });
    // Archiving twice changes nothing.
    expect(await applyCardChange(typed(s), p, { kind: 'archive' })).toMatchObject({ changed: false });

    expect(await applyCardChange(typed(s), p, { kind: 'restore' })).toEqual({
      ok: true,
      tenantId: tenantC,
      changed: true,
    });
    expect((await row(p)).archived_at).toBeNull();
    expect(await ids('all')).toEqual([p, keep]);
    expect(await ids('approved')).toEqual([p]);
    expect(await ids('archived')).toEqual([]);
    expect((await row(p)).status).toBe('approved');

    expect((await events(p)).map((e) => [e.action, e.details])).toEqual([
      ['project.archived', { projectId: p }],
      ['project.restored', { projectId: p }],
    ]);
  });

  it('AC-7 Archive and Restore need Delete projects; Rename and Set status need Edit model', async () => {
    const p = await create(editor, 'Perm project');
    expect(await applyCardChange(typed(editor), p, { kind: 'archive' })).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await applyCardChange(typed(viewer), p, { kind: 'archive' })).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect((await row(p)).archived_at).toBeNull();
    expect(await applyCardChange(typed(deleter), p, { kind: 'archive' })).toMatchObject({
      ok: true,
    });
    expect(await applyCardChange(typed(editor), p, { kind: 'restore' })).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect((await row(p)).archived_at).not.toBeNull();
    // Out of scope: P0002 for every action.
    for (const change of [
      { kind: 'rename', name: 'Nope' },
      { kind: 'status', status: 'approved' },
      { kind: 'archive' },
      { kind: 'restore' },
    ] as const) {
      expect(await applyCardChange(typed(scoped), p, change), change.kind).toEqual({
        ok: false,
        code: 'project_not_found',
      });
    }
  });

  it('isolation: one company cannot read or change another company project through any card action', async () => {
    const p = await create(editor, 'Company A project');
    for (const change of [
      { kind: 'rename', name: 'Taken' },
      { kind: 'status', status: 'in_build' },
      { kind: 'archive' },
      { kind: 'restore' },
    ] as const) {
      expect(await applyCardChange(typed(ownerB), p, change), change.kind).toEqual({
        ok: false,
        code: 'project_not_found',
      });
    }
    const del = await ownerB.serverDb.rpc('delete_project', {
      p_project: p,
      p_confirm_name: 'Company A project',
    });
    expect(del.error?.code).toBe('P0002');
    expect(await row(p)).toMatchObject({
      name: 'Company A project',
      status: 'draft',
      archived_at: null,
    });
    expect(await events(p)).toEqual([]);
    // Company B lists and counts none of A's projects, archived or not.
    await harnessSql()`update public.project set archived_at = now() where id = ${p}::uuid`;
    const listed = await listProjects(typed(ownerB), { tab: 'archived', sort: 'edited', after: null });
    expect(listed.items.map((i) => i.id)).not.toContain(p);
  });

  it('AC-8 an archived project opens like any other: lock, recent open and model read work', async () => {
    const p = await create(editor, 'Archived opens');
    await harnessSql()`update public.project set archived_at = now() where id = ${p}::uuid`;
    const lock = await editor.serverDb.rpc('acquire_edit_lock', {
      p_project: p,
      p_device_id: 'device-ezd124-open',
    });
    expect(lock.error).toBeNull();
    expect((lock.data as { status?: string }).status).toBe('acquired');
    const open = await editor.serverDb.rpc('record_project_open', { p_project: p });
    expect(open.error).toBeNull();
    const objects = await editor.serverDb
      .from('model_object')
      .select('object_id')
      .eq('project_id', p);
    expect(objects.error).toBeNull();
    expect((objects.data ?? []).length).toBeGreaterThan(0);
  });
});
