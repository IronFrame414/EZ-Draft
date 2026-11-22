// EZD-502 (AC-EZD-502-1 "Both shows the RCP over a greyed floor plan"; S05 Controls "Floor / Ceiling / Both segment";
// S05 Layout "Canvas: RCP drawing"; S05 Data shown "ridge line and direction"; board S05Ceiling "RIDGE 13' 0"").
// Fixture: the 144 x 120 ROOM walls with a 36" door on the east wall (tools test-utils), and the room vaulted with
// a ridge at y = 60, 156" high (EZD-501 ceiling-sync values: S05 summary "ridge 13' 0""). No browser.
import {
  CURRENT_SCHEMA_VERSION,
  newRoomAttributes,
  type BeamData,
  type Point,
} from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { planDetailItems } from '../../lazy/room-fields/details-drawing';
import { planDrawingList } from '../plan/batches';
import { tokenRgb } from '../plan/color';
import { DOOR, F1, roomValue, uid } from '../tools/test-utils/fixtures';
import { dashes, GREYED_FLOOR_TOKEN, rcpList, rcpView } from './rcp';

const P = (x: number, y: number): Point => ({ x, y });
const ROOM_ID = uid(60);
const DOOR_ID = uid(50);

function vaulted(): Map<string, ObjectValue> {
  const objects = new Map(DOOR);
  const room = roomValue([P(0, 0), P(144, 0), P(144, 120), P(0, 120)], 'Family room', null);
  const data = room.data as { attributes: ReturnType<typeof newRoomAttributes> };
  data.attributes = {
    ...data.attributes,
    ceilingType: 'vaulted',
    ceiling: {
      heightsBy: 'pitch',
      wallHeights: [],
      pointHeights: [],
      pitch: 9.4,
      ridge: { start: P(0, 60), end: P(144, 60), height: 156 },
    },
  };
  objects.set(ROOM_ID, room);
  return objects;
}

const idsOf = (items: { objectId: string }[]) =>
  new Set(items.map((i) => i.objectId.toLowerCase()));

describe('EZD-502 RCP drawing', () => {
  it('keeps the walls and the room, leaves out the door and the dimensions', () => {
    const objects = vaulted();
    const floor = planDrawingList(objects, {}, null, null)!;
    expect(idsOf(floor.items).has(DOOR_ID)).toBe(true);
    const rcp = rcpList(floor, objects)!;
    const ids = idsOf(rcp.items);
    expect(ids.has(DOOR_ID)).toBe(false);
    for (const n of [1, 2, 3, 4]) expect(ids.has(uid(n))).toBe(true);
    expect(ids.has(ROOM_ID)).toBe(true);
    expect(rcp.items.some((i) => i.layer === 'dimensions')).toBe(false);
  });

  it('is reflected in the floor plan orientation: every wall item draws where it does on the floor plan', () => {
    const objects = vaulted();
    const floor = planDrawingList(objects, {}, null, null)!;
    const walls = rcpList(floor, objects)!.items.filter((i) =>
      [1, 2, 3, 4].some((n) => i.objectId.toLowerCase() === uid(n)),
    );
    expect(walls.length).toBeGreaterThan(0);
    for (const item of walls) expect(floor.items).toContainEqual(item);
  });

  it('draws the ridge dashed with its label RIDGE 13\' 0"', () => {
    const objects = vaulted();
    const rcp = rcpList(planDrawingList(objects, {}, null, null), objects)!;
    const lines = rcp.items.filter((i) => i.objectId === ROOM_ID && i.kind === 'line');
    // 144" in a 12, 4, 2, 4 pattern: long dashes at 0, 22, ... 132 (the last cut at 144), short at 16, 38, ... 126.
    expect(lines).toHaveLength(13);
    expect(lines.every((l) => l.kind === 'line' && l.from.y === 60 && l.to.y === 60)).toBe(true);
    const text = rcp.items.find(
      (i) => i.objectId === ROOM_ID && i.kind === 'text' && i.text.startsWith('RIDGE'),
    );
    expect(text).toMatchObject({ text: 'RIDGE 13\' 0"', at: { x: 72, y: 60 }, rotationDeg: 0 });
  });

  it('a room without a stored ceiling draws no ridge', () => {
    const objects = new Map(DOOR);
    objects.set(
      ROOM_ID,
      roomValue([P(0, 0), P(144, 0), P(144, 120), P(0, 120)], 'Family room', null),
    );
    const rcp = rcpList(planDrawingList(objects, {}, null, null), objects)!;
    expect(rcp.items.some((i) => i.kind === 'text' && i.text.startsWith('RIDGE'))).toBe(false);
  });

  it('AC-EZD-502-1: Both draws the whole floor plan in one grey under the RCP; Ceiling draws the RCP alone', () => {
    const objects = vaulted();
    const floor = planDrawingList(objects, {}, null, null);
    const both = rcpView(floor, objects, 'both');
    const greyed = both.batches.filter((b) => b.key.startsWith('floor:'));
    const rcp = both.batches.filter((b) => !b.key.startsWith('floor:'));
    expect(greyed.length).toBeGreaterThan(0);
    expect(rcp.length).toBeGreaterThan(0);
    const grey = tokenRgb(GREYED_FLOOR_TOKEN);
    for (const b of greyed) expect(b.color).toEqual(grey);
    const topGrey = Math.max(...greyed.map((b) => b.order));
    const lowRcp = Math.min(...rcp.map((b) => b.order));
    expect(topGrey).toBeLessThan(lowRcp);
    // The greyed plan holds the door; the RCP does not.
    const greyVertices = greyed.reduce((n, b) => n + b.positions.length, 0);
    const doorless = rcpView(
      planDrawingList(new Map([...objects].filter(([id]) => id !== DOOR_ID)), {}, null, null),
      objects,
      'both',
    );
    const doorlessGrey = doorless.batches
      .filter((b) => b.key.startsWith('floor:'))
      .reduce((n, b) => n + b.positions.length, 0);
    expect(greyVertices).toBeGreaterThan(doorlessGrey);
    expect(both.list).toEqual(rcpList(floor, objects));

    const ceiling = rcpView(floor, objects, 'ceiling');
    expect(ceiling.batches.some((b) => b.key.startsWith('floor:'))).toBe(false);
    expect(ceiling.batches.map((b) => b.key)).toEqual(rcp.map((b) => b.key));
  });

  it('dashes: 12, 4, 2, 4 from the start, the last dash cut at the end', () => {
    expect(dashes(P(0, 0), P(30, 0))).toEqual([
      [P(0, 0), P(12, 0)],
      [P(16, 0), P(18, 0)],
      [P(22, 0), P(30, 0)],
    ]);
    expect(dashes(P(5, 5), P(5, 5))).toEqual([]);
  });
});

// EZD-505 (AC-EZD-505-1; S05 Validation "Level beams in a vault must sit below the ridge and at or above the wall
// plate; warn otherwise"; Q-0630 "The whole object turns error red"). The 144" room, ridge 13' 0" east-west, walls
// 8' 0": 6" x 8" beams across the ridge at 4' 0" o.c. are 3 beams (144 / 48), each drawn as its 4 outline edges.
const BEAM_ID = uid(70);
function withBeam(heightAff: number): Map<string, ObjectValue> {
  const objects = vaulted();
  const data: BeamData = {
    geometry: { roomId: ROOM_ID, shift: P(0, 0) },
    status: 'new',
    level: F1,
    attributes: {
      placement: 'level_in_vault',
      heightAff,
      match: 'custom',
      matchRoomId: null,
      width: 6,
      height: 8,
      layout: { by: 'spacing', spacing: 48 },
      length: null,
      direction: 'across_ridge',
      endDetail: 'square',
    },
  };
  objects.set(BEAM_ID, {
    type: 'beam',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: data as unknown as Record<string, unknown>,
  });
  return objects;
}

describe('EZD-505 beams on the RCP', () => {
  it('draws each beam of the set in its status colour', () => {
    const objects = withBeam(108);
    const rcp = rcpList(planDrawingList(objects, {}, null, null), objects)!;
    const beams = rcp.items.filter((i) => i.objectId === BEAM_ID);
    expect(beams).toHaveLength(12);
    expect(beams.every((i) => i.layer === 'new')).toBe(true);
    const xs = new Set(beams.flatMap((i) => (i.kind === 'line' ? [i.from.x, i.to.x] : [])));
    expect([...xs].sort((a, b) => a - b)).toEqual([21, 27, 69, 75, 117, 123]);
  });

  it('AC-EZD-505-1: a level beam set above the ridge turns error red', () => {
    const objects = withBeam(162);
    const rcp = rcpList(planDrawingList(objects, {}, null, null), objects)!;
    const beams = rcp.items.filter((i) => i.objectId === BEAM_ID);
    expect(beams).toHaveLength(12);
    expect(beams.every((i) => i.layer === 'flagged')).toBe(true);
  });

  it('beams are ceiling items: the floor plan does not draw them', () => {
    const objects = withBeam(108);
    const floor = planDrawingList(objects, {}, null, null)!;
    expect(floor.items.some((i) => i.objectId === BEAM_ID)).toBe(false);
  });
});

// EZD-515 (AC-EZD-515-1 "A fan closer than the clearance warns"; S05 Validation "Ceiling fan blade clearance to walls
// and beams", "Hosted ceiling item left off any ceiling surface: red flag"; Q-0630 "The whole object turns error
// red"). The 144" x 120" room, its walls' inner faces on the outline; a fan's default 52" span is a 26" radius. The
// clearance is the owner's Defaults value, fixture input here.
const FAN_ID = uid(80);
const DET_ID = uid(81);
function withDevice(id: string, kind: string, at: Point): Map<string, ObjectValue> {
  const objects = vaulted();
  objects.set(id, {
    type: 'device',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: { geometry: { point: at }, status: 'new', level: F1, attributes: { kind } },
  });
  return objects;
}
const layersOf = (objects: Map<string, ObjectValue>, id: string, fanClearance: number | null) => {
  const floor = planDrawingList(objects, { extraItems: planDetailItems }, null, null);
  const items = rcpList(floor, objects, { fanClearance })!.items;
  const own = items.filter((i) => i.objectId.toLowerCase() === id);
  expect(own.length).toBeGreaterThan(0);
  return new Set(own.map((i) => i.layer));
};

describe('EZD-515 fan clearance and hosted flags on the RCP', () => {
  it('AC-EZD-515-1: a fan closer than the clearance turns error red', () => {
    // Centre 40" off the south wall: the blade tip is 14" off it, under 18".
    const objects = withDevice(FAN_ID, 'ceiling_fan', P(60, 40));
    expect(layersOf(objects, FAN_ID, 18)).toEqual(new Set(['flagged']));
  });

  it('the same fan keeps its status colour at a clearance it meets, and with no clearance set', () => {
    const objects = withDevice(FAN_ID, 'ceiling_fan', P(60, 40));
    expect(layersOf(objects, FAN_ID, 14)).toEqual(new Set(['new']));
    expect(layersOf(objects, FAN_ID, null)).toEqual(new Set(['new']));
  });

  it('a detector off every ceiling is flagged red; inside the room it is not', () => {
    expect(layersOf(withDevice(DET_ID, 'smoke_detector', P(200, 60)), DET_ID, null)).toEqual(
      new Set(['flagged']),
    );
    expect(layersOf(withDevice(DET_ID, 'smoke_detector', P(72, 60)), DET_ID, null)).toEqual(
      new Set(['new']),
    );
  });
});
