// EZD-132 T8-T17, T19 (vault/plans/EZD-132.md section 4): buckets, Storage policies, the source_file table and
// the server storage helpers on the local stack. Members sign in with EZD-006's fixtures and act through
// serverDb (gate header sent, as a server route does), so RLS and the Storage policies apply; anon is
// anonDb({ gate: true }). Objects are removed with the secret-key client, rows with cleanup(). Expected
// values: AC-EZD-132-1..5, section 1 Steps 1-2 and Decided rows, 03c source_file, Q-0232 (900 s links),
// Q-0269 (b) (cost files), docs/architecture.md Storage buckets and paths. X = randomBytes(7340155); only
// hashes and lengths are compared.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminDb,
  anonDb,
  claimsOf,
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
import { describeTenantIsolation } from '../../../test-harness/rls/isolation';
import { SOURCE_FILE_KINDS, type SourceFileKind } from '../../lib/storage/source-file-kinds';
import { uploadFile, UploadError } from '../../lib/storage/upload';
import {
  completeSourceFileUpload,
  createSignedUpload,
  readObject,
  removeObject,
  signedDownloadUrl,
  SIGNED_DOWNLOAD_SECONDS,
  sourceFilePath,
  startSourceFileUpload,
  statObject,
  StorageError,
  type DbClient,
  type SourceFileView,
  type StartSourceFileInput,
} from './index';

const X_BYTES = 7340155;
const CHUNK = 6291456;
const TAIL = 1048699;
const PDF = 'application/pdf';
const RLS_REFUSED = 'new row violates row-level security policy';
const NOT_FOUND = 'Object not found';
const FIVE_BUCKETS = ['sources', 'renders', 'exports', 'media', 'jobs'];
const FIVE_POLICIES = [
  'storage_sources_select',
  'storage_sources_insert',
  'storage_media_select',
  'storage_media_insert',
  'storage_media_delete',
];

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
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

describe('EZD-132 file storage', () => {
  const X = new Uint8Array(randomBytes(X_BYTES));
  const objects: Array<{ bucket: string; path: string }> = [];

  let tA = '';
  let tB = '';
  let pA = '';
  let pB = '';
  let a: Member;
  let l: Member;
  let f: Member;
  let b: Member;
  let sA: Session;
  let sL: Session;
  let sF: Session;
  let sB: Session;
  // T10's finished pdf; T11, T12, T14, T15 and T19 run after it.
  let t10: SourceFileView;

  const sourcesTarget = (path: string) => ({ bucket: 'sources' as const, path });

  const startInput = (
    who: Member,
    overrides: Partial<StartSourceFileInput> = {},
  ): StartSourceFileInput => ({
    projectId: pA,
    kind: 'pdf',
    originalName: 'plan.pdf',
    contentType: PDF,
    size: X_BYTES,
    uploadedBy: who.appUserId,
    ...overrides,
  });

  // start -> uploadFile (real fetch) -> complete, as one member.
  async function uploadSource(
    s: Session,
    who: Member,
    kind: SourceFileKind,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<SourceFileView> {
    const { sourceFile, upload } = await startSourceFileUpload(
      db(s),
      startInput(who, { kind, size: bytes.length }),
    );
    objects.push({ bucket: 'sources', path: sourceFile.storagePath });
    await uploadFile(upload, new Blob([bytes]), { contentType: PDF });
    return completeSourceFileUpload(db(s), sourceFile.id);
  }

  // Section 4 preamble: fixture members hold no user_permission row, so a test sets one (T16, T19).
  async function setSwitch(member: Member, key: string, granted: boolean): Promise<void> {
    await harnessSql()`
      insert into public.user_permission (tenant_id, membership_id, permission_key, granted)
      values (${tA}::uuid, ${member.membershipId}::uuid, ${key}, ${granted})
      on conflict (membership_id, permission_key) do update set granted = excluded.granted`;
  }

  beforeAll(async () => {
    tA = await createTenant();
    tB = await createTenant();
    [pA] = await createProjects(tA, 1);
    [pB] = await createProjects(tB, 1);
    a = await createMember({ tenantId: tA, scope: 'all' });
    l = await createMember({ tenantId: tA, scope: 'listed', listed: [] });
    f = await createMember({ tenantId: tA, scope: 'all' });
    b = await createMember({ tenantId: tB, scope: 'all' });
    sA = await signIn(a.email);
    sL = await signIn(l.email);
    sF = await signIn(f.email);
    sB = await signIn(b.email);
  });

  afterAll(async () => {
    try {
      const byBucket = new Map<string, string[]>();
      for (const o of objects) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) ?? []), o.path]);
      for (const [bucket, paths] of byBucket) await adminDb().storage.from(bucket).remove(paths);
      await cleanup();
    } finally {
      await closeHarness();
    }
  });

  it('EZD-132 T8 five private buckets; policies only on sources and media, none for update or anon', async () => {
    const buckets = await harnessSql()<{ id: string; public: boolean }[]>`
      select id, public from storage.buckets where id = any(${FIVE_BUCKETS}::text[])`;
    expect(buckets.map((r) => r.id).sort()).toEqual([...FIVE_BUCKETS].sort());
    for (const r of buckets) expect(r.public, r.id).toBe(false);

    const policies = await harnessSql()<
      {
        policyname: string;
        cmd: string;
        roles: string[];
        qual: string | null;
        with_check: string | null;
      }[]
    >`
      select policyname, cmd, roles::text[] as roles, qual, with_check
      from pg_policies where schemaname = 'storage' and tablename = 'objects'`;
    expect(policies.map((p) => p.policyname).sort()).toEqual([...FIVE_POLICIES].sort());
    for (const p of policies) {
      expect(['UPDATE', 'ALL'], p.policyname).not.toContain(p.cmd);
      const text = `${p.qual ?? ''} ${p.with_check ?? ''}`;
      for (const closed of ['renders', 'exports', 'jobs'])
        expect(text, p.policyname).not.toContain(closed);
      expect(p.roles, p.policyname).not.toContain('anon');
      expect(p.roles, p.policyname).not.toContain('public');
    }
  });

  describe('EZD-132 T9 source_file table', () => {
    describeTenantIsolation('source_file', {
      makeRow: (t, ctx) => {
        const id = randomUUID();
        const project = ctx.projectIds[0];
        return {
          id,
          tenant_id: t,
          project_id: project,
          kind: 'pdf',
          storage_path: sourceFilePath(t, project, id),
          original_name: 'a.pdf',
          content_type: PDF,
          size_bytes: 1,
          uploaded_by: ctx.member.appUserId,
        };
      },
    });

    it('EZD-132 T9 the kind check holds the source file kinds', async () => {
      const rows = await harnessSql()<{ def: string }[]>`
        select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.source_file'::regclass and contype = 'c'`;
      const kindCheck = rows.map((r) => r.def).find((d) => /\bkind\b/.test(d));
      expect(kindCheck).toBeDefined();
      const values = [...(kindCheck ?? '').matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
      expect(values).toEqual([...SOURCE_FILE_KINDS]);
    });
  });

  it('EZD-132 T10 done when: an uploaded file is byte-identical on download', async () => {
    const { sourceFile, upload } = await startSourceFileUpload(
      db(sA),
      startInput(a, { originalName: 'plan.pdf', size: X_BYTES }),
    );
    objects.push({ bucket: 'sources', path: sourceFile.storagePath });
    expect(upload.url).toBe(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable/sign`,
    );
    await uploadFile(upload, new Blob([X]), { contentType: PDF });
    t10 = await completeSourceFileUpload(db(sA), sourceFile.id);

    expect(t10.storagePath).toBe(`${tA}/${pA}/${sourceFile.id}`);
    expect(t10.uploadedBy).toBe(a.appUserId);
    expect(t10.sizeBytes).toBe(X_BYTES);
    expect(t10.uploadedAt).not.toBeNull();

    const url = await signedDownloadUrl(db(sA), sourcesTarget(t10.storagePath));
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(sha(new Uint8Array(await res.arrayBuffer()))).toBe(sha(X));
  });

  it('EZD-132 T11 done when: another tenant, an unlisted member and anon cannot read the file', async () => {
    const path = t10.storagePath;
    const target = sourcesTarget(path);
    for (const [label, s] of [
      ['tenant B', sB],
      ['listed without pA', sL],
    ] as const) {
      const bucket = s.serverDb.storage.from('sources');
      const listed = await bucket.list(`${tA}/${pA}`);
      expect(listed.data, label).toEqual([]);
      const dl = await bucket.download(path);
      expect(dl.error?.message, label).toBe(NOT_FOUND);
      const su = await bucket.createSignedUrl(path, SIGNED_DOWNLOAD_SECONDS);
      expect(su.error?.message, label).toBe(NOT_FOUND);
      await expectStorageCode(signedDownloadUrl(db(s), target), 'object_not_found', label);
      expect(await readObject(db(s), target), label).toBeNull();
      expect(await statObject(db(s), target), label).toBeNull();
      const lb = await s.serverDb.storage.listBuckets();
      expect(lb.data, label).toEqual([]);
      const rows = await s.serverDb.from('source_file').select('id').eq('id', t10.id);
      expect(rows.data, label).toEqual([]);
    }

    const anon = anonDb({ gate: true }).storage;
    expect((await anon.from('sources').list(`${tA}/${pA}`)).data).toEqual([]);
    expect((await anon.from('sources').download(path)).error?.message).toBe(NOT_FOUND);
    expect((await anon.listBuckets()).data).toEqual([]);
  });

  it('EZD-132 T12 done when: a download link stops working after its lifetime', async () => {
    const target = sourcesTarget(t10.storagePath);
    const defaultUrl = await signedDownloadUrl(db(sA), target);
    const token = new URL(defaultUrl).searchParams.get('token') ?? '';
    const claims = claimsOf(token);
    expect(Number(claims.exp) - Number(claims.iat)).toBe(900);

    const shortUrl = await signedDownloadUrl(db(sA), target, { expiresIn: 2 });
    const now = await fetch(shortUrl);
    expect(now.status).toBe(200);
    await now.arrayBuffer();
    await new Promise((r) => setTimeout(r, 3500));
    const later = await fetch(shortUrl);
    expect(later.status).toBe(400);
    expect(await later.text()).toContain('InvalidJWT');
  }, 15_000);

  it('EZD-132 T13 an interrupted real upload resumes from the stored offset', async () => {
    const { sourceFile, upload } = await startSourceFileUpload(db(sA), startInput(a));
    objects.push({ bucket: 'sources', path: sourceFile.storagePath });

    let patches = 0;
    const failing = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (
        init?.method ?? (input instanceof Request ? input.method : 'GET')
      ).toUpperCase();
      if (method === 'PATCH' && ++patches === 2) throw new TypeError('fetch failed');
      return fetch(input, init);
    }) as typeof fetch;
    const err = await caught(
      uploadFile(upload, new Blob([X]), {
        contentType: PDF,
        retryDelaysMs: [],
        fetchImpl: failing,
      }),
    );
    expect(err).toBeInstanceOf(UploadError);
    const e = err as UploadError;
    expect(e.code).toBe('upload_interrupted');
    expect(e.offset).toBe(CHUNK);
    expect(e.resumeUrl).not.toBeNull();

    const calls: Array<{ method: string; bytes: number; offset: string | null }> = [];
    const recording = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      const bytes = (await req.clone().arrayBuffer()).byteLength;
      const res = await fetch(req);
      calls.push({
        method: req.method.toUpperCase(),
        bytes,
        offset: res.headers.get('upload-offset'),
      });
      return res;
    }) as typeof fetch;
    await uploadFile(upload, new Blob([X]), {
      contentType: PDF,
      resumeUrl: e.resumeUrl ?? undefined,
      fetchImpl: recording,
    });
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'PATCH']);
    expect(calls[0].offset).toBe(String(CHUNK));
    expect(calls[1].bytes).toBe(TAIL);

    const back = await readObject(db(sA), sourcesTarget(sourceFile.storagePath));
    expect(back).not.toBeNull();
    expect(sha(back ?? new Uint8Array())).toBe(sha(X));
  });

  it('EZD-132 T14 originals cannot be replaced, moved, removed or re-pointed', async () => {
    const path = t10.storagePath;
    const y = new Uint8Array(randomBytes(100));
    const bucket = sA.serverDb.storage.from('sources');

    expect((await bucket.createSignedUploadUrl(path)).error?.message).toBe(RLS_REFUSED);
    expect((await bucket.upload(path, y, { upsert: true })).error?.message).toBe(RLS_REFUSED);
    expect((await bucket.update(path, y)).error?.message).toBe(RLS_REFUSED);
    expect((await bucket.move(path, `${tA}/${pA}/${randomUUID()}`)).error).not.toBeNull();
    expect((await bucket.remove([path])).data).toEqual([]);
    const back = await readObject(db(sA), sourcesTarget(path));
    expect(sha(back ?? new Uint8Array())).toBe(sha(X));

    const table = () => sA.serverDb.from('source_file');
    const repoint = await table()
      .update({ storage_path: `${tA}/${pA}/${randomUUID()}` })
      .eq('id', t10.id);
    expect(repoint.error?.code).toBe('P0001');
    expect(repoint.error?.message).toBe('source_file_original_refused');
    const again = await table().update({ uploaded_at: new Date().toISOString() }).eq('id', t10.id);
    expect(again.error?.code).toBe('P0001');
    expect(again.error?.message).toBe('source_file_original_refused');
    const calib = await table()
      .update({ scale_calibration: { a: 1 } })
      .eq('id', t10.id);
    expect(calib.error).toBeNull();
    const del = await table().delete().eq('id', t10.id);
    expect(del.error?.code).toBe('42501');

    const noRow = await bucket.createSignedUploadUrl(`${tA}/${pA}/${randomUUID()}`);
    expect(noRow.error?.message).toBe(RLS_REFUSED);
  });

  it('EZD-132 T15 start and complete checks', async () => {
    await expectStorageCode(
      startSourceFileUpload(db(sA), startInput(a, { size: 0 })),
      'invalid_input',
      'size 0',
    );
    await expectStorageCode(
      startSourceFileUpload(db(sA), startInput(a, { kind: 'zip' as unknown as SourceFileKind })),
      'invalid_input',
      'kind zip',
    );
    await expectStorageCode(
      startSourceFileUpload(db(sA), startInput(a, { contentType: 'Bad Type' })),
      'invalid_input',
      'Bad Type',
    );
    await expectStorageCode(
      startSourceFileUpload(db(sA), startInput(a, { originalName: 'a'.repeat(256) })),
      'invalid_input',
      '256 code points',
    );
    await expectStorageCode(
      startSourceFileUpload(db(sA), startInput(a, { projectId: 'x' })),
      'invalid_input',
      'projectId x',
    );
    await expectStorageCode(
      startSourceFileUpload(db(sA), startInput(a, { projectId: pB })),
      'project_not_found',
      "tenant B's project",
    );
    await expectStorageCode(
      startSourceFileUpload(db(sL), startInput(l, { projectId: pA })),
      'project_not_found',
      'listed member without pA',
    );

    const early = await startSourceFileUpload(db(sA), startInput(a));
    objects.push({ bucket: 'sources', path: early.sourceFile.storagePath });
    await expectStorageCode(
      completeSourceFileUpload(db(sA), early.sourceFile.id),
      'upload_missing',
    );

    const short = await startSourceFileUpload(db(sA), startInput(a, { size: 11 }));
    objects.push({ bucket: 'sources', path: short.sourceFile.storagePath });
    await uploadFile(short.upload, new Blob([new Uint8Array(randomBytes(10))]), {
      contentType: PDF,
    });
    await expectStorageCode(
      completeSourceFileUpload(db(sA), short.sourceFile.id),
      'upload_size_mismatch',
    );

    const first = await completeSourceFileUpload(db(sA), t10.id);
    const second = await completeSourceFileUpload(db(sA), t10.id);
    expect(first.uploadedAt).toBe(t10.uploadedAt);
    expect(second.uploadedAt).toBe(t10.uploadedAt);
  });

  it('EZD-132 T16 media logo: written only with Company settings, read in the company', async () => {
    const target = { bucket: 'media' as const, path: `${tA}/tenant/logo/${randomUUID()}.png` };
    objects.push(target);
    const bytes = new Uint8Array(randomBytes(50));

    // (1) L without the switch cannot sign the logo path.
    await expectStorageCode(createSignedUpload(db(sL), target), 'upload_refused', '(1)');

    // (2) With settings_company, L uploads the logo.
    await setSwitch(l, 'settings_company', true);
    const upload = await createSignedUpload(db(sL), target);
    await uploadFile(upload, new Blob([bytes]), { contentType: 'image/png' });

    // (3) Readable by L and by A (no switch); not by tenant B.
    const readL = await readObject(db(sL), target);
    expect(sha(readL ?? new Uint8Array())).toBe(sha(bytes));
    expect(await statObject(db(sL), target)).toEqual({ size: 50 });
    const readA = await readObject(db(sA), target);
    expect(sha(readA ?? new Uint8Array())).toBe(sha(bytes));
    expect(await readObject(db(sB), target)).toBeNull();

    // (4) A is not the uploader: nothing removed.
    await removeObject(db(sA), target);
    expect(await statObject(db(sL), target), '(4)').toEqual({ size: 50 });

    // (5) L without the switch: nothing removed.
    await setSwitch(l, 'settings_company', false);
    await removeObject(db(sL), target);
    expect(await statObject(db(sL), target), '(5)').toEqual({ size: 50 });

    // (6) L with the switch removes it.
    await setSwitch(l, 'settings_company', true);
    await removeObject(db(sL), target);
    expect(await readObject(db(sL), target), '(6)').toBeNull();

    // (7) Only the logo folder takes uploads, and never sources' tenant folder.
    await expectStorageCode(
      createSignedUpload(db(sL), { bucket: 'media', path: `${tA}/tenant/${randomUUID()}.png` }),
      'upload_refused',
      '(7) tenant folder',
    );
    await expectStorageCode(
      createSignedUpload(db(sL), {
        bucket: 'media',
        path: `${tA}/tenant/logo/sub/${randomUUID()}.png`,
      }),
      'upload_refused',
      '(7) logo subfolder',
    );
    await setSwitch(a, 'settings_company', true);
    await expectStorageCode(
      createSignedUpload(db(sA), { bucket: 'media', path: `${tA}/${pA}/${randomUUID()}.png` }),
      'upload_refused',
      '(7) project folder',
    );
    await expectStorageCode(
      createSignedUpload(db(sL), { bucket: 'sources', path: `${tA}/tenant/${randomUUID()}` }),
      'upload_refused',
      '(7) sources tenant folder',
    );
  });

  it('EZD-132 T17 renders, exports and jobs take no member upload', async () => {
    for (const bucket of ['renders', 'exports', 'jobs'] as const) {
      await expectStorageCode(
        createSignedUpload(db(sA), { bucket, path: `${tA}/${pA}/${randomUUID()}` }),
        'upload_refused',
        bucket,
      );
    }
  });

  it('EZD-132 T19 cost files only for members with See company costs', async () => {
    await setSwitch(a, 'see_company_costs', true);
    await setSwitch(f, 'see_company_costs', false);
    const supplierBytes = new Uint8Array(randomBytes(100));
    const orderBytes = new Uint8Array(randomBytes(100));
    const supplier = await uploadSource(sA, a, 'supplier_pdf', supplierBytes);
    const order = await uploadSource(sA, a, 'order_report', orderBytes);
    const cost = [
      { file: supplier, bytes: supplierBytes },
      { file: order, bytes: orderBytes },
    ];

    for (const { file, bytes } of cost) {
      const read = await readObject(db(sA), sourcesTarget(file.storagePath));
      expect(sha(read ?? new Uint8Array()), file.kind).toBe(sha(bytes));
    }

    for (const { file } of cost) {
      const target = sourcesTarget(file.storagePath);
      expect(await readObject(db(sF), target), file.kind).toBeNull();
      expect(await statObject(db(sF), target), file.kind).toBeNull();
      await expectStorageCode(signedDownloadUrl(db(sF), target), 'object_not_found', file.kind);
    }
    const listed = await sF.serverDb.storage.from('sources').list(`${tA}/${pA}`);
    const names = (listed.data ?? []).map((o) => o.name);
    expect(names).toContain(t10.id);
    expect(names).not.toContain(supplier.id);
    expect(names).not.toContain(order.id);
    for (const kind of ['supplier_pdf', 'order_report'] as const) {
      await expectStorageCode(
        startSourceFileUpload(db(sF), startInput(f, { kind, size: 100 })),
        'upload_refused',
        kind,
      );
    }

    // Controls for F: an ordinary file reads and starts.
    const pdf = await readObject(db(sF), sourcesTarget(t10.storagePath));
    expect(sha(pdf ?? new Uint8Array())).toBe(sha(X));
    const started = await startSourceFileUpload(db(sF), startInput(f, { kind: 'pdf' }));
    objects.push({ bucket: 'sources', path: started.sourceFile.storagePath });
    expect(started.sourceFile.kind).toBe('pdf');

    // The switch applies without a new sign-in.
    await setSwitch(f, 'see_company_costs', true);
    const after = await readObject(db(sF), sourcesTarget(supplier.storagePath));
    expect(sha(after ?? new Uint8Array())).toBe(sha(supplierBytes));

    // (S2) A pending row is signed only by its uploader, even for an all-scope member with the switch.
    const pending = await startSourceFileUpload(db(sA), startInput(a, { kind: 'pdf', size: 100 }));
    objects.push({ bucket: 'sources', path: pending.sourceFile.storagePath });
    const pendingTarget = sourcesTarget(pending.sourceFile.storagePath);
    await expectStorageCode(createSignedUpload(db(sF), pendingTarget), 'upload_refused', 'F signs');
    const own = await createSignedUpload(db(sA), pendingTarget);
    expect(own.token.length).toBeGreaterThan(0);
  });
});
