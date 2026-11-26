// EZD-1402 (phase-14 EZD-1402 "on reconnect the outbox drains like an autosave"; 03b Architecture rule 9; Q-0503;
// Q-0507 "the outbox drains whenever the app is open"): sends the queued field actions, oldest first, one at a time.
// A photo goes first as a signed upload (11 Operations: browser uploads go straight to Storage), then the action is
// recorded. A network failure stops the drain and keeps the order; it runs again on reconnect, on the next add and
// after a wait. A refusal for good keeps the action on the device, marked refused (never dropped). Every send names
// the signed-in membership, so a queue is never sent under another sign-in (Q-0503).
import { uploadFile, UploadError, type SignedUpload } from '../storage/upload';
import { createOnlineSource, type OnlineSource } from '../network';
import { FIELD_PHOTO_TYPES, type FieldAction, type NewFieldAction } from './field-action';
import type { FieldQueue } from './field-queue';
import { MEMBERSHIP_HEADER, type Actor } from './outbox';
import { webTabLock, type TabLock } from './tab-lock';

// The same waits as the model autosave's retries (outbox-sync.ts Decided "Failed"); the last repeats.
const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

const DEVICE_ID_KEY = 'ezdraft-device-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// This browser's id (03c offline_change.device_id), made once and kept in localStorage.
export function deviceId(store: Pick<Storage, 'getItem' | 'setItem'> | undefined = globalThis.localStorage): string {
  try {
    const kept = store?.getItem(DEVICE_ID_KEY);
    if (kept && UUID.test(kept)) return kept;
    const made = crypto.randomUUID();
    store?.setItem(DEVICE_ID_KEY, made);
    return made;
  } catch {
    return crypto.randomUUID();
  }
}

// sent: recorded (or already recorded). refused: kept, marked. stopped: not sent now (network, sign-in, server).
type Step = { kind: 'sent' } | { kind: 'refused'; code: string } | { kind: 'stopped' };

export type FieldSync = {
  add(action: NewFieldAction): Promise<FieldAction>;
  drain(): Promise<void>;
  // Called after the queue changes (an add, a send, a refusal).
  subscribe(listener: () => void): () => void;
  dispose(): void;
};

async function codeOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown } } | null;
    if (typeof body?.error?.code === 'string') return body.error.code;
  } catch {
    /* no body */
  }
  return `http_${res.status}`;
}

// 400, 403, 404 and 409 are for good; 401 (signed out or another sign-in), 5xx and others are tried again.
const forGood = (status: number) => status === 400 || status === 403 || status === 404 || status === 409;

export function createFieldSync(o: {
  actor: Actor;
  queue: FieldQueue;
  fetchImpl?: typeof fetch;
  online?: OnlineSource;
  upload?: typeof uploadFile;
  device?: string;
  lock?: TabLock;
}): FieldSync {
  const fetchImpl = o.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const online = o.online ?? createOnlineSource();
  const upload = o.upload ?? uploadFile;
  const device = o.device ?? deviceId();
  // One sender per user and company across the browser's tabs, as the model autosave (outbox-sync.ts).
  const lock = o.lock ?? webTabLock();
  const lockName = `ezdraft-field:${o.actor.appUserId}:${o.actor.tenantId}`;
  const listeners = new Set<() => void>();
  let running: Promise<void> | null = null;
  let rerun = false;
  let disposed = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const changed = () => {
    for (const l of listeners) l();
  };

  const post = (projectId: string, path: string, body: unknown) =>
    fetchImpl(`/api/projects/${encodeURIComponent(projectId)}/field-actions${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [MEMBERSHIP_HEADER]: o.actor.membershipId },
      body: JSON.stringify(body),
    });

  const sendPhoto = async (a: FieldAction & { photo: NonNullable<FieldAction['photo']> }): Promise<Step | null> => {
    let res: Response;
    try {
      res = await post(a.projectId, '/photo', { id: a.id, kind: a.kind, photo: a.photo.ext });
    } catch {
      return { kind: 'stopped' };
    }
    if (!res.ok) return forGood(res.status) ? { kind: 'refused', code: await codeOf(res) } : { kind: 'stopped' };
    let signed: SignedUpload | null;
    try {
      signed = ((await res.json()) as { upload: SignedUpload | null }).upload;
    } catch {
      return { kind: 'stopped' };
    }
    if (signed === null) return null;
    try {
      await upload(signed, a.photo.blob, { contentType: FIELD_PHOTO_TYPES[a.photo.ext], fetchImpl });
    } catch (e) {
      if (e instanceof UploadError && (e.code === 'upload_rejected' || e.code === 'upload_empty')) {
        return { kind: 'refused', code: e.code };
      }
      return { kind: 'stopped' };
    }
    return null;
  };

  const sendOne = async (a: FieldAction): Promise<Step> => {
    if (a.photo !== null) {
      const photo = await sendPhoto(a as FieldAction & { photo: NonNullable<FieldAction['photo']> });
      if (photo !== null) return photo;
    }
    let res: Response;
    try {
      res = await post(a.projectId, '', {
        id: a.id,
        deviceId: device,
        kind: a.kind,
        ops: a.ops,
        baseVersionId: a.baseVersionId,
        queuedAt: a.queuedAt,
        photo: a.photo?.ext ?? null,
      });
    } catch {
      return { kind: 'stopped' };
    }
    if (res.ok) return { kind: 'sent' };
    return forGood(res.status) ? { kind: 'refused', code: await codeOf(res) } : { kind: 'stopped' };
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    if (disposed) return;
    const wait = RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1];
    timer = setTimeout(() => {
      timer = null;
      void drain();
    }, wait);
  };

  const loop = async (): Promise<void> => {
    for (;;) {
      if (disposed || !online.getSnapshot()) return;
      rerun = false;
      const next = (await o.queue.list()).find((a) => a.state === 'queued');
      if (next === undefined) return;
      const step = await sendOne(next);
      if (step.kind === 'stopped') {
        failures += 1;
        schedule();
        return;
      }
      failures = 0;
      if (step.kind === 'sent') await o.queue.remove(next);
      else await o.queue.refuse(next, step.code);
      changed();
    }
  };

  function drain(): Promise<void> {
    if (disposed) return Promise.resolve();
    if (running !== null) {
      rerun = true;
      return running;
    }
    const run = (async () => {
      try {
        const result = await lock.tryRun(lockName, loop);
        if (!result.ran) {
          failures = Math.max(failures, 1);
          schedule();
        }
      } catch (error) {
        void import('../errors/capture').then((m) => m.captureBrowserError(error, 'outbox.field'));
      } finally {
        running = null;
      }
      if (rerun && !disposed) {
        rerun = false;
        await drain();
      }
    })();
    running = run;
    return run;
  }

  const off = online.subscribe(() => {
    if (online.getSnapshot()) {
      failures = 0;
      void drain();
    }
  });

  return {
    async add(action) {
      const added = await o.queue.add(action);
      changed();
      void drain();
      return added;
    },
    drain,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      off();
    },
  };
}
