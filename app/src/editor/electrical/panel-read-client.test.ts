// EZD-606 (S06 Controls "Existing panel ... panel label photo (AI reads brand, rating, spaces; user confirms)";
// Q-0637 photo row "the browser ... shrinks to JPEG"; 11 rule 11 "Push, not poll"): the browser side of one panel
// photo read, against a fake server, Storage and project channel. The read output is the stub recording's label.
import { describe, expect, it } from 'vitest';
import { createFakeTus } from '../../../test-utils/storage/fake-tus';
import type { ProjectChannelEvents } from '../../lib/realtime/events';
import { createPanelPhotoReader } from './panel-read-client';

const P = '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f01';
const FILE = '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f02';
const JOB = '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f03';
const LABEL = { brand: 'Square D', rating: 200, spaces: 40 };

type Progress = ProjectChannelEvents['job.progress'];

function fakeChannel() {
  const listeners: ((p: Progress) => void)[] = [];
  let released = 0;
  const handle = {
    ready: Promise.resolve('subscribed' as const),
    on: (_e: string, cb: (p: Progress) => void) => {
      listeners.push(cb);
      return () => listeners.splice(listeners.indexOf(cb), 1);
    },
    onResync: () => () => {},
  };
  return {
    open: async () => ({ handle: handle as never, release: () => void released++ }),
    emit: (p: Progress) => [...listeners].forEach((cb) => cb(p)),
    released: () => released,
  };
}

function server(o: { readStatus?: number; job: () => { status: string; result?: unknown } }) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const tus = createFakeTus();
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (!url.startsWith('/api/')) return tus.fetchImpl(input, init);
    calls.push({
      method,
      path: url,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    if (url === `/api/projects/${P}/source-files`)
      return Response.json(
        {
          sourceFile: { id: FILE },
          upload: {
            bucket: 'sources',
            path: `t/${P}/${FILE}`,
            token: 'tok',
            url: 'https://storage.test/sign/1',
          },
        },
        { status: 201 },
      );
    if (url.endsWith('/complete')) return Response.json({ sourceFile: {} }, { status: 200 });
    if (url === `/api/projects/${P}/panel-read`)
      return Response.json({ jobId: JOB }, { status: o.readStatus ?? 202 });
    if (url === `/api/jobs/${JOB}`) return Response.json({ job: o.job() }, { status: 200 });
    return new Response(null, { status: 404 });
  };
  return { calls, fetchImpl };
}

const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });
const file = () => new File([new Uint8Array([1, 2, 3])], 'IMG_0001.HEIC');

describe('EZD-606 panel photo read client', () => {
  it('sends the shrunk JPEG as a panel_photo, starts the read and answers the finished job', async () => {
    let done = false;
    const s = server({
      job: () =>
        done
          ? {
              status: 'done',
              result: { purpose: 'panel.label', output: { status: 'read', label: LABEL } },
            }
          : { status: 'running' },
    });
    const ch = fakeChannel();
    const read = createPanelPhotoReader(P, {
      fetchImpl: s.fetchImpl,
      channel: ch.open,
      prepare: async () => ({ ok: true, jpeg }),
    }).call(null, 'label', file());
    await expect.poll(() => s.calls.filter((c) => c.path === `/api/jobs/${JOB}`).length).toBe(1);
    done = true;
    ch.emit({
      jobId: JOB,
      kind: 'ai_read',
      status: 'done',
      progress: 100,
      attempts: 1,
    } as Progress);
    expect(await read).toEqual({
      status: 'done',
      fileId: FILE,
      output: { status: 'read', label: LABEL },
    });
    expect(s.calls[0]).toEqual({
      method: 'POST',
      path: `/api/projects/${P}/source-files`,
      body: {
        kind: 'panel_photo',
        originalName: 'IMG_0001.jpg',
        contentType: 'image/jpeg',
        size: 4,
      },
    });
    expect(s.calls.find((c) => c.path.endsWith('/panel-read'))!.body).toEqual({
      fileId: FILE,
      read: 'label',
    });
    expect(ch.released()).toBe(1);
  });

  it('a file that is not a usable photo answers `photo` and sends nothing', async () => {
    const s = server({ job: () => ({ status: 'running' }) });
    const out = await createPanelPhotoReader(P, {
      fetchImpl: s.fetchImpl,
      channel: fakeChannel().open,
      prepare: async () => ({ ok: false }),
    })('label', file());
    expect(out).toEqual({ status: 'failed', reason: 'photo' });
    expect(s.calls).toEqual([]);
  });

  it('a failed job, a refused start and a job output of the wrong shape answer failed', async () => {
    const opts = (job: () => { status: string; result?: unknown }, readStatus?: number) => {
      const s = server({ job, ...(readStatus === undefined ? {} : { readStatus }) });
      return createPanelPhotoReader(P, {
        fetchImpl: s.fetchImpl,
        channel: fakeChannel().open,
        prepare: async () => ({ ok: true, jpeg }),
      });
    };
    expect(await opts(() => ({ status: 'failed' }))('label', file())).toEqual({
      status: 'failed',
      reason: 'failed',
    });
    expect(await opts(() => ({ status: 'running' }), 403)('label', file())).toEqual({
      status: 'failed',
      reason: 'denied',
    });
    expect(
      await opts(() => ({
        status: 'done',
        result: { output: { status: 'read', label: { brand: 7 } } },
      }))('label', file()),
    ).toEqual({ status: 'failed', reason: 'failed' });
  });
});
