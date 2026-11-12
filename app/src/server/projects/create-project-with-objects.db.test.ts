// EZD-221a D1-D3 (vault/plans/EZD-221a.md section 1 M1, section 4; AC-EZD-221-3, -5, -6). Expected values: M1's
// body (create_project first, so its 42501 for a member without Create projects, Q-0566; p_objects an array of
// 1 to 5 objects, each exactly the keys data, id, schema_version, type, a uuid id compared as uuid, type wall or
// room, schema_version a whole number of 1 to 9 digits, data an object, else 22023 invalid_input, Q-0203,
// Q-0568, L-048, L-061; inserted rows take the floor's object_id as level, updated_seq 1, updated_by the
// caller's app user, Q-0451; floor from trigger project_first_floor; grants: authenticated only, L-016).
// Calls go through the gated serverDb of `signIn`, as a route does (pattern create-project.db.test.ts).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPermissions } from '../../../test-harness/permissions/grant';
import {
  cleanup,
  closeHarness,
  createMember,
  createTenant,
  harnessSql,
  signIn,
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { buildTemplateObjects } from './template-objects';

type Row = { project_id: string; tenant_id: string };

const L_KITCHEN_108 = { key: 'l_kitchen', width: 141.5, length: 168, ceilingHeight: 108 } as const;

describe('EZD-221a create_project_with_objects', () => {
  let tenant = '';
  let creatorMember: Member;
  let creator: Session;
  let noKey: Session;
  let editOnly: Session;

  const call = (s: Session, objects: unknown) =>
    s.serverDb.rpc('create_project_with_objects', {
      p_name: 'Kitchen remodel',
      p_address: '12 Oak Ave',
      p_type: 'kitchen',
      p_customer_id: null,
      p_scope_of_work: null,
      p_objects: objects,
    });
  const counts = async () => {
    const p =
      await harnessSql()`select count(*) as n from public.project where tenant_id = ${tenant}::uuid`;
    const m =
      await harnessSql()`select count(*) as n from public.model_object where tenant_id = ${tenant}::uuid`;
    return { projects: Number(p[0].n), objects: Number(m[0].n) };
  };

  beforeAll(async () => {
    tenant = await createTenant();
    creatorMember = await createMember({ tenantId: tenant, scope: 'listed' });
    await setPermissions(tenant, creatorMember.membershipId, ['create_projects']);
    const n = await createMember({ tenantId: tenant, scope: 'listed' });
    await setPermissions(tenant, n.membershipId, []);
    const e = await createMember({ tenantId: tenant, scope: 'listed' });
    await setPermissions(tenant, e.membershipId, ['edit_model']);
    creator = await signIn(creatorMember.email);
    noKey = await signIn(n.email);
    editOnly = await signIn(e.email);
  }, 180000);

  afterAll(async () => {
    await cleanup();
    await closeHarness();
  });

  it('EZD-221a D1 writes: the project, its listing and the template objects on the floor, without Edit model', async () => {
    const sent = buildTemplateObjects({ ...L_KITCHEN_108 });
    const made = await call(creator, sent);
    expect(made.error).toBeNull();
    const rows = made.data as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(tenant);
    const project = rows[0].project_id;

    const mp =
      await harnessSql()`select membership_id from public.membership_project where project_id = ${project}::uuid`;
    expect(mp).toHaveLength(1);
    expect(mp[0].membership_id).toBe(creatorMember.membershipId);

    const objs =
      await harnessSql()`select object_id, type, data, schema_version, updated_seq, updated_by,
        data->'attributes'->>'height' as height
      from public.model_object where project_id = ${project}::uuid`;
    expect(objs.filter((o) => o.type === 'floor')).toHaveLength(1);
    expect(objs.filter((o) => o.type === 'wall')).toHaveLength(4);
    expect(objs.filter((o) => o.type === 'room')).toHaveLength(1);
    expect(objs).toHaveLength(6);
    const floorId = objs.find((o) => o.type === 'floor')?.object_id as string;

    for (const s of sent) {
      const got = objs.find((o) => o.object_id === s.id);
      expect(got, s.id).toBeDefined();
      expect(got?.type).toBe(s.type);
      expect(got?.schema_version).toBe(s.schema_version);
      expect(got?.data).toEqual({ ...s.data, level: floorId });
      expect(got?.updated_seq).toBe(1);
      expect(got?.updated_by).toBe(creatorMember.appUserId);
      if (s.type === 'wall') expect(got?.height).toBe('108');
    }
  });

  it('EZD-221a D2 refusals: every bad object list is 22023 and writes no project and no object', async () => {
    const [wall, wall2] = buildTemplateObjects({ ...L_KITCHEN_108 });
    const six = [
      ...buildTemplateObjects({ ...L_KITCHEN_108 }),
      buildTemplateObjects({ ...L_KITCHEN_108 })[0],
    ];
    const noData = { id: wall.id, type: wall.type, schema_version: wall.schema_version };
    const bad: [string, unknown][] = [
      ['null', null],
      ['{}', {}],
      ['[]', []],
      ['6 valid rows', six],
      ['[1]', [1]],
      ['[{}]', [{}]],
      ['extra key x', [{ ...wall, x: 1 }]],
      ['no data', [noData]],
      ["id 'nope'", [{ ...wall, id: 'nope' }]],
      ['id 5', [{ ...wall, id: 5 }]],
      ["type 'opening'", [{ ...wall, type: 'opening' }]],
      ["type 'floor'", [{ ...wall, type: 'floor' }]],
      ['schema_version 0', [{ ...wall, schema_version: 0 }]],
      ["schema_version '1'", [{ ...wall, schema_version: '1' }]],
      ['schema_version 1.5', [{ ...wall, schema_version: 1.5 }]],
      ['schema_version 1234567890', [{ ...wall, schema_version: 1234567890 }]],
      ['data []', [{ ...wall, data: [] }]],
      [
        'duplicate id in two cases',
        [
          { ...wall, id: 'abcdef12-3456-4abc-8def-0123456789ab' },
          { ...wall2, id: 'abcdef12-3456-4abc-8def-0123456789ab'.toUpperCase() },
        ],
      ],
    ];
    const before = await counts();
    for (const [label, objects] of bad) {
      const r = await call(creator, objects);
      expect(r.error?.code, label).toBe('22023');
      expect(await counts(), label).toEqual(before);
    }
  });

  it('EZD-221a D3 permission: Create projects is required, Edit model is not enough; authenticated only', async () => {
    const before = await counts();
    for (const s of [noKey, editOnly]) {
      const r = await call(s, buildTemplateObjects({ ...L_KITCHEN_108 }));
      expect(r.error?.code).toBe('42501');
      expect(await counts()).toEqual(before);
    }
    const sig = 'public.create_project_with_objects(text, text, text, uuid, text, jsonb)';
    const expected: [string, boolean][] = [
      ['anon', false],
      ['authenticated', true],
      ['service_role', false],
    ];
    for (const [role, ok] of expected) {
      const r = await harnessSql()`select has_function_privilege(${role}, ${sig}, 'execute') as ok`;
      expect(r[0].ok, role).toBe(ok);
    }
  });
});
