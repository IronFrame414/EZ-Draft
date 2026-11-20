// EZD-304 (S01 PDF: scale calibration "After upload, PDF only"; Q-0203 "a PDF with no known scale never blocks").
// The app routes are stubbed and each signed upload goes to EZD-132's in-memory TUS server, so no network is reached
// (CLAUDE.md rule 5). Expected: after the files are sent, setScale is asked once per PDF (kind pdf) with its name,
// source file id and local bytes, and never for another kind; the import starts whatever it answers, also when it
// fails.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFakeTus, type FakeTus } from '../../../test-utils/storage/fake-tus';
import { addFiles, emptyUploadList } from './upload-files';
import { uploadAndStartImport } from './upload-client';

const P = '11111111-1111-4111-8111-111111111111';

function harness() {
  const paths: string[] = [];
  const tus = new Map<string, FakeTus>();
  let started = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('/api/')) {
      paths.push(url);
      if (url === `/api/projects/${P}/source-files`) {
        started += 1;
        const id = `0000000${started}-0000-4000-8000-000000000000`;
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
      if (url === `/api/projects/${P}/imports`) return Response.json({}, { status: 202 });
      return new Response(null, { status: 404 });
    }
    const key = [...tus.keys()].find((k) => url.startsWith(k));
    if (key === undefined) throw new Error(`unexpected ${url}`);
    return (tus.get(key) as FakeTus).fetchImpl(input, init);
  };
  return { paths, fetchImpl };
}

const files = () => {
  const pdf = new Uint8Array(randomBytes(300));
  const glb = new Uint8Array(randomBytes(200));
  const list = addFiles(
    emptyUploadList<Blob>('pdf'),
    [
      { name: 'plan.pdf', size: pdf.length, file: new Blob([pdf], { type: 'application/pdf' }) },
      { name: 'scan.glb', size: glb.length, file: new Blob([glb]) },
    ],
    (() => {
      let n = 0;
      return () => `item-${++n}`;
    })(),
  ).items;
  return { list, pdf };
};

describe('EZD-304 set-scale step in the upload run', () => {
  it('asks setScale once for the PDF, with its bytes, then starts the import', async () => {
    const h = harness();
    const { list, pdf } = files();
    expect(list.map((i) => i.kind)).toEqual(['pdf', 'polycam_glb']);
    const asked: { name: string; sourceFileId: string; bytes: Uint8Array }[] = [];
    const ids = await uploadAndStartImport(P, list, {
      done: new Map(),
      fetchImpl: h.fetchImpl,
      retryDelaysMs: [],
      setScale: async (file) => {
        asked.push({
          name: file.name,
          sourceFileId: file.sourceFileId,
          bytes: new Uint8Array(await file.source.arrayBuffer()),
        });
        return null;
      },
    });
    expect(asked).toEqual([{ name: 'plan.pdf', sourceFileId: ids[0], bytes: pdf }]);
    expect(h.paths.at(-1)).toBe(`/api/projects/${P}/imports`);
  });

  it('a failed set-scale step never stops the import (Q-0203)', async () => {
    const h = harness();
    const { list } = files();
    await uploadAndStartImport(P, list, {
      done: new Map(),
      fetchImpl: h.fetchImpl,
      retryDelaysMs: [],
      setScale: async () => {
        throw new Error('unreadable');
      },
    });
    expect(h.paths.filter((p) => p === `/api/projects/${P}/imports`)).toHaveLength(1);
  });
});
