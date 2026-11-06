// EZD-202 Build step 8 (vault/plans/EZD-202.md section 3 `schema/index.ts`, Decided "Document checks"; 03f
// Objects inside model_json; AC-EZD-202-1, -2, -5): the stored object and model document readers. Every reader
// of `model_object` rows or `model_version.model_json` parses through here.
import { z } from 'zod';
import { floorDataSchema, type FloorData } from './floor';
import { migrateStoredObject } from './migrate';
import { openingDataSchema, type OpeningData } from './opening';
import { roomDataSchema, type RoomData } from './room';
import { wallDataSchema, type WallData } from './wall';

export * from './common';
export * from './floor';
export * from './migrate';
export * from './opening';
export * from './room';
export * from './wall';

export const OBJECT_TYPES = ['floor', 'wall', 'opening', 'room'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export type StoredObject = { id: string; type: string; schema_version: number; data: unknown };

type DataByType = { floor: FloorData; wall: WallData; opening: OpeningData; room: RoomData };
export type ModelObject = {
  [T in ObjectType]: { id: string; type: T; data: DataByType[T] };
}[ObjectType];

export type ObjectIssueCode =
  | 'invalid_document'
  | 'invalid_data'
  | 'unknown_type'
  | 'unknown_schema_version'
  | 'duplicate_id'
  | 'level_not_found';
export type ObjectIssue = { id: string; issue: ObjectIssueCode };

export type ModelDocument = { objects: ModelObject[] };

const DATA_SCHEMAS: { [T in ObjectType]: z.ZodType<DataByType[T]> } = {
  floor: floorDataSchema,
  wall: wallDataSchema,
  opening: openingDataSchema,
  room: roomDataSchema,
};

const isObjectType = (type: string): type is ObjectType =>
  (OBJECT_TYPES as readonly string[]).includes(type);

// Order: version, type, data. An object below the current version is migrated before its data is read.
export function parseStoredObject(
  obj: StoredObject,
): { ok: true; object: ModelObject } | { ok: false; issue: ObjectIssue } {
  const migrated = migrateStoredObject(obj);
  if (migrated === null)
    return { ok: false, issue: { id: obj.id, issue: 'unknown_schema_version' } };
  const type = migrated.type;
  if (!isObjectType(type)) return { ok: false, issue: { id: obj.id, issue: 'unknown_type' } };
  const parsed = DATA_SCHEMAS[type].safeParse(migrated.data);
  if (!parsed.success) return { ok: false, issue: { id: obj.id, issue: 'invalid_data' } };
  return { ok: true, object: { id: obj.id, type, data: parsed.data } as ModelObject };
}

const storedShape = z.strictObject({
  id: z.uuid(),
  type: z.string(),
  schema_version: z.number(),
  data: z.unknown(),
});

const documentShape = z.object({ objects: z.array(z.unknown()) });

export function parseModelDocument(
  json: unknown,
): { ok: true; document: ModelDocument } | { ok: false; issues: ObjectIssue[] } {
  const doc = documentShape.safeParse(json);
  if (!doc.success) return { ok: false, issues: [{ id: '', issue: 'invalid_document' }] };

  const issues: (ObjectIssue | null)[] = [];
  const parsed: (ModelObject | null)[] = [];
  const seen = new Set<string>();
  for (const raw of doc.data.objects) {
    const shape = storedShape.safeParse(raw);
    if (!shape.success) {
      const id = (raw as { id?: unknown } | null)?.id;
      issues.push({ id: typeof id === 'string' ? id : '', issue: 'invalid_data' });
      parsed.push(null);
      continue;
    }
    const obj = shape.data as StoredObject;
    const key = obj.id.toLowerCase();
    const result = parseStoredObject(obj);
    if (!result.ok) issues.push(result.issue);
    else if (seen.has(key)) issues.push({ id: obj.id, issue: 'duplicate_id' });
    else issues.push(null);
    seen.add(key);
    parsed.push(result.ok ? result.object : null);
  }

  const floorIds = new Set(
    parsed.filter((o) => o?.type === 'floor').map((o) => (o as ModelObject).id.toLowerCase()),
  );
  parsed.forEach((o, i) => {
    if (o === null || o.type === 'floor' || issues[i] !== null) return;
    if (!floorIds.has(o.data.level.toLowerCase()))
      issues[i] = { id: o.id, issue: 'level_not_found' };
  });

  const found = issues.filter((x): x is ObjectIssue => x !== null);
  if (found.length > 0) return { ok: false, issues: found };
  return { ok: true, document: { objects: parsed as ModelObject[] } };
}
