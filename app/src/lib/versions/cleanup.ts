// EZD-123 (S20 "Cleanup sheet: version row" one-line change summary; Q-0700 05 "Cleanup sheet"; AC-EZD-123-9, -10):
// the cleanup sheet's rows as the route answers them, and the change summary counts against the parent version by
// object id (version-diff.ts). Shared by the server route and the browser. No React.
import type { ObjectValue } from '../outbox/model-api';
import { versionDiff } from './version-diff';

export type CleanupCounts = { added: number; changed: number; removed: number };

// A stored checkpoint object, as model_version.model_json holds it.
export type StoredObject = { id: string; type: string; schema_version: number; data: unknown };

function toMap(objects: readonly StoredObject[]): Map<string, ObjectValue> {
  const m = new Map<string, ObjectValue>();
  for (const o of objects) {
    m.set(o.id, {
      type: o.type,
      schemaVersion: o.schema_version,
      data: (o.data ?? {}) as Record<string, unknown>,
    });
  }
  return m;
}

// The objects of a model_json document; anything else reads as no objects.
export function storedObjects(modelJson: unknown): StoredObject[] {
  const raw = (modelJson as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (o): o is StoredObject =>
      typeof o === 'object' && o !== null && typeof (o as { id?: unknown }).id === 'string',
  );
}

// Null when there is no parent (the first version).
export function cleanupCounts(
  parent: readonly StoredObject[] | null,
  row: readonly StoredObject[],
): CleanupCounts | null {
  if (parent === null) return null;
  const d = versionDiff(toMap(parent), toMap(row));
  return { added: d.added.length, changed: d.changed.length, removed: d.removed.length };
}

export type CleanupRow = {
  id: string;
  createdAt: string;
  author: string | null;
  cause: string | null;
  label: string | null;
  summary: CleanupCounts | null;
  shownAt: string;
  // A signed preview image URL; null shows the placeholder (Q-0664).
  previewUrl: string | null;
};

export type CleanupList = { rows: CleanupRow[]; graceDays: number; ageDays: number };
