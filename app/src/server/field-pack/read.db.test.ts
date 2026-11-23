// EZD-1404 on the local stack (03d field_pack_issue; S17 Permissions "View field pack: View projects (scoped to
// assigned projects)"; CLAUDE.md rule 4: one company cannot read or change another company's field_pack_issue rows).
// Expected values come from the seeded issue: Version 2 with the rooms Kitchen and Pantry, three tasks and the note;
// the newest issue wins; a project with no issue has no pack (S17 States "No field pack issued yet").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedFieldPack } from '../../../e2e/fixtures/field-pack';
import { setPermissions } from '../../../test-harness/permissions/grant';
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
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
import { readFieldPack } from './read';

const CREW = ['view_projects', 'check_off_tasks', 'photo_notes', 'flag_conflict'] as const;

describe('EZD-1404 field_pack_issue', () => {
  let tA = '';
  let pA = '';
  let pEmpty = '';
  let pOther = '';
  let crew: Session;
  let b: Session;

  beforeAll(async () => {
    tA = await createTenant();
    [pA, pEmpty, pOther] = await createProjects(tA, 3);
    const m = await createMember({ tenantId: tA, scope: 'listed', listed: [pA!, pEmpty!] });
    await setPermissions(tA, m.membershipId, [...CREW] as never);
    crew = await signIn(m.email);
    const tB = await createTenant();
    const mb = await createMember({ tenantId: tB, scope: 'all' });
    await setPermissions(tB, mb.membershipId, ['view_projects']);
    b = await signIn(mb.email);
    await seedFieldPack(harnessSql(), {
      tenantId: tA,
      projectId: pA!,
      rooms: ['Old room'],
      versionNo: 1,
      issuedAt: '2026-10-01T12:00:00Z',
    });
    await seedFieldPack(harnessSql(), {
      tenantId: tA,
      projectId: pA!,
      rooms: ['Kitchen', 'Pantry'],
      versionNo: 2,
      note: 'Island moved 6" east',
      taskCount: 3,
      issuedAt: '2026-10-08T12:00:00Z',
    });
    await seedFieldPack(harnessSql(), { tenantId: tA, projectId: pOther! });
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('a crew member listed on the project reads the newest issued pack', async () => {
    const view = await readFieldPack(crew.serverDb as never, pA);
    expect(view?.pack).toMatchObject({
      revision: { kind: 'version', no: 2 },
      note: 'Island moved 6" east',
      openTasks: 3,
    });
    expect(Date.parse(view!.pack!.issuedAt)).toBe(Date.parse('2026-10-08T12:00:00Z'));
    expect(view?.pack?.rooms.map((r) => r.name)).toEqual(['Kitchen', 'Pantry']);
  });

  it('a project with no issue has no pack', async () => {
    const view = await readFieldPack(crew.serverDb as never, pEmpty);
    expect(view).not.toBeNull();
    expect(view?.pack).toBeNull();
  });

  it('a project the crew member is not listed on is not found', async () => {
    expect(await readFieldPack(crew.serverDb as never, pOther)).toBeNull();
    const direct = await crew.serverDb.from('field_pack_issue').select('id').eq('project_id', pOther);
    expect(direct.data ?? []).toEqual([]);
  });

  it("another company can neither read nor change this project's pack", async () => {
    expect(await readFieldPack(b.serverDb as never, pA)).toBeNull();
    const direct = await b.serverDb.from('field_pack_issue').select('id').eq('project_id', pA);
    expect(direct.data ?? []).toEqual([]);
  });

  it('a member cannot write the table directly', async () => {
    const { error } = await crew.serverDb
      .from('field_pack_issue')
      .update({ note: 'changed' })
      .eq('project_id', pA)
      .select('id');
    expect(error === null || error.code === '42501').toBe(true);
    expect((await readFieldPack(crew.serverDb as never, pA))?.pack?.note).toBe('Island moved 6" east');
  });

  describeTenantIsolation('field_pack_issue', {
    makeRow: async (t, ctx) => {
      const [v] = await harnessSql()<{ id: string }[]>`
        insert into public.model_version (project_id, tenant_id, model_json, schema_version)
        values (${ctx.projectIds[0]!}::uuid, ${t}::uuid, '{"objects":[]}'::jsonb, 1)
        returning id`;
      return { tenant_id: t, project_id: ctx.projectIds[0], model_version_id: v!.id, note: 'n' };
    },
    update: { note: 'changed' },
  });
});
