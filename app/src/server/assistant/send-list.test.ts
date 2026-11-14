// EZD-5602 T2-T5 (vault/plans/EZD-5602.md section 1 step 10, Decided "D-Classify", "D-Projection", "D-Label",
// "D-Size", section 4; AC-EZD-5602-3, -4, -12, -13, -14). The send list: every stored data leaf is classified,
// the projection of packages/geometry/src/schema/samples/v4.json (EZD-204a) sends only the sent floor's shapes
// and sizes under refs, room labels pass only through the D-Label words, and the drawing size limit is 400,000
// characters (Q-0638 limits row). Expected values: the plan's D-Classify list, v4.json and the plan's T3-T5 rows.
import {
  floorDataSchema,
  OBJECT_TYPES,
  openingDataShape,
  parseStoredObject,
  roomDataSchema,
  wallDataSchema,
  type ModelObject,
  type StoredObject,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { F1, roomObj, uid } from '../../../../packages/geometry/src/rooms/test-utils/fixtures';
import v4 from '../../../../packages/geometry/src/schema/samples/v4.json';
import {
  buildSentDrawing,
  drawingTooLarge,
  PROJECTORS,
  SEND_CLASSIFICATION,
  sentRoomLabel,
} from './send-list';

// Test-local walker (plan T2): unwrap optional and nullable; an object goes into its shape; an array into its
// element with `[]`; anything else is a leaf. zod 4.6.7 keeps `.shape` on a refined object.
function schemaLeaves(prefix: string, schema: z.ZodType): string[] {
  let s: z.ZodType = schema;
  while (s instanceof z.ZodOptional || s instanceof z.ZodNullable) s = s.unwrap() as z.ZodType;
  if (s instanceof z.ZodObject) {
    return Object.entries(s.shape as Record<string, z.ZodType>).flatMap(([key, child]) =>
      schemaLeaves(`${prefix}.${key}`, child),
    );
  }
  if (s instanceof z.ZodArray) return schemaLeaves(`${prefix}[]`, s.element as z.ZodType);
  return [prefix];
}

const allLeaves = (): string[] => [
  ...schemaLeaves('floor', floorDataSchema),
  ...schemaLeaves('wall', wallDataSchema as unknown as z.ZodType),
  ...schemaLeaves('opening', openingDataShape),
  ...schemaLeaves('room', roomDataSchema),
];

// D-Classify: the 8 'never' keys, plus EZD-234's room floor level and photos; the other 36 are 'send'.
const NEVER = [
  'floor.name',
  'opening.geometry.axis.x',
  'opening.geometry.axis.y',
  'opening.attributes.roughOpeningMode',
  'room.closureOverride.who',
  'room.closureOverride.when',
  'room.closureOverride.gap.x',
  'room.closureOverride.gap.y',
  'room.attributes.floorLevel',
  'room.attributes.photos[]',
];

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-/i;

const F1_ID = '34234c39-7f4e-4f09-8b77-92e9c457f84b';
const F2_ID = '3917dda6-80b4-45ae-8bc0-59144aa66585';
const DOOR_ID = '05339e81-17bb-4a72-a80a-f0dba166d978';
const F2_WALL_ID = '5c32e94e-e652-43f5-844f-f635f1ff4cd1';

function sampleObjects(): ModelObject[] {
  return (v4.objects as StoredObject[]).map((o) => {
    const r = parseStoredObject(o);
    if (!r.ok) throw new Error(`v4.json object ${o.id} does not parse (${r.issue.issue})`);
    return r.object;
  });
}

function keysDeep(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysDeep(v, out);
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

const V4_LAYERS = [
  { material: 'drywall', thickness: 0.5 },
  { material: 'stud', thickness: 3.5 },
  { material: 'drywall', thickness: 0.5 },
];

describe('EZD-5602 send list', () => {
  it('T2 classification: every schema leaf is classified, nothing else is, and each object type has a projector', () => {
    const leaves = allLeaves();
    expect(leaves).toHaveLength(46);
    expect(new Set(leaves).size).toBe(46);
    expect(Object.keys(SEND_CLASSIFICATION).sort()).toEqual([...leaves].sort());
    const expected = Object.fromEntries(
      leaves.map((leaf) => [leaf, NEVER.includes(leaf) ? 'never' : 'send']),
    );
    expect({ ...SEND_CLASSIFICATION }).toEqual(expected);
    expect(Object.values(SEND_CLASSIFICATION).filter((v) => v === 'never')).toHaveLength(10);
    expect(leaves).toContain('wall.attributes.layers[].material');

    // A new stored field shows up unclassified.
    const probe = z.strictObject({ ...roomDataSchema.shape, secretPrice: z.number() });
    const unclassified = schemaLeaves('room', probe).filter((l) => !(l in SEND_CLASSIFICATION));
    expect(unclassified).toEqual(['room.secretPrice']);

    expect(Object.keys(PROJECTORS).sort()).toEqual([...OBJECT_TYPES].sort());
  });

  it('T3 projection of v4.json Floor 1: refs, shapes and sizes only, nothing of Floor 2 but its ref', () => {
    const objects = sampleObjects();
    const built = buildSentDrawing(objects, F1_ID, [DOOR_ID, F2_WALL_ID, crypto.randomUUID()]);
    expect(built).not.toBeNull();
    const { drawing, refs } = built!;

    expect(drawing.units).toBe('inches');
    expect(drawing.floor).toBe('f1');
    expect(drawing.floors).toEqual([
      { ref: 'f1', order: 1 },
      { ref: 'f2', order: 2 },
    ]);
    expect(drawing.walls.map((w: { ref: string }) => w.ref)).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(drawing.walls[1]).toEqual({
      ref: 'w2',
      floor: 'f1',
      start: { x: 0, y: 0 },
      end: { x: 120, y: 0 },
      status: 'new',
      thickness: 4.5,
      thicknessSide: 'right',
      height: 96,
      topCutToCeiling: false,
      bearing: false,
      layers: V4_LAYERS,
      number: null,
    });
    expect(drawing.openings).toEqual([
      {
        ref: 'o1',
        floor: 'f1',
        hostWall: 'w3',
        center: { x: 120, y: 48 },
        status: 'new',
        kind: 'window',
        width: 36,
        height: 48,
        roughOpening: { width: 38, height: 50 },
        sillHeight: 36,
        swing: null,
        hand: null,
        impactRating: 'not_rated',
        shutterType: null,
        number: null,
      },
      {
        ref: 'o2',
        floor: 'f1',
        hostWall: 'w2',
        center: { x: 60, y: 0 },
        status: 'new',
        kind: 'door',
        width: 36,
        height: 80,
        roughOpening: { width: 38, height: 82 },
        sillHeight: 0,
        swing: 'left',
        hand: 'left',
        impactRating: 'not_rated',
        shutterType: null,
        number: null,
      },
    ]);
    expect(drawing.rooms).toEqual([
      {
        ref: 'r1',
        floor: 'f1',
        status: 'existing',
        label: 'Kitchen',
        boundary: [
          { x: 0, y: 0 },
          { x: 120, y: 0 },
          { x: 120, y: 96 },
          { x: 0, y: 96 },
        ],
        areaSqFt: 80,
      },
    ]);
    expect(drawing.selected).toEqual(['o2']);

    expect(refs).toEqual({
      f1: F1_ID,
      f2: F2_ID,
      w1: '09b59d6e-533b-46c4-8bb8-16d36a317520',
      w2: 'aaf876ba-3f51-4bdc-a79b-74af4fe95f45',
      w3: 'dd95bb08-124b-4347-9069-a741a3766dc8',
      w4: 'f13937da-4cb2-441d-b2e5-53a53715307b',
      o1: '0236f1bd-ff22-4297-bdbb-98ec96f4ffae',
      o2: DOOR_ID,
      r1: '6a5bae36-e7f4-4459-a3b8-b1528fbd8a21',
    });

    const json = JSON.stringify(drawing);
    expect(UUID_RE.test(json)).toBe(false);
    expect(json).not.toContain('Floor 1');
    expect(json).not.toContain('Floor 2');
    const keys = keysDeep(drawing);
    for (const k of [
      'axis',
      'roughOpeningMode',
      'closureOverride',
      'level',
      'hostWallId',
      'id',
      'name',
    ])
      expect(keys.has(k), k).toBe(false);
    for (const list of [drawing.walls, drawing.openings, drawing.rooms])
      for (const o of list as { floor: string }[]) expect(o.floor).toBe('f1');
    expect(json).not.toContain('"w5"');
    expect(json).not.toContain('"o3"');
    expect(json).not.toContain('"r2"');

    expect(buildSentDrawing(objects, crypto.randomUUID(), [])).toBeNull();
  });

  it('T4 room labels: list words and numbers pass, anything else is Room n', () => {
    // The boundary is v4.json's Kitchen boundary (the label does not depend on it).
    const box = [
      { x: 0, y: 0 },
      { x: 120, y: 0 },
      { x: 120, y: 96 },
      { x: 0, y: 96 },
    ];
    const objects = [
      { id: F1, type: 'floor', data: { name: 'F', order: 1 } },
      roomObj(uid(1), box, 'Kitchen', F1),
      roomObj(uid(2), box, 'Primary bath 2', F1),
      roomObj(uid(3), box, 'Smith guest bath', F1),
    ] as ModelObject[];
    const built = buildSentDrawing(objects, F1, []);
    expect(built).not.toBeNull();
    expect(built!.drawing.rooms.map((r: { label: string }) => r.label)).toEqual([
      'Kitchen',
      'Primary bath 2',
      'Room 3',
    ]);

    expect(sentRoomLabel('KITCHEN', 4)).toBe('KITCHEN');
    expect(sentRoomLabel('L-kitchen 5x8', 4)).toBe('L-kitchen 5x8');
    for (const name of ['Kitchen,', 'Bath 2.5', '   ', 'Quixote $13,579 kitchen'])
      expect(sentRoomLabel(name, 4), name).toBe('Room 4');
  });

  it('T5 a drawing over 400,000 characters is too large', () => {
    expect(drawingTooLarge('x'.repeat(400_000))).toBe(false);
    expect(drawingTooLarge('x'.repeat(400_001))).toBe(true);
  });
});
