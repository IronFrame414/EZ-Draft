// EZD-234 Build (S03 Fixtures "click to place"; Q-0704 05-screens; AC-EZD-234-2, -3; vault/build/assumptions.md
// EZD-234): what the Fixtures panel has chosen and the one change a click places. A fixture takes the panel's width,
// depth and facing; a utility point links to the appliance whose outline holds the click, if any. Both take the
// status new objects take today (EZD-214 brings the view's status). Pure.
import {
  CURRENT_SCHEMA_VERSION,
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
  newUtilityPointData,
  type FixtureFacing,
} from './fixture-geometry';

export type FixtureChoice =
  | { type: 'fixture'; kind: FixtureKind; width: number; depth: number; facing: FixtureFacing }
  | { type: 'utility'; kind: UtilityKind; volts: 120 | 240; amps: number };

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
  const type = choice.type === 'fixture' ? 'fixture' : 'utility_point';
  const data =
    choice.type === 'fixture'
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
