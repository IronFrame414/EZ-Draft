'use client';
// EZD-126 (S06 Controls; ARCH Realtime "Requests only on events"; 11 rule 11; AC-EZD-126-6): makes the lock UI for
// one open editor session. It joins the project channel at once (EZD-125's own source waits for the tab to come
// back online or visible, vault/build/assumptions.md EZD-125), gives every lock event and resync of it to the
// session's lock controller, and tells the lock UI store each event first so it knows why a lock changed; the
// channel's presence feeds the avatars. No polling: the controller reads the lock route only on those events.
// Loaded with the lock UI's lazy module (app/src/lazy/lock-ui), which the editor loads on the first user input.
import { createToastStore } from '../../components/states/toast-store';
import { fetchPeople } from '../../lib/people/people-api';
import { getRealtimeHub } from '../../lib/realtime';
import type { ThumbnailCapture } from '../../lib/thumbnail/thumbnail';
import type { EditorSession } from '../editor-session';
import { LOCK_EVENTS, type LockEvent, type LockEventSource } from '../lock/lock-controller';
import { lockController, stopEditing } from '../lock/session-lock';
import { createLockUiStore, type LockUiStore } from './lock-ui-store';
import type { LockUi } from './LockUi';
import { sessionSwitcher } from '../switcher/ProjectSwitcher';

// `capture` is the plan's thumbnail for Stop editing's checkpoint; `reopen` opens the editor again once Start
// editing took the lock (it then saves with the lock's epoch); `someone` is t('office.lock.someone').
export function createLockUi(
  session: EditorSession,
  capture: () => Promise<ThumbnailCapture | null>,
  reopen: () => void,
  someone: string,
): LockUi {
  const projectId = session.model.project.id;
  const handle = getRealtimeHub().project(projectId);
  let store: LockUiStore | null = null;
  const events: LockEventSource = (_id, cb) => {
    const offs = [
      handle.onResync(() => cb(null)),
      ...LOCK_EVENTS.map((name) =>
        handle.on(name, (payload) => {
          const event = { name, payload } as LockEvent;
          store?.onEvent(event);
          cb(event);
        }),
      ),
    ];
    return () => {
      for (const off of offs) off();
    };
  };
  const controller = lockController(session, { events });
  const toasts = createToastStore();
  store = createLockUiStore({
    projectId,
    viewerId: session.model.viewer.appUserId,
    canEditModel: session.lock.canEditModel,
    wasHolding: session.lock.holding,
    controller,
    stopEditing: () => stopEditing(session, capture),
    drain: () => session.sync?.flush() ?? Promise.resolve(),
    onLockTaken: reopen,
    onLockLeft: () => {
      session.lock.holding = false;
    },
    toasts,
    someone,
    fetchPeople: (id, ids) => fetchPeople(id, ids),
  });
  const s = store;
  // EZD-128 (Q-0697 decisions 04; Q-0698): the project switcher of this session, its leave with the same capture.
  const switcher = sessionSwitcher(session, capture);
  const presence = () => s.setPresence(handle.presence().map((m) => m.appUserId));
  const offPresence = handle.onPresence(presence);
  presence();
  return {
    store: s,
    toasts,
    sync: session.sync,
    staleKey: () => controller.staleSaveMessageKey(),
    switcher,
    dispose() {
      switcher.store.dispose();
      offPresence();
      s.dispose();
      handle.release();
    },
  };
}
