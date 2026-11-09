'use client';
// EZD-299 Build step 6 (vault/plans/EZD-299.md section 3 C5; Decided D-Inputs, D-Outdated, D-Hook, D-Banner;
// Q-0511 e; Q-0540): the conflict list's inputs for the open editor: every row of the session's conflict list in
// its store order, then the changes an older app build queued while the sync's problem is `app_outdated`.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ConflictListState } from '../../lib/conflicts/conflict-list';
import { outdatedInputs, type ConflictViewInput } from '../../lib/conflicts/conflict-view';
import type { OutboxEntry } from '../../lib/outbox/outbox';
import type { SyncState } from '../../lib/outbox/outbox-sync';
import type { EditorSession } from '../editor-session';

export type ConflictInputs = {
  inputs: ConflictViewInput[];
  server: ConflictListState['server'];
  outdatedCount: number;
  othersSaved: boolean;
};

const unsubscribed = () => {};
const getNull = () => null;

async function report(error: unknown): Promise<void> {
  const { captureBrowserError } = await import('../../lib/errors/capture');
  captureBrowserError(error, 'editor.device_copy');
}

type Loaded = { session: EditorSession; entries: OutboxEntry[] };

export function useConflictInputs(
  session: EditorSession | null,
  projectId: string,
  listOpen: boolean,
): ConflictInputs {
  const sync = session?.sync ?? null;
  const conflicts = session?.conflicts ?? null;

  const subscribeSync = useCallback(
    (cb: () => void) => (sync === null ? unsubscribed : sync.subscribe(cb)),
    [sync],
  );
  const getSync = useCallback((): SyncState | null => sync?.getState() ?? null, [sync]);
  const syncState = useSyncExternalStore(subscribeSync, getSync, getNull);

  const subscribeList = useCallback(
    (cb: () => void) => (conflicts === null ? unsubscribed : conflicts.subscribe(cb)),
    [conflicts],
  );
  const getList = useCallback(
    (): ConflictListState | null => conflicts?.getState() ?? null,
    [conflicts],
  );
  const listState = useSyncExternalStore(subscribeList, getList, getNull);

  const outdatedActive = syncState?.problem === 'app_outdated';

  // D-Outdated: the queue is read when the problem becomes app_outdated and each time the list opens.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const last = useRef<{ session: EditorSession | null; outdated: boolean; open: boolean }>({
    session: null,
    outdated: false,
    open: false,
  });
  const token = useRef(0);
  useEffect(() => {
    const prev = last.current;
    last.current = { session, outdated: outdatedActive, open: listOpen };
    if (session === null || !outdatedActive) return;
    const became = !prev.outdated || prev.session !== session;
    const opened = listOpen && !prev.open;
    if (!became && !opened) return;
    token.current += 1;
    const mine = token.current;
    session.queued().then(
      (entries) => {
        if (mine === token.current) setLoaded({ session, entries });
      },
      (error: unknown) => {
        if (mine === token.current) setLoaded({ session, entries: [] });
        void report(error);
      },
    );
  }, [session, outdatedActive, listOpen]);

  const rows = listState?.rows;
  const entries =
    outdatedActive && loaded !== null && loaded.session === session ? loaded.entries : null;
  const outdated = useMemo(
    () =>
      session === null || entries === null
        ? []
        : outdatedInputs(entries, projectId, session.model.objects),
    [session, entries, projectId],
  );
  const inputs = useMemo<ConflictViewInput[]>(
    () => [...(rows ?? []), ...outdated],
    [rows, outdated],
  );

  const status = syncState?.status;
  return {
    inputs,
    server: listState?.server ?? 'idle',
    outdatedCount: outdated.length,
    othersSaved: syncState !== null && status !== 'error' && status !== 'offline',
  };
}
