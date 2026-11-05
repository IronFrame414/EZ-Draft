// EZD-202 G3-G7 (vault/plans/EZD-202.md section 3 schema/index.ts, section 4; AC-EZD-202-1, -2, -5, -6).
// Expected values: AC-1 and the fixture row (16 objects: 2 floor, 8 wall, 4 opening, 2 room), section 3 (issue
// codes; parse order version, type, data), Decided "Document checks" (duplicate_id on the later object,
// case-insensitive; level_not_found; invalid_document), 03g Statement (the schema never rounds).
import { describe, expect, test } from 'vitest';
import { parseModelDocument, parseStoredObject, type StoredObject } from './index';
import v1 from './samples/v1.json';

type Doc = { objects: StoredObject[] };
type Rec = Record<string, unknown>;

const sample = (): Doc => JSON.parse(JSON.stringify(v1)) as Doc;
const firstOf = (doc: Doc, type: string): StoredObject => {
  const found = doc.objects.find((o) => o.type === type);
  if (!found) throw new Error(`fixture has no ${type}`);
  return found;
};
const dataOf = (o: StoredObject): Rec => o.data as Rec;
const attrsOf = (o: StoredObject): Rec => dataOf(o).attributes as Rec;
const geometryOf = (o: StoredObject): Rec => dataOf(o).geometry as Rec;

describe('EZD-202 model document schema', () => {
  test('G3 sample: the v1 document parses with 16 objects; thicknessSide left and center parse', () => {
    const r = parseModelDocument(sample());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const count = (t: string) => r.document.objects.filter((o) => o.type === t).length;
    expect(r.document.objects).toHaveLength(16);
    expect(count('floor')).toBe(2);
    expect(count('wall')).toBe(8);
    expect(count('opening')).toBe(4);
    expect(count('room')).toBe(2);
    for (const side of ['left', 'center']) {
      const doc = sample();
      attrsOf(firstOf(doc, 'wall')).thicknessSide = side;
      expect(parseModelDocument(doc).ok, side).toBe(true);
    }
  });

  test('G4 bad data: each refused object gives invalid_data with its id', () => {
    const cases: [string, string, (o: StoredObject) => void][] = [
      ['no height', 'wall', (o) => void delete attrsOf(o).height],
      ['height "96"', 'wall', (o) => void (attrsOf(o).height = '96')],
      ['no thicknessSide', 'wall', (o) => void delete attrsOf(o).thicknessSide],
      ['thicknessSide outside', 'wall', (o) => void (attrsOf(o).thicknessSide = 'outside')],
      ['status proposed', 'wall', (o) => void (dataOf(o).status = 'proposed')],
      ['extra key', 'wall', (o) => void (dataOf(o).extra = 1)],
      ['level abc', 'wall', (o) => void (dataOf(o).level = 'abc')],
      ['x NaN', 'wall', (o) => void ((geometryOf(o).start as Rec).x = Number.NaN)],
      [
        'room 2 points',
        'room',
        (o) => void (geometryOf(o).boundary = (geometryOf(o).boundary as unknown[]).slice(0, 2)),
      ],
      ['kind skylight', 'opening', (o) => void (attrsOf(o).kind = 'skylight')],
      ['floor order 0', 'floor', (o) => void (dataOf(o).order = 0)],
    ];
    for (const [name, type, mutate] of cases) {
      const obj = JSON.parse(JSON.stringify(firstOf(sample(), type))) as StoredObject;
      mutate(obj);
      expect(parseStoredObject(obj), name).toEqual({
        ok: false,
        issue: { id: obj.id, issue: 'invalid_data' },
      });
    }
  });

  test('G5 type, version: an unknown type and an unknown version are named before the data', () => {
    const wall = firstOf(sample(), 'wall');
    expect(parseStoredObject({ ...wall, type: 'beam' })).toEqual({
      ok: false,
      issue: { id: wall.id, issue: 'unknown_type' },
    });
    const badBeam = {
      ...(JSON.parse(JSON.stringify(wall)) as StoredObject),
      type: 'beam',
      data: { not: 'a wall' },
    };
    expect(parseStoredObject(badBeam)).toEqual({
      ok: false,
      issue: { id: wall.id, issue: 'unknown_type' },
    });
    expect(parseStoredObject({ ...wall, type: 'beam', schema_version: 3 })).toEqual({
      ok: false,
      issue: { id: wall.id, issue: 'unknown_schema_version' },
    });
    for (const version of [3, 0, 1.5]) {
      expect(parseStoredObject({ ...wall, schema_version: version }), String(version)).toEqual({
        ok: false,
        issue: { id: wall.id, issue: 'unknown_schema_version' },
      });
    }
  });

  test('G6 document: level_not_found, duplicate_id on the later object, invalid_document', () => {
    const randomLevel = sample();
    const wallA = firstOf(randomLevel, 'wall');
    dataOf(wallA).level = '7b0f3e52-2c1d-4a8e-9f64-5d3a1c8e9b20';
    expect(parseModelDocument(randomLevel)).toEqual({
      ok: false,
      issues: [{ id: wallA.id, issue: 'level_not_found' }],
    });

    const wallLevel = sample();
    const wallB = firstOf(wallLevel, 'wall');
    const room = firstOf(wallLevel, 'room');
    dataOf(room).level = wallB.id;
    expect(parseModelDocument(wallLevel)).toEqual({
      ok: false,
      issues: [{ id: room.id, issue: 'level_not_found' }],
    });

    const dup = sample();
    const earlier = firstOf(dup, 'wall');
    const later = JSON.parse(JSON.stringify(firstOf(dup, 'room'))) as StoredObject;
    later.id = earlier.id.toUpperCase();
    dup.objects.push(later);
    expect(parseModelDocument(dup)).toEqual({
      ok: false,
      issues: [{ id: later.id, issue: 'duplicate_id' }],
    });

    expect(parseModelDocument({})).toEqual({
      ok: false,
      issues: [{ id: '', issue: 'invalid_document' }],
    });
  });

  test('G7 unrounded: a coordinate of 150.03 is parsed as 150.03', () => {
    const doc = sample();
    const wall = firstOf(doc, 'wall');
    (geometryOf(wall).start as Rec).x = 150.03;
    const r = parseModelDocument(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const parsed = r.document.objects.find((o) => o.id === wall.id);
    expect(
      (parsed?.data as unknown as { geometry: { start: { x: number } } }).geometry.start.x,
    ).toBe(150.03);
  });
});
