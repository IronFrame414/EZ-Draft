// EZD-204a O1-O6 (vault/plans/EZD-204a.md sections 3, 4; AC-EZD-204-5, -6, -10, -14, -15): opening data v4, the
// v3 to v4 step, new openings and flips. Expected values: plan Decided "Opening v4" (Q-0630 rows 4, 14, 38; Q-0633
// G11; Q-0640 rows 2, 7), "v3 → v4 step" (Q-0642 row 2; Q-0641 row 3; 03b rule 5; samples/v3.json values),
// "createOpeningData" and "autoRoughOpening" (Q-0630 question 1 row 3, row 6), "Flips" (Q-0630 row 4; Q-0633 G6),
// "isOpeningFlagged" (Q-0630 row 5) and "isVerticalLine / leftEndIsLow" (Q-0641 row 1; Q-0642 row 3; 03g 1/64").
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  migrateStoredObject,
  openingDataSchema,
  parseStoredObject,
  SHUTTER_TYPES,
  type StoredObject,
} from '../schema';
import v1 from '../schema/samples/v1.json';
import v3 from '../schema/samples/v3.json';
import v4 from '../schema/samples/v4.json';
import { deepFreeze, ID, LEVEL_1, roomWalls } from '../walls/test-utils/fixtures';
import {
  autoRoughOpening,
  createOpeningData,
  flipHand,
  flipSwing,
  isOpeningFlagged,
  isVerticalLine,
  leftEndIsLow,
  type OpeningObject,
} from './opening';

type Rec = Record<string, unknown>;
type Doc = { objects: StoredObject[] };

const V1 = (v1 as unknown as Doc).objects;
const V3 = (v3 as unknown as Doc).objects;
const V4 = (v4 as unknown as Doc).objects;

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// The Floor 1 door and window of a sample (the first floor by `order`).
function floor1Opening(objects: StoredObject[], kind: 'door' | 'window'): StoredObject {
  const floor1 = objects.find((o) => o.type === 'floor' && (o.data as Rec).name === 'Floor 1');
  if (!floor1) throw new Error('sample has no Floor 1');
  const found = objects.find(
    (o) =>
      o.type === 'opening' &&
      (o.data as Rec).level === floor1.id &&
      ((o.data as { attributes: Rec }).attributes.kind as string) === kind,
  );
  if (!found) throw new Error(`sample has no Floor 1 ${kind}`);
  return copy(found);
}

type OpeningJson = { geometry: Rec; attributes: Rec } & Rec;

// A copy of the v4 Floor 1 opening with `change` applied to a fresh copy of its data.
function v4With(kind: 'door' | 'window', change: (d: OpeningJson) => void): StoredObject {
  const obj = floor1Opening(V4, kind);
  change(obj.data as OpeningJson);
  return obj;
}

const expectRefused = (obj: StoredObject) =>
  expect(parseStoredObject(obj)).toEqual({
    ok: false,
    issue: { id: obj.id, issue: 'invalid_data' },
  });

describe('EZD-204a opening data v4', () => {
  it('EZD-204a O1 schema accepts v4 doors and windows', () => {
    const accepted: StoredObject[] = [
      floor1Opening(V4, 'door'),
      floor1Opening(V4, 'window'),
      v4With('door', (d) => {
        d.attributes.impactRating = 'shutter';
        d.attributes.shutterType = null;
      }),
      ...SHUTTER_TYPES.map((t) =>
        v4With('door', (d) => {
          d.attributes.impactRating = 'shutter';
          d.attributes.shutterType = t;
        }),
      ),
      v4With('door', (d) => {
        d.attributes.impactRating = 'impact_rated';
      }),
      v4With('window', (d) => {
        d.geometry.hostWallId = null;
        d.geometry.axis = { x: 0, y: 1 };
      }),
      v4With('window', (d) => {
        d.attributes.sillHeight = 0;
      }),
    ];
    expect(SHUTTER_TYPES).toHaveLength(5);
    for (const obj of accepted) {
      expect(obj.schema_version).toBe(4);
      expect(parseStoredObject(obj).ok).toBe(true);
    }
  });

  it('EZD-204a O2 schema refuses bad openings', () => {
    const refused: StoredObject[] = [
      v4With('door', (d) => {
        d.attributes.swing = null;
      }),
      v4With('door', (d) => {
        d.attributes.hand = null;
      }),
      v4With('window', (d) => {
        d.attributes.swing = 'left';
      }),
      v4With('window', (d) => {
        d.attributes.hand = 'right';
      }),
      v4With('door', (d) => {
        d.attributes.swing = 'up';
      }),
      v4With('door', (d) => {
        d.attributes.impactRating = 'rated';
      }),
      v4With('door', (d) => {
        d.attributes.shutterType = 'accordion';
        d.attributes.impactRating = 'not_rated';
      }),
      v4With('door', (d) => {
        d.attributes.shutterType = 'awning';
      }),
      v4With('door', (d) => {
        d.attributes.roughOpeningMode = 'manual';
      }),
      v4With('door', (d) => {
        d.geometry.axis = { x: 1, y: 0 };
      }),
      v4With('door', (d) => {
        d.geometry.hostWallId = null;
        d.geometry.axis = { x: 1, y: 1 };
      }),
      v4With('door', (d) => {
        delete d.attributes.impactRating;
      }),
      v4With('door', (d) => {
        d.attributes.width = 0;
      }),
      v4With('door', (d) => {
        (d.attributes.roughOpening as Rec).height = 0;
      }),
      v4With('door', (d) => {
        d.attributes.sillHeight = -1;
      }),
    ];
    expect(refused).toHaveLength(15);
    for (const obj of refused) expectRefused(obj);
  });

  it('EZD-204a O3 v3 openings upgrade on read and the input is not changed', () => {
    const v3Door = floor1Opening(V3, 'door');
    const v3Window = floor1Opening(V3, 'window');
    const door = deepFreeze(copy(v3Door));
    const win = deepFreeze(copy(v3Window));
    const nullData = deepFreeze({ ...copy(v3Door), data: null });

    const upgraded = (o: StoredObject, swingHand: 'left' | null): StoredObject => {
      const data = o.data as OpeningJson;
      return {
        id: o.id,
        type: 'opening',
        schema_version: 4,
        data: {
          ...data,
          geometry: { ...data.geometry, axis: null },
          attributes: {
            ...data.attributes,
            swing: swingHand,
            hand: swingHand,
            impactRating: 'not_rated',
            shutterType: null,
            roughOpeningMode: 'typed',
          },
        },
      };
    };

    const mDoor = migrateStoredObject(door);
    expect(mDoor).toEqual(upgraded(v3Door, 'left'));
    expect((mDoor?.data as OpeningJson).attributes.roughOpening).toEqual({ width: 38, height: 82 });
    const mWindow = migrateStoredObject(win);
    expect(mWindow).toEqual(upgraded(v3Window, null));
    expect((mWindow?.data as OpeningJson).attributes.roughOpening).toEqual({
      width: 38,
      height: 50,
    });
    expect(parseStoredObject(door).ok).toBe(true);
    expect(parseStoredObject(win).ok).toBe(true);

    const mNull = migrateStoredObject(nullData);
    expect(mNull?.schema_version).toBe(4);
    expect(mNull?.data).toBeNull();

    expect(door).toEqual(v3Door);
    expect(win).toEqual(v3Window);
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(V3.map((o) => migrateStoredObject(o))).toEqual(V4);
    expect(V1.map((o) => migrateStoredObject(o))).toEqual(V4);
  });

  it('EZD-204a done when: new openings are Existing with the Q-0630 sizes', () => {
    const [w1] = roomWalls(144, 120);
    const doorData = createOpeningData({ kind: 'door', host: w1, center: { x: 72, y: 0 } });
    const expectedDoor = {
      geometry: { center: { x: 72, y: 0 }, hostWallId: ID.W1, axis: null },
      status: 'existing',
      level: LEVEL_1,
      attributes: {
        kind: 'door',
        width: 36,
        height: 80,
        roughOpening: { width: 38, height: 82.5 },
        sillHeight: 0,
        swing: 'left',
        hand: 'left',
        impactRating: 'not_rated',
        shutterType: null,
        roughOpeningMode: 'auto',
      },
    };
    expect(doorData).toEqual(expectedDoor);
    expect(doorData.attributes).not.toHaveProperty('number');

    const rightDoor = createOpeningData({
      kind: 'door',
      host: w1,
      center: { x: 72, y: 0 },
      swing: 'right',
    });
    expect(rightDoor).toEqual({
      ...expectedDoor,
      attributes: { ...expectedDoor.attributes, swing: 'right' },
    });
    expect(rightDoor.attributes).not.toHaveProperty('number');

    const windowData = createOpeningData({
      kind: 'window',
      host: w1,
      center: { x: 72, y: 0 },
      swing: 'right',
    });
    expect(windowData).toEqual({
      geometry: { center: { x: 72, y: 0 }, hostWallId: ID.W1, axis: null },
      status: 'existing',
      level: LEVEL_1,
      attributes: {
        kind: 'window',
        width: 36,
        height: 48,
        roughOpening: { width: 36.5, height: 48.5 },
        sillHeight: 36,
        swing: null,
        hand: null,
        impactRating: 'not_rated',
        shutterType: null,
        roughOpeningMode: 'auto',
      },
    });
    expect(windowData.attributes).not.toHaveProperty('number');

    expect(autoRoughOpening('door', { width: 32, height: 80 })).toEqual({
      width: 34,
      height: 82.5,
    });
    expect(autoRoughOpening('window', { width: 24, height: 36 })).toEqual({
      width: 24.5,
      height: 36.5,
    });

    for (const data of [doorData, rightDoor, windowData]) {
      expect(openingDataSchema.safeParse(data).success).toBe(true);
    }
  });

  it('EZD-204a O5 flips change swing or hand only', () => {
    const [w1] = roomWalls(144, 120);
    const doorData = createOpeningData({ kind: 'door', host: w1, center: { x: 72, y: 0 } });
    const windowData = createOpeningData({ kind: 'window', host: w1, center: { x: 72, y: 0 } });
    const door: OpeningObject = deepFreeze({ id: ID.D1, type: 'opening', data: copy(doorData) });
    const win: OpeningObject = deepFreeze({ id: ID.N1, type: 'opening', data: copy(windowData) });
    const unhosted: OpeningObject = deepFreeze({
      id: ID.D1,
      type: 'opening',
      data: {
        ...copy(doorData),
        geometry: { ...doorData.geometry, hostWallId: null, axis: { x: 1, y: 0 } },
      },
    });
    const before = copy(door);

    const swung = flipSwing(door);
    expect(swung).toEqual({
      ...before,
      data: { ...before.data, attributes: { ...before.data.attributes, swing: 'right' } },
    });
    expect(flipSwing(swung as OpeningObject)).toEqual(before);

    const handed = flipHand(door);
    expect(handed).toEqual({
      ...before,
      data: { ...before.data, attributes: { ...before.data.attributes, hand: 'right' } },
    });
    expect(handed?.data.geometry.center).toEqual({ x: 72, y: 0 });
    expect(door).toEqual(before);

    expect(flipSwing(win)).toBeNull();
    expect(flipHand(win)).toBeNull();

    expect(isOpeningFlagged(door)).toBe(false);
    expect(isOpeningFlagged(unhosted)).toBe(true);
  });

  it('EZD-204a O6 left end and vertical walls', () => {
    expect(isVerticalLine({ start: { x: 0, y: 0 }, end: { x: 0, y: 120 } })).toBe(true);
    expect(isVerticalLine({ start: { x: 0, y: 0 }, end: { x: 0.015625, y: 120 } })).toBe(true);
    expect(isVerticalLine({ start: { x: 0, y: 0 }, end: { x: 0.03125, y: 120 } })).toBe(false);

    expect(leftEndIsLow({ x: 1, y: 0 }, false)).toBe(true);
    expect(leftEndIsLow({ x: -1, y: 0 }, false)).toBe(false);
    expect(leftEndIsLow({ x: 0, y: 1 }, true)).toBe(false);
    expect(leftEndIsLow({ x: 0, y: -1 }, true)).toBe(true);
  });
});
