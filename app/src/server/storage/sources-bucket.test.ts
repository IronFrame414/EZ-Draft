// EZD-296 T1-T6 (vault/plans/EZD-296.md section 4; AC-EZD-296-1, AC-EZD-296-2). Expected values: build step 1 (the
// migration sets `sources` to file_size_limit 52428800 and the six types of L), D1-D4, R-052. Every call goes through
// the member's gated serverDb.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { SOURCE_CONTENT_TYPES, SOURCE_MAX_BYTES } from '../../lib/storage/source-file-kinds';
import { kindOptions } from '../../lib/imports/upload-files';
import { uploadFile, UploadError } from '../../lib/storage/upload';
import {
  completeSourceFileUpload,
  startSourceFileUpload,
  StorageError,
  type DbClient,
} from './index';

const L = [
  'image/vnd.dxf',
  'model/gltf-binary',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
];
const N = 52428800;

const db = (s: Session) => s.serverDb as unknown as DbClient;

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected a rejection');
}

async function expectStorageCode(p: Promise<unknown>, code: string, label?: string) {
  const err = await caught(p);
  expect(err, label).toBeInstanceOf(StorageError);
  expect((err as StorageError).code, label).toBe(code);
}

describe('EZD-296 sources bucket limits', () => {
  let t = '';
  let p = '';
  let appUserId = '';
  let s: Session;
  const uploaded: string[] = [];

  beforeAll(async () => {
    t = await createTenant();
    [p] = await createProjects(t, 1);
    const member = await createMember({ tenantId: t, scope: 'all' });
    appUserId = member.appUserId;
    s = await signIn(member.email);
  }, 180000);

  afterAll(async () => {
    await adminDb().storage.from('sources').remove(uploaded);
    await cleanup();
    await closeHarness();
  });

  const objectExists = async (path: string) => {
    const slash = path.lastIndexOf('/');
    const name = path.slice(slash + 1);
    const { data, error } = await adminDb()
      .storage.from('sources')
      .list(path.slice(0, slash), { search: name });
    expect(error).toBeNull();
    return (data ?? []).some((o) => o.name === name);
  };

  const pending = async () => {
    const started = await startSourceFileUpload(db(s), {
      projectId: p,
      kind: 'pdf',
      originalName: 'plan.pdf',
      contentType: 'application/pdf',
      size: 100,
      uploadedBy: appUserId,
    });
    uploaded.push(started.sourceFile.storagePath);
    return started;
  };

  const directPut = (path: string, bytes: Uint8Array, contentType: string) =>
    s.serverDb.storage.from('sources').upload(path, bytes, { contentType });

  const rowCount = async () => {
    const { count, error } = await adminDb()
      .from('source_file')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', p);
    expect(error).toBeNull();
    return count;
  };

  it('T1 bucket row holds the size limit and the six types', async () => {
    const rows = await harnessSql()`
      select file_size_limit, allowed_mime_types from storage.buckets where id = 'sources'`;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].file_size_limit)).toBe(N);
    expect(Number(rows[0].file_size_limit)).toBe(SOURCE_MAX_BYTES);
    expect(rows[0].allowed_mime_types).toEqual(L);
    expect(rows[0].allowed_mime_types).toEqual([...SOURCE_CONTENT_TYPES]);
  }, 120000);

  it('T2 a direct put with a wrong type is refused, the right type is accepted', async () => {
    const { sourceFile } = await pending();
    const path = sourceFile.storagePath;
    const bytes = new Uint8Array(100).fill(0x61);
    for (const type of [
      'text/html',
      'image/svg+xml',
      'text/html; charset=utf-8',
      'application/octet-stream',
    ]) {
      const res = await directPut(path, bytes, type);
      expect(res.error, type).not.toBeNull();
      expect(await objectExists(path), type).toBe(false);
    }
    const control = await directPut(path, bytes, 'application/pdf');
    expect(control.error).toBeNull();
    expect(await objectExists(path)).toBe(true);
  }, 120000);

  it('T3 a resumable upload with a wrong type is rejected, the right type completes', async () => {
    const { sourceFile, upload } = await pending();
    const bytes = new Uint8Array(100).fill(0x61);
    const err = await caught(uploadFile(upload, new Blob([bytes]), { contentType: 'text/html' }));
    expect(err).toBeInstanceOf(UploadError);
    expect((err as UploadError).code).toBe('upload_rejected');
    expect(await objectExists(sourceFile.storagePath)).toBe(false);

    await uploadFile(upload, new Blob([bytes]), { contentType: 'application/pdf' });
    const done = await completeSourceFileUpload(db(s), sourceFile.id);
    expect(done.uploadedAt).not.toBeNull();
  }, 120000);

  it('T4 a direct put over the size limit is refused, a small one is accepted', async () => {
    const { sourceFile } = await pending();
    const path = sourceFile.storagePath;
    const big = await directPut(path, new Uint8Array(N + 1).fill(0x61), 'application/pdf');
    expect(big.error).not.toBeNull();
    expect(await objectExists(path)).toBe(false);

    const control = await directPut(path, new Uint8Array(100).fill(0x61), 'application/pdf');
    expect(control.error).toBeNull();
    expect(await objectExists(path)).toBe(true);
  }, 120000);

  it('T5 start refuses a wrong type or size and writes no row', async () => {
    const before = await rowCount();
    const input = {
      projectId: p,
      kind: 'pdf' as const,
      originalName: 'plan.pdf',
      contentType: 'application/pdf',
      size: 100,
      uploadedBy: appUserId,
    };
    await expectStorageCode(
      startSourceFileUpload(db(s), { ...input, contentType: 'text/html' }),
      'invalid_input',
      'text/html',
    );
    await expectStorageCode(
      startSourceFileUpload(db(s), { ...input, contentType: 'image/svg+xml' }),
      'invalid_input',
      'svg',
    );
    await expectStorageCode(
      startSourceFileUpload(db(s), { ...input, size: 52428801 }),
      'invalid_input',
      'size',
    );
    expect(await rowCount()).toBe(before);

    const ok = await startSourceFileUpload(db(s), {
      ...input,
      size: 52428800,
      contentType: 'APPLICATION/PDF',
    });
    uploaded.push(ok.sourceFile.storagePath);
    expect(ok.sourceFile.contentType).toBe('application/pdf');
    expect(ok.sourceFile.sizeBytes).toBe(52428800);
  }, 120000);

  it('T6 each type of the list is accepted end to end', async () => {
    for (const type of L) {
      const { sourceFile, upload } = await startSourceFileUpload(db(s), {
        projectId: p,
        // EZD-301 (Q-0517): a kind that takes this type.
        kind: kindOptions(type as (typeof SOURCE_CONTENT_TYPES)[number])[0],
        originalName: 'f',
        contentType: type,
        size: 16,
        uploadedBy: appUserId,
      });
      uploaded.push(sourceFile.storagePath);
      await uploadFile(upload, new Blob([new Uint8Array(16).fill(0x61)]), { contentType: type });
      const done = await completeSourceFileUpload(db(s), sourceFile.id);
      expect(done.uploadedAt, type).not.toBeNull();
      expect(done.contentType, type).toBe(type);
      expect(await objectExists(sourceFile.storagePath), type).toBe(true);
    }
  }, 120000);
});
