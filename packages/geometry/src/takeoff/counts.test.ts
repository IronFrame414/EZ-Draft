// EZD-1611b (AC-EZD-1611b-1; 09i Takeoff rules; vault/build/assumptions/EZD-1611b.md): the fixture kitchen returns
// the expected-quantity JSON for the countertop, cabinet, fixture, device and wire lines. Every expected number is
// worked by hand (fixtures/counts.md and the comments here) from the formulas table, never from running this code.
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  parseModelDocument,
  parseStoredObject,
  type ModelObject,
  type StoredObject,
} from '../schema';
import expected from './fixtures/counts.expected.json';
import model from './fixtures/counts.model.json';
import kbExpected from './fixtures/kitchen-bath.expected.json';
import kbModel from './fixtures/kitchen-bath.model.json';
import {
  countTakeoff,
  takeoff,
  type TakeoffCountLine,
  type TakeoffCountSettings,
  type TakeoffSettings,
} from './index';

const parse = (objects: unknown[]): ModelObject[] =>
  (objects as StoredObject[]).map((o) => {
    const r = parseStoredObject(o);
    if (!r.ok) throw new Error(`${o.id} ${r.issue.issue}`);
    return r.object;
  });
const settings = expected.settings as TakeoffCountSettings;
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const L = uid(1);
const wall = (n: number, start: { x: number; y: number }, end: { x: number; y: number }) => ({
  id: uid(n),
  type: 'wall',
  schema_version: CURRENT_SCHEMA_VERSION,
  data: {
    geometry: { start, end },
    status: 'existing',
    level: L,
    attributes: {
      thickness: 4.5,
      thicknessSide: 'center',
      height: 96,
      topCutToCeiling: false,
      bearing: false,
      layers: [
        { material: 'drywall', thickness: 0.5 },
        { material: 'stud', thickness: 3.5 },
        { material: 'drywall', thickness: 0.5 },
      ],
    },
  },
});

describe('EZD-1611b countertop, cabinet, fixture, device and wire takeoff', () => {
  it('the fixture is a valid stored model at the current schema version', () => {
    for (const o of model.objects) expect(o.schema_version, o.id).toBe(CURRENT_SCHEMA_VERSION);
    expect(parseModelDocument({ objects: model.objects }).ok).toBe(true);
  });

  it('AC-EZD-1611b-1: returns the expected-quantity JSON for these lines of the fixture', () => {
    expect(countTakeoff(parse(model.objects), settings)).toEqual(expected.lines);
  });

  it('a fixture or device kind the takeoff does not list gives no line and no error', () => {
    const objects = parse(model.objects);
    const sink = objects.find((o) => o.id === uid(0x71))!;
    const light = objects.find((o) => o.id === uid(0x86))!;
    const later = (o: ModelObject, n: number, kind: string) =>
      ({
        ...o,
        id: uid(n),
        data: { ...o.data, attributes: { ...(o.data as { attributes: object }).attributes, kind } },
      }) as unknown as ModelObject;
    const more = [...objects, later(sink, 0x7f, 'microwave'), later(light, 0x8f, 'ev_charger')];
    expect(countTakeoff(more, settings)).toEqual(expected.lines);
  });

  it("an object goes to the room on its own floor, and its wire rise uses that floor's ceiling", () => {
    // A second floor over the fixture kitchen: the same four walls, 108" high, and a room "Loft" with the kitchen's
    // outline. On it: a New sink at (60,60) and a New receptacle at (132,1), 16", alone on a New circuit in space 7
    // of Panel A (first floor, (12,1)). The kitchen's lines stay as they are; the Loft gets:
    // sink 1; duplex receptacle 1; wire: the panel and the device are on different floors, so the straight distance
    // (12,1)-(132,1) = 120". Rise: panel 96 - 60 = 36 (kitchen ceiling); device 2 x (108 - 16) = 184 (Loft ceiling,
    // not the kitchen's 96). 120 + 36 + 184 = 340" = 28.33 -> 28.4 LF; x 1.15 = 391" = 32.58 -> 33 LF.
    const L2 = uid(2);
    const up = <T extends { id: string; data: object }>(o: T, n: number, data: object): T => ({
      ...o,
      id: uid(n),
      data: { ...o.data, level: L2, ...data },
    });
    const src = model.objects as unknown as {
      id: string;
      type: string;
      data: { attributes: object; geometry: object };
    }[];
    const get = (n: number) => src.find((o) => o.id === uid(n))!;
    const room = get(0x31);
    const sink = get(0x71);
    const r1 = get(0x81);
    const circuit = get(0xa1);
    const stacked = parse([
      ...src,
      {
        id: L2,
        type: 'floor',
        schema_version: CURRENT_SCHEMA_VERSION,
        data: { name: 'Second floor', order: 2 },
      },
      ...[0x11, 0x12, 0x13, 0x14].map((n) =>
        up(get(n), n + 0x100, { attributes: { ...get(n).data.attributes, height: 108 } }),
      ),
      up(room, 0x131, { attributes: { ...room.data.attributes, name: 'Loft' } }),
      up(sink, 0x171, { geometry: { ...sink.data.geometry, center: { x: 60, y: 60 } } }),
      up(r1, 0x181, { attributes: { ...r1.data.attributes, circuit: uid(0x1a1) } }),
      up(circuit, 0x1a1, { attributes: { ...circuit.data.attributes, space: 7, name: 'Loft' } }),
    ]);
    const loft = { roomId: uid(0x131), roomName: 'Loft' };
    const ea = (trade: string, item: string, k: string, id: number) => ({
      ...loft,
      trade,
      item,
      key: k,
      unit: 'EA',
      qty: 1,
      waste: null,
      total: 1,
      count: null,
      sourceIds: [uid(id)],
    });
    const kitchen = expected.lines.filter((l) => l.roomId !== null);
    const none = expected.lines.filter((l) => l.roomId === null);
    expect(countTakeoff(stacked, settings)).toEqual([
      ...kitchen,
      ea('fixtures', 'fixture', 'sink', 0x171),
      ea('electrical', 'device', 'receptacle_duplex', 0x181),
      {
        ...loft,
        trade: 'electrical',
        item: 'wire',
        key: uid(0x1a1),
        unit: 'LF',
        qty: 28.4,
        waste: { material: 'wire', pct: 15 },
        total: 33,
        count: null,
        sourceIds: [uid(0x1a1), uid(0x91), uid(0x181)],
      },
      ...none,
    ]);
  });

  it('a countertop waste or wire slack not entered keeps the quantity and gives no total', () => {
    const lines = countTakeoff(parse(model.objects), { countertopWaste: null, wireSlack: null });
    const a = lines.find((l) => l.item === 'countertop' && l.key === 'A')!;
    expect(a.qty).toBe(17);
    expect(a.waste).toEqual({ material: 'countertop', pct: null });
    expect(a.total).toBeNull();
    const w = lines.find((l) => l.item === 'wire' && l.key === uid(0xa1))!;
    expect(w.qty).toBe(47.7);
    expect(w.total).toBeNull();
  });

  it('wire turns at a T, takes the wall height outside rooms, and a ceiling light has no rise', () => {
    // A wall (0,0)-(240,0) and a wall (120,0)-(120,100) ending on its middle; no room. Panel at (0,1) -> (0,0).
    // Receptacle at (121,50), 16" -> (120,50): 120 along the first wall + 50 up the second = 170". A recessed light at
    // (121,90) with no height -> (120,90): 40" more; it sits at the ceiling, so no rise.
    // Rise: 96 (wall height, no room) - 60 = 36; 2 x (96 - 16) = 160. 170 + 40 + 196 = 406" = 33.83 -> 33.9 LF;
    // x 1.15 = 38.91 -> 39 LF.
    const objects = parse([
      {
        id: L,
        type: 'floor',
        schema_version: CURRENT_SCHEMA_VERSION,
        data: { name: 'First floor', order: 1 },
      },
      wall(0x11, { x: 0, y: 0 }, { x: 240, y: 0 }),
      wall(0x12, { x: 120, y: 0 }, { x: 120, y: 100 }),
      {
        id: uid(0x91),
        type: 'panel',
        schema_version: CURRENT_SCHEMA_VERSION,
        data: {
          geometry: { point: { x: 0, y: 1 } },
          status: 'new',
          level: L,
          attributes: {
            name: 'Panel A',
            parentPanel: null,
            serviceSize: null,
            mainBreaker: null,
            spaces: null,
          },
        },
      },
      ...[
        { n: 0x81, kind: 'receptacle_duplex', x: 121, y: 50, height: 16 },
        { n: 0x82, kind: 'recessed_light', x: 121, y: 90 },
      ].map((d) => ({
        id: uid(d.n),
        type: 'device',
        schema_version: CURRENT_SCHEMA_VERSION,
        data: {
          geometry: { point: { x: d.x, y: d.y } },
          status: 'new',
          level: L,
          attributes: {
            kind: d.kind,
            circuit: uid(0xa1),
            ...(d.height === undefined ? {} : { height: d.height }),
          },
        },
      })),
      {
        id: uid(0xa1),
        type: 'circuit',
        schema_version: CURRENT_SCHEMA_VERSION,
        data: {
          status: 'new',
          level: L,
          attributes: {
            panel: uid(0x91),
            space: 1,
            poles: 1,
            name: 'Circuit 1',
            breaker: 15,
            protection: null,
            dedicated: false,
            load: 0,
            order: [uid(0x81), uid(0x82)],
          },
        },
      },
    ]);
    const wire = countTakeoff(objects, { countertopWaste: null, wireSlack: 15 }).filter(
      (l) => l.item === 'wire',
    );
    expect(wire).toEqual<TakeoffCountLine[]>([
      {
        roomId: null,
        roomName: null,
        trade: 'electrical',
        item: 'wire',
        key: uid(0xa1),
        unit: 'LF',
        qty: 33.9,
        waste: { material: 'wire', pct: 15 },
        total: 39,
        count: null,
        sourceIds: [uid(0xa1), uid(0x91), uid(0x81), uid(0x82)],
      },
    ]);
  });

  it("the whole takeoff puts each room's count lines after its room-finish lines", () => {
    // The EZD-1611a kitchen and bath: New boxes B36 and SB36 in the kitchen run, V30 in the bath (its depth runs
    // west off the run line at x = 208.5, into the bath). No tops, fixtures or devices.
    const all = {
      ...(kbExpected.settings as TakeoffSettings),
      countertopWaste: null,
      wireSlack: 15,
    };
    const box = (room: number, name: string, code: string, id: number): TakeoffCountLine => ({
      roomId: uid(room),
      roomName: name,
      trade: 'cabinets',
      item: 'cabinet',
      key: code,
      unit: 'EA',
      qty: 1,
      waste: null,
      total: 1,
      count: null,
      sourceIds: [uid(id)],
    });
    const finish = kbExpected.lines;
    const of = (room: number) => finish.filter((l) => l.roomId === uid(room));
    expect(takeoff(parse(kbModel.objects), all)).toEqual([
      ...of(0x31),
      box(0x31, 'Kitchen', 'B36', 0x41),
      box(0x31, 'Kitchen', 'SB36', 0x42),
      ...of(0x32),
      box(0x32, 'Bath', 'V30', 0x44),
      ...of(0x33),
    ]);
  });
});
