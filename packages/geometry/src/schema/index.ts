// EZD-202 Build step 8 (vault/plans/EZD-202.md section 3 `schema/index.ts`, Decided "Document checks"; 03f
// Objects inside model_json; AC-EZD-202-1, -2, -5): the stored object and model document readers. Every reader
// of `model_object` rows or `model_version.model_json` parses through here.
// EZD-234 Build (Q-0704 03-data-model rows 1-3; AC-EZD-234-3, -4): the phase 10 types, and `fileRefs` for every
// type so the save check reads every source_file id a document holds.
// EZD-233: the `group` type (two or more member ids on one level); a new type, so the version stays.
import { z } from 'zod';
import { blockingDataSchema, type BlockingData } from './blocking';
import { engineerNoteDataSchema, type EngineerNoteData } from './engineer-note';
import {
  accessDataSchema,
  chaseDataSchema,
  deviceDataSchema,
  hvacDataSchema,
  soffitDataSchema,
  type AccessData,
  type ChaseData,
  type DeviceData,
  type HvacData,
  type SoffitData,
} from './existing-details';
import { fixtureDataSchema, type FixtureData } from './fixture';
import { groupDataSchema, type GroupData } from './group';
import { pinDataSchema, type PinData } from './pin';
import { tileShowerDataSchema, type TileShowerData } from './tile-shower';
import { utilityPointDataSchema, type UtilityPointData } from './utility-point';
import { floorDataSchema, type FloorData } from './floor';
import { migrateStoredObject } from './migrate';
import { openingDataSchema, type OpeningData } from './opening';
import { roomDataSchema, type RoomData } from './room';
import { wallDataSchema, type WallData } from './wall';

export * from './blocking';
export * from './common';
export * from './engineer-note';
export * from './existing-details';
export * from './fixture';
export * from './floor';
export * from './group';
export * from './pin';
export * from './tile-shower';
export * from './utility-point';
export * from './migrate';
export * from './opening';
export * from './room';
export * from './wall';

export const OBJECT_TYPES = [
  'floor',
  'wall',
  'opening',
  'room',
  'engineer_note',
  'fixture',
  'utility_point',
  'pin',
  'tile_shower',
  'blocking',
  'hvac',
  'device',
  'access',
  'soffit',
  'chase',
  'group',
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export type StoredObject = { id: string; type: string; schema_version: number; data: unknown };

type DataByType = {
  floor: FloorData;
  wall: WallData;
  opening: OpeningData;
  room: RoomData;
  engineer_note: EngineerNoteData;
  fixture: FixtureData;
  utility_point: UtilityPointData;
  pin: PinData;
  tile_shower: TileShowerData;
  blocking: BlockingData;
  hvac: HvacData;
  device: DeviceData;
  access: AccessData;
  soffit: SoffitData;
  chase: ChaseData;
  group: GroupData;
};
export type ModelObject = {
  [T in ObjectType]: { id: string; type: T; data: DataByType[T] };
}[ObjectType];

export type ObjectIssueCode =
  | 'invalid_document'
  | 'invalid_data'
  | 'unknown_type'
  | 'unknown_schema_version'
  | 'duplicate_id'
  | 'level_not_found'
  | 'override_other_user'
  | 'file_not_found';
export type ObjectIssue = { id: string; issue: ObjectIssueCode };

export type ModelDocument = { objects: ModelObject[] };

const DATA_SCHEMAS: { [T in ObjectType]: z.ZodType<DataByType[T]> } = {
  floor: floorDataSchema,
  wall: wallDataSchema,
  opening: openingDataSchema,
  room: roomDataSchema,
  engineer_note: engineerNoteDataSchema,
  fixture: fixtureDataSchema,
  utility_point: utilityPointDataSchema,
  pin: pinDataSchema,
  tile_shower: tileShowerDataSchema,
  blocking: blockingDataSchema,
  hvac: hvacDataSchema,
  device: deviceDataSchema,
  access: accessDataSchema,
  soffit: soffitDataSchema,
  chase: chaseDataSchema,
  group: groupDataSchema,
};

// A source_file id held in an object, with the source_file kinds that field accepts. An empty `kinds` refuses
// every id: the engineer letter's own kind arrives with EZD-215 (Q-0704 row 3).
export type FileRef = { fileId: string; kinds: readonly string[] };

const none = (): FileRef[] => [];
const PHOTO_KINDS = ['photo'] as const;

// Mapped over every type, so a new type cannot be added without saying which file ids it holds.
const FILE_REFS: { [T in ObjectType]: (data: DataByType[T]) => FileRef[] } = {
  floor: none,
  wall: none,
  opening: none,
  room: (d) => d.attributes.photos.map((fileId) => ({ fileId, kinds: PHOTO_KINDS })),
  engineer_note: (d) =>
    d.attributes.fileId === null ? [] : [{ fileId: d.attributes.fileId, kinds: [] }],
  fixture: none,
  utility_point: none,
  pin: (d) =>
    d.attributes.photoFileId === null
      ? []
      : [{ fileId: d.attributes.photoFileId, kinds: PHOTO_KINDS }],
  tile_shower: none,
  blocking: none,
  hvac: none,
  device: none,
  access: none,
  soffit: none,
  chase: none,
  group: none,
};

export function fileRefs(object: ModelObject): FileRef[] {
  return (FILE_REFS[object.type] as (data: unknown) => FileRef[])(object.data);
}

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
