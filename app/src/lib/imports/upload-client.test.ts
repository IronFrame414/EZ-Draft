// EZD-301 (S01 Continue to review; 08 Imports "Originals are always stored unchanged"; Events emitted
// import.started). The app routes are stubbed and each signed upload goes to EZD-132's in-memory TUS server, so no
// network is reached (CLAUDE.md rule 5). Expected: every file is started with its tag, name, type and size, its
// bytes reach Storage unchanged, it is completed, then one import call names every source file in list order; a
// retry after a failure sends only the files not yet sent.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFakeTus, type FakeTus } from '../../../test-utils/storage/fake-tus';
import { addFiles, emptyUploadList, type UploadItem } from './upload-files';
import { ImportUploadError, uploadAndStartImport } from './upload-client';

const P = '11111111-1111-4111-8111-111111111111';

type Call = { method: string; path: string; body: unknown };

function harness(
  opts: { startStatus?: (n: number) => number; importStatus?: number; base?: number } = {},
) {
  const calls: Call[] = [];
  const tus = new Map<string, FakeTus>();
  let started = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/')) {
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
      calls.push({ method, path: url, body });
      if (url === `/api/projects/${P}/source-files`) {
        started += 1;
        const status = opts.startStatus?.(started) ?? 201;
        if (status !== 201) return Response.json({ error: { code: 'x' } }, { status });
        const id = `0000000${(opts.base ?? 0) + started}-0000-4000-8000-000000000000`;
        const sign = `https://storage.test/sign/${started}`;
        tus.set(sign, createFakeTus());
        return Response.json(
          {
            sourceFile: { id },
            upload: { bucket: 'sources', path: `t/${P}/${id}`, token: 'tok', url: sign },
          },
          { status: 201 },
        );
      }
      if (url.endsWith('/complete')) return Response.json({ sourceFile: {} }, { status: 200 });
      if (url === `/api/projects/${P}/imports`) {
        return Response.json({}, { status: opts.importStatus ?? 202 });
      }
      return new Response(null, { status: 404 });
    }
    const key = [...tus.keys()].find((k) => url.startsWith(k));
    if (key === undefined) throw new Error(`unexpected ${url}`);
    return (tus.get(key) as FakeTus).fetchImpl(input, init);
  };
  return { calls, tus, fetchImpl };
}

const items = (bytes: Uint8Array<ArrayBuffer>[]): UploadItem<Blob>[] =>
  addFiles(
    emptyUploadList<Blob>('polycam'),
    [
      { name: 'scan.dxf', size: bytes[0].length, file: new Blob([bytes[0]]) },
      { name: 'scan.glb', size: bytes[1].length, file: new Blob([bytes[1]]) },
    ],
    (() => {
      let n = 0;
      return () => `item-${++n}`;
    })(),
  ).items;

describe('EZD-301 upload and start the import', () => {
  it('EZD-301 U8 each original reaches Storage unchanged, then import.started names every file', async () => {
    const bytes = [new Uint8Array(randomBytes(1500)), new Uint8Array(randomBytes(2700))];
    const h = harness();
    const done = new Map<string, string>();
    const progress: string[] = [];
    const ids = await uploadAndStartImport(P, items(bytes), {
      done,
      fetchImpl: h.fetchImpl,
      retryDelaysMs: [],
      onFile: (i, total) => progress.push(`${i + 1}/${total}`),
    });
    expect(progress).toEqual(['1/2', '2/2']);
    expect(ids).toEqual([
      '00000001-0000-4000-8000-000000000000',
      '00000002-0000-4000-8000-000000000000',
    ]);
    expect(h.calls.map((c) => c.path)).toEqual([
      `/api/projects/${P}/source-files`,
      '/api/source-files/00000001-0000-4000-8000-000000000000/complete',
      `/api/projects/${P}/source-files`,
      '/api/source-files/00000002-0000-4000-8000-000000000000/complete',
      `/api/projects/${P}/imports`,
    ]);
    expect(h.calls[0].body).toEqual({
      kind: 'polycam_dxf',
      originalName: 'scan.dxf',
      contentType: 'image/vnd.dxf',
      size: 1500,
    });
    expect(h.calls[2].body).toEqual({
      kind: 'polycam_glb',
      originalName: 'scan.glb',
      contentType: 'model/gltf-binary',
      size: 2700,
    });
    expect(h.calls[4].body).toEqual({ sourceFileIds: ids });
    const stored = (n: number) =>
      Buffer.from(h.tus.get(`https://storage.test/sign/${n}`)!.stored());
    expect(stored(1).equals(Buffer.from(bytes[0]))).toBe(true);
    expect(stored(2).equals(Buffer.from(bytes[1]))).toBe(true);
  });

  it('EZD-301 U9 a failed file is named; the retry sends only the rest', async () => {
    const bytes = [new Uint8Array(randomBytes(100)), new Uint8Array(randomBytes(200))];
    const list = items(bytes);
    const done = new Map<string, string>();
    const first = harness({ startStatus: (n) => (n === 2 ? 500 : 201) });
    const err = await uploadAndStartImport(P, list, {
      done,
      fetchImpl: first.fetchImpl,
      retryDelaysMs: [],
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportUploadError);
    expect(err).toMatchObject({ code: 'upload_failed', fileName: 'scan.glb' });
    expect([...done.values()]).toEqual(['00000001-0000-4000-8000-000000000000']);

    const second = harness({ base: 5 });
    await uploadAndStartImport(P, list, { done, fetchImpl: second.fetchImpl, retryDelaysMs: [] });
    const starts = second.calls.filter((c) => c.path.endsWith('/source-files'));
    expect(starts).toHaveLength(1);
    expect(starts[0].body).toMatchObject({ originalName: 'scan.glb' });
    expect(second.calls.at(-1)?.body).toEqual({
      sourceFileIds: [
        '00000001-0000-4000-8000-000000000000',
        '00000006-0000-4000-8000-000000000000',
      ],
    });
  });

  it('EZD-301 U10 a 403 start is not_authorized; a refused import is import_failed', async () => {
    const bytes = [new Uint8Array(randomBytes(10)), new Uint8Array(randomBytes(10))];
    const denied = harness({ startStatus: () => 403 });
    await expect(
      uploadAndStartImport(P, items(bytes), { done: new Map(), fetchImpl: denied.fetchImpl }),
    ).rejects.toMatchObject({ code: 'not_authorized', fileName: 'scan.dxf' });
    const refused = harness({ importStatus: 400 });
    await expect(
      uploadAndStartImport(P, items(bytes), {
        done: new Map(),
        fetchImpl: refused.fetchImpl,
        retryDelaysMs: [],
      }),
    ).rejects.toMatchObject({ code: 'import_failed', fileName: null });
  });
});
