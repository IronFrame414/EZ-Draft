// EZD-234 (Q-0704 03-data-model row 3 "File references are checked on save"; 10-permissions Q-0704; AC-EZD-234-4;
// CLAUDE.md rule 4). Local database, real sign-in (as object-numbers.db.test.ts). A pin's photo id must name an
// uploaded `photo` source_file of the same project, read through the saver's own client: another company's file,
// another project's file, an upload not finished, a file of another kind and an engineer letter are all refused.
import { randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION } from '@ezdraft/geometry';
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
import type { PermissionKey } from '../../lib/permissions/catalog';
import type { Database } from '../db/database.types';
import { saveObjects, type ObjectChange } from './model';

type Rec = Record<string, unknown>;
const EDITOR: readonly PermissionKey[] = ['view_projects', 'edit_model'];
type Who = { member: Member; session: Session };

async function editor(tenant: string): Promise<Who> {
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, [...EDITOR]);
  return { member, session: await signIn(member.email) };
}

const floorOf = async (project: string): Promise<string> => {
  const [first] = await harnessSql()<{ object_id: string }[]>`
    select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
  return first.object_id;
};

async function sourceFile(
  tenant: string,
  project: string,
  kind: string,
  uploaded: boolean,
): Promise<string> {
  const id = randomUUID();
  await harnessSql()`insert into public.source_file
    (id, tenant_id, project_id, kind, storage_path, original_name, content_type, size_bytes, uploaded_at)
    values (${id}::uuid, ${tenant}::uuid, ${project}::uuid, ${kind}, ${`${tenant}/${project}/${id}`},
      'photo.jpg', 'image/jpeg', 10, ${uploaded ? new Date() : null})`;
  return id;
}

const pinData = (level: string, photoFileId: string | null): Rec => ({
  geometry: { point: { x: 10, y: 10 } },
  status: 'existing',
  level,
  attributes: { kind: 'damage_moisture', photoFileId },
});
const noteData = (level: string, fileId: string | null): Rec => ({
  geometry: { start: { x: 0, y: 0 }, end: { x: 120, y: 0 } },
  status: 'existing',
  level,
  attributes: {
    wallId: randomUUID(),
    action: 'delete',
    engineerName: '',
    approvedText: '',
    fileId,
    letterOnFile: false,
  },
});
const upsert = (type: string, data: Rec): ObjectChange => ({
  id: randomUUID(),
  baseSeq: 0,
  deleted: false,
  type,
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});

afterAll(async () => {
  await cleanup();
  await closeHarness();
});

describe('EZD-234 file references on save (database)', () => {
  let tenant = '';
  let other = '';
  let project = '';
  let project2 = '';
  let otherProject = '';
  let level = '';
  let a: Who;

  beforeAll(async () => {
    tenant = await createTenant();
    other = await createTenant();
    [project, project2] = await createProjects(tenant, 2);
    [otherProject] = await createProjects(other, 1);
    level = await floorOf(project);
    a = await editor(tenant);
  }, 180000);

  const save = (changes: ObjectChange[]) =>
    saveObjects(
      a.session.serverDb as unknown as SupabaseClient<Database>,
      project,
      { lockEpoch: 0, changes },
      a.member.appUserId,
    );

  it('an uploaded photo of this project saves; no photo saves', async () => {
    const photo = await sourceFile(tenant, project, 'photo', true);
    const r = await save([
      upsert('pin', pinData(level, photo)),
      upsert('pin', pinData(level, null)),
    ]);
    expect(r.ok).toBe(true);
  });

  it("another company's file is refused, and nothing is written", async () => {
    const theirs = await sourceFile(other, otherProject, 'photo', true);
    const change = upsert('pin', pinData(level, theirs));
    expect(await save([change])).toEqual({
      ok: false,
      code: 'invalid_object',
      invalid: [{ id: change.id, issue: 'file_not_found' }],
    });
    const rows = await harnessSql()`
      select 1 from public.model_object where object_id = ${change.id}::uuid`;
    expect(rows).toHaveLength(0);
  });

  it("another project's file, an unfinished upload, another kind and an unknown id are refused", async () => {
    const cases = [
      await sourceFile(tenant, project2, 'photo', true),
      await sourceFile(tenant, project, 'photo', false),
      await sourceFile(tenant, project, 'pdf', true),
      randomUUID(),
    ];
    for (const fileId of cases) {
      const change = upsert('pin', pinData(level, fileId));
      expect(await save([change]), fileId).toEqual({
        ok: false,
        code: 'invalid_object',
        invalid: [{ id: change.id, issue: 'file_not_found' }],
      });
    }
  });

  it('room photos are checked the same way; an engineer letter is refused until its kind exists', async () => {
    const good = await sourceFile(tenant, project, 'photo', true);
    const bad = await sourceFile(tenant, project2, 'photo', true);
    const room = (photos: string[]) =>
      upsert('room', {
        geometry: {
          boundary: [
            { x: 0, y: 0 },
            { x: 144, y: 0 },
            { x: 144, y: 120 },
          ],
        },
        status: 'existing',
        level,
        attributes: { name: 'Room 1', floorLevel: 0, photos },
        closureOverride: null,
      });
    expect((await save([room([good])])).ok).toBe(true);
    const r = room([good, bad]);
    expect(await save([r])).toEqual({
      ok: false,
      code: 'invalid_object',
      invalid: [{ id: r.id, issue: 'file_not_found' }],
    });
    const letter = await sourceFile(tenant, project, 'pdf', true);
    const n = upsert('engineer_note', noteData(level, letter));
    expect(await save([n])).toEqual({
      ok: false,
      code: 'invalid_object',
      invalid: [{ id: n.id, issue: 'file_not_found' }],
    });
    expect((await save([upsert('engineer_note', noteData(level, null))])).ok).toBe(true);
  });
});
