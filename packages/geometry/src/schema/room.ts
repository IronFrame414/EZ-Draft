// EZD-202 Build step 6 (vault/plans/EZD-202.md section 3 `roomDataSchema`): the stored room.
// EZD-205a Build step 1 (vault/plans/EZD-205a.md section 3 `roomDataSchema`, Decided "Room data shape",
// "closureOverride"; Q-0568; Q-0570): a room holds its status and its closure override; `gap` is the miss vector in
// inches from the chain's last wall end to its first wall start.
// EZD-218 (03 Q-0664 "Rooms gain …"; S15h; S05; AC-EZD-218-4, -6): schema version 6 adds the room type, the floor
// finish (free text until EZD-1611a) and the ceiling type.
// EZD-234 Build (Q-0704 03-data-model row 1 "Room gains floorLevel (signed inches, default 0) and photos
// (source_file ids)"; 03b rule 5): schema version 5 adds both to the room's attributes.
// EZD-501 (S05 Data shown "Room ceilings: type, ridge line and direction, heights per wall or point, pitch"; 03f
// rooms "ceiling heights by point or pitch"; phase-05 EZD-501 "default flat at wall height"; AC-EZD-501-1): schema
// version 7 adds `attributes.ceiling`; null is a flat ceiling at the room's wall height.
import * as z from 'zod/mini';
import { levelSchema, objectStatusSchema, pointSchema } from './common';

export const ROOM_TYPES = ['kitchen', 'bath', 'laundry', 'other'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const CEILING_TYPES = ['flat', 'single_slope', 'vaulted', 'tray', 'coffered'] as const;
export type CeilingType = (typeof CEILING_TYPES)[number];

// EZD-501: which input the ceiling heights come from (S05 Change ceiling "heights per wall or per point, or pitch").
export const CEILING_HEIGHTS_BY = ['wall', 'point', 'pitch'] as const;
export type CeilingHeightsBy = (typeof CEILING_HEIGHTS_BY)[number];

// Heights are inches above the room's finished floor; pitch is rise in inches per 12" of run (S05 "9.4/12").
const ceilingHeightSchema = z.number().check(z.positive());

export const ceilingRidgeSchema = z
  .strictObject({ start: pointSchema, end: pointSchema, height: ceilingHeightSchema })
  .check(z.refine((r) => r.start.x !== r.end.x || r.start.y !== r.end.y));

export const roomCeilingSchema = z.strictObject({
  heightsBy: z.enum(CEILING_HEIGHTS_BY),
  wallHeights: z
    .array(z.strictObject({ wall: z.uuid(), height: ceilingHeightSchema }))
    .check(z.refine((rows) => new Set(rows.map((r) => r.wall.toLowerCase())).size === rows.length)),
  pointHeights: z.array(z.strictObject({ at: pointSchema, height: ceilingHeightSchema })),
  pitch: z.nullable(z.number().check(z.positive())),
  // The ridge line, start to end, gives the ridge direction; for a single slope it is the high edge.
  ridge: z.nullable(ceilingRidgeSchema),
});
export type RoomCeiling = z.infer<typeof roomCeilingSchema>;

// EZD-514 (S05 Controls "Framing known | Inspector, when a ceiling is selected | Choose Unknown / New construction / Full
// demo / Enter locations. Enter locations: draw joist or beam lines with direction and spacing. Turns keep-clear checks
// on."; S05 Decision 5; S05 Validation "Keep-clear warning when a can lands on a joist or beam"; vault/build/
// assumptions.md EZD-514): how the room's ceiling framing is known, and the joist or beam lines drawn on it. A line
// runs start to end (its direction); with a spacing it repeats parallel across the room at that spacing on center.
// Optional, so every stored room stays valid and the version stays; absent reads as Unknown with no lines.
export const FRAMING_KNOWN = ['unknown', 'new_construction', 'full_demo', 'entered'] as const;
export type FramingKnown = (typeof FRAMING_KNOWN)[number];
export const FRAMING_MEMBER_KINDS = ['joist', 'beam'] as const;
export type FramingMemberKind = (typeof FRAMING_MEMBER_KINDS)[number];

export const framingLineSchema = z
  .strictObject({
    kind: z.enum(FRAMING_MEMBER_KINDS),
    start: pointSchema,
    end: pointSchema,
    spacing: z.nullable(z.number().check(z.positive())),
  })
  .check(z.refine((l) => l.start.x !== l.end.x || l.start.y !== l.end.y));
export type FramingLine = z.infer<typeof framingLineSchema>;

export const roomFramingSchema = z.strictObject({
  known: z.enum(FRAMING_KNOWN),
  lines: z.array(framingLineSchema),
});
export type RoomFraming = z.infer<typeof roomFramingSchema>;

export const closureOverrideSchema = z.strictObject({
  who: z.uuid(),
  when: z.iso.datetime(),
  gap: pointSchema,
});
export type ClosureOverride = z.infer<typeof closureOverrideSchema>;

export const roomDataSchema = z.strictObject({
  geometry: z.strictObject({ boundary: z.array(pointSchema).check(z.minLength(3)) }),
  status: objectStatusSchema,
  level: levelSchema,
  attributes: z.strictObject({
    name: z.string().check(z.minLength(1)),
    floorLevel: z.number(),
    photos: z.array(z.uuid()),
    roomType: z.nullable(z.enum(ROOM_TYPES)),
    floorFinish: z.string(),
    ceilingType: z.nullable(z.enum(CEILING_TYPES)),
    ceiling: z.nullable(roomCeilingSchema),
    // EZD-514: absent is Unknown.
    framing: z.optional(roomFramingSchema),
  }),
  closureOverride: z.nullable(closureOverrideSchema),
});
export type RoomData = z.infer<typeof roomDataSchema>;

// EZD-234 Build: every room maker builds its attributes here, so a new room field reaches every maker.
export function newRoomAttributes(name: string): RoomData['attributes'] {
  return {
    name,
    floorLevel: 0,
    photos: [],
    roomType: null,
    floorFinish: '',
    ceilingType: null,
    ceiling: null,
  };
}

// EZD-501 "default flat at wall height": a room with no ceiling type is flat, and with no stored ceiling its
// height is the wall height.
export function roomCeilingType(
  attributes: Pick<RoomData['attributes'], 'ceilingType'>,
): CeilingType {
  return attributes.ceilingType ?? 'flat';
}

/** EZD-514: the room's framing; absent reads as Unknown with no lines. */
export function roomFraming(attributes: Pick<RoomData['attributes'], 'framing'>): RoomFraming {
  return attributes.framing ?? { known: 'unknown', lines: [] };
}
