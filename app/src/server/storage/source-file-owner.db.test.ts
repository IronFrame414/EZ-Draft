// EZD-320 T1-T8 (vault/plans/EZD-320.md section 4): only the person who started a source-file upload can
// finish it, nobody can clear or change an uploader, removing a user still works, and the stamp needs the
// stored object. Members act through serverDb so RLS and the triggers apply.
import { randomBytes } from 'node:crypto';
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
  type Member,
  type Session,
} from '../../../test-harness/rls/fixtures';
import { uploadFile } from '../../lib/storage/upload';
import {
  completeSourceFileUpload,
  startSourceFileUpload,
  StorageError,
  type DbClient,
  type SourceFileView,
} from './index';

const db = (s: Session) => s.serverDb as unknown as DbClient;

describe('EZD-320 pending source-file uploads belong to their starter', () => {
  const objects: string[] = [];
  let pA = '';
  let a: Member;
  let f: Member;
  let c: Member;
  let sA: Session;
  let sF: Session;
  let sC: Session;

  beforeAll(async () => {
    const tA = await createTenant();
    [pA] = await createProjects(tA, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    f = await createMember({ tenantId: tA, scope: 'all' });
    c = await createMember({ tenantId: tA, scope: 'all' });
    sA = await signIn(a.email);
    sF = await signIn(f.email);
    sC = await signIn(c.email);
  });

  afterAll(async () => {
    try {
      if (objects.length > 0) await adminDb().storage.from('sources').remove(objects);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  async function started(s: Session, who: Member) {
    return startSourceFileUpload(db(s), {
      projectId: pA,
      kind: 'pdf',
      originalName: 'plan.pdf',
      contentType: 'application/pdf',
      size: 1024,
      uploadedBy: who.appUserId,
    });
  }

  async function pending(s: Session, who: Member, bytes = 1024): Promise<SourceFileView> {
    // started() always records size 1024, so bytes other than 1024 leave the stored object a different size.
    const { sourceFile, upload } = await started(s, who);
    await uploadFile(upload, new Blob([new Uint8Array(randomBytes(bytes))]), {
      contentType: 'application/pdf',
    });
    objects.push(sourceFile.storagePath);
    return sourceFile;
  }

  async function finished(s: Session, who: Member): Promise<SourceFileView> {
    const p = await pending(s, who);
    return completeSourceFileUpload(db(s), p.id);
  }

  async function row(id: string) {
    const r = await harnessSql()<{ uploaded_by: string | null; uploaded_at: Date | null }[]>`
      select uploaded_by, uploaded_at from public.source_file where id = ${id}::uuid`;
    return r;
  }

  async function caught(p: Promise<unknown>): Promise<unknown> {
    try {
      await p;
    } catch (e) {
      return e;
    }
    throw new Error('expected a rejection');
  }

  it('EZD-320 T1 a co-member cannot mark a pending upload uploaded', async () => {
    const p = await pending(sA, a);
    const res = await sF.serverDb
      .from('source_file')
      .update({ uploaded_at: new Date().toISOString() })
      .eq('id', p.id)
      .select('id');
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
    const r = await row(p.id);
    expect(r).toHaveLength(1);
    expect(r[0].uploaded_at).toBeNull();
    expect(r[0].uploaded_by).toBe(a.appUserId);
  });

  it("EZD-320 T2 a co-member's complete is refused", async () => {
    const p = await pending(sA, a);
    const err = await caught(completeSourceFileUpload(db(sF), p.id));
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).code).toBe('upload_refused');
    expect((await row(p.id))[0].uploaded_at).toBeNull();
  });

  it("EZD-320 T3 a co-member cannot change or clear a pending row's uploader", async () => {
    const p = await pending(sA, a);
    for (const patch of [
      { uploaded_by: f.appUserId },
      { uploaded_by: null },
      { supplier_name: 'X' },
    ]) {
      const res = await sF.serverDb.from('source_file').update(patch).eq('id', p.id).select('id');
      expect(res.error, JSON.stringify(patch)).toBeNull();
      expect(res.data, JSON.stringify(patch)).toEqual([]);
    }
    expect((await row(p.id))[0].uploaded_by).toBe(a.appUserId);
  });

  it('EZD-320 T4 nobody clears or changes an uploader in an update', async () => {
    const d = await finished(sA, a);
    const p = await pending(sA, a);
    const attempts = [
      sF.serverDb.from('source_file').update({ uploaded_by: null }).eq('id', d.id).select('id'),
      sF.serverDb
        .from('source_file')
        .update({ uploaded_by: f.appUserId })
        .eq('id', d.id)
        .select('id'),
      sA.serverDb.from('source_file').update({ uploaded_by: null }).eq('id', p.id).select('id'),
    ];
    for (const attempt of attempts) {
      const res = await attempt;
      expect(res.error?.code).toBe('P0001');
      expect(res.error?.message).toBe('source_file_original_refused');
    }
    expect((await row(d.id))[0].uploaded_by).toBe(a.appUserId);
    expect((await row(p.id))[0].uploaded_by).toBe(a.appUserId);
  });

  it('EZD-320 T5 the uploader completes their own upload', async () => {
    const p = await pending(sA, a);
    const err = await caught(completeSourceFileUpload(db(sF), p.id));
    expect(err).toBeInstanceOf(StorageError);
    const done = await completeSourceFileUpload(db(sA), p.id);
    expect(done.uploadedAt).not.toBeNull();
    expect(done.uploadedBy).toBe(a.appUserId);
    expect((await row(p.id))[0].uploaded_at).not.toBeNull();
  });

  it('EZD-320 T6 a co-member still calibrates a finished row', async () => {
    const d = await finished(sA, a);
    const res = await sF.serverDb
      .from('source_file')
      .update({ scale_calibration: { a: 1 } })
      .eq('id', d.id)
      .select('id');
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(1);
  });

  it('EZD-320 T7 removing a user who uploaded files still works', async () => {
    const d = await finished(sC, c);
    const p = await pending(sC, c);
    const before = (await row(d.id))[0].uploaded_at;
    await harnessSql()`delete from public.membership where user_id = ${c.appUserId}::uuid`;
    await harnessSql()`delete from public.app_user where id = ${c.appUserId}::uuid`;
    const rd = await row(d.id);
    const rp = await row(p.id);
    expect(rd).toHaveLength(1);
    expect(rp).toHaveLength(1);
    expect(rd[0].uploaded_by).toBeNull();
    expect(rd[0].uploaded_at).toEqual(before);
    expect(rp[0].uploaded_by).toBeNull();
    expect(rp[0].uploaded_at).toBeNull();
  });

  it('EZD-320 T8 the uploader cannot stamp without the object', async () => {
    const q = (await started(sA, a)).sourceFile;
    const w = await pending(sA, a, 2048);
    // w's row records 1024 bytes but its stored object is 2048, so no object matches the row.
    for (const id of [q.id, w.id]) {
      const res = await sA.serverDb
        .from('source_file')
        .update({ uploaded_at: new Date().toISOString() })
        .eq('id', id)
        .select('id');
      expect(res.error?.code).toBe('P0001');
      expect(res.error?.message).toBe('source_file_upload_missing');
    }
    expect((await row(q.id))[0].uploaded_at).toBeNull();
    expect((await row(w.id))[0].uploaded_at).toBeNull();
  });
});
