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
import type { Actor, OutboxEntry, OutboxStorage } from '../lib/outbox/outbox';
import { createIdbOutboxStorage } from '../lib/outbox/outbox-idb';
import { createOutboxSync, type OutboxSync } from '../lib/outbox/outbox-sync';
import { createModelStore, type ModelStore } from './model/model-store';

export type OpenDeps = {
  fetchImpl?: typeof fetch;
  createStorage?: (actor: Actor) => OutboxStorage;
  createSync?: (o: { actor: Actor; storage: OutboxStorage }) => OutboxSync;
  // EZD-299b Build step 8 (Decided D-Session).
  createConflicts?: (o: ConflictListOptions) => ConflictList;
};

export type EditorSession = {
  model: ModelLoad;
  store: ModelStore;
  sync: OutboxSync | null;
  conflicts: ConflictList;
  dispose(): void;
};

export type OpenResult =
  { kind: 'ready'; session: EditorSession } | { kind: 'failed' | 'no-access' | 'not-found' };

async function report(error: unknown): Promise<void> {
  const { captureBrowserError } = await import('../lib/errors/capture');
  captureBrowserError(error, 'editor.device_copy');
}

export async function openEditorSession(projectId: string, deps?: OpenDeps): Promise<OpenResult> {
  const loaded = await fetchModel(projectId, { fetchImpl: deps?.fetchImpl ?? fetch });
  if (!loaded.ok) {
    if (loaded.status === 403) return { kind: 'no-access' };
    if (loaded.status === 404) return { kind: 'not-found' };
    return { kind: 'failed' };
  }
  const model = loaded.model;
  const { appUserId, tenantId, membershipId } = model.viewer;
  const actor: Actor = { appUserId, tenantId, membershipId };
  const storage = (deps?.createStorage ?? createIdbOutboxStorage)(actor);

  let entries: OutboxEntry[];
  try {
    entries = await storage.list();
  } catch (error) {
    entries = [];
    void report(error);
  }

  const sync = model.viewer.canEdit
    ? (deps?.createSync ?? createOutboxSync)({ actor, storage })
    : null;
  const store = createModelStore({
    objects: loadWorkingCopy(model, entries),
    onCommit: sync ? (c) => void sync.enqueue(projectId, model.lockEpoch, c) : undefined,
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

  if (sync && entries.length > 0) void sync.flush();

  return {
    kind: 'ready',
    session: {
      model,
      store,
      sync,
      conflicts,
      dispose() {
        conflicts.dispose();
        sync?.dispose();
        storage.close();
      },
    },
  };
}
