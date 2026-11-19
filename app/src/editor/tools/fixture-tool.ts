// EZD-234 Build (S03 Fixtures "click to place"; Q-0704 05-screens; AC-EZD-234-2, -3; vault/build/assumptions.md
// EZD-234): what the Fixtures panel has chosen and the one change a click places. A fixture takes the panel's width,
// depth and facing; a utility point links to the appliance whose outline holds the click, if any. Both take the
// status new objects take (EZD-214: the View's status through `ctx.status`). Pure.
// EZD-226 Build (AC-EZD-226-1, -2; vault/build/assumptions.md EZD-226): a custom tile shower is a third choice; it
// places a `tile_shower` centred on the click.
// EZD-227 Build (AC-EZD-227-1, -3; Q-0704; 09q Blocking): grab-bar blocking is a fourth choice. Its length and height to
// centre start empty (no default) and a click places it on the nearest wall, on the side clicked (placeBlocking).
// EZD-233: a saved group is a fifth choice, placed by the drawing controller through `placeSavedGroup`.
// EZD-220 (03f:16; Q-0704 03-data-model "pin ... status always existing"; AC-EZD-220-1): an existing-condition pin is a
// sixth choice. A click places a pin of the chosen kind with no photo; it is Existing whatever the View.
// EZD-229 (AC-EZD-229-2; Q-0704 03-data-model row 2; phase-02.md EZD-229 "as existing-status objects";
// vault/build/assumptions.md EZD-229): an existing detail is a seventh choice: a supply or return register (hvac), a
// smoke, CO or combination detector (device), an attic hatch (access), a soffit or a chase. A click places it at its
// starting size centred on the click; it is Existing whatever the View.
// EZD-731 (AC-EZD-731-1; phase-07 EZD-731; vault/research/R-012.md recommendation 5; vault/build/assumptions.md
// EZD-731): mechanical equipment and registers are an eighth choice: an air handler, a condenser, a supply or a return
// register (all `hvac`). A click places it at its starting size centred on the click, with the View's status.
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PAN_SLOPE_IN_PER_FT,
  parseStoredObject,
  type FixtureKind,
  type HvacKind,
  type ModelObject,
  type ObjectStatus,
  type PinKind,
  type Point,
  type UtilityKind,
} from '@ezdraft/geometry';
import type { SavedGroupPayload } from '../edit/arrange-changes';
import type { Change } from '../model/patches';
import {
  FIXTURE_DEFAULT_SIZES,
  fixtureAt,
  newFixtureData,
  newTileShowerData,
  placeBlocking,
  newUtilityPointData,
  type FixtureFacing,
} from './fixture-geometry';

export type FixtureChoice =
  | { type: 'fixture'; kind: FixtureKind; width: number; depth: number; facing: FixtureFacing }
  | { type: 'utility'; kind: UtilityKind; volts: 120 | 240; amps: number }
  | {
      type: 'tile_shower';
      width: number;
      depth: number;
      facing: FixtureFacing;
      curb: { height: number; width: number } | null;
      nicheCount: number;
      niche: { width: number; height: number; bottomHeight: number };
      bench: { width: number; depth: number; height: number } | null;
      glass: { type: 'fixed' | 'door'; length: number; swing: 'in' | 'out' } | null;
      drain: 'center' | 'linear';
      panSlope: number;
    }
  | { type: 'blocking'; length: number | null; heightToCenter: number | null }
  // EZD-233 (R26; AC-EZD-233-2): a saved group from the panel's Saved section; a click places a copy of it.
  | { type: 'saved_group'; id: string; name: string; payload: SavedGroupPayload }
  | { type: 'pin'; kind: PinKind }
  | { type: 'existing_detail'; detail: ExistingDetail }
  | { type: 'mechanical'; kind: HvacKind };

// EZD-229: the existing details, each named by the object type and kind it places.
export const EXISTING_DETAILS = [
  'supply',
  'return',
  'smoke_detector',
  'co_detector',
  'smoke_co_detector',
  'attic_hatch',
  'soffit',
  'chase',
] as const;
export type ExistingDetail = (typeof EXISTING_DETAILS)[number];

// Starting sizes, width x depth in inches, and the soffit's drop (vault/build/assumptions.md EZD-229).
export const EXISTING_DETAIL_SIZES = {
  supply: { width: 10, depth: 4 },
  return: { width: 20, depth: 20 },
  attic_hatch: { width: 22, depth: 30 },
  soffit: { width: 24, depth: 24 },
  chase: { width: 16, depth: 16 },
} as const;
export const SOFFIT_DROP_START_IN = 12;

// EZD-731: the mechanical kinds in panel order, equipment first, and their starting sizes, width x depth in inches
// (registers as the existing ones; vault/build/assumptions.md EZD-731).
export const MECHANICAL_KINDS = ['air_handler', 'condenser', 'supply', 'return'] as const satisfies readonly HvacKind[];
export const MECHANICAL_SIZES: Readonly<Record<HvacKind, { width: number; depth: number }>> = {
  air_handler: { width: 22, depth: 22 },
  condenser: { width: 30, depth: 30 },
  supply: EXISTING_DETAIL_SIZES.supply,
  return: EXISTING_DETAIL_SIZES.return,
};

export function mechanicalChoice(kind: HvacKind): FixtureChoice {
  return { type: 'mechanical', kind };
}

export function existingDetailChoice(detail: ExistingDetail): FixtureChoice {
  return { type: 'existing_detail', detail };
}

// Grab-bar blocking starts with its length and height to centre empty: both are required and have no default
// (Q-0704 09-calculations; 09q Blocking row 3).
export function blockingChoice(): FixtureChoice {
  return { type: 'blocking', length: null, heightToCenter: null };
}

// Starting sizes when a bench or glass is turned on in the panel (vault/build/assumptions.md EZD-226).
export const SHOWER_BENCH_START = { width: 24, depth: 15, height: 18 } as const;
export const SHOWER_GLASS_LENGTH_START = 30;

// A tile shower starts 60" x 36" (09q Tile shower row 1) with a 4" x 4" curb, no niches (12" x 24", 48" up when
// added), no bench, no glass, a center drain and the P-045 default pan slope, facing down
// (vault/build/assumptions.md EZD-226).
export function tileShowerChoice(): FixtureChoice {
  return {
    type: 'tile_shower',
    width: 60,
    depth: 36,
    facing: 'down',
    curb: { height: 4, width: 4 },
    nicheCount: 0,
    niche: { width: 12, height: 24, bottomHeight: 48 },
    bench: null,
    glass: null,
    drain: 'center',
    panSlope: DEFAULT_PAN_SLOPE_IN_PER_FT,
  };
}

// EZD-214: the status a placement takes when the caller gives none; the editor passes the View's status.
export const NEW_OBJECT_STATUS: ObjectStatus = 'existing';

// A fixture kind starts at its default size, facing down.
export function fixtureChoice(kind: FixtureKind): FixtureChoice {
  const size = FIXTURE_DEFAULT_SIZES[kind];
  return { type: 'fixture', kind, width: size.width, depth: size.depth, facing: 'down' };
}

// EZD-220: a pin of one kind.
export function pinChoice(kind: PinKind): FixtureChoice {
  return { type: 'pin', kind };
}

// A utility point starts at 120 V and 20 A when electric (vault/build/assumptions.md EZD-234).
export function utilityChoice(kind: UtilityKind): FixtureChoice {
  return { type: 'utility', kind, volts: 120, amps: 20 };
}

export const DEFAULT_FIXTURE_CHOICE: FixtureChoice = fixtureChoice('toilet');

// The change for one click, or null when the choice does not make a valid object (a size or amps not above 0).
export function placeFixture(
  choice: FixtureChoice,
  at: Point,
  ctx: {
    level: string;
    objects: readonly ModelObject[];
    newId: () => string;
    captureIn?: number;
    status?: ObjectStatus;
  },
): Change | null {
  if (choice.type === 'blocking') return placeBlockingChange(choice, at, ctx);
  if (choice.type === 'saved_group') return null;
  if (choice.type === 'pin') return placePin(choice.kind, at, ctx);
  if (choice.type === 'existing_detail') return placeExistingDetail(choice.detail, at, ctx);
  if (choice.type === 'mechanical') return placeMechanical(choice.kind, at, ctx);
  const status = ctx.status ?? NEW_OBJECT_STATUS;
  const id = ctx.newId();
  const type =
    choice.type === 'fixture'
      ? 'fixture'
      : choice.type === 'tile_shower'
        ? 'tile_shower'
        : 'utility_point';
  const data =
    choice.type === 'tile_shower'
      ? newTileShowerData({
          center: at,
          facing: choice.facing,
          width: choice.width,
          depth: choice.depth,
          curb: choice.curb,
          nicheCount: choice.nicheCount,
          niche: choice.niche,
          bench: choice.bench,
          glass: choice.glass,
          drain: choice.drain,
          panSlope: choice.panSlope,
          status,
          level: ctx.level,
        })
      : choice.type === 'fixture'
        ? newFixtureData({
            kind: choice.kind,
            center: at,
            facing: choice.facing,
            width: choice.width,
            depth: choice.depth,
            status,
            level: ctx.level,
          })
        : newUtilityPointData({
            kind: choice.kind,
            point: at,
            status,
            level: ctx.level,
            volts: choice.volts,
            amps: choice.amps,
            servesObjectId: fixtureAt(ctx.objects, at, ctx.level)?.id ?? null,
          });
  const parsed = parseStoredObject({ id, type, schema_version: CURRENT_SCHEMA_VERSION, data });
  if (!parsed.ok) return null;
  return {
    id,
    value: {
      type,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: parsed.object.data as unknown as Record<string, unknown>,
    },
  };
}

// EZD-227: the blocking a click places on the nearest wall within the capture, or null when its length or height is
// empty or not above 0, no wall is near, or it does not fit on the wall.
function placeBlockingChange(
  choice: Extract<FixtureChoice, { type: 'blocking' }>,
  at: Point,
  ctx: {
    level: string;
    objects: readonly ModelObject[];
    newId: () => string;
    captureIn?: number;
    status?: ObjectStatus;
  },
): Change | null {
  if (choice.length === null || choice.heightToCenter === null) return null;
  const data = placeBlocking({
    at,
    objects: ctx.objects,
    level: ctx.level,
    captureIn: ctx.captureIn ?? 0,
    length: choice.length,
    heightToCenter: choice.heightToCenter,
    status: ctx.status ?? NEW_OBJECT_STATUS,
  });
  if (data === null) return null;
  const id = ctx.newId();
  const parsed = parseStoredObject({
    id,
    type: 'blocking',
    schema_version: CURRENT_SCHEMA_VERSION,
    data,
  });
  if (!parsed.ok) return null;
  return {
    id,
    value: {
      type: 'blocking',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: parsed.object.data as unknown as Record<string, unknown>,
    },
  };
}

// EZD-220: a pin at the click, always Existing, with no photo yet (the photo is attached from its inspector once
// the upload has finished, so the save check never sees an unfinished file).
function placePin(kind: PinKind, at: Point, ctx: { level: string; newId: () => string }): Change | null {
  const id = ctx.newId();
  const data = {
    geometry: { point: { x: at.x, y: at.y } },
    status: 'existing',
    level: ctx.level,
    attributes: { kind, photoFileId: null },
  };
  const parsed = parseStoredObject({ id, type: 'pin', schema_version: CURRENT_SCHEMA_VERSION, data });
  if (!parsed.ok) return null;
  return {
    id,
    value: {
      type: 'pin',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: parsed.object.data as unknown as Record<string, unknown>,
    },
  };
}

// EZD-229: the object type and data of an existing detail centred on the click, always Existing.
export function existingDetailData(
  detail: ExistingDetail,
  at: Point,
  level: string,
): { type: 'hvac' | 'device' | 'access' | 'soffit' | 'chase'; data: Record<string, unknown> } {
  const base = { status: 'existing', level };
  const center = { x: at.x, y: at.y };
  const axis = { x: 1, y: 0 };
  const box = (width: number, depth: number) => [
    { x: at.x - width / 2, y: at.y - depth / 2 },
    { x: at.x + width / 2, y: at.y - depth / 2 },
    { x: at.x + width / 2, y: at.y + depth / 2 },
    { x: at.x - width / 2, y: at.y + depth / 2 },
  ];
  switch (detail) {
    case 'supply':
    case 'return':
      return {
        type: 'hvac',
        data: {
          ...base,
          geometry: { center, axis },
          attributes: { kind: detail, ...EXISTING_DETAIL_SIZES[detail] },
        },
      };
    case 'attic_hatch':
      return {
        type: 'access',
        data: {
          ...base,
          geometry: { center, axis },
          attributes: { kind: detail, ...EXISTING_DETAIL_SIZES.attic_hatch },
        },
      };
    case 'soffit': {
      const s = EXISTING_DETAIL_SIZES.soffit;
      return {
        type: 'soffit',
        data: {
          ...base,
          geometry: { boundary: box(s.width, s.depth) },
          attributes: { dropHeight: SOFFIT_DROP_START_IN },
        },
      };
    }
    case 'chase': {
      const s = EXISTING_DETAIL_SIZES.chase;
      return {
        type: 'chase',
        data: { ...base, geometry: { boundary: box(s.width, s.depth) }, attributes: {} },
      };
    }
    default:
      return { type: 'device', data: { ...base, geometry: { point: center }, attributes: { kind: detail } } };
  }
}

function placeExistingDetail(
  detail: ExistingDetail,
  at: Point,
  ctx: { level: string; newId: () => string },
): Change | null {
  const id = ctx.newId();
  const { type, data } = existingDetailData(detail, at, ctx.level);
  const parsed = parseStoredObject({ id, type, schema_version: CURRENT_SCHEMA_VERSION, data });
  if (!parsed.ok) return null;
  return {
    id,
    value: {
      type,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: parsed.object.data as unknown as Record<string, unknown>,
    },
  };
}

// EZD-731: the hvac object a click places for a mechanical kind, centred on the click, with the View's status.
export function mechanicalData(
  kind: HvacKind,
  at: Point,
  level: string,
  status: ObjectStatus,
): Record<string, unknown> {
  return {
    geometry: { center: { x: at.x, y: at.y }, axis: { x: 1, y: 0 } },
    status,
    level,
    attributes: { kind, ...MECHANICAL_SIZES[kind] },
  };
}

function placeMechanical(
  kind: HvacKind,
  at: Point,
  ctx: { level: string; newId: () => string; status?: ObjectStatus },
): Change | null {
  const id = ctx.newId();
  const data = mechanicalData(kind, at, ctx.level, ctx.status ?? NEW_OBJECT_STATUS);
  const parsed = parseStoredObject({ id, type: 'hvac', schema_version: CURRENT_SCHEMA_VERSION, data });
  if (!parsed.ok) return null;
  return {
    id,
    value: {
      type: 'hvac',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: parsed.object.data as unknown as Record<string, unknown>,
    },
  };
}
