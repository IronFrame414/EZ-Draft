// EZD-224b T-U10 to T-U12 (vault/plans/EZD-224b.md section 4; AC-EZD-224-1, -3). Expected values: the plan's Decided
// "Client order (`saveCheckpointThumbnail`)", "Client order (`makeCheckpoint`)", "Report", "Two calls at once" and
// the Seam (part a's routes). Every dependency is a stub; nothing touches the network, Storage or a worker thread.
import { describe, expect, test, vi } from 'vitest';
import type { ThumbnailCapture, ThumbnailCrop } from '../../lib/thumbnail/thumbnail';
import { encodeThumbnail, type ThumbnailWorker } from './encode-client';
import { makeCheckpoint, saveCheckpointThumbnail, type ThumbnailDeps } from './checkpoint';

const IMG = {
  data: new Uint8ClampedArray(16),
  width: 2,
  height: 2,
  colorSpace: 'srgb',
} as unknown as ImageData;

const CROP: ThumbnailCrop = {
  sx: 672,
  sy: 184,
  sw: 1760,
  sh: 1720,
  dx: (440 - (1760 * 256) / 1720) / 2,
  dy: 0,
  dw: (1760 * 256) / 1720,
  dh: 256,
};

const CAPTURED: ThumbnailCapture = { image: IMG, crop: CROP };
const UPLOAD = { bucket: 'media', path: 't/P/thumb/V.webp', token: 'TOK', url: 'http://s/upload' };
const START = '/api/projects/P/versions/V/thumbnail';
const COMPLETE = '/api/projects/P/versions/V/thumbnail/complete';

type Reply = { status: number; body: unknown } | 'throw';
const json = (status: number, body: unknown): Reply => ({ status, body });
const text = (status: number, body: string): Reply => ({ status, body: { __text: body } });

function respond(reply: Reply): Response {
  if (reply === 'throw') throw new TypeError('Failed to fetch');
  const b = reply.body as { __text?: string } | null;
  const raw =
    b !== null && typeof b === 'object' && '__text' in b ? b.__text! : JSON.stringify(reply.body);
  return new Response(raw, { status: reply.status });
}

type Setup = {
  start?: Reply;
  complete?: Reply;
  capture?: () => Promise<ThumbnailCapture | null>;
  encode?: () => Promise<{ bytes: Uint8Array<ArrayBuffer>; quality: 60 } | null>;
  upload?: () => Promise<void>;
};

function flow(s: Setup = {}) {
  const calls: string[] = [];
  const report = vi.fn();
  const uploadSpy = vi.fn(async (..._a: unknown[]) => {
    calls.push('upload');
    if (s.upload) await s.upload();
  });
  const fetchImpl = vi.fn(async (url: string) => {
    calls.push('POST ' + url);
    if (url === START) return respond(s.start ?? json(200, { upload: UPLOAD }));
    if (url === COMPLETE)
      return respond(s.complete ?? json(200, { thumbnail: { versionId: 'V' } }));
    throw new Error('unexpected url ' + url);
  });
  const encode = vi.fn(async (_image: ImageData) => {
    calls.push('encode');
    return s.encode ? s.encode() : { bytes: new Uint8Array(38000), quality: 60 as const };
  });
  const capture = vi.fn(async () => {
    calls.push('capture');
    return s.capture ? s.capture() : CAPTURED;
  });
  const deps = { fetchImpl, encode, upload: uploadSpy, report } as unknown as ThumbnailDeps;
  return { calls, report, uploadSpy, fetchImpl, encode, capture, deps };
}

const save = (f: ReturnType<typeof flow>) =>
  saveCheckpointThumbnail({ projectId: 'P', versionId: 'V', capture: f.capture }, f.deps);

function causeChain(e: unknown): Error[] {
  const out: Error[] = [];
  let cur: unknown = e;
  while (cur instanceof Error) {
    out.push(cur);
    cur = cur.cause;
  }
  return out;
}

function expectReported(f: ReturnType<typeof flow>, code: string) {
  expect(f.report).toHaveBeenCalledTimes(1);
  const err = f.report.mock.calls[0]![0] as Error;
  expect(err).toBeInstanceOf(Error);
  expect(err.message).toBe('editor.thumbnail');
  expect(err.cause).toBeInstanceOf(Error);
  expect((err.cause as Error).message).toBe(code);
}

describe('EZD-224b checkpoint client', () => {
  test('EZD-224b T-U10 saveCheckpointThumbnail runs capture, encode, start, upload, complete and never throws', async () => {
    // (a)
    const a = flow();
    expect(await save(a)).toEqual({
      status: 'saved',
      versionId: 'V',
      quality: 60,
      bytes: 38000,
      crop: CROP,
    });
    expect(a.calls).toEqual(['capture', 'encode', 'POST ' + START, 'upload', 'POST ' + COMPLETE]);
    const args = a.uploadSpy.mock.calls[0]!;
    expect(args[0]).toEqual(UPLOAD);
    const blob = args[1] as Blob;
    expect(blob.size).toBe(38000);
    expect(blob.type).toBe('image/webp');
    expect(args[2]).toEqual({ contentType: 'image/webp' });
    expect(a.report).not.toHaveBeenCalled();

    // (b) nothing drawn
    const b = flow({ capture: async () => null });
    expect(await save(b)).toEqual({ status: 'empty', versionId: 'V' });
    expect(b.calls).toEqual(['capture']);
    expect(b.report).not.toHaveBeenCalled();

    // (c)
    const c = flow({
      capture: async () => {
        throw new Error('cap');
      },
    });
    expect(await save(c)).toEqual({ status: 'failed', versionId: 'V', code: 'capture_failed' });
    expect(c.calls).toEqual(['capture']);
    expectReported(c, 'capture_failed');

    // (d)
    const d = flow({ encode: async () => null });
    expect(await save(d)).toEqual({ status: 'too_large', versionId: 'V' });
    expect(d.calls).toEqual(['capture', 'encode']);
    expectReported(d, 'too_large');

    // (e)
    const e = flow({
      encode: async () => {
        throw new Error('enc');
      },
    });
    expect(await save(e)).toEqual({ status: 'failed', versionId: 'V', code: 'encode_failed' });
    expect(e.fetchImpl).not.toHaveBeenCalled();
    expectReported(e, 'encode_failed');

    // (f)
    const f = flow({
      start: json(404, {
        error: { code: 'version_not_found', message_key: 'error.version_not_found' },
      }),
    });
    expect(await save(f)).toEqual({ status: 'failed', versionId: 'V', code: 'version_not_found' });
    expect(f.uploadSpy).not.toHaveBeenCalled();
    expectReported(f, 'version_not_found');

    // (g)
    const g = flow({ start: 'throw' });
    expect(await save(g)).toEqual({ status: 'failed', versionId: 'V', code: 'network_failed' });
    expectReported(g, 'network_failed');

    // (h)
    const h = flow({ start: json(200, { upload: { bucket: 'logos' } }) });
    expect(await save(h)).toEqual({ status: 'failed', versionId: 'V', code: 'bad_response' });
    expect(h.uploadSpy).not.toHaveBeenCalled();
    expectReported(h, 'bad_response');

    // (i) the signed token and url never reach a report
    const i = flow({
      upload: async () => {
        throw new Error('upload_rejected');
      },
    });
    expect(await save(i)).toEqual({ status: 'failed', versionId: 'V', code: 'upload_failed' });
    expect(i.calls).not.toContain('POST ' + COMPLETE);
    expectReported(i, 'upload_failed');
    for (const err of causeChain(i.report.mock.calls[0]![0])) {
      expect(err.message).not.toContain('TOK');
      expect(err.message).not.toContain('http://s/upload');
    }

    // (j)
    const j = flow({ complete: json(409, { error: { code: 'thumbnail_invalid' } }) });
    expect(await save(j)).toEqual({ status: 'failed', versionId: 'V', code: 'thumbnail_invalid' });
    expectReported(j, 'thumbnail_invalid');

    // (k) a 500 whose body is not JSON
    const k = flow({ complete: text(500, 'server exploded') });
    expect(await save(k)).toEqual({ status: 'failed', versionId: 'V', code: 'http_500' });
    expectReported(k, 'http_500');

    // (l) another version in the answer
    const l = flow({ complete: json(200, { thumbnail: { versionId: 'other' } }) });
    expect(await save(l)).toEqual({ status: 'failed', versionId: 'V', code: 'bad_response' });
    expectReported(l, 'bad_response');

    // (m) a 200 start that is not JSON is the server's fault, not the network's
    const m = flow({ start: text(200, 'oops') });
    expect(await save(m)).toEqual({ status: 'failed', versionId: 'V', code: 'bad_response' });
    expect(m.uploadSpy).not.toHaveBeenCalled();
    expectReported(m, 'bad_response');

    // (n)
    const n = flow({ complete: text(200, 'oops') });
    expect(await save(n)).toEqual({ status: 'failed', versionId: 'V', code: 'bad_response' });
    expectReported(n, 'bad_response');
  });

  test('EZD-224b T-U11 makeCheckpoint posts the checkpoint first and captures only after a 201', async () => {
    const run = (o: { checkpoints: Reply; start?: Reply; complete?: Reply }) => {
      const f = flow({ start: o.start, complete: o.complete });
      const fetchImpl = vi.fn(async (url: string, init?: unknown) => {
        if (url === '/api/projects/P/checkpoints') {
          f.calls.push('POST ' + url);
          expect(init).toEqual({ method: 'POST' });
          return respond(o.checkpoints);
        }
        return f.fetchImpl(url);
      });
      const deps = { ...f.deps, fetchImpl } as unknown as ThumbnailDeps;
      return { f, fetchImpl, result: makeCheckpoint({ projectId: 'P', capture: f.capture }, deps) };
    };

    // (a)
    const a = run({ checkpoints: json(201, { version: { id: 'V' } }) });
    const ra = await a.result;
    expect(ra.status).toBe('saved');
    expect((ra as { versionId: string }).versionId).toBe('V');
    expect(a.f.calls).toEqual([
      'POST /api/projects/P/checkpoints',
      'capture',
      'encode',
      'POST ' + START,
      'upload',
      'POST ' + COMPLETE,
    ]);

    // (b) to (g): the checkpoint itself failed, so nothing else runs and nothing is reported
    const failures: Array<[Reply, string]> = [
      [
        json(403, { error: { code: 'permission_denied', message_key: 'error.not_authorized' } }),
        'permission_denied',
      ],
      ['throw', 'network_failed'],
      [json(201, { version: {} }), 'bad_response'],
      [json(500, null), 'http_500'],
      [
        json(401, { error: { code: 'not_signed_in', message_key: 'error.not_signed_in' } }),
        'not_signed_in',
      ],
      [text(201, 'oops'), 'bad_response'],
    ];
    for (const [reply, code] of failures) {
      const r = run({ checkpoints: reply });
      const out = await r.result;
      expect(out).toEqual({ status: 'failed', code });
      expect('versionId' in out).toBe(false);
      expect(r.f.capture).not.toHaveBeenCalled();
      expect(r.f.encode).not.toHaveBeenCalled();
      expect(r.f.uploadSpy).not.toHaveBeenCalled();
      expect(r.f.report).not.toHaveBeenCalled();
    }

    // (h) two checkpoints at once share one capture; the older one's start says version_not_found
    const shared = Promise.resolve(CAPTURED);
    const capture = vi.fn(() => shared);
    const workers: Array<ReturnType<typeof vi.fn>> = [];
    const createWorker = (): ThumbnailWorker => {
      const w = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        onmessage: null as ((e: unknown) => void) | null,
        onerror: null,
        onmessageerror: null,
      };
      w.postMessage.mockImplementation(() => {
        queueMicrotask(() =>
          w.onmessage?.({ data: { kind: 'encoded', bytes: new ArrayBuffer(38000), quality: 60 } }),
        );
      });
      workers.push(w.postMessage);
      return w as unknown as ThumbnailWorker;
    };
    const report = vi.fn();
    let issued = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url === '/api/projects/P/checkpoints') {
        issued += 1;
        return respond(json(201, { version: { id: 'V' + issued } }));
      }
      if (url === '/api/projects/P/versions/V1/thumbnail') {
        return respond(
          json(404, {
            error: { code: 'version_not_found', message_key: 'error.version_not_found' },
          }),
        );
      }
      if (url === '/api/projects/P/versions/V2/thumbnail') {
        return respond(json(200, { upload: { ...UPLOAD, path: 't/P/thumb/V2.webp' } }));
      }
      if (url === '/api/projects/P/versions/V2/thumbnail/complete') {
        return respond(json(200, { thumbnail: { versionId: 'V2' } }));
      }
      throw new Error('unexpected url ' + url);
    });
    const deps = {
      fetchImpl,
      encode: (image: ImageData) => encodeThumbnail(image, { createWorker }),
      upload: vi.fn(async () => {}),
      report,
    } as unknown as ThumbnailDeps;
    const [first, second] = await Promise.all([
      makeCheckpoint({ projectId: 'P', capture }, deps),
      makeCheckpoint({ projectId: 'P', capture }, deps),
    ]);
    expect(first).toEqual({ status: 'failed', versionId: 'V1', code: 'version_not_found' });
    expect(second).toMatchObject({ status: 'saved', versionId: 'V2', quality: 60 });
    expect(report).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(2);
    for (const post of workers) {
      expect(post).toHaveBeenCalledTimes(1);
      expect(post.mock.calls[0]).toHaveLength(1);
      expect((post.mock.calls[0]![0] as { image: unknown }).image).toBe(IMG);
    }
  });

  test('EZD-224b T-U12 the project and version ids are encoded in every URL', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      urls.push(url);
      if (url === '/api/projects/a%2Fb/checkpoints')
        return respond(json(201, { version: { id: 'v?1' } }));
      if (url === '/api/projects/a%2Fb/versions/v%3F1/thumbnail')
        return respond(json(200, { upload: UPLOAD }));
      if (url === '/api/projects/a%2Fb/versions/v%3F1/thumbnail/complete')
        return respond(json(200, { thumbnail: { versionId: 'v?1' } }));
      throw new Error('unencoded or unexpected url ' + url);
    });
    const deps = {
      fetchImpl,
      encode: vi.fn(async () => ({ bytes: new Uint8Array(38000), quality: 60 as const })),
      upload: vi.fn(async () => {}),
      report: vi.fn(),
    } as unknown as ThumbnailDeps;
    const out = await makeCheckpoint({ projectId: 'a/b', capture: async () => CAPTURED }, deps);
    expect(urls).toEqual([
      '/api/projects/a%2Fb/checkpoints',
      '/api/projects/a%2Fb/versions/v%3F1/thumbnail',
      '/api/projects/a%2Fb/versions/v%3F1/thumbnail/complete',
    ]);
    expect(out.status).toBe('saved');
  });
});
