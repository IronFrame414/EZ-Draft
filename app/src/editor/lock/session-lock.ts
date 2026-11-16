// EZD-125 (S06 Edit lock; Q-0681 (a); Q-0697 decisions 03, 04, 05; S06 Decision 12; 03b rules 7, 9; AC-EZD-125-8):
// the lock parts of an open editor session that load on first use, so the editor's first download (what it
// fetches with no user action, 11 rule 7) stays inside its budget: the lock controller, Stop editing, and the
// count behind the tab-close release. editor-session.ts keeps the acquire, `session.lock` and the pagehide check.
// No React.
import type { EditorSession } from '../editor-session';
import type { ThumbnailCapture } from '../../lib/thumbnail/thumbnail';
import { sendClosingRelease } from '../../lib/lock/lock-client';
import { stopEditingSession, type StopEditingOutcome } from './leave';
import {
  createLockController,
  hubLockEvents,
  type LockController,
  type LockEventSource,
} from './lock-controller';

type Session = Pick<EditorSession, 'model' | 'sync' | 'lock' | 'queued'>;

// The session's dispose calls `lock.disarm`; each part loaded here chains its own cleanup onto it.
function addCleanup(lock: Session['lock'], cleanup: () => void): void {
  const before = lock.disarm;
  lock.disarm = () => {
    before?.();
    cleanup();
  };
}

// The session's controller, made on the first call: read at once, then on every lock event and resync of the
// project channel (hubLockEvents in a browser). The session's dispose disposes it.
export function lockController(
  session: Session,
  o: { events?: LockEventSource; fetchImpl?: typeof fetch } = {},
): LockController {
  const lock = session.lock;
  if (!lock.controller) {
    const controller = createLockController({
      projectId: session.model.project.id,
      appUserId: session.model.viewer.appUserId,
      events: o.events ?? (typeof window === 'undefined' ? undefined : hubLockEvents),
      fetchImpl: o.fetchImpl,
    });
    lock.controller = controller;
    if (lock.disposed) controller.dispose();
    addCleanup(lock, () => controller.dispose());
  }
  return lock.controller;
}

// Drain, checkpoint with the plan's thumbnail, then release; a failed step keeps the lock.
export async function stopEditing(
  session: Session,
  capture: () => Promise<ThumbnailCapture | null>,
  o: { fetchImpl?: typeof fetch } = {},
): Promise<StopEditingOutcome> {
  const { lock, sync } = session;
  if (!lock.holding || !sync) return { ok: false, step: 'release', code: 'not_lock_holder' };
  const projectId = session.model.project.id;
  const outcome = await stopEditingSession({
    projectId,
    sync,
    queued: async () => (await session.queued()).filter((e) => e.projectId === projectId).length,
    fetchImpl: o.fetchImpl ?? fetch,
    capture,
  });
  if (outcome.ok) lock.holding = false;
  await lock.controller?.refresh();
  return outcome;
}

// Tab close (Q-0697 decisions 04; 03b rules 7, 9): a keepalive release with reason closed, carrying the epoch
// it held, sent once on pagehide while this tab holds the lock and this device has no entries for the project
// (the queued edits then drain at the next open, which re-acquires with the same epoch). pagehide cannot wait
// for storage, so the count is kept here: recounted on every sync state change; `cleanAt` moves up only for the
// latest count, begun once every edit had reached storage and with no edit since, finished with the sync idle or
// saved. Armed once per session.
export function armTabClose(
  session: Session,
  page: Pick<Window, 'addEventListener' | 'removeEventListener'> | null | undefined,
  fetchImpl: typeof fetch,
): void {
  const { lock, sync } = session;
  if (lock.armed || lock.disposed || !sync) return;
  const projectId = session.model.project.id;
  let seq = 0;
  const settled = () => {
    const status = sync.getState().status;
    return status === 'idle' || status === 'saved';
  };
  const recount = () => {
    if (lock.disposed) return;
    const n = (seq += 1);
    const seen = lock.commits;
    const allStored = lock.stored === seen;
    session.queued().then(
      (all) => {
        if (n !== seq) return;
        lock.count = all.filter((e) => e.projectId === projectId).length;
        if (allStored && lock.commits === seen && settled()) lock.cleanAt = seen;
      },
      () => {
        if (n === seq) lock.count = null;
      },
    );
  };
  const onPageHide = () => {
    if (lock.holding && lock.cleanAt === lock.commits && lock.count === 0 && settled()) {
      lock.holding = false;
      sendClosingRelease(projectId, session.model.lockEpoch, fetchImpl);
    }
  };
  lock.armed = true;
  const off = sync.subscribe(recount);
  page?.addEventListener('pagehide', onPageHide);
  addCleanup(lock, () => {
    off();
    page?.removeEventListener('pagehide', onPageHide);
  });
  recount();
}
