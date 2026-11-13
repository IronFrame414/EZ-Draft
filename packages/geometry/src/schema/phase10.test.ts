// EZD-234 (AC-EZD-234-3, -4; Q-0704 03-data-model rows 1-3, 09-calculations rows; 09q). Expected values: Q-0704 and
// the 09q tables (Utilities to move row 5; Tile shower row 9; Blocking rows 1-3), and samples/v5.json, which is
// v4.json with every room given floorLevel 0 and photos [] by hand, followed by one object of each phase 10 type.
import { describe, expect, it } from 'vitest';
import v4 from './samples/v4.json';
import v5 from './samples/v5.json';
import {
  CURRENT_SCHEMA_VERSION,
  fileRefs,
  migrateStoredObject,
  OBJECT_TYPES,
  parseModelDocument,
  parseStoredObject,
  type ModelObject,
  type StoredObject,
} from './index';

type Rec = Record<string, unknown>;
const objectsOf = (doc: unknown) => (doc as { objects: StoredObject[] }).objects;
const V5 = objectsOf(v5);
const sampleOf = (type: string): StoredObject => {
  const o = V5.find((x) => x.type === type);
  if (o === undefined) throw new Error(`v5.json has no ${type}`);
  return structuredClone(o);
};
const withData = (type: string, change: (d: Rec & { attributes: Rec; geometry: Rec }) => void) => {
  const o = sampleOf(type);
  change(o.data as Rec & { attributes: Rec; geometry: Rec });
  return o;
};
const ok = (o: StoredObject) => parseStoredObject(o).ok;
const parsed = (o: StoredObject): ModelObject => {
  const r = parseStoredObject(o);
  if (!r.ok) throw new Error(`${o.type} refused`);
  return r.object;
};

const PHASE_10_TYPES = [
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
];

describe('EZD-234 phase 10 schema step', () => {
  it('AC-4 one step: version 5 adds every phase 10 type; v5.json parses whole', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(5);
    for (const t of PHASE_10_TYPES) expect(OBJECT_TYPES).toContain(t);
    expect(OBJECT_TYPES).toHaveLength(15);
    expect(new Set(V5.map((o) => o.type))).toEqual(new Set(OBJECT_TYPES));
    expect(parseModelDocument(structuredClone(v5)).ok).toBe(true);
  });

  it('AC-4 a v4 document opens unchanged but for the room floor level and photos', () => {
    const before = structuredClone(objectsOf(v4));
    const migrated = objectsOf(v4).map((o) => migrateStoredObject(o));
    expect(migrated).toEqual(V5.slice(0, 16));
    expect(objectsOf(v4)).toEqual(before);
    const room = migrated.find((o) => o?.type === 'room')!;
    expect((room.data as { attributes: Rec }).attributes).toMatchObject({
      floorLevel: 0,
      photos: [],
    });
    expect(parseModelDocument({ objects: before }).ok).toBe(true);
  });

  it('AC-4 room floor level is signed and finite; photos are source_file ids', () => {
    const room = (change: (a: Rec) => void) =>
      withData('room', (d) => {
        change(d.attributes);
      });
    expect(ok(room((a) => (a.floorLevel = -0.0625)))).toBe(true);
    expect(ok(room((a) => (a.floorLevel = 8)))).toBe(true);
    expect(ok(room((a) => (a.floorLevel = Number.POSITIVE_INFINITY)))).toBe(false);
    expect(ok(room((a) => delete a.floorLevel))).toBe(false);
    expect(ok(room((a) => (a.photos = [crypto.randomUUID()])))).toBe(true);
    expect(ok(room((a) => (a.photos = ['not-a-uuid'])))).toBe(false);
  });

  it('AC-3 utility points: electric 240 V / 50 A and 120 V / 20 A save, 0 A is refused (09q row 5)', () => {
    const electric = (volts: unknown, amps: unknown) =>
      withData('utility_point', (d) => {
        d.attributes.kind = 'electric';
        d.attributes.volts = volts;
        d.attributes.amps = amps;
      });
    expect(ok(electric(240, 50))).toBe(true);
    expect(ok(electric(120, 20))).toBe(true);
    expect(ok(electric(120, 0))).toBe(false);
    expect(ok(electric(208, 20))).toBe(false);
    expect(ok(electric(null, 20))).toBe(false);
    expect(ok(electric(120, null))).toBe(false);
  });

  it('AC-3 volts and amps are refused on gas, water and drain; each places at a point and links to one id', () => {
    for (const kind of ['gas', 'water', 'drain']) {
      const plain = withData('utility_point', (d) => {
        d.attributes.kind = kind;
        d.attributes.volts = null;
        d.attributes.amps = null;
      });
      expect(ok(plain), kind).toBe(true);
      const volts = withData('utility_point', (d) => {
        d.attributes.kind = kind;
        d.attributes.volts = 120;
        d.attributes.amps = null;
      });
      expect(ok(volts), kind).toBe(false);
      const amps = withData('utility_point', (d) => {
        d.attributes.kind = kind;
        d.attributes.volts = null;
        d.attributes.amps = 20;
      });
      expect(ok(amps), kind).toBe(false);
    }
    expect(ok(withData('utility_point', (d) => (d.attributes.kind = 'steam')))).toBe(false);
    expect(ok(withData('utility_point', (d) => (d.attributes.servesObjectId = null)))).toBe(true);
    expect(ok(withData('utility_point', (d) => (d.attributes.servesObjectId = ['a'])))).toBe(false);
  });

  it('AC-2 fixtures: the 14 kinds, positive width and depth, a unit axis', () => {
    const kinds = [
      'toilet',
      'lavatory',
      'tub',
      'shower_prefab',
      'sink',
      'cooktop',
      'range',
      'hood',
      'refrigerator',
      'dishwasher',
      'disposal',
      'washer',
      'dryer',
      'water_heater',
    ];
    for (const kind of kinds)
      expect(ok(withData('fixture', (d) => (d.attributes.kind = kind))), kind).toBe(true);
    expect(ok(withData('fixture', (d) => (d.attributes.kind = 'shower')))).toBe(false);
    expect(ok(withData('fixture', (d) => (d.attributes.width = 0)))).toBe(false);
    expect(ok(withData('fixture', (d) => (d.attributes.depth = -1)))).toBe(false);
    expect(ok(withData('fixture', (d) => (d.geometry.axis = { x: 1, y: 1 })))).toBe(false);
    expect(ok(withData('fixture', (d) => (d.geometry.axis = { x: 0, y: -1 })))).toBe(true);
  });

  it('pins are always existing; the engineer letter tick needs a name and approval text (Q-0708)', () => {
    expect(ok(withData('pin', (d) => (d.status = 'new')))).toBe(false);
    expect(ok(withData('engineer_note', (d) => (d.status = 'demo')))).toBe(false);
    const note = (name: string, text: string, tick: boolean) =>
      withData('engineer_note', (d) => {
        d.attributes.engineerName = name;
        d.attributes.approvedText = text;
        d.attributes.letterOnFile = tick;
      });
    expect(ok(note('', '', false))).toBe(true);
    expect(ok(note('A. Engineer', 'Header 2-2x12', true))).toBe(true);
    expect(ok(note('A. Engineer', '', true))).toBe(false);
    expect(ok(note('', 'Header 2-2x12', true))).toBe(false);
  });

  it('tile shower width 0 is refused, any positive size is stored (09q Tile shower rows 4, 9)', () => {
    const rect = (w: number, d: number) =>
      withData('tile_shower', (x) => {
        x.geometry.footprint = [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: d },
          { x: 0, y: d },
        ];
      });
    expect(ok(rect(24, 24))).toBe(true);
    expect(ok(rect(0, 36))).toBe(false);
    expect(ok(withData('tile_shower', (x) => (x.attributes.curb = null)))).toBe(true);
    expect(
      ok(
        withData('tile_shower', (x) => {
          x.geometry.footprint = [
            { x: 0, y: 0 },
            { x: 60, y: 0 },
            { x: 70, y: 36 },
            { x: 0, y: 36 },
          ];
        }),
      ),
    ).toBe(false);
    expect(ok(withData('tile_shower', (x) => delete x.attributes.panSlope))).toBe(false);
  });

  it('blocking 24" by 34" saves; length 0 or height left empty is refused (09q Blocking rows 1-3)', () => {
    expect(ok(sampleOf('blocking'))).toBe(true);
    expect(ok(withData('blocking', (d) => (d.attributes.length = 0)))).toBe(false);
    expect(ok(withData('blocking', (d) => delete d.attributes.heightToCenter))).toBe(false);
  });

  it('AC-4 fileRefs names every source_file id: room photos and a pin photo as photos, the letter with no kind yet', () => {
    const photo = crypto.randomUUID();
    const room = parsed(withData('room', (d) => (d.attributes.photos = [photo])));
    expect(fileRefs(room)).toEqual([{ fileId: photo, kinds: ['photo'] }]);
    const pin = parsed(withData('pin', (d) => (d.attributes.photoFileId = photo)));
    expect(fileRefs(pin)).toEqual([{ fileId: photo, kinds: ['photo'] }]);
    const note = parsed(withData('engineer_note', (d) => (d.attributes.fileId = photo)));
    expect(fileRefs(note)).toEqual([{ fileId: photo, kinds: [] }]);
    for (const o of V5) {
      const p = parsed(structuredClone(o));
      expect(fileRefs(p), o.type).toEqual([]);
    }
  });
});
