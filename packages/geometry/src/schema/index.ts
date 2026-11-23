// EZD-202 Build step 8 (vault/plans/EZD-202.md section 3 `schema/index.ts`, Decided "Document checks"; 03f
// Objects inside model_json; AC-EZD-202-1, -2, -5): the stored object and model document readers. Every reader
// of `model_object` rows or `model_version.model_json` parses through here.
// EZD-234 Build (Q-0704 03-data-model rows 1-3; AC-EZD-234-3, -4): the phase 10 types, and `fileRefs` for every
// type so the save check reads every source_file id a document holds.
// EZD-233: the `group` type (two or more member ids on one level); a new type, so the version stays.
// EZD-402: the cabinet types (run, box, filler, panel, corner treatment, open shelf, trim); new types, so the
// version stays.
// EZD-411: the `countertop_piece` type (outline and edges); a new type, so the version stays.
// EZD-733: the `tile_layout` type (pattern, tile size, joint, start point on a floor or a wall face); a new type, so
// the version stays.
// EZD-505: the `beam` type (a beam set on one room's ceiling); a new type, so the version stays.
// EZD-510: the `switch_zone` type (a switching zone on one room's ceiling, existing-details.ts); a new type too.
// EZD-513: the `ceiling_shape` (tray, coffer, crown) and `ceiling_tag` types (ceiling-shapes.ts); new types too.
// EZD-511: the `act_grid` type (an acoustical ceiling grid on one room's flat ceiling, act-grid.ts); a new type too.
// EZD-601: the `panel` and `circuit` types (S06 left panel); new types, so the version stays.
// EZD-726: the `sheet_set` type (03b rule 3); a new type, so the version stays. Like a floor it names no level.
// EZD-1009: the `design_option` type (03b rules 3 and 4); a new type, so the version stays. It names no level; each
// add or replace object in its delta is checked against its own type's schema and holds that object's file ids.
import { z } from 'zod';
import { actGridDataSchema, type ActGridData } from './act-grid';
import { beamDataSchema, type BeamData } from './beam';
import { blockingDataSchema, type BlockingData } from './blocking';
import {
  cabinetBoxDataSchema,
  cabinetCornerDataSchema,
  cabinetFillerDataSchema,
  cabinetPanelDataSchema,
  cabinetRunDataSchema,
  cabinetShelfDataSchema,
  cabinetTrimDataSchema,
  type CabinetBoxData,
  type CabinetCornerData,
  type CabinetFillerData,
  type CabinetPanelData,
  type CabinetRunData,
  type CabinetShelfData,
  type CabinetTrimData,
} from './cabinet';
import { circuitDataSchema, panelDataSchema, type CircuitData, type PanelData } from './electrical';
import { countertopPieceDataSchema, type CountertopPieceData } from './countertop';
import { designOptionDataSchema, type DesignOptionData } from './design-option';
import { engineerNoteDataSchema, type EngineerNoteData } from './engineer-note';
import {
  accessDataSchema,
  chaseDataSchema,
  deviceDataSchema,
  switchZoneDataSchema,
  hvacDataSchema,
  soffitDataSchema,
  type AccessData,
  type ChaseData,
  type DeviceData,
  type SwitchZoneData,
  type HvacData,
  type SoffitData,
} from './existing-details';
import {
  ceilingShapeDataSchema,
  ceilingTagDataSchema,
  type CeilingShapeData,
  type CeilingTagData,
} from './ceiling-shapes';
import { fixtureDataSchema, type FixtureData } from './fixture';
import { groupDataSchema, type GroupData } from './group';
import { pinDataSchema, type PinData } from './pin';
import { tileLayoutDataSchema, type TileLayoutData } from './tile-layout';
import { tileShowerDataSchema, type TileShowerData } from './tile-shower';
import { utilityPointDataSchema, type UtilityPointData } from './utility-point';
import { floorDataSchema, type FloorData } from './floor';
import { migrateStoredObject } from './migrate';
import { openingDataSchema, type OpeningData } from './opening';
import { roomDataSchema, type RoomData } from './room';
import { sheetSetDataSchema, type SheetSetData } from './sheet-set';
import { wallDataSchema, type WallData } from './wall';

export * from './act-grid';
export * from './beam';
export * from './blocking';
export * from './cabinet';
export * from './ceiling-shapes';
export * from './common';
export * from './countertop';
export * from './design-option';
export * from './electrical';
export * from './engineer-note';
export * from './existing-details';
export * from './fixture';
export * from './floor';
export * from './group';
export * from './pin';
export * from './tile-layout';
export * from './tile-shower';
export * from './utility-point';
export * from './migrate';
export * from './opening';
export * from './room';
export * from './sheet-set';
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
  'cabinet_run',
  'cabinet_box',
  'cabinet_filler',
  'cabinet_panel',
  'cabinet_corner',
  'cabinet_shelf',
  'cabinet_trim',
  'countertop_piece',
  'tile_layout',
  'beam',
  'panel',
  'circuit',
  'sheet_set',
  'design_option',
  'switch_zone',
  'ceiling_shape',
  'ceiling_tag',
  'act_grid',
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
  cabinet_run: CabinetRunData;
  cabinet_box: CabinetBoxData;
  cabinet_filler: CabinetFillerData;
  cabinet_panel: CabinetPanelData;
  cabinet_corner: CabinetCornerData;
  cabinet_shelf: CabinetShelfData;
  cabinet_trim: CabinetTrimData;
  countertop_piece: CountertopPieceData;
  tile_layout: TileLayoutData;
  beam: BeamData;
  panel: PanelData;
  circuit: CircuitData;
  sheet_set: SheetSetData;
  design_option: DesignOptionData;
  switch_zone: SwitchZoneData;
  ceiling_shape: CeilingShapeData;
  ceiling_tag: CeilingTagData;
  act_grid: ActGridData;
};
export type ModelObject = {
  [T in ObjectType]: { id: string; type: T; data: DataByType[T] };
}[ObjectType];

// The types that sit on no floor: floors themselves, the project's sheet sets (EZD-726) and its design options
// (EZD-1009). Every other object names its floor in `data.level`.
export type LevelObject = Exclude<ModelObject, { type: 'floor' | 'sheet_set' | 'design_option' }>;
export const hasLevel = (o: ModelObject): o is LevelObject =>
  o.type !== 'floor' && o.type !== 'sheet_set' && o.type !== 'design_option';

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

const isObjectType = (type: string): type is ObjectType =>
  (OBJECT_TYPES as readonly string[]).includes(type);

// EZD-1009: an add or replace object in a design option's delta is any other type, checked by that type's schema.
// Read lazily, as DATA_SCHEMAS is declared below.
const patchObjectsValid = (d: DesignOptionData): boolean =>
  d.modelDelta.every(
    (p) =>
      p.op === 'remove' ||
      (isObjectType(p.object.type) &&
        p.object.type !== 'design_option' &&
        DATA_SCHEMAS[p.object.type].safeParse(p.object.data).success),
  );

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
  cabinet_run: cabinetRunDataSchema,
  cabinet_box: cabinetBoxDataSchema,
  cabinet_filler: cabinetFillerDataSchema,
  cabinet_panel: cabinetPanelDataSchema,
  cabinet_corner: cabinetCornerDataSchema,
  cabinet_shelf: cabinetShelfDataSchema,
  cabinet_trim: cabinetTrimDataSchema,
  countertop_piece: countertopPieceDataSchema,
  tile_layout: tileLayoutDataSchema,
  beam: beamDataSchema,
  panel: panelDataSchema,
  circuit: circuitDataSchema,
  sheet_set: sheetSetDataSchema,
  design_option: designOptionDataSchema.refine(patchObjectsValid),
  switch_zone: switchZoneDataSchema,
  ceiling_shape: ceilingShapeDataSchema,
  ceiling_tag: ceilingTagDataSchema,
  act_grid: actGridDataSchema,
};

// A source_file id held in an object, with the source_file kinds that field accepts. An empty `kinds` refuses
// every id. EZD-215 (Q-0704 row 3): the engineer letter takes its own kind, engineer_letter.
export type FileRef = { fileId: string; kinds: readonly string[] };

const none = (): FileRef[] => [];
const PHOTO_KINDS = ['photo'] as const;
const LETTER_KINDS = ['engineer_letter'] as const;
const PANEL_PHOTO_KINDS = ['panel_photo'] as const;

// Mapped over every type, so a new type cannot be added without saying which file ids it holds.
const FILE_REFS: { [T in ObjectType]: (data: DataByType[T]) => FileRef[] } = {
  floor: none,
  wall: none,
  opening: none,
  room: (d) => d.attributes.photos.map((fileId) => ({ fileId, kinds: PHOTO_KINDS })),
  engineer_note: (d) =>
    d.attributes.fileId === null ? [] : [{ fileId: d.attributes.fileId, kinds: LETTER_KINDS }],
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
  cabinet_run: none,
  cabinet_box: none,
  cabinet_filler: none,
  cabinet_panel: none,
  cabinet_corner: none,
  cabinet_shelf: none,
  cabinet_trim: none,
  countertop_piece: none,
  tile_layout: none,
  beam: none,
  // EZD-606: the label photo, a panel_photo source_file.
  panel: (d) =>
    d.attributes.labelPhoto === undefined || d.attributes.labelPhoto === null
      ? []
      : [{ fileId: d.attributes.labelPhoto, kinds: PANEL_PHOTO_KINDS }],
  circuit: none,
  sheet_set: none,
  // EZD-1009: the file ids of every add or replace object, so a patch cannot carry an id the save check never reads.
  // Each add or replace object has passed its own type's schema with the option (patchObjectsValid).
  design_option: (d) =>
    d.modelDelta.flatMap((p) => (p.op === 'remove' ? [] : fileRefs(p.object as ModelObject))),
  switch_zone: none,
  ceiling_shape: none,
  ceiling_tag: none,
  act_grid: none,
};

export function fileRefs(object: ModelObject): FileRef[] {
  return (FILE_REFS[object.type] as (data: unknown) => FileRef[])(object.data);
}

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
    if (o === null || !hasLevel(o) || issues[i] !== null) return;
    if (!floorIds.has(o.data.level.toLowerCase()))
      issues[i] = { id: o.id, issue: 'level_not_found' };
  });

  const found = issues.filter((x): x is ObjectIssue => x !== null);
  if (found.length > 0) return { ok: false, issues: found };
  return { ok: true, document: { objects: parsed as ModelObject[] } };
}
