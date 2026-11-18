// EZD-127 D1-D6 (AC-EZD-127-1; 04 Header card "N to review" pill; phase-01 EZD-127 "kept in
// project.open_items_count and updated when a source changes, never counted across tables on page load").
// Expected values: one test review item gives a count of 1 on the project and on its Projects card (list_projects
// openItems); the same source thing opened twice is one item; resolving or deleting an item takes it off; a member
// can neither write the count nor a review_item row (42501, RLS); a count change alone leaves updated_at; another
// company's member reads nothing. Rows are written as the source features will, through private.add_review_item
// and private.resolve_review_item (harnessSql, the database owner).
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
  type Session,
} from '../../../test-harness/rls/fixtures';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import { REVIEW_SOURCES } from '../../lib/review/sources';
import type { Database } from '../db/database.types';
import { listProjects } from '../projects/projects';
import { readReviewSummary } from './review';

const T = { timeout: 60_000 };
const typed = (s: Session) => s.serverDb as unknown as SupabaseClient<Database>;

describe('EZD-127 review items', () => {
  let tenant = '';
  let project = '';
  let second = '';
  let memberS: Session;
  let editorS: Session;
  let otherS: Session;

  const stored = async (id: string) =>
    (
      await harnessSql()<{ n: number; u: Date }[]>`select open_items_count as n, updated_at as u
        from public.project where id = ${id}::uuid`
    )[0];
  const add = async (id: string, source: string, ref: string) =>
    (
      await harnessSql()<
        { id: string }[]
      >`select private.add_review_item(${id}::uuid, ${source}, ${ref}) as id`
    )[0].id;
  const resolve = async (id: string, source: string, ref: string) =>
    (
      await harnessSql()<
        { ok: boolean }[]
      >`select private.resolve_review_item(${id}::uuid, ${source}, ${ref}) as ok`
    )[0].ok;
  const card = async (s: Session, id: string) =>
    (await listProjects(typed(s), { tab: 'all', sort: 'edited', after: null })).items.find(
      (p) => p.id === id,
    )?.openItems;

  beforeAll(async () => {
    tenant = await createTenant();
    [project, second] = await createProjects(tenant, 2);
    const m = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, m.membershipId, ['view_projects']);
    const e = await createMember({ tenantId: tenant, scope: 'all' });
    await setPermissions(tenant, e.membershipId, ['view_projects', 'edit_model']);
    const otherTenant = await createTenant();
    const o = await createMember({ tenantId: otherTenant, scope: 'all' });
    await setPermissions(otherTenant, o.membershipId, ['view_projects']);
    memberS = await signIn(m.email);
    editorS = await signIn(e.email);
    otherS = await signIn(o.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  }, 180000);

  it('EZD-127 D1 the database source list is the shared REVIEW_SOURCES list', T, async () => {
    const rows = await harnessSql()<{ def: string }[]>`select pg_get_constraintdef(c.oid) as def
      from pg_constraint c where c.conrelid = 'public.review_item'::regclass and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%source = ANY%'`;
    expect(rows).toHaveLength(1);
    const values = [...rows[0].def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
    expect(values).toEqual([...REVIEW_SOURCES]);
  });

  it(
    'EZD-127 D2 a test review item shows on the stored count, the pill summary and the project card',
    T,
    async () => {
      const before = await stored(project);
      expect(before.n).toBe(0);
      await add(project, 'field_conflict', 'test-1');
      const after = await stored(project);
      expect(after.n).toBe(1);
      expect(after.u.toISOString()).toBe(before.u.toISOString());
      expect(await readReviewSummary(typed(memberS), project, false)).toEqual({ count: 1 });
      expect(await readReviewSummary(typed(memberS), project, true)).toEqual({
        count: 1,
        groups: [{ source: 'field_conflict', count: 1 }],
      });
      expect(await card(memberS, project)).toBe(1);
      expect(await card(memberS, second)).toBe(0);
    },
  );

  it('EZD-127 D3 the count follows add, add again, resolve, reopen and delete', T, async () => {
    const id1 = await add(second, 'render_approval', 'r-1');
    expect(await add(second, 'render_approval', 'r-1')).toBe(id1);
    expect((await stored(second)).n).toBe(1);
    await add(second, 'client_comment', 'c-1');
    await add(second, 'render_approval', 'r-2');
    expect((await stored(second)).n).toBe(3);
    expect(await readReviewSummary(typed(memberS), second, true)).toEqual({
      count: 3,
      groups: [
        { source: 'render_approval', count: 2 },
        { source: 'client_comment', count: 1 },
      ],
    });
    expect(await resolve(second, 'render_approval', 'r-1')).toBe(true);
    expect(await resolve(second, 'render_approval', 'r-1')).toBe(false);
    expect((await stored(second)).n).toBe(2);
    // Reopened later: a new open item for the same source thing.
    expect(await add(second, 'render_approval', 'r-1')).not.toBe(id1);
    expect((await stored(second)).n).toBe(3);
    await harnessSql()`delete from public.review_item where project_id = ${second}::uuid and source = 'client_comment'`;
    expect((await stored(second)).n).toBe(2);
    await harnessSql()`delete from public.review_item where project_id = ${second}::uuid`;
    expect((await stored(second)).n).toBe(0);
    expect(await card(memberS, second)).toBe(0);
  });

  it('EZD-127 D4 the pill reads the stored count and never counts the rows', T, async () => {
    await harnessSql()`update public.project set open_items_count = 5 where id = ${second}::uuid`;
    expect(await readReviewSummary(typed(memberS), second, false)).toEqual({ count: 5 });
    await harnessSql()`update public.project set open_items_count = 0 where id = ${second}::uuid`;
  });

  it('EZD-127 D5 a member writes neither the count nor a review item', T, async () => {
    const setCount = await typed(editorS)
      .from('project')
      .update({ open_items_count: 9 })
      .eq('id', project);
    expect(setCount.error?.code).toBe('42501');
    const rename = await typed(editorS)
      .from('project')
      .update({ name: 'Renamed' })
      .eq('id', project)
      .select('id');
    expect(rename.error).toBeNull();
    const insert = await typed(editorS)
      .from('review_item')
      .insert({ tenant_id: tenant, project_id: project, source: 'translation', source_ref: 'x-1' });
    expect(insert.error?.code).toBe('42501');
    const resolveRow = await typed(editorS)
      .from('review_item')
      .update({ resolved_at: new Date().toISOString() })
      .eq('project_id', project)
      .select('id');
    expect(resolveRow.data ?? []).toEqual([]);
    const callAdd = await typed(editorS).rpc(
      'add_review_item' as never,
      {
        p_project: project,
        p_source: 'translation',
        p_source_ref: 'x-2',
      } as never,
    );
    expect(callAdd.error).not.toBeNull();
    expect((await stored(project)).n).toBe(1);
  });

  it(
    'EZD-127 D6 another company reads no review item and no count of this project',
    T,
    async () => {
      expect(await readReviewSummary(typed(otherS), project, true)).toBeNull();
      const rows = await typed(otherS).from('review_item').select('id').eq('project_id', project);
      expect(rows.data ?? []).toEqual([]);
    },
  );

  describeTenantIsolation('review_item', {
    makeRow: (tenantId, ctx) => ({
      tenant_id: tenantId,
      project_id: ctx.projectIds[0],
      source: 'code_warning',
      source_ref: 'iso-1',
    }),
  });
});
