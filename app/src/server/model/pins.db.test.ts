// EZD-220 (AC-EZD-220-1, -2, -3, -6; 03f:16; 03c:15 "A deleted pin or room keeps its source_file rows"; Q-0704
// 03-data-model rows 1 and 3, 10-permissions; CLAUDE.md rule 4). Local database, real sign-in (as file-refs.db.test.ts).
// A pin of each of the six kinds saves Existing and loads back the same; a moisture pin keeps its photo id; saving
// a photo id of another project, of another kind or still uploading is refused; deleting a pin keeps its
// source_file row; the photo link is signed only for the pin's own company, only for a finished `photo` file.
import { randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION, PIN_KINDS } from '@ezdraft/geometry';
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
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import type { PermissionKey } from '../../lib/permissions/catalog';
import type { Database } from '../db/database.types';
import type { PermissionContext } from '../permissions/context';
import { signPhotoLink, StorageError } from '../storage';
import { loadModel, saveObjects, type ObjectChange } from './model';

type Rec = Record<string, unknown>;
type Db = SupabaseClient<Database>;
type Who = { member: Member; session: Session };
const EDITOR: readonly PermissionKey[] = ['view_projects', 'edit_model'];

async function editor(tenant: string): Promise<Who> {
  const member = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, member.membershipId, [...EDITOR]);
  return { member, session: await signIn(member.email) };
}

const ctxOf = (m: Member): PermissionContext => ({
  appUserId: m.appUserId,
  membershipId: m.membershipId,
  scope: 'all',
  permissions: new Set(EDITOR),
  listedProjectIds: new Set<string>(),
});

const floorOf = async (project: string): Promise<string> => {
  const [first] = await harnessSql()<{ object_id: string }[]>`
    select object_id from public.model_object where project_id = ${project}::uuid and type = 'floor'`;
  return first.object_id;
};

const stored: string[] = [];

async function sourceFile(
  tenant: string,
  project: string,
  kind: string,
  uploaded: boolean,
  withObject = false,
): Promise<string> {
  const id = randomUUID();
  const path = `${tenant}/${project}/${id}`;
  if (withObject) {
    const up = await adminDb()
      .storage.from('sources')
      .upload(path, new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    stored.push(path);
  }
  await harnessSql()`insert into public.source_file
    (id, tenant_id, project_id, kind, storage_path, original_name, content_type, size_bytes, uploaded_at)
    values (${id}::uuid, ${tenant}::uuid, ${project}::uuid, ${kind}, ${path},
      'leak.jpg', 'image/jpeg', 4, ${uploaded ? new Date() : null})`;
  return id;
}

const pinData = (level: string, kind: string, photoFileId: string | null): Rec => ({
  geometry: { point: { x: 48, y: 30 } },
  status: 'existing',
  level,
  attributes: { kind, photoFileId },
});
const upsert = (id: string, data: Rec, baseSeq = 0): ObjectChange => ({
  id,
  baseSeq,
  deleted: false,
  type: 'pin',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data,
});

afterAll(async () => {
  try {
    if (stored.length > 0) await adminDb().storage.from('sources').remove(stored);
    await cleanup();
  } finally {
    await closeHarness();
  }
});

describe('EZD-220 existing-condition pins (database)', () => {
  let tenant = '';
  let other = '';
  let project = '';
  let project2 = '';
  let otherProject = '';
  let level = '';
  let a: Who;
  let b: Who;

  beforeAll(async () => {
    tenant = await createTenant();
    other = await createTenant();
    [project, project2] = await createProjects(tenant, 2);
    [otherProject] = await createProjects(other, 1);
    level = await floorOf(project);
    a = await editor(tenant);
    b = await editor(other);
  }, 180000);

  const db = (w: Who) => w.session.serverDb as unknown as Db;
  const save = (changes: ObjectChange[]) =>
    saveObjects(db(a), project, { lockEpoch: 0, changes }, a.member.appUserId);

  it('AC-1 a pin of each kind saves Existing and survives reload; a moisture pin keeps its photo', async () => {
    const photo = await sourceFile(tenant, project, 'photo', true);
    const ids = PIN_KINDS.map(() => randomUUID());
    const changes = PIN_KINDS.map((kind, i) =>
      upsert(ids[i]!, pinData(level, kind, kind === 'damage_moisture' ? photo : null)),
    );
    expect((await save(changes)).ok).toBe(true);

    const load = await loadModel(db(a), project, ctxOf(a.member));
    const pins = (load?.objects ?? []).filter((o) => o.type === 'pin');
    expect(pins).toHaveLength(6);
    for (const [i, kind] of PIN_KINDS.entries()) {
      const got = pins.find((o) => o.id.toLowerCase() === ids[i]!.toLowerCase());
      expect(got?.data, kind).toEqual(
        pinData(level, kind, kind === 'damage_moisture' ? photo : null),
      );
    }
  });

  it('AC-1 a pin with any status but Existing is refused', async () => {
    for (const status of ['new', 'demo']) {
      const change = upsert(randomUUID(), { ...pinData(level, 'protect', null), status });
      const r = await save([change]);
      expect(r.ok, status).toBe(false);
    }
  });

  it('AC-3 a photo id of another project, another kind or still uploading is refused', async () => {
    const cases = [
      await sourceFile(tenant, project2, 'photo', true),
      await sourceFile(tenant, project, 'panel_photo', true),
      await sourceFile(tenant, project, 'photo', false),
    ];
    for (const fileId of cases) {
      const change = upsert(randomUUID(), pinData(level, 'damage_moisture', fileId));
      expect(await save([change]), fileId).toEqual({
        ok: false,
        code: 'invalid_object',
        invalid: [{ id: change.id, issue: 'file_not_found' }],
      });
    }
  });

  it('AC-6 deleting a pin keeps its source_file row', async () => {
    const photo = await sourceFile(tenant, project, 'photo', true);
    const id = randomUUID();
    const first = await save([upsert(id, pinData(level, 'damage_moisture', photo))]);
    expect(first.ok).toBe(true);
    const seq = first.ok ? first.objects[0]!.updatedSeq : 0;
    const gone = await save([
      { ...upsert(id, pinData(level, 'damage_moisture', photo), seq), deleted: true },
    ]);
    expect(gone.ok).toBe(true);
    const rows = await harnessSql()<{ deleted: boolean }[]>`
      select deleted from public.model_object where object_id = ${id}::uuid`;
    expect(rows).toEqual([{ deleted: true }]);
    const files = await harnessSql()`select 1 from public.source_file where id = ${photo}::uuid`;
    expect(files).toHaveLength(1);
  });

  it('AC-2 the photo link is signed from the file row for its own company', async () => {
    const photo = await sourceFile(tenant, project, 'photo', true, true);
    const url = await signPhotoLink(db(a), photo);
    expect(url).toContain(`/object/sign/sources/${tenant}/${project}/${photo}`);
    const res = await fetch(url);
    expect(res.status).toBe(200);
  });

  it('AC-6 another company cannot read the photo; another kind or an unfinished upload gets no link', async () => {
    const photo = await sourceFile(tenant, project, 'photo', true, true);
    await expect(signPhotoLink(db(b), photo)).rejects.toEqual(
      new StorageError('source_file_not_found'),
    );
    const read = await db(b).from('source_file').select('id').eq('id', photo);
    expect(read.data).toEqual([]);
    const theirs = await sourceFile(other, otherProject, 'photo', true, true);
    await expect(signPhotoLink(db(a), theirs)).rejects.toEqual(
      new StorageError('source_file_not_found'),
    );
    for (const fileId of [
      await sourceFile(tenant, project, 'supplier_pdf', true, true),
      await sourceFile(tenant, project, 'photo', false, true),
    ]) {
      await expect(signPhotoLink(db(a), fileId)).rejects.toEqual(
        new StorageError('source_file_not_found'),
      );
    }
  });
});
