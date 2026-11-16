// EZD-120c Build step 4 (vault/plans/EZD-120c.md section 3 editor-session row; Decided "Open", "Ready", "Report,
// dispose"; 03a; Q-0500; Q-0214; P120b "Reopen"): opens one project in the editor. The model load decides the
// answer (403 no access, 404 not found, anything else failed); a ready project is the load with this device's
// unsaved edits on top, the device mirror replaced, and, for an editor, the autosave sync. No React.
import {
  createConflictList,
  type ConflictList,
  type ConflictListOptions,
} from '../lib/conflicts/conflict-list';
import { fetchModel, loadWorkingCopy, type ModelLoad } from '../lib/outbox/model-api';
import type { Actor, OutboxEntry, OutboxStorage, SavedObject } from '../lib/outbox/outbox';
import { createIdbOutboxStorage } from '../lib/outbox/outbox-idb';
import { createOutboxSync, type OutboxSync } from '../lib/outbox/outbox-sync';
import { createModelStore, type ModelStore } from './model/model-store';
import { createProjectDefaults, type ProjectDefaults, type ResyncSource } from './project-defaults';
import { acquireAtOpen } from '../lib/lock/lock-open';
import type { LockController } from './lock/lock-controller';

export type OpenDeps = {
  fetchImpl?: typeof fetch;
  createStorage?: (actor: Actor) => OutboxStorage;
  createSync?: (o: {
    actor: Actor;
    storage: OutboxStorage;
    onSaved?: (projectId: string, saved: SavedObject[]) => void;
  }) => OutboxSync;
  // EZD-299b Build step 8 (Decided D-Session).
  createConflicts?: (o: ConflictListOptions) => ConflictList;
  // EZD-116 (AC-EZD-116-8): the project channel resync that re-reads the defaults; none means no re-read.
  resync?: ResyncSource;
};

// EZD-125 (Q-0697 decisions 03, 04; S06 Decision 12; 03b rule 9): the viewer's hold on the edit lock and what
// the tab-close release needs. The controller, Stop editing and the tab-close count are in session-lock.ts
// (`lockController(session)`, `stopEditing(session, capture)`, `armTabClose`), loaded on first use so the editor's
// first download stays inside its budget (11 rule 7).
export type EditorLock = {
  // The Edit model switch (model.viewer.canEdit is the hold at open).
  canEditModel: boolean;
  // This tab holds the lock.
  holding: boolean;
  // This device's queued entries for the project as last counted; null when the count failed.
  count: number | null;
  // `commits` when the last count found every edit stored and the sync settled: the release needs it equal to
  // `commits` (no edit since).
  cleanAt: number;
  // Edits made in this session, and how many of them have reached storage: a count moves `cleanAt` only when
  // every edit was stored before it began.
  commits: number;
  stored: number;
  disposed?: boolean;
  controller?: LockController;
  armed?: boolean;
  // The cleanup of the parts loaded from session-lock.ts (the tab-close listener, the controller).
  disarm?: () => void;
};

export type EditorSession = {
  model: ModelLoad;
  store: ModelStore;
  sync: OutboxSync | null;
  conflicts: ConflictList;
  // EZD-116 (Q-0697 03): the effective defaults, from the load and re-read on each resync.
  defaults: ProjectDefaults;
  // EZD-125: the edit lock of this open project.
  lock: EditorLock;
  // EZD-299 C4: the device outbox of this actor, every project.
  queued(): Promise<OutboxEntry[]>;
  dispose(): void;
};

export type OpenResult =
  { kind: 'ready'; session: EditorSession } | { kind: 'failed' | 'no-access' | 'not-found' };

async function report(error: unknown): Promise<void> {
  const { captureBrowserError } = await import('../lib/errors/capture');
  captureBrowserError(error, 'editor.device_copy');
}

export async function openEditorSession(projectId: string, deps?: OpenDeps): Promise<OpenResult> {
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const loaded = await fetchModel(projectId, { fetchImpl });
  if (!loaded.ok) {
    if (loaded.status === 403) return { kind: 'no-access' };
    if (loaded.status === 404) return { kind: 'not-found' };
    return { kind: 'failed' };
  }
  // EZD-125 (04:90; S03:16-17; AC-EZD-125-4): a viewer with Edit model asks for the lock at open. A free lock
  // (or one this person already holds from another tab) is theirs and the editor saves with its epoch; a lock
  // held by another person, or no answer, opens view only, with no sync and nothing saved.
  const canEditModel = loaded.model.viewer.canEdit;
  // Asked alongside the device list read, so the open waits for one round trip, not two.
  const acquiring = canEditModel ? acquireAtOpen(projectId, crypto.randomUUID(), fetchImpl) : null;
  const { appUserId, tenantId, membershipId } = loaded.model.viewer;
  const actor: Actor = { appUserId, tenantId, membershipId };
  const storage = (deps?.createStorage ?? createIdbOutboxStorage)(actor);

  let entries: OutboxEntry[];
  try {
    entries = await storage.list();
  } catch (error) {
    entries = [];
    void report(error);
  }

  const acquired = await acquiring;
  const model = loaded.model;
  model.lockEpoch = acquired ?? model.lockEpoch;
  model.viewer.canEdit = acquired !== null;

  // EZD-294 Build step 12 (vault/plans/EZD-294.md Decided "Session start"; Q-0629 (b)): a saved answer of this
  // project puts its numbers in the open model; the store starts from the load's highs.
  const sync = model.viewer.canEdit
    ? (deps?.createSync ?? createOutboxSync)({
        actor,
        storage,
        onSaved: (pid, saved) => {
          if (pid === projectId) store.applySavedNumbers(saved);
        },
      })
    : null;
  const store = createModelStore({
    objects: loadWorkingCopy(model, entries),
    numberHighs: model.numberHighs,
    onCommit: sync
      ? (c) => {
          if (!ctx.holding) return;
          ctx.commits += 1;
          arm();
          void sync.enqueue(projectId, model.lockEpoch, c).then(() => {
            ctx.stored += 1;
          });
        }
      : undefined,
  });
  // EZD-299b Decided D-Session: the conflict list over the same storage and sync.
  const conflicts = (deps?.createConflicts ?? createConflictList)({
    storage,
    sync,
    fetchImpl: deps?.fetchImpl ?? fetch,
    editor: { projectId, lockEpoch: model.lockEpoch, applyRemote: (c) => store.applyRemote(c) },
  });

  try {
    await storage.replaceMirror(projectId, model.objects);
  } catch (error) {
    void report(error);
  }
  void conflicts.refresh();
  const defaults = createProjectDefaults({
    projectId,
    initial: model.defaults ?? {},
    resync: deps?.resync,
    fetchImpl: deps?.fetchImpl ?? fetch,
  });

  if (sync && entries.length > 0) void sync.flush();
  // EZD-125 (Q-0697 decisions 04; 03b rules 7, 9; 11 rule 7): the lock context. The tab-close release and its
  // count (session-lock.ts `armTabClose`) load with the first user action on the page or the first edit, or at
  // once when this project has entries queued from before (a pointerdown arms it; a keyboard-only session is
  // armed by its first edit); the editor's first download holds only this.
  const ctx: EditorLock = {
    canEditModel,
    holding: acquired !== null,
    // Any queued entry counts until the first count narrows it to this project.
    count: entries.length,
    cleanAt: 0,
    commits: 0,
    stored: 0,
  };
  const page = globalThis.window;
  const arm = () =>
    void import('./lock/session-lock').then((m) => m.armTabClose(session, page, fetchImpl));
  page?.addEventListener('pointerdown', arm);

  const session: EditorSession = {
    model,
    store,
    sync,
    conflicts,
    defaults,
    lock: ctx,
    queued: () => storage.list(),
    dispose() {
      page?.removeEventListener('pointerdown', arm);
      ctx.disposed = true;
      ctx.disarm?.();
      defaults.dispose();
      conflicts.dispose();
      sync?.dispose();
      storage.close();
    },
  };
  if (ctx.holding && ctx.count) arm();
  return { kind: 'ready', session };
}
