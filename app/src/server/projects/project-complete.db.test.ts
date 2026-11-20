// EZD-137 (AC-EZD-137-1, -2, -3; CLAUDE.md rule 4). Expected values: Q-0191 (Mark complete moves the project to a
// Completed filter; it stays viewable and can be reopened); Q-0700 decisions 03 "Completed status" (complete,
// completed_from, completed_at; Reopen restores completed_from or draft and clears both; All and the five status
// tabs exclude complete and archived; archived_at is independent; Complete sorts last); Q-0700 decisions 10 (Mark
// complete and Reopen need Edit model, no lock; every check also runs inside the database function); examples 09p
// Status moves rows 1, 2, 3, 5. Calls go through the gated serverDb of `signIn`, as the routes do.
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
import { countProjects, decodeCursor, listProjects } from './projects';

const typed = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

describe('EZD-137 Mark complete and the Completed tab', () => {
  let tenantA = '';
  let editor: Session; // view_projects, edit_model, delete_projects, create_projects
  let deleter: Session; // view_projects, delete_projects
  let viewer: Session; // view_projects only
  let lockHolder: Session; // edit_model, holds the edit lock
  let ownerB: Session; // another company, every switch

  const create = async (s: Session, name: string) => {
    const r = await s.serverDb.rpc('create_project', {
      p_name: name,
      p_address: '1 Complete St',
      p_type: 'kitchen',
      p_customer_id: null as never,
      p_scope_of_work: null as never,
    });
    expect(r.error).toBeNull();
    return (r.data as { project_id: string }[])[0].project_id;
  };
  const row = async (id: string) =>
    (
      await harnessSql()<
        {
          status: string;
          completed_from: string | null;
          completed_at: Date | null;
          archived_at: Date | null;
        }[]
      >`select status, completed_from, completed_at, archived_at from public.project where id = ${id}::uuid`
    )[0];
  const events = async (id: string) =>
    harnessSql()<{ action: string; details: Record<string, unknown> }[]>`
      select action, details from public.event_log
      where object_id = ${id}::uuid and action like 'project.%' order by at, id`;

  beforeAll(async () => {
    tenantA = await createTenant();
    const tenantB = await createTenant();
    const grants: [string, string[]][] = [
      [tenantA, ['view_projects', 'edit_model', 'delete_projects', 'create_projects']],
      [tenantA, ['view_projects', 'delete_projects']],
      [tenantA, ['view_projects']],
      [tenantA, ['view_projects', 'edit_model']],
      [tenantB, ['view_projects', 'edit_model', 'delete_projects', 'create_projects']],
    ];
    const sessions: Session[] = [];
    for (const [tenant, perms] of grants) {
      const m = await createMember({ tenantId: tenant, scope: 'all' });
      await setPermissions(tenant, m.membershipId, perms as never);
      sessions.push(await signIn(m.email));
    }
    [editor, deleter, viewer, lockHolder, ownerB] = sessions;
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('09p rows 1-2: In build, Mark complete stores in_build; Reopen returns to In build and clears both', async () => {
    const p = await create(editor, 'Build project');
    expect(
      await applyCardChange(typed(editor), p, { kind: 'status', status: 'in_build' }),
    ).toMatchObject({ ok: true, changed: true });
    // Another member holds the lock; Mark complete and Reopen do not need it (Q-0700 decisions 10).
    const lock = await lockHolder.serverDb.rpc('acquire_edit_lock', {
      p_project: p,
      p_device_id: 'device-ezd137',
    });
    expect(lock.error).toBeNull();

    expect(await applyCardChange(typed(editor), p, { kind: 'complete' })).toEqual({
      ok: true,
      tenantId: tenantA,
      changed: true,
    });
    const done = await row(p);
    expect(done.status).toBe('complete');
    expect(done.completed_from).toBe('in_build');
    expect(done.completed_at).not.toBeNull();
    // Twice changes nothing.
    expect(await applyCardChange(typed(editor), p, { kind: 'complete' })).toMatchObject({
      changed: false,
    });
    // Set status is not a way out of complete; Reopen is.
    const set = await editor.serverDb.rpc('set_project_status', {
      p_project: p,
      p_status: 'approved',
    });
    expect(set.error?.code).toBe('22023');
    expect((await row(p)).status).toBe('complete');

    expect(await applyCardChange(typed(editor), p, { kind: 'reopen' })).toEqual({
      ok: true,
      tenantId: tenantA,
      changed: true,
    });
    expect(await row(p)).toMatchObject({
      status: 'in_build',
      completed_from: null,
      completed_at: null,
    });
    // Reopen on a project that is not complete changes nothing.
    expect(await applyCardChange(typed(editor), p, { kind: 'reopen' })).toMatchObject({
      changed: false,
    });

    expect((await events(p)).map((e) => [e.action, e.details])).toEqual([
      ['project.status_changed', { projectId: p, from: 'draft', to: 'in_build' }],
      ['project.status_changed', { projectId: p, from: 'in_build', to: 'complete' }],
      ['project.status_changed', { projectId: p, from: 'complete', to: 'in_build' }],
    ]);
  });

  it('09p row 3: Reopen with completed_from null gives Draft', async () => {
    const p = await create(editor, 'No prior status');
    await harnessSql()`update public.project set status = 'complete', completed_from = null,
      completed_at = now() where id = ${p}::uuid`;
    expect(await applyCardChange(typed(editor), p, { kind: 'reopen' })).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(await row(p)).toMatchObject({ status: 'draft', completed_from: null, completed_at: null });
  });

  it('the columns: completed_from is one of the five statuses and both are set only while complete', async () => {
    const p = await create(editor, 'Column checks');
    await expect(
      harnessSql()`update public.project set status = 'complete', completed_from = 'complete' where id = ${p}::uuid`,
    ).rejects.toThrow();
    await expect(
      harnessSql()`update public.project set completed_from = 'draft' where id = ${p}::uuid`,
    ).rejects.toThrow();
    await expect(
      harnessSql()`update public.project set completed_at = now() where id = ${p}::uuid`,
    ).rejects.toThrow();
    expect((await row(p)).status).toBe('draft');
  });

  it('AC-1, AC-3: Completed lists it with its count; All and the five status tabs exclude it; it still opens', async () => {
    const tenantC = await createTenant();
    const m = await createMember({ tenantId: tenantC, scope: 'all' });
    await setPermissions(tenantC, m.membershipId, [
      'view_projects',
      'create_projects',
      'edit_model',
      'delete_projects',
    ]);
    const s = await signIn(m.email);
    const keep = await create(s, 'Laundry room');
    const p = await create(s, 'Oak kitchen');
    await harnessSql()`update public.project set status = 'approved' where id = ${p}::uuid`;
    const ids = async (tab: 'all' | 'approved' | 'complete' | 'archived', search?: string) =>
      (await listProjects(typed(s), { tab, sort: 'edited', after: null }, search)).items.map(
        (i) => i.id,
      );

    expect(await applyCardChange(typed(s), p, { kind: 'complete' })).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(await ids('all')).toEqual([keep]);
    expect(await ids('approved')).toEqual([]);
    expect(await ids('all', 'oak')).toEqual([]);
    expect(await ids('complete')).toEqual([p]);
    expect(await ids('complete', 'oak')).toEqual([p]);
    expect(await ids('archived')).toEqual([]);
    const page = await listProjects(typed(s), { tab: 'complete', sort: 'edited', after: null });
    expect(page.items[0]).toMatchObject({ status: 'complete', archived: false });
    expect(await countProjects(typed(s))).toEqual({
      all: 1,
      draft: 1,
      client_review: 0,
      permit_submitted: 0,
      approved: 0,
      in_build: 0,
      complete: 1,
      archived: 0,
    });

    // Still opens (Q-0191 "stays viewable"; Q-0700 05): the edit lock and the model read work.
    const lock = await s.serverDb.rpc('acquire_edit_lock', {
      p_project: p,
      p_device_id: 'device-ezd137-open',
    });
    expect(lock.error).toBeNull();
    expect((lock.data as { status?: string }).status).toBe('acquired');
    const open = await s.serverDb.rpc('record_project_open', { p_project: p });
    expect(open.error).toBeNull();
    const model = await s.serverDb.from('model_object').select('object_id').eq('project_id', p);
    expect(model.error).toBeNull();
    expect((model.data ?? []).length).toBeGreaterThan(0);

    // 09p row 5: archived then restored, still complete.
    expect(await applyCardChange(typed(s), p, { kind: 'archive' })).toMatchObject({ changed: true });
    expect(await ids('complete')).toEqual([]);
    expect(await ids('archived')).toEqual([p]);
    expect(await countProjects(typed(s))).toMatchObject({ all: 1, complete: 0, archived: 1 });
    expect((await row(p)).status).toBe('complete');
    expect(await applyCardChange(typed(s), p, { kind: 'restore' })).toMatchObject({ changed: true });
    expect(await row(p)).toMatchObject({ status: 'complete', completed_from: 'approved', archived_at: null });
    expect(await ids('complete')).toEqual([p]);

    // AC-2: Reopen returns it to Approved and the active list.
    expect(await applyCardChange(typed(s), p, { kind: 'reopen' })).toMatchObject({ changed: true });
    expect(await ids('all')).toEqual([p, keep]);
    expect(await ids('approved')).toEqual([p]);
    expect(await ids('complete')).toEqual([]);
  });

  it('Complete sorts last on the Status sort, and its rank-6 cursor pages', async () => {
    const tenantD = await createTenant();
    const m = await createMember({ tenantId: tenantD, scope: 'all' });
    await setPermissions(tenantD, m.membershipId, ['view_projects', 'create_projects']);
    const s = await signIn(m.email);
    const ids: string[] = [];
    for (let i = 0; i < 49; i += 1) ids.push(await create(s, `Done ${i}`));
    await harnessSql()`update public.project set status = 'complete', completed_from = 'in_build',
      completed_at = now() where id = any(${ids}::uuid[])`;
    const first = await listProjects(typed(s), { tab: 'complete', sort: 'status', after: null });
    expect(first.items).toHaveLength(48);
    expect(first.next).not.toBeNull();
    const cursor = decodeCursor(first.next!);
    expect(cursor?.r).toBe(6);
    const second = await listProjects(typed(s), { tab: 'complete', sort: 'status', after: cursor });
    expect(second.items).toHaveLength(1);
    expect(second.next).toBeNull();
  }, 120000);

  it('Mark complete and Reopen need Edit model; refused inside the function', async () => {
    const p = await create(editor, 'Permission project');
    for (const s of [deleter, viewer]) {
      expect(await applyCardChange(typed(s), p, { kind: 'complete' })).toEqual({
        ok: false,
        code: 'permission_denied',
      });
    }
    await harnessSql()`update public.project set status = 'complete', completed_from = 'draft',
      completed_at = now() where id = ${p}::uuid`;
    for (const s of [deleter, viewer]) {
      expect(await applyCardChange(typed(s), p, { kind: 'reopen' })).toEqual({
        ok: false,
        code: 'permission_denied',
      });
    }
    expect((await row(p)).status).toBe('complete');
    expect(await events(p)).toEqual([]);
  });

  it('isolation: one company cannot complete, reopen or list another company project', async () => {
    const p = await create(editor, 'Company A project');
    for (const kind of ['complete', 'reopen'] as const) {
      expect(await applyCardChange(typed(ownerB), p, { kind }), kind).toEqual({
        ok: false,
        code: 'project_not_found',
      });
    }
    expect((await row(p)).status).toBe('draft');
    await harnessSql()`update public.project set status = 'complete', completed_from = 'draft',
      completed_at = now() where id = ${p}::uuid`;
    expect(await applyCardChange(typed(ownerB), p, { kind: 'reopen' })).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    expect((await row(p)).status).toBe('complete');
    const listed = await listProjects(typed(ownerB), { tab: 'complete', sort: 'edited', after: null });
    expect(listed.items.map((i) => i.id)).not.toContain(p);
    expect((await countProjects(typed(ownerB))).complete).toBe(0);
  });
});
