// EZD-299 (vault/plans/EZD-299.md Decided D-Outdated, D-Groups): the conflict list's grouping by project, the count
// for the open project and the older-version rows.
// EZD-229 (11 Budgets; EZD-120c B11): moved out of conflict-view.ts unchanged, so the editor at open loads only these
// and the row views (conflict-view.ts) load with the lazy conflict panel.
import type { LoadedObject } from '../outbox/model-api';
import type { OutboxEntry } from '../outbox/outbox';
import type { MineChange, SavedValue } from './conflicts';
import type { ConflictGroupKind, ConflictViewInput } from './conflict-view';

const sameId = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const groupOf = (input: ConflictViewInput, openProjectId: string): ConflictGroupKind =>
  input.reason === 'not_open'
    ? 'not_open'
    : sameId(input.projectId, openProjectId)
      ? 'this'
      : 'other';

export function countForProject(inputs: readonly ConflictViewInput[], projectId: string): number {
  return inputs.filter((input) => groupOf(input, projectId) === 'this').length;
}

const keyCompare = (a: OutboxEntry, b: OutboxEntry) => {
  const ka = `${a.projectId}/${a.id}`;
  const kb = `${b.projectId}/${b.id}`;
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

// D-Outdated: the changes an older app build queued, newest first.
export function outdatedInputs(
  entries: readonly OutboxEntry[],
  openProjectId: string,
  loaded: readonly LoadedObject[],
): ConflictViewInput[] {
  return [...entries]
    .sort((a, b) => b.queuedAt - a.queuedAt || keyCompare(a, b))
    .map((e) => {
      const found = sameId(e.projectId, openProjectId)
        ? loaded.find((o) => sameId(o.id, e.id))
        : undefined;
      const mine: MineChange =
        e.value === null ? { deleted: true } : { deleted: false, ...e.value };
      const saved: SavedValue | null =
        found === undefined
          ? null
          : {
              updatedSeq: found.updatedSeq,
              deleted: false,
              type: found.type,
              schemaVersion: found.schemaVersion,
              data: found.data,
            };
      return {
        key: `outdated:${e.projectId}/${e.id}`,
        projectId: e.projectId,
        projectName: null,
        objectId: e.id,
        reason: 'outdated',
        mine,
        saved,
        actions: ['reload'],
        savedBy: null,
        savedAt: null,
        clientName: null,
      };
    });
}
