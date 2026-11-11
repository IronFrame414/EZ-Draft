// EZD-207a U6, U7 (vault/plans/EZD-207a.md section 4; Decided "Drawing list", "Batches", "Colours"; AC-EZD-207-4, -9).
// Expected values: the plan's rows and the board colours (#7a828e, #9aa3af, oklch cobalt and red per U1), never the code.
import {
  CURRENT_SCHEMA_VERSION,
  buildDrawingList,
  createWallData,
  parseStoredObject,
  type DrawingItem,
  type DrawingList,
} from '@ezdraft/geometry';
import { describe, expect, test } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { buildPlanBatches, drawingBounds, openFloorId, planDrawingList } from './batches';
import { tokenRgb } from './color';

const F0 = '00000000-0000-4000-8000-000000000001';
const F1 = '00000000-0000-4000-8000-000000000002';
const F2 = '00000000-0000-4000-8000-000000000003';
const W1 = '00000000-0000-4000-8000-000000000011';
const W2 = '00000000-0000-4000-8000-000000000012';
const BOGUS = '00000000-0000-4000-8000-000000000021';

function wall(level: string): ObjectValue {
  const made = createWallData({ start: { x: 0, y: 0 }, end: { x: 120, y: 0 }, level });
  if (!made.ok) throw new Error('wall fixture');
  return {
    type: 'wall',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: made.data as unknown as Record<string, unknown>,
  };
}

const floor = (order: number): ObjectValue => ({
  type: 'floor',
  schemaVersion: CURRENT_SCHEMA_VERSION,
  data: { name: `Floor ${order}`, order },
});

function parsed(id: string, value: ObjectValue) {
  const r = parseStoredObject({
    id,
    type: value.type,
    schema_version: value.schemaVersion,
    data: value.data,
  });
  if (!r.ok) throw new Error('fixture does not parse');
  return r.object;
}

const p = (x: number, y: number) => ({ x, y });
const L = 'level-a';
const FX: DrawingList = {
  level: L,
  omitted: [],
  items: [
    { kind: 'line', layer: 'existing', objectId: 'o1', role: 'cut', from: p(0, 0), to: p(120, 0) },
    {
      kind: 'line',
      layer: 'existing',
      objectId: 'o1',
      role: 'cut',
      from: p(0, 4.5),
      to: p(120, 4.5),
    },
    {
      kind: 'fill',
      layer: 'existing',
      objectId: 'o1',
      points: [p(0, 0), p(120, 0), p(120, 4.5), p(0, 4.5)],
    },
    {
      kind: 'arc',
      layer: 'existing',
      objectId: 'o2',
      role: 'hidden',
      center: p(0, 0),
      radius: 36,
      startAngle: 0,
      endAngle: 90,
    },
    { kind: 'fill', layer: 'new', objectId: 'o3', points: [p(-10, -10), p(0, -10), p(0, 0)] },
    {
      kind: 'line',
      layer: 'demo',
      objectId: 'o4',
      role: 'beyond',
      from: p(0, -48),
      to: p(10, -48),
    },
    { kind: 'fill', layer: 'rooms', objectId: 'o5', points: [p(0, 0), p(10, 0), p(10, 10)] },
    {
      kind: 'hatch',
      layer: 'rooms',
      objectId: 'o5',
      role: 'beyond',
      segments: [
        { from: p(1, 1), to: p(2, 2) },
        { from: p(3, 3), to: p(4, 4) },
        { from: p(5, 5), to: p(6, 6) },
      ],
      boundary: [p(0, 0), p(10, 0), p(10, 10)],
    },
    {
      kind: 'line',
      layer: 'dimensions',
      objectId: 'o6',
      role: 'dimension',
      from: p(0, 30),
      to: p(120, 30),
    },
    {
      kind: 'text',
      layer: 'dimensions',
      objectId: 'o6',
      text: "10'",
      font: 'dm-mono-400',
      sizePt: 10.5,
      widthPt: 18,
      at: p(60, 30),
      rotationDeg: 0,
      align: 'center',
    },
  ] satisfies DrawingItem[],
};

const slate400 = { r: 0x7a / 255, g: 0x82 / 255, b: 0x8e / 255 };
const slate300 = { r: 0x9a / 255, g: 0xa3 / 255, b: 0xaf / 255 };
const cobalt = { r: 0.2122, g: 0.4211, b: 0.8278 };
const red = { r: 0.8567, g: 0.2621, b: 0.2234 };

describe('EZD-207a batches', () => {
  test('EZD-207a U6 the open floor is the lowest order (ties by id) and the list is that floor only', () => {
    const base = new Map<string, ObjectValue>([
      [F1, floor(1)],
      [F2, floor(2)],
      [W1, wall(F1)],
      [W2, wall(F2)],
      [BOGUS, { type: 'bogus', schemaVersion: 1, data: {} }],
    ]);
    expect(openFloorId(base)).toBe(F1);
    const expected = buildDrawingList(
      { objects: [parsed(F1, floor(1)), parsed(W1, wall(F1))] },
      { level: F1, dimensionTextPt: 10.5, roomHatch: null, roomLabelPt: 11.25 },
    );
    const list = planDrawingList(base);
    expect(list).toEqual(expected);
    expect(list!.items.some((i) => i.objectId === W2)).toBe(false);

    const noFloors = new Map<string, ObjectValue>([
      [W1, wall(F1)],
      [W2, wall(F2)],
      [BOGUS, { type: 'bogus', schemaVersion: 1, data: {} }],
    ]);
    expect(openFloorId(noFloors)).toBeNull();
    expect(planDrawingList(noFloors)).toBeNull();

    const tie = new Map<string, ObjectValue>([
      [F1, floor(1)],
      [F0, floor(1)],
    ]);
    expect(openFloorId(tie)).toBe(F0);
  });

  test('EZD-207a U7 one batch per layer and role in draw order, with the board colours and the drawing bounds', () => {
    const batches = buildPlanBatches(FX);
    expect(batches.map((b) => [b.key, b.positions.length / 3, b.kind, b.role, b.order])).toEqual([
      ['rooms:segments:beyond', 6, 'segments', 'beyond', 1],
      ['existing:fill', 6, 'fill', null, 2],
      ['new:fill', 3, 'fill', null, 2],
      ['demo:segments:beyond', 2, 'segments', 'beyond', 3],
      ['existing:segments:cut', 4, 'segments', 'cut', 3],
      ['existing:segments:hidden', 36, 'segments', 'hidden', 3],
      ['dimensions:segments:dimension', 2, 'segments', 'dimension', 4],
    ]);
    const colour = (key: string) => batches.find((b) => b.key === key)!.color;
    const expectedColour: Array<[string, { r: number; g: number; b: number }]> = [
      ['rooms:segments:beyond', slate300],
      ['existing:fill', slate400],
      ['new:fill', cobalt],
      ['demo:segments:beyond', red],
      ['existing:segments:cut', slate400],
      ['existing:segments:hidden', slate400],
      ['dimensions:segments:dimension', slate400],
    ];
    for (const [key, want] of expectedColour) {
      const got = colour(key);
      expect(Math.abs(got.r - want.r) <= 0.001, `${key} r`).toBe(true);
      expect(Math.abs(got.g - want.g) <= 0.001, `${key} g`).toBe(true);
      expect(Math.abs(got.b - want.b) <= 0.001, `${key} b`).toBe(true);
    }
    for (const b of batches) expect(b.positions).toBeInstanceOf(Float32Array);
    expect(drawingBounds(FX)).toEqual({ minX: -10, minY: -48, maxX: 120, maxY: 36 });
    expect(buildPlanBatches(null)).toEqual([]);
    expect(drawingBounds(null)).toBeNull();
  });
});

// EZD-204b B1 (vault/plans/EZD-204b.md sections 3, 4; Decided "Colour"; AC-EZD-204-4; `A/styles/tokens.css:17`).
describe('EZD-204b flagged layer', () => {
  test('EZD-204b B1 the flagged layer draws in error red', () => {
    const batches = buildPlanBatches({
      level: L,
      omitted: [],
      items: [
        {
          kind: 'line',
          layer: 'flagged',
          objectId: 'o9',
          role: 'cut',
          from: p(0, 0),
          to: p(36, 0),
        },
      ],
    });
    expect(batches).toHaveLength(1);
    const b = batches[0]!;
    expect([b.key, b.kind, b.layer, b.role, b.order]).toEqual([
      'flagged:segments:cut',
      'segments',
      'flagged',
      'cut',
      3,
    ]);
    expect(Math.abs(b.color.r - red.r) <= 0.001, 'r').toBe(true);
    expect(Math.abs(b.color.g - red.g) <= 0.001, 'g').toBe(true);
    expect(Math.abs(b.color.b - red.b) <= 0.001, 'b').toBe(true);
    expect(b.color).toEqual(tokenRgb('--ez-red'));
  });
});

// EZD-235 P1 (vault/plans/EZD-235.md section 4; step 7; 09j Room area row 1). Middle dot as its escape (L-042).
import { label } from '../derived/test-utils/two-room';
import { baseObjects, roomValue, uid as fixtureUid } from '../tools/test-utils/fixtures';

describe('EZD-235 planDrawingList options', () => {
  test('EZD-235 P1 planDrawingList passes its options to the drawing list', () => {
    const m = new Map([
      ...baseObjects(),
      [fixtureUid(10), roomValue([p(0, 0), p(144, 0), p(144, 120), p(0, 120)], 'Kitchen', null)],
    ]);
    expect(label(planDrawingList(m, { roomAreaSqFt: () => 7 }), fixtureUid(10))).toBe(
      'KITCHEN \u00b7 7 SF',
    );
    expect(label(planDrawingList(m), fixtureUid(10))).toBe('KITCHEN \u00b7 120 SF');
  });
});
