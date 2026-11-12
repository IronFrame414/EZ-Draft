// EZD-224 D1 to D12 (vault/plans/EZD-224.md section 4; AC-EZD-224-1 to -4). Database and Storage tests against the
// local stack. Expected values: the plan's Tests table, Decided rows and Seam (Q-0664: path, 40,959-byte limit,
// image/webp only; 09m row 5). Every test makes its own projects in the file's tenants; every object a test
// uploads is removed in afterAll before cleanup() (L-051; pattern: app/src/server/storage/media-bucket.test.ts).
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
import { THUMB_WEBP } from '../../../test-harness/thumbnail/fixture';
import { UploadError, uploadFile, type SignedUpload } from '../../lib/storage/upload';
import { createCheckpoint } from '../model/model';
import { listProjects } from '../projects/projects';
import type { DbClient } from '../storage/objects';
import { completeCheckpointThumbnail, startCheckpointThumbnail } from './thumbnail';

const uploaded: string[] = [];

type Who = { session: Session; membershipId: string };
let tenantA = '';
let tenantB = '';
let editor: Who;
let editor2: Who;
let viewer: Who;

const client = (w: Who) => w.session.serverDb as unknown as DbClient;
const thumbPath = (tenant: string, project: string, version: string) =>
  `${tenant}/${project}/thumb/${version}.webp`;

async function checkpoint(w: Who, project: string): Promise<string> {
  const r = await createCheckpoint(w.session.serverDb as never, project);
  if (!r.ok) throw new Error(`checkpoint failed: ${r.code}`);
  return r.versionId;
}

async function memberWith(tenant: string, permissions: string[]): Promise<Who> {
  const m = await createMember({ tenantId: tenant, scope: 'all' });
  await setPermissions(tenant, m.membershipId, permissions as never);
  return { session: await signIn(m.email), membershipId: m.membershipId };
}

// Starts and returns the signed upload of an eligible version; records its path for afterAll.
async function startOk(w: Who, project: string, version: string): Promise<SignedUpload> {
  const r = await startCheckpointThumbnail(client(w), project, version);
  if (!r.ok) throw new Error(`start refused: ${r.code}`);
  uploaded.push(r.upload.path);
  return r.upload;
}

const send = (upload: SignedUpload, bytes: Uint8Array, contentType = 'image/webp') =>
  uploadFile(upload, new Blob([bytes as BlobPart]), { contentType });

const zeros = (n: number) => new Uint8Array(n);

const objectExists = async (path: string) => {
  const slash = path.lastIndexOf('/');
  const name = path.slice(slash + 1);
  const { data, error } = await adminDb()
    .storage.from('media')
    .list(path.slice(0, slash), { search: name });
  expect(error).toBeNull();
  return (data ?? []).some((o) => o.name === name);
};

const previewOf = async (version: string) =>
  (
    await harnessSql()<{ preview_path: string | null }[]>`
      select preview_path from public.model_version where id = ${version}::uuid`
  )[0].preview_path;

const thumbOf = async (project: string) =>
  (
    await harnessSql()<{ thumbnail_path: string | null }[]>`
      select thumbnail_path from public.project where id = ${project}::uuid`
  )[0].thumbnail_path;

// The code a postgres.js query fails with, or null when it succeeds.
const failureCode = async (query: PromiseLike<unknown>): Promise<string | null> => {
  try {
    await query;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'no_code';
  }
};

describe('EZD-224 checkpoint thumbnail database', () => {
  beforeAll(async () => {
    tenantA = await createTenant();
    tenantB = await createTenant();
    editor = await memberWith(tenantA, ['view_projects', 'edit_model']);
    editor2 = await memberWith(tenantA, ['view_projects', 'edit_model']);
    viewer = await memberWith(tenantA, ['view_projects']);
  }, 180000);

  afterAll(async () => {
    try {
      if (uploaded.length > 0) await adminDb().storage.from('media').remove(uploaded);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('EZD-224 D1 the media bucket takes image/webp and refuses text/html', async () => {
    const rows = await harnessSql()`
      select file_size_limit, allowed_mime_types from storage.buckets where id = 'media'`;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].file_size_limit)).toBe(4000000);
    for (const type of ['image/webp', 'image/png', 'image/jpeg', 'image/svg+xml']) {
      expect(rows[0].allowed_mime_types).toContain(type);
    }
    const [p] = await createProjects(tenantA, 1);
    const v = await checkpoint(editor, p);
    const upload = await startOk(editor, p, v);
    const html = await send(upload, new Uint8Array(10).fill(0x61), 'text/html').catch((e) => e);
    expect(html).toBeInstanceOf(UploadError);
    expect((html as UploadError).code).toBe('upload_rejected');
    expect(await objectExists(upload.path)).toBe(false);
  }, 60000);

  it("EZD-224 D2 start returns the lower-case path only for the caller's own newest checkpoint", async () => {
    const [p, p2] = await createProjects(tenantA, 2);
    const [pB] = await createProjects(tenantB, 1);
    const v1 = await checkpoint(editor, p);
    const v2 = await checkpoint(editor, p);

    const ok = await startCheckpointThumbnail(client(editor), p, v2.toUpperCase());
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      uploaded.push(ok.upload.path);
      expect(ok.upload.path).toBe(thumbPath(tenantA, p, v2));
    }

    expect(await startCheckpointThumbnail(client(viewer), p, v2)).toEqual({
      ok: false,
      code: 'permission_denied',
    });
    expect(await startCheckpointThumbnail(client(editor), pB, v2)).toEqual({
      ok: false,
      code: 'project_not_found',
    });
    // Another member's own newest checkpoint of a project, started by the first member.
    const theirs = await checkpoint(editor2, p2);
    expect(await startCheckpointThumbnail(client(editor), p2, theirs)).toEqual({
      ok: false,
      code: 'version_not_found',
    });
    // An older checkpoint of the caller's own.
    expect(await startCheckpointThumbnail(client(editor), p, v1)).toEqual({
      ok: false,
      code: 'version_not_found',
    });
  }, 120000);

  it('EZD-224 D3 Storage signs a thumb path only for the server and only for an eligible path', async () => {
    const [p1, p2] = await createProjects(tenantA, 2);
    const v = await checkpoint(editor, p1);
    const v2 = await checkpoint(editor, p2);
    const eligible = thumbPath(tenantA, p1, v);
    const media = (db: Session['serverDb']) => db.storage.from('media');
    uploaded.push(eligible);

    // The browser's client (no gate header) and a plain server upload are refused.
    expect((await media(editor.session.browserDb).createSignedUploadUrl(eligible)).error).not.toBeNull();
    expect(
      (await media(editor.session.browserDb).upload(eligible, THUMB_WEBP, { contentType: 'image/webp' }))
        .error,
    ).not.toBeNull();
    expect(
      (await media(editor.session.serverDb).upload(eligible, THUMB_WEBP, { contentType: 'image/webp' }))
        .error,
    ).not.toBeNull();

    // The member who made a checkpoint and then loses Edit model (only the live permission check refuses).
    const revoked = await memberWith(tenantA, ['view_projects', 'edit_model']);
    const [pR] = await createProjects(tenantA, 1);
    const vR = await checkpoint(revoked, pR);
    await setPermissions(tenantA, revoked.membershipId, ['view_projects'] as never);

    const refused: Array<[string, Session['serverDb'], string]> = [
      ['tenant B prefix', editor.session.serverDb, thumbPath(tenantB, p1, v)],
      ['extra folder', editor.session.serverDb, `${tenantA}/${p1}/thumb/x/${v}.webp`],
      ['upper-case version', editor.session.serverDb, thumbPath(tenantA, p1, v.toUpperCase())],
      ['dot dot', editor.session.serverDb, `${tenantA}/${p1}/thumb/../${v}.webp`],
      ['png extension', editor.session.serverDb, `${tenantA}/${p1}/thumb/${v}.png`],
      ['another project version', editor.session.serverDb, thumbPath(tenantA, p1, v2)],
      ['no Edit model', revoked.session.serverDb, thumbPath(tenantA, pR, vR)],
    ];
    for (const [name, db, path] of refused) {
      uploaded.push(path);
      const r = await media(db).createSignedUploadUrl(path);
      expect(r.error, name).not.toBeNull();
      expect(await objectExists(path), name).toBe(false);
    }

    const signed = await media(editor.session.serverDb).createSignedUploadUrl(eligible);
    expect(signed.error).toBeNull();
    expect(signed.data?.token).toBeTruthy();
  }, 120000);

  it('EZD-224 D4 complete stores the path only for one webp of 1 to 40,959 bytes uploaded by the caller', async () => {
    const [p] = await createProjects(tenantA, 1);
    const stays = async (path: string) => {
      expect(await thumbOf(p)).toBe(path);
    };

    const v1 = await checkpoint(editor, p);
    const first = await startOk(editor, p, v1);
    await send(first, zeros(40959));
    expect(await completeCheckpointThumbnail(client(editor), p, v1)).toEqual({
      ok: true,
      path: thumbPath(tenantA, p, v1),
    });
    const path = thumbPath(tenantA, p, v1);
    expect(first.path).toBe(path);
    expect(await previewOf(v1)).toBe(path);
    expect(await thumbOf(p)).toBe(path);

    const invalid = async (v: string) => {
      expect(await completeCheckpointThumbnail(client(editor), p, v)).toEqual({
        ok: false,
        code: 'thumbnail_invalid',
      });
      expect(await previewOf(v)).toBeNull();
      await stays(path);
      expect(await previewOf(v1)).toBe(path);
    };

    const big = await checkpoint(editor, p);
    await send(await startOk(editor, p, big), zeros(40960));
    await invalid(big);

    const png = await checkpoint(editor, p);
    await send(await startOk(editor, p, png), THUMB_WEBP, 'image/png');
    await invalid(png);

    const none = await checkpoint(editor, p);
    await startOk(editor, p, none);
    await invalid(none);

    const empty = await checkpoint(editor, p);
    const emptyUpload = await startOk(editor, p, empty);
    const put = await editor.session.serverDb.storage
      .from('media')
      .uploadToSignedUrl(emptyUpload.path, emptyUpload.token, new Blob([], { type: 'image/webp' }), {
        contentType: 'image/webp',
      });
    expect(put.error).toBeNull();
    await invalid(empty);

    const foreign = await checkpoint(editor, p);
    const foreignPath = thumbPath(tenantA, p, foreign);
    uploaded.push(foreignPath);
    const admin = await adminDb()
      .storage.from('media')
      .upload(foreignPath, THUMB_WEBP, { contentType: 'image/webp' });
    expect(admin.error).toBeNull();
    await invalid(foreign);

    expect(await completeCheckpointThumbnail(client(editor), p, v1)).toEqual({
      ok: false,
      code: 'version_not_found',
    });
  }, 180000);

  it('EZD-224 D5 a newer checkpoint makes the older version refused', async () => {
    const [p] = await createProjects(tenantA, 1);
    const v1 = await checkpoint(editor, p);
    await send(await startOk(editor, p, v1), THUMB_WEBP);
    await checkpoint(editor, p);
    expect(await completeCheckpointThumbnail(client(editor), p, v1)).toEqual({
      ok: false,
      code: 'version_not_found',
    });
    expect(await previewOf(v1)).toBeNull();
  }, 60000);

  it('EZD-224 D6 two completes held on the edit lock: one stores, one is refused', async () => {
    const [p] = await createProjects(tenantA, 1);
    const v = await checkpoint(editor, p);
    await send(await startOk(editor, p, v), THUMB_WEBP);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const held = harnessSql().begin(async (tx) => {
      const rows = await tx`select 1 from public.edit_lock where project_id = ${p}::uuid for update`;
      expect(rows).toHaveLength(1);
      locked();
      await gate;
    });
    try {
      await lockTaken;
      const a = completeCheckpointThumbnail(client(editor), p, v);
      const b = completeCheckpointThumbnail(client(editor), p, v);
      await expect
        .poll(
          async () =>
            (
              await harnessSql()<{ n: number }[]>`
                select count(*)::int as n from pg_stat_activity
                where wait_event_type = 'Lock' and query like '%set_checkpoint_thumbnail%'`
            )[0].n,
          { timeout: 30000 },
        )
        .toBe(2);
      release();
      await held;
      const results = await Promise.all([a, b]);
      expect(results.map((r) => (r.ok ? 'ok' : r.code)).sort()).toEqual(['ok', 'version_not_found']);
    } finally {
      release();
      await held.catch(() => {});
    }
    expect(await previewOf(v)).toBe(thumbPath(tenantA, p, v));
  }, 120000);

  it('EZD-224 D7 a server checkpoint leaves preview_path null and thumbnail_path unchanged', async () => {
    const [p] = await createProjects(tenantA, 1);
    const v1 = await checkpoint(editor, p);
    await send(await startOk(editor, p, v1), THUMB_WEBP);
    expect(await completeCheckpointThumbnail(client(editor), p, v1)).toEqual({
      ok: true,
      path: thumbPath(tenantA, p, v1),
    });
    const path = thumbPath(tenantA, p, v1);

    const v2 = await checkpoint(editor, p);
    expect(await previewOf(v2)).toBeNull();
    expect(await thumbOf(p)).toBe(path);
    expect(await previewOf(v1)).toBe(path);
  }, 60000);

  it('EZD-224 D8 list_projects reports hasThumbnail', async () => {
    const tenant = await createTenant();
    const [p1, p2] = await createProjects(tenant, 2);
    const m = await memberWith(tenant, ['view_projects', 'edit_model']);
    const v = await checkpoint(m, p1);
    await send(await startOk(m, p1, v), THUMB_WEBP);
    expect(await completeCheckpointThumbnail(client(m), p1, v)).toEqual({
      ok: true,
      path: thumbPath(tenant, p1, v),
    });
    await checkpoint(m, p2);

    const page = await listProjects(m.session.serverDb as never, {
      tab: 'all',
      sort: 'edited',
      after: null,
    });
    expect(page.items.find((i) => i.id === p1)?.hasThumbnail).toBe(true);
    expect(page.items.find((i) => i.id === p2)?.hasThumbnail).toBe(false);
  }, 120000);

  it('EZD-224 D9 the column checks refuse a path of another row', async () => {
    const [p1, p2] = await createProjects(tenantA, 2);
    const v = await checkpoint(editor, p1);
    const v2 = await checkpoint(editor, p2);
    const sql = harnessSql();

    const otherProjectPath = thumbPath(tenantA, p2, v2);
    expect(
      await failureCode(sql`update public.project set thumbnail_path = ${otherProjectPath} where id = ${p1}::uuid`),
    ).toBe('23514');
    expect(
      await failureCode(
        sql`update public.model_version set preview_path = ${`${tenantA}/${p1}/thumb/${v}.png`} where id = ${v}::uuid`,
      ),
    ).toBe('23514');
    expect(await thumbOf(p1)).toBeNull();
    expect(await previewOf(v)).toBeNull();
  }, 60000);

  it('EZD-224 D10 catalog: the thumb policy, definer functions and grants', async () => {
    const sql = harnessSql();
    const policies = await sql<{ cmd: string; roles: string[]; with_check: string | null }[]>`
      select cmd, roles::text[] as roles, with_check from pg_policies
      where schemaname = 'storage' and tablename = 'objects' and policyname = 'storage_media_thumb_insert'`;
    expect(policies).toHaveLength(1);
    expect(policies[0].cmd).toBe('INSERT');
    expect(policies[0].roles).toEqual(['authenticated']);
    for (const text of ['storage_request_from_server', 'sign_upload_url', 'thumbnail_upload_allowed']) {
      expect(policies[0].with_check ?? '').toContain(text);
    }

    const functions: Array<[string, string, boolean]> = [
      ['public', 'start_checkpoint_thumbnail', true],
      ['public', 'set_checkpoint_thumbnail', true],
      ['private', 'thumbnail_upload_allowed', true],
      ['private', 'checkpoint_thumbnail_refusal', false],
    ];
    for (const [schema, name, authenticated] of functions) {
      const rows = await sql<
        { prosecdef: boolean; proconfig: string[] | null; anon: boolean; service: boolean; auth: boolean }[]
      >`
        select p.prosecdef, p.proconfig,
          has_function_privilege('anon', p.oid, 'execute') as anon,
          has_function_privilege('service_role', p.oid, 'execute') as service,
          has_function_privilege('authenticated', p.oid, 'execute') as auth
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = ${schema} and p.proname = ${name}`;
      expect(rows, `${schema}.${name}`).toHaveLength(1);
      expect(rows[0].prosecdef, `${name} definer`).toBe(true);
      expect(rows[0].proconfig ?? [], `${name} search_path`).toContain('search_path=""');
      expect(rows[0].anon, `${name} anon`).toBe(false);
      expect(rows[0].service, `${name} service_role`).toBe(false);
      expect(rows[0].auth, `${name} authenticated`).toBe(authenticated);
    }
  }, 60000);

  it('EZD-224 D11 only set_checkpoint_thumbnail writes project.thumbnail_path', async () => {
    const [p] = await createProjects(tenantA, 1);
    const v = await checkpoint(editor, p);
    const x = thumbPath(tenantA, p, v);
    const refusedWith = (r: { error: { code?: string; message?: string } | null }, name: string) => {
      expect(r.error, name).not.toBeNull();
      expect(r.error?.code, name).toBe('42501');
      expect(r.error?.message, name).toBe('thumbnail_path_refused');
    };

    refusedWith(
      await editor.session.serverDb.from('project').update({ thumbnail_path: x }).eq('id', p),
      'member update',
    );
    refusedWith(
      await editor.session.serverDb
        .from('project')
        .insert({ tenant_id: tenantA, name: 'n', address: 'a', type: 'kitchen', thumbnail_path: x }),
      'member insert',
    );
    refusedWith(await adminDb().from('project').update({ thumbnail_path: x }).eq('id', p), 'service role');
    expect(await thumbOf(p)).toBeNull();

    await send(await startOk(editor, p, v), THUMB_WEBP);
    expect(await completeCheckpointThumbnail(client(editor), p, v)).toEqual({
      ok: true,
      path: x,
    });
    expect(await thumbOf(p)).toBe(x);

    const renamed = await editor.session.serverDb.from('project').update({ name: 'Renamed thumb' }).eq('id', p);
    expect(renamed.error).toBeNull();
    const row = (
      await harnessSql()<{ name: string; thumbnail_path: string | null }[]>`
        select name, thumbnail_path from public.project where id = ${p}::uuid`
    )[0];
    expect(row.name).toBe('Renamed thumb');
    expect(row.thumbnail_path).toBe(x);
  }, 120000);

  it('EZD-224 D12 an upload with no content type is refused at complete', async () => {
    const [p] = await createProjects(tenantA, 1);
    const v = await checkpoint(editor, p);
    const upload = await startOk(editor, p, v);
    const signature = { 'Tus-Resumable': '1.0.0', 'x-signature': upload.token };

    const created = await fetch(upload.url, {
      method: 'POST',
      headers: {
        ...signature,
        'Upload-Length': String(THUMB_WEBP.length),
        'Upload-Metadata': [
          `bucketName ${btoa(upload.bucket)}`,
          `objectName ${btoa(upload.path)}`,
        ].join(','),
      },
    });
    expect(created.status).toBe(201);
    const location = new URL(created.headers.get('Location') as string, upload.url).toString();
    const patched = await fetch(location, {
      method: 'PATCH',
      headers: {
        ...signature,
        'Upload-Offset': '0',
        'Content-Type': 'application/offset+octet-stream',
      },
      body: THUMB_WEBP as BodyInit,
    });
    expect(patched.status).toBe(204);

    expect(await completeCheckpointThumbnail(client(editor), p, v)).toEqual({
      ok: false,
      code: 'thumbnail_invalid',
    });
    expect(await previewOf(v)).toBeNull();
    expect(await thumbOf(p)).toBeNull();
  }, 60000);
});
