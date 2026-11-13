// EZD-234 Build (S03 Fixtures "click to place"; Q-0704 05-screens; AC-EZD-234-2, -3; vault/build/assumptions.md
// EZD-234): what the Fixtures panel has chosen and the one change a click places. A fixture takes the panel's width,
// depth and facing; a utility point links to the appliance whose outline holds the click, if any. Both take the
// status new objects take today (EZD-214 brings the view's status). Pure.
// EZD-226 Build (AC-EZD-226-1, -2; vault/build/assumptions.md EZD-226): a custom tile shower is a third choice; it
// places a `tile_shower` centred on the click.
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PAN_SLOPE_IN_PER_FT,
  parseStoredObject,
  type FixtureKind,
  type ModelObject,
  type ObjectStatus,
  type Point,
  type UtilityKind,
} from '@ezdraft/geometry';
import type { Change } from '../model/patches';
import {
  FIXTURE_DEFAULT_SIZES,
  fixtureAt,
  newFixtureData,
  newTileShowerData,
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
    };

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

// The status new objects take until the Existing / Proposed switch (EZD-214) exists, as the wall tool does.
export const NEW_OBJECT_STATUS: ObjectStatus = 'existing';

// A fixture kind starts at its default size, facing down.
export function fixtureChoice(kind: FixtureKind): FixtureChoice {
  const size = FIXTURE_DEFAULT_SIZES[kind];
  return { type: 'fixture', kind, width: size.width, depth: size.depth, facing: 'down' };
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
  ctx: { level: string; objects: readonly ModelObject[]; newId: () => string },
): Change | null {
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
          status: NEW_OBJECT_STATUS,
          level: ctx.level,
        })
      : choice.type === 'fixture'
        ? newFixtureData({
            kind: choice.kind,
            center: at,
            facing: choice.facing,
            width: choice.width,
            depth: choice.depth,
            status: NEW_OBJECT_STATUS,
            level: ctx.level,
          })
        : newUtilityPointData({
            kind: choice.kind,
            point: at,
            status: NEW_OBJECT_STATUS,
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
