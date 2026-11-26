// EZD-216 (AC-EZD-216-8; 03 Q-0667 field lists; Q-0687 (b) notes of several lines, at most 500 characters, from the
// atlas's characters with á, é, ñ, ü, ° and ½; Q-0664 paper sizes 3/32", 1/8", 3/16", 1/4"): the dimension and text
// schemas, stored with status and level like every object, through the one stored-object reader.
import { describe, expect, it } from 'vitest';
import { parseModelDocument, parseStoredObject } from './index';
import { CURRENT_SCHEMA_VERSION } from './migrate';
import { TEXT_CHARS, TEXT_MAX_CHARS } from './text';

const LEVEL = '00000000-0000-4000-8000-0000000000a1';
const WALL_A = '00000000-0000-4000-8000-0000000000b1';
const WALL_B = '00000000-0000-4000-8000-0000000000b2';
const ROOM = '00000000-0000-4000-8000-0000000000c1';
const ID = '00000000-0000-4000-8000-0000000000d1';

type Rec = Record<string, unknown>;

const dim = (geometry: Rec, attributes: Rec = {}): Rec => ({
  geometry,
  status: 'new',
  level: LEVEL,
  attributes: { kind: 'linear', offset: 12, override: null, auto: null, room: null, ...attributes },
});
const text = (attributes: Rec = {}, geometry: Rec = {}): Rec => ({
  geometry: { position: { x: 10, y: 20 }, leader: null, ...geometry },
  status: 'existing',
  level: LEVEL,
  attributes: { text: 'VERIFY IN FIELD', paperSize: '3/32', ...attributes },
});
const parse = (type: string, data: unknown) =>
  parseStoredObject({ id: ID, type, schema_version: CURRENT_SCHEMA_VERSION, data });
const ok = (type: string, data: unknown) => parse(type, data).ok;

const POINTS = { kind: 'points', from: { x: 0, y: 0 }, to: { x: 150, y: 0 } };
const FACE = { kind: 'wall_face', wallId: WALL_A, face: 'right' };
const WALLS = { kind: 'walls', wallIds: [WALL_A, WALL_B], at: { x: 30, y: 30 } };

describe('EZD-216 dimension schema (Q-0667)', () => {
  it('accepts two points, a wall face, two walls (angular) and both auto kinds', () => {
    expect(ok('dimension', dim(POINTS))).toBe(true);
    expect(ok('dimension', dim(FACE))).toBe(true);
    expect(ok('dimension', dim(WALLS, { kind: 'angular', offset: 0 }))).toBe(true);
    expect(ok('dimension', dim({ kind: 'auto', axis: 'x' }, { auto: 'overall' }))).toBe(true);
    expect(ok('dimension', dim({ kind: 'auto', axis: 'y' }, { auto: 'room', room: ROOM }))).toBe(true);
    expect(ok('dimension', dim(POINTS, { override: 'EQ' }))).toBe(true);
    // No 200 ft limit (Q-0664): 3000" apart is stored.
    expect(ok('dimension', dim({ ...POINTS, to: { x: 3000, y: 0 } }))).toBe(true);
  });

  it('refuses parts that disagree', () => {
    expect(ok('dimension', dim(WALLS))).toBe(false); // two walls but linear
    expect(ok('dimension', dim(POINTS, { kind: 'angular' }))).toBe(false);
    expect(ok('dimension', dim({ kind: 'auto', axis: 'x' }))).toBe(false); // auto geometry, auto none
    expect(ok('dimension', dim(POINTS, { auto: 'overall' }))).toBe(false);
    expect(ok('dimension', dim({ kind: 'auto', axis: 'x' }, { auto: 'room' }))).toBe(false); // no room
    expect(ok('dimension', dim(POINTS, { room: ROOM }))).toBe(false);
    expect(ok('dimension', dim({ ...WALLS, wallIds: [WALL_A, WALL_A] }, { kind: 'angular' }))).toBe(false);
  });

  it('refuses empty, malformed and unknown values', () => {
    expect(ok('dimension', dim({ ...POINTS, from: { x: Number.NaN, y: 0 } }))).toBe(false);
    expect(ok('dimension', dim(POINTS, { offset: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(ok('dimension', dim(POINTS, { override: '' }))).toBe(false);
    expect(ok('dimension', dim(POINTS, { override: '   ' }))).toBe(false);
    expect(ok('dimension', dim(POINTS, { override: 'two\nlines' }))).toBe(false);
    expect(ok('dimension', dim(POINTS, { override: 'x'.repeat(101) }))).toBe(false);
    expect(ok('dimension', dim({ ...FACE, face: 'center' }))).toBe(false);
    expect(ok('dimension', dim({ kind: 'auto', axis: 'z' }, { auto: 'overall' }))).toBe(false);
    expect(ok('dimension', { ...dim(POINTS), extra: 1 })).toBe(false);
    const noStatus = dim(POINTS);
    delete noStatus.status;
    expect(ok('dimension', noStatus)).toBe(false);
  });
});

describe('EZD-216 text schema (Q-0667; Q-0687 (b))', () => {
  it('accepts a note with and without a leader at each paper size', () => {
    for (const paperSize of ['3/32', '1/8', '3/16', '1/4']) expect(ok('text', text({ paperSize }))).toBe(true);
    expect(ok('text', text({}, { leader: { x: 0, y: 0 } }))).toBe(true);
    expect(ok('text', text({ paperSize: '1/2' }))).toBe(false);
  });

  it('takes several lines, 500 characters, and the Latin-1 letters á é ñ ü ° ½', () => {
    expect(TEXT_MAX_CHARS).toBe(500);
    expect(ok('text', text({ text: 'x'.repeat(500) }))).toBe(true);
    expect(ok('text', text({ text: 'x'.repeat(501) }))).toBe(false);
    expect(ok('text', text({ text: 'VERIFY\nIN FIELD' }))).toBe(true);
    expect(ok('text', text({ text: 'Baño: pendiente ½" a 90°, cámara, pingüino, café' }))).toBe(true);
    for (const ch of ['á', 'é', 'ñ', 'ü', '°', '½', '·']) expect(TEXT_CHARS).toContain(ch);
  });

  it('refuses empty text, spaces only and characters outside the atlas (smart quotes, tab)', () => {
    expect(ok('text', text({ text: '' }))).toBe(false);
    expect(ok('text', text({ text: ' \n ' }))).toBe(false);
    expect(ok('text', text({ text: '“quoted”' }))).toBe(false);
    expect(ok('text', text({ text: 'a\tb' }))).toBe(false);
    expect(ok('text', text({}, { position: { x: 'a', y: 0 } }))).toBe(false);
  });

  it('is stored with status and level: a text on a floor that is not there is refused', () => {
    const floor = { id: LEVEL, type: 'floor', schema_version: CURRENT_SCHEMA_VERSION, data: { name: 'Floor 1', order: 1 } };
    const note = { id: ID, type: 'text', schema_version: CURRENT_SCHEMA_VERSION, data: text() };
    expect(parseModelDocument({ objects: [floor, note] }).ok).toBe(true);
    const r = parseModelDocument({ objects: [note] });
    expect(r.ok === false && r.issues).toEqual([{ id: ID, issue: 'level_not_found' }]);
  });
});
