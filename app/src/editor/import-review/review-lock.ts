'use client';

// EZD-314 (S02 States "Locked / view-only: another user holds the edit lock; all edit controls disabled; lock banner
// shows who and since when, with Request edit"; Permissions "Edit model ... Also requires holding the edit lock";
// AC-EZD-314-3): the edit lock of the project an import belongs to, for Import review. It reads the lock through
// EZD-125's lock controller (the lock route at start, then on each lock event of the project channel) and gives
// the editor's lock banner (EZD-126 LockBanner) what it shows. Import review never takes the lock itself
// (save_import_review refuses only while another user holds it), so the review is locked exactly while the lock
// has a holder who is not the viewer.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LockUiState, RequestUi } from '../lock-ui/lock-ui-store';
import {
  createLockController,
  hubLockEvents,
  type LockController,
  type LockView,
} from '../lock/lock-controller';

export type ReviewLock = {
  /** Another user holds the edit lock. */
  locked: boolean;
  /** What LockBanner reads (banner and canEdit); the other fields are the store's empty values. */
  banner: LockUiState;
  requestEdit: () => void;
  cancelRequest: () => void;
};

const EMPTY: Omit<LockUiState, 'banner' | 'canEdit' | 'viewOnly' | 'loaded'> = {
  isHolder: false,
  prompt: null,
  stopBusy: false,
  avatars: { shown: [], overflow: 0 },
  lockLost: null,
  people: new Map(),
};

export function useReviewLock(o: {
  projectId: string;
  /** The viewer's app user id; no lock is read without it. */
  viewerId: string | undefined;
  canEdit: boolean;
  fetchImpl?: typeof fetch;
}): ReviewLock {
  const { projectId, viewerId, canEdit, fetchImpl } = o;
  const controller = useRef<LockController | null>(null);
  // The controller's last view; set from its subscription (each read of the lock route that settles).
  const [view, setView] = useState<LockView | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!viewerId) return;
    const c = createLockController({
      projectId,
      appUserId: viewerId,
      events: typeof window === 'undefined' ? undefined : hubLockEvents,
      fetchImpl,
    });
    const stop = c.subscribe(() => setView(c.get()));
    controller.current = c;
    return () => {
      stop();
      c.dispose();
      if (controller.current === c) controller.current = null;
    };
  }, [projectId, viewerId, fetchImpl]);

  const lock = view?.status === 'ready' ? view.lock : null;
  const holderId = lock?.holder?.appUserId ?? null;
  const locked = holderId !== null && holderId !== viewerId;
  const request: RequestUi = busy
    ? { kind: 'busy' }
    : lock?.myRequest
      ? { kind: 'requested', requestedAt: lock.myRequest.requestedAt }
      : { kind: 'idle' };
  const banner: LockUiState = {
    ...EMPTY,
    loaded: lock !== null,
    canEdit,
    viewOnly: locked,
    banner:
      locked && lock && holderId !== null
        ? {
            holderId,
            holderName: lock.holder?.name ?? null,
            since: lock.since ?? lock.now,
            request,
          }
        : null,
  };

  const requestEdit = useCallback(() => {
    const c = controller.current;
    if (!c || !canEdit) return;
    setBusy(true);
    void c.requestEdit().finally(() => setBusy(false));
  }, [canEdit]);
  const cancelRequest = useCallback(() => {
    const c = controller.current;
    if (!c) return;
    setBusy(true);
    void c.cancelRequest().finally(() => setBusy(false));
  }, []);

  return { locked, banner, requestEdit, cancelRequest };
}
