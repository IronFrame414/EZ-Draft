// EZD-606 (S06 Controls "Existing panel ... panel label photo (AI reads brand, rating, spaces; user confirms) ... read
// from directory photo"; Q-0637 photo row "the browser checks type and 20 MB, shrinks to JPEG with long edge at most
// 1,568 px and 3,500,000 bytes, and converts HEIC"; 11 rule 11 "Push, not poll"): the browser side of one panel photo
// read. The photo is checked and shrunk by the Assistant's photo worker (loaded on first use), sent as a panel_photo
// source_file (pin-photo.ts), and POST /api/projects/[id]/panel-read starts the ai_read job. The job's progress
// arrives on the project channel (job.progress); the job is fetched when it finishes, once when the channel is ready
// (a read that finished before the subscription) and after each resync. No timers. Browser only.
import {
  panelReadOutputSchema,
  type PanelRead,
  type PanelReadOutput,
} from '../../lib/electrical/panel-read';
import type { ProjectHandle } from '../../lib/realtime/hub';
import { uploadPinPhoto, type PhotoAttempt } from '../inspector/pin-photo';

/** `failed`: the photo could not be used, sent or read (`photo`: not a photo, too large or unreadable). */
export type PanelReadAnswer<R extends PanelRead> =
  | { status: 'done'; fileId: string; output: PanelReadOutput<R> }
  | { status: 'failed'; reason: 'photo' | 'denied' | 'failed' };

export type PanelPhotoReader = <R extends PanelRead>(
  read: R,
  file: File,
) => Promise<PanelReadAnswer<R>>;

type Channel = Pick<ProjectHandle, 'on' | 'onResync' | 'ready'>;

export type PanelReaderDeps = {
  fetchImpl?: typeof fetch;
  channel?: () => Promise<{ handle: Channel; release: () => void }>;
  prepare?: (file: File) => Promise<{ ok: true; jpeg: Blob } | { ok: false }>;
};

const hubChannel = (projectId: string) => async () => {
  const { getRealtimeHub } = await import('../../lib/realtime');
  const handle = getRealtimeHub().project(projectId);
  return { handle, release: () => handle.release() };
};

const workerPrepare = async (file: File) => {
  const { createPhotoWorkerShrinker, preparePhoto } = await import('../../lazy/photo-prepare');
  const shrinker = createPhotoWorkerShrinker();
  try {
    const r = await preparePhoto(file, shrinker.shrink);
    return r.ok ? { ok: true as const, jpeg: r.photo.jpeg } : { ok: false as const };
  } finally {
    shrinker.dispose();
  }
};

/** The finished job's output, null while it runs, or `failed`. */
export async function fetchPanelReadJob<R extends PanelRead>(
  read: R,
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PanelReadOutput<R> | 'failed' | null> {
  const res = await fetchImpl(`/api/jobs/${encodeURIComponent(jobId)}`, {
    credentials: 'same-origin',
  });
  if (!res.ok) return 'failed';
  const body = (await res.json().catch(() => null)) as {
    job?: { status?: unknown; result?: { output?: unknown } | null };
  } | null;
  const status = body?.job?.status;
  if (status === 'failed') return 'failed';
  if (status !== 'done') return null;
  const out = panelReadOutputSchema(read).safeParse(body?.job?.result?.output);
  return out.success ? out.data : 'failed';
}

/** Resolves once with the job's output (or `failed`); the channel is released then. */
export function waitForPanelRead<R extends PanelRead>(
  channel: Channel,
  read: R,
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PanelReadOutput<R> | 'failed'> {
  return new Promise((resolve) => {
    let settled = false;
    const offs: (() => void)[] = [];
    const check = () => {
      if (settled) return;
      fetchPanelReadJob(read, jobId, fetchImpl).then(
        (out) => {
          if (out === null || settled) return;
          settled = true;
          for (const off of offs) off();
          resolve(out);
        },
        () => {
          // A failed fetch is ignored: the next event or resync fetches again.
        },
      );
    };
    offs.push(
      channel.on('job.progress', (p) => {
        if (p.jobId === jobId && (p.status === 'done' || p.status === 'failed')) check();
      }),
      channel.onResync(() => check()),
    );
    void channel.ready.then(() => check());
  });
}

export function createPanelPhotoReader(
  projectId: string,
  deps: PanelReaderDeps = {},
): PanelPhotoReader {
  const fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const channelOf = deps.channel ?? hubChannel(projectId);
  const prepare = deps.prepare ?? workerPrepare;
  return async <R extends PanelRead>(read: R, file: File): Promise<PanelReadAnswer<R>> => {
    const photo = await prepare(file).catch(() => ({ ok: false as const }));
    if (!photo.ok) return { status: 'failed', reason: 'photo' };
    const attempt: { current: PhotoAttempt } = { current: null };
    let fileId: string;
    try {
      fileId = await uploadPinPhoto(
        projectId,
        {
          name: file.name.replace(/\.[^.]*$/, '') + '.jpg',
          blob: photo.jpeg,
          contentType: 'image/jpeg',
        },
        attempt,
        { fetchImpl, kind: 'panel_photo' },
      );
    } catch (e) {
      return {
        status: 'failed',
        reason: (e as { code?: unknown }).code === 'not_authorized' ? 'denied' : 'failed',
      };
    }
    // Subscribe before the job starts, so its finish event is not missed.
    let ch: { handle: Channel; release: () => void };
    try {
      ch = await channelOf();
    } catch {
      return { status: 'failed', reason: 'failed' };
    }
    try {
      let res: Response;
      try {
        res = await fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/panel-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ fileId, read }),
        });
      } catch {
        return { status: 'failed', reason: 'failed' };
      }
      if (res.status === 403) return { status: 'failed', reason: 'denied' };
      const body = (await res.json().catch(() => null)) as { jobId?: unknown } | null;
      if (res.status !== 202 || typeof body?.jobId !== 'string')
        return { status: 'failed', reason: 'failed' };
      const out = await waitForPanelRead(ch.handle, read, body.jobId, fetchImpl);
      return out === 'failed'
        ? { status: 'failed', reason: 'failed' }
        : { status: 'done', fileId, output: out };
    } finally {
      ch.release();
    }
  };
}
