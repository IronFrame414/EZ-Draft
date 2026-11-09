// EZD-299b Build step 7 (vault/plans/EZD-299b.md section 3 conflict-list row; Decided D-Merge, D-Stale, D-KeepMine
// (list), D-KeepTheirs, D-Remove, D-Refresh errors; Q-0502; Q-0511; Q-0540; Q-0632 (a)): the conflict list the
// screens read, this device's rows merged with the server's copy, and its three actions. A `zustand/vanilla`
// store with its storage, sync and fetch passed in. No React.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Change } from '../../editor/model/patches';
import { fetchModel, type ObjectValue } from '../outbox/model-api';
import type {
  ConflictKey,
  DeviceConflict,
  DeviceConflictReason,
  OutboxEntry,
  OutboxStorage,
} from '../outbox/outbox';
import type { OutboxSync } from '../outbox/outbox-sync';
import { getConflicts, removeServerConflict } from './conflict-api';
import type { MineChange, SavedValue, SyncConflictItem } from './conflicts';

export type ConflictAction = 'keep_mine' | 'keep_theirs' | 'remove';

export type ConflictRow = {
  key: string;
  projectId: string;
  projectName: string | null;
  objectId: string;
  reason: DeviceConflictReason;
  baseSeq: number;
  mine: MineChange | null;
  saved: SavedValue | null;
  clientName: string | null;
  savedBy: string | null;
  savedAt: string | null;
  serverSeq: number | null;
  serverId: string | null;
  at: number;
  // Decided D-Merge, D-Guard: the device row's refusedAt, null for a server item alone.
  refusedAt: number | null;
  actions: readonly ConflictAction[];
};

export type ConflictListState = {
  rows: ConflictRow[];
  server: 'idle' | 'loading' | 'ok' | 'failed';
};

export type ResolveResult =
  { ok: true } | { ok: false; reason: 'not_found' | 'not_allowed' | 'failed' };

export type ConflictListOptions = {
  storage: OutboxStorage;
  sync: OutboxSync | null;
  fetchImpl?: typeof fetch;
  editor?: { projectId: string; lockEpoch: number; applyRemote(changes: Change[]): void };
};

export type ConflictList = StoreApi<ConflictListState> & {
  refresh(): Promise<void>;
  keepMine(key: string): Promise<ResolveResult>;
  keepTheirs(key: string): Promise<ResolveResult>;
  remove(key: string): Promise<ResolveResult>;
  dispose(): void;
};

const keyOf = (projectId: string, objectId: string) => `${projectId}/${objectId}`;

const actionsFor = (reason: DeviceConflictReason): readonly ConflictAction[] =>
  reason === 'conflict' ? ['keep_mine', 'keep_theirs'] : ['remove'];

const fromItem = (
  item: SyncConflictItem,
  serverSeq: number | null,
  refusedAt: number | null,
): ConflictRow => ({
  key: keyOf(item.projectId, item.objectId),
  projectId: item.projectId,
  projectName: item.projectName,
  objectId: item.objectId,
  reason: item.reason,
  baseSeq: item.baseSeq,
  mine: item.mine,
  saved: item.saved,
  clientName: item.clientName,
  savedBy: item.savedBy,
  savedAt: item.savedAt,
  serverSeq,
  serverId: item.id,
  at: Date.parse(item.updatedAt),
  refusedAt,
  actions: actionsFor(item.reason),
});

const fromDevice = (d: DeviceConflict): ConflictRow => ({
  key: keyOf(d.projectId, d.objectId),
  projectId: d.projectId,
  projectName: null,
  objectId: d.objectId,
  reason: d.reason,
  baseSeq: d.baseSeq,
  mine: d.value === null ? { deleted: true } : { deleted: false, ...d.value },
  saved: null,
  clientName: null,
  savedBy: null,
  savedAt: null,
  serverSeq: d.serverSeq,
  serverId: d.serverId,
  at: d.refusedAt,
  refusedAt: d.refusedAt,
  actions: actionsFor(d.reason),
});

// Decided D-Merge: one row per key; `at` descending, then key ascending.
export function mergeConflicts(
  device: DeviceConflict[],
  queuedKeys: ReadonlySet<string>,
  server: SyncConflictItem[] | null,
): { rows: ConflictRow[]; resolvedElsewhere: ConflictKey[] } {
  const items = new Map<string, SyncConflictItem>();
  for (const item of server ?? []) items.set(keyOf(item.projectId, item.objectId), item);
  const hidden = new Set<string>();
  const rows: ConflictRow[] = [];
  const resolvedElsewhere: ConflictKey[] = [];
  const used = new Set<string>();
  for (const d of device) {
    const key = keyOf(d.projectId, d.objectId);
    if (d.state === 'requeued' && queuedKeys.has(key)) {
      hidden.add(key);
      continue;
    }
    const item = items.get(key);
    if (item !== undefined) {
      rows.push(fromItem(item, d.serverSeq, d.refusedAt));
      used.add(key);
    } else if (server !== null && d.server === 'recorded') {
      resolvedElsewhere.push({ projectId: d.projectId, objectId: d.objectId });
    } else {
      rows.push(fromDevice(d));
    }
  }
  for (const [key, item] of items) {
    if (hidden.has(key) || used.has(key)) continue;
    rows.push(fromItem(item, null, null));
  }
  rows.sort((a, b) => b.at - a.at || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { rows, resolvedElsewhere };
}

const mineValue = (mine: MineChange | null): ObjectValue | null =>
  mine === null || mine.deleted
    ? null
    : { type: mine.type, schemaVersion: mine.schemaVersion, data: mine.data };

async function reportStorage(error: unknown): Promise<void> {
  const { captureBrowserError } = await import('../errors/capture');
  captureBrowserError(error, 'outbox.storage');
}

const NOT_FOUND: ResolveResult = { ok: false, reason: 'not_found' };
const NOT_ALLOWED: ResolveResult = { ok: false, reason: 'not_allowed' };
const FAILED: ResolveResult = { ok: false, reason: 'failed' };

export function createConflictList(o: ConflictListOptions): ConflictList {
  const storage = o.storage;
  const sync = o.sync;
  const editor = o.editor;
  const fetchImpl = o.fetchImpl ?? fetch;
  const store = createStore<ConflictListState>()(() => ({ rows: [], server: 'idle' }));

  // Decided D-Stale: `token` names the newest refresh; `rev` moves with every change to the list.
  let token = 0;
  let rev = 0;
  let disposed = false;

  const find = (key: string) => store.getState().rows.find((r) => r.key === key);
  const dropRow = (key: string) => {
    store.setState({ rows: store.getState().rows.filter((r) => r.key !== key) });
    rev += 1;
  };
  const isOpen = (projectId: string) => editor !== undefined && editor.projectId === projectId;

  async function refresh(): Promise<void> {
    token += 1;
    const mine = token;
    const startRev = rev;
    const current = () => !disposed && mine === token;
    store.setState({ server: 'loading' });

    let device: DeviceConflict[];
    let queuedKeys: Set<string>;
    try {
      device = await storage.listConflicts();
      queuedKeys = new Set((await storage.list()).map((e) => keyOf(e.projectId, e.id)));
    } catch {
      if (!current()) return;
      if (rev !== startRev) return refresh();
      store.setState({ server: 'failed' });
      return;
    }
    const server = await getConflicts(fetchImpl);
    if (!current()) return;
    if (rev !== startRev) return refresh();

    const merged = mergeConflicts(device, queuedKeys, server);
    if (merged.resolvedElsewhere.length > 0) {
      // Decided D-Guard: each key deleted only at the refusal this read saw.
      const guarded = merged.resolvedElsewhere.map((k) => ({
        ...k,
        refusedAt:
          device.find((d) => d.projectId === k.projectId && d.objectId === k.objectId)?.refusedAt ??
          null,
      }));
      let kept: ConflictKey[];
      try {
        kept = await storage.deleteConflicts(guarded);
      } catch {
        if (!current()) return;
        if (rev !== startRev) return refresh();
        store.setState({ server: 'failed' });
        return;
      }
      if (!current()) return;
      if (rev !== startRev || kept.length > 0) return refresh();
    }
    store.setState({ rows: merged.rows, server: server === null ? 'failed' : 'ok' });
  }

  // Decided D-Guard: the device row at the key now (and, for Keep mine, the queued entry); a newer refusal,
  // or a device row at a server-only row, since the list was read → refresh and null (failed).
  async function guard(
    row: ConflictRow,
    readQueue: boolean,
  ): Promise<{ device: DeviceConflict | undefined; queued: OutboxEntry | undefined } | null> {
    let device: DeviceConflict | undefined;
    let queued: OutboxEntry | undefined;
    try {
      device = (await storage.listConflicts()).find(
        (d) => d.projectId === row.projectId && d.objectId === row.objectId,
      );
      if (readQueue) {
        queued = (await storage.list()).find(
          (e) => e.projectId === row.projectId && e.id === row.objectId,
        );
      }
    } catch (error) {
      await reportStorage(error);
      return null;
    }
    if ((device?.refusedAt ?? null) !== row.refusedAt) {
      void refresh();
      return null;
    }
    return { device, queued };
  }

  // Decided D-Guard: the device row is deleted only at the refusal the list showed; a newer refusal stored
  // during the network call is kept → refresh and false. Storage errors are thrown to the caller.
  async function deleteAtRefusal(row: ConflictRow): Promise<boolean> {
    const kept = await storage.deleteConflicts([
      { projectId: row.projectId, objectId: row.objectId, refusedAt: row.refusedAt },
    ]);
    if (kept.length === 0) return true;
    void refresh();
    return false;
  }

  const unsubscribe =
    sync === null
      ? () => {}
      : sync.subscribe((state, prev) => {
          if (disposed || state.conflictRev === prev.conflictRev) return;
          rev += 1;
          void refresh();
        });

  return {
    ...store,
    refresh,

    // Decided D-KeepMine (list).
    async keepMine(key) {
      const row = find(key);
      if (row === undefined) return NOT_FOUND;
      if (row.reason !== 'conflict' || sync === null) return NOT_ALLOWED;
      const now = await guard(row, true);
      if (now === null) return FAILED;
      const { device, queued } = now;
      const lockEpoch = isOpen(row.projectId) ? (editor?.lockEpoch ?? 0) : (device?.lockEpoch ?? 0);
      const passed: DeviceConflict =
        device !== undefined
          ? { ...device, lockEpoch }
          : {
              projectId: row.projectId,
              objectId: row.objectId,
              reason: 'conflict',
              baseSeq: row.baseSeq,
              serverSeq: row.saved?.updatedSeq ?? null,
              lockEpoch,
              value: mineValue(row.mine),
              refusedAt: row.at,
              state: 'listed',
              server: 'recorded',
              serverId: row.serverId,
            };
      const baseSeq = row.saved?.updatedSeq ?? row.serverSeq ?? 0;
      let result: { kept: boolean };
      try {
        result = await sync.keepMine(passed, baseSeq);
      } catch {
        return FAILED;
      }
      // Q-0648 (b): a newer refusal at the key kept the row.
      if (result.kept) {
        void refresh();
        return FAILED;
      }
      // D-Requeue: the value Keep mine sends, a later queued edit's when there is one.
      const value = queued !== undefined ? queued.value : passed.value;
      if (isOpen(row.projectId)) editor?.applyRemote([{ id: row.objectId, value }]);
      rev += 1;
      return { ok: true };
    },

    // Decided D-KeepTheirs.
    async keepTheirs(key) {
      const row = find(key);
      if (row === undefined) return NOT_FOUND;
      const now = await guard(row, false);
      if (now === null) return FAILED;
      const serverId = now.device?.serverId ?? row.serverId;
      let value: ObjectValue | null;
      let updatedSeq: number;
      if (row.saved !== null) {
        const saved = row.saved;
        value = saved.deleted
          ? null
          : { type: saved.type, schemaVersion: saved.schemaVersion, data: saved.data };
        updatedSeq = saved.updatedSeq;
      } else {
        const loaded = await fetchModel(row.projectId, { fetchImpl });
        if (!loaded.ok) return FAILED;
        const found = loaded.model.objects.find((x) => x.id === row.objectId);
        value =
          found === undefined
            ? null
            : { type: found.type, schemaVersion: found.schemaVersion, data: found.data };
        updatedSeq = found?.updatedSeq ?? 0;
      }
      if (serverId !== null) {
        if ((await removeServerConflict(fetchImpl, serverId)) !== 'removed') return FAILED;
      }
      try {
        if (!(await deleteAtRefusal(row))) return FAILED;
        await storage.setMirror(row.projectId, row.objectId, value, updatedSeq);
      } catch (error) {
        await reportStorage(error);
        return FAILED;
      }
      if (isOpen(row.projectId)) editor?.applyRemote([{ id: row.objectId, value }]);
      dropRow(key);
      return { ok: true };
    },

    // Decided D-Remove.
    async remove(key) {
      const row = find(key);
      if (row === undefined) return NOT_FOUND;
      const now = await guard(row, false);
      if (now === null) return FAILED;
      const serverId = now.device?.serverId ?? row.serverId;
      if (serverId !== null) {
        if ((await removeServerConflict(fetchImpl, serverId)) !== 'removed') return FAILED;
      }
      try {
        if (!(await deleteAtRefusal(row))) return FAILED;
      } catch (error) {
        await reportStorage(error);
        return FAILED;
      }
      dropRow(key);
      return { ok: true };
    },

    dispose() {
      disposed = true;
      unsubscribe();
    },
  };
}
