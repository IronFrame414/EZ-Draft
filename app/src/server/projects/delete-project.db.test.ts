// EZD-124 (AC-EZD-124-1, -5, -7; CLAUDE.md rule 4). Expected values: Q-0201 (Delete is offered at any time, even
// after a send, and removes everything permanently; the client link stops working); Q-0700 decisions 03 "Project
// Delete" (one definer function checks Delete projects and project scope; it deletes the project row with every
// dependent row, sets notification.project_id to null, writes event_log project.deleted in the same transaction
// and queues a company-level purge job, project_id null with the project id in the payload; a project Delete
// signs no one out); examples 09p Delete confirmation (trimmed by the caller, compared exactly, case included) and
// Token row 4 (project deleted: the link resolves to nothing, at once).
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  sessionCount,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { Database } from '../db/database.types';
import { clearStubOutbox } from '../email/test-harness/stub-transport';
import { resolveClientLink } from '../sends/resolve';
import { sendToClient } from '../sends/sends';
import { deleteProject } from './project-card-actions';

const ENV = { EMAIL_TRANSPORT: 'stub', EMAIL_FROM: 'EZ Draft Test <test@example.test>' };
const typed = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

describe('EZD-124 delete_project', () => {
  let tenantA = '';
  let tenantB = '';
  let owner: Session; // view_projects, edit_model, send_to_client, create_projects, delete_projects
  let ownerMember: Member;
  let editor: Session; // view_projects, edit_model: no Delete projects
  let listedMember: Member; // listed on the project; must stay signed in
  let ownerB: Session;
  let customer = '';

  const create = async (name: string) => {
    const r = await owner.serverDb.rpc('create_project', {
      p_name: name,
      p_address: '9 Delete St',
      p_type: 'bath',
      p_customer_id: customer as never,
      p_scope_of_work: null as never,
    });
    expect(r.error).toBeNull();
    return (r.data as { project_id: string }[])[0].project_id;
  };

  // Every public table with a project_id column, and its rows for the project.
  const dependents = async (projectId: string): Promise<Record<string, number>> => {
    const sql = harnessSql();
    const tables = await sql<{ table_name: string }[]>`
      select c.table_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'project_id' and t.table_type = 'BASE TABLE'
      order by c.table_name`;
    const out: Record<string, number> = {};
    for (const { table_name } of tables) {
      const [r] = await sql<{ n: number }[]>`
        select count(*)::int as n from ${sql('public')}.${sql(table_name)} where project_id = ${projectId}::uuid`;
      if (r.n > 0) out[table_name] = r.n;
    }
    return out;
  };

  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    customer = (
      await harnessSql()`insert into public.customer (tenant_id, name, email)
        values (${tenantA}::uuid, 'Ann Lee', 'ann@example.test') returning id`
    )[0].id as string;
    ownerMember = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, ownerMember.membershipId, [
      'view_projects',
      'edit_model',
      'send_to_client',
      'create_projects',
      'delete_projects',
    ]);
    owner = await signIn(ownerMember.email);
    const e = await createMember({ tenantId: tenantA, scope: 'all' });
    await setPermissions(tenantA, e.membershipId, ['view_projects', 'edit_model']);
    editor = await signIn(e.email);
    const b = await createMember({ tenantId: tenantB, scope: 'all' });
    await setPermissions(tenantB, b.membershipId, ['view_projects', 'delete_projects']);
    ownerB = await signIn(b.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('AC-1 AC-5 Delete after a send removes the project and every dependent row, logs, queues the purge, ends no session, and the client link stops resolving', async () => {
    const p = await create('Kitchen remodel');
    // A sent version (Version 1), its sent package and token, the edit lock row.
    clearStubOutbox();
    const sent = await sendToClient(typed(owner), { projectId: p, note: null }, { env: ENV });
    if (!sent.ok) throw new Error(`send failed: ${sent.code}`);
    const token = sent.send.link.split('/').pop() as string;
    expect((await resolveClientLink(token))?.projectId).toBe(p);
    // A listed member with a live session, a project job and a notification about the project.
    listedMember = await createMember({ tenantId: tenantA, scope: 'listed', listed: [p] });
    await setPermissions(tenantA, listedMember.membershipId, ['view_projects']);
    await signIn(listedMember.email);
    const sessionsBefore = await sessionCount(listedMember.authUserId);
    expect(sessionsBefore).toBeGreaterThan(0);
    const sql = harnessSql();
    await sql`insert into public.job (tenant_id, project_id, kind, payload, max_attempts)
      values (${tenantA}::uuid, ${p}::uuid, 'test', '{}'::jsonb, 1)`;
    const [n] = await sql<{ id: string }[]>`
      insert into public.notification (tenant_id, user_id, kind, link, project_id)
      values (${tenantA}::uuid, ${ownerMember.appUserId}::uuid, 'render_finished', '/', ${p}::uuid)
      returning id`;

    const before = await dependents(p);
    for (const t of ['model_object', 'model_version', 'edit_lock', 'sent_package', 'membership_project', 'job']) {
      expect(before[t], t).toBeGreaterThan(0);
    }

    // Wrong case and blank are refused; nothing is removed.
    expect(await deleteProject(typed(owner), p, 'kitchen remodel')).toEqual({
      ok: false,
      code: 'name_mismatch',
    });
    expect(await deleteProject(typed(owner), p, '')).toEqual({ ok: false, code: 'name_mismatch' });
    expect(await dependents(p)).toEqual(before);

    const r = await deleteProject(typed(owner), p, 'Kitchen remodel');
    expect(r).toEqual({ ok: true, tenantId: tenantA, jobId: expect.any(String) });
    if (!r.ok) return;

    expect((await sql`select 1 from public.project where id = ${p}::uuid`).length).toBe(0);
    expect(await dependents(p)).toEqual({});
    const [note] = await sql<{ project_id: string | null }[]>`
      select project_id from public.notification where id = ${n.id}::uuid`;
    expect(note.project_id).toBeNull();

    const log = await sql<{ action: string; details: unknown; tenant_id: string; actor_app_user_id: string }[]>`
      select action, details, tenant_id, actor_app_user_id from public.event_log
      where object_id = ${p}::uuid and action = 'project.deleted'`;
    expect(log).toEqual([
      {
        action: 'project.deleted',
        details: { projectId: p, name: 'Kitchen remodel' },
        tenant_id: tenantA,
        actor_app_user_id: ownerMember.appUserId,
      },
    ]);

    const jobs = await sql<{ id: string; project_id: string | null; kind: string; payload: unknown; status: string }[]>`
      select id, project_id, kind, payload, status from public.job where id = ${r.jobId}::uuid`;
    expect(jobs).toEqual([
      { id: r.jobId, project_id: null, kind: 'project_purge', payload: { projectId: p }, status: 'queued' },
    ]);

    expect(await sessionCount(listedMember.authUserId)).toBe(sessionsBefore);
    expect(await resolveClientLink(token)).toBeNull();
  });

  it('AC-7 Delete needs Delete projects inside the function; other companies cannot delete', async () => {
    const p = await create('Guest bath');
    expect(await deleteProject(typed(editor), p, 'Guest bath')).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await deleteProject(typed(ownerB), p, 'Guest bath')).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    const sql = harnessSql();
    expect((await sql`select 1 from public.project where id = ${p}::uuid`).length).toBe(1);
    expect(
      (await sql`select 1 from public.event_log where object_id = ${p}::uuid and action = 'project.deleted'`)
        .length,
    ).toBe(0);
    expect(
      (await sql`select 1 from public.job where kind = 'project_purge' and payload ->> 'projectId' = ${p}`)
        .length,
    ).toBe(0);
  });

  it('a member of company B cannot read company A purge jobs (a company-level job is all-projects only)', async () => {
    const p = await create('Hall bath');
    const r = await deleteProject(typed(owner), p, 'Hall bath');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const seen = await ownerB.serverDb.from('job').select('id').eq('id', r.jobId);
    expect(seen.error).toBeNull();
    expect(seen.data).toEqual([]);
    const mine = await owner.serverDb.from('job').select('id').eq('id', r.jobId);
    expect(mine.data).toEqual([{ id: r.jobId }]);
  });
});
