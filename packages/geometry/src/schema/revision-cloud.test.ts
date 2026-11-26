// EZD-232 (S03 rail Revision cloud "Draw a cloud and delta tag manually"; 03f Annotation "revision clouds"; Q-0200
// manual and automatic clouds): the revision_cloud schema, through the one stored-object reader.
import { describe, expect, it } from 'vitest';
import { OBJECT_TYPES, fileRefs, parseStoredObject } from './index';
import { CURRENT_SCHEMA_VERSION } from './migrate';

const LEVEL = '00000000-0000-4000-8000-0000000000a1';
const ID = '00000000-0000-4000-8000-0000000000e1';

type Rec = Record<string, unknown>;

const SQUARE = [
  { x: 0, y: 0 },
  { x: 96, y: 0 },
  { x: 96, y: 72 },
  { x: 0, y: 72 },
];
const cloud = (over: Rec = {}, attributes: Rec = {}): Rec => ({
  geometry: { boundary: SQUARE, tag: { x: 96, y: 72 } },
  level: LEVEL,
  attributes: { source: 'manual', rev: null, ...attributes },
  ...over,
});
const parse = (data: unknown) =>
  parseStoredObject({
    id: ID,
    type: 'revision_cloud',
    schema_version: CURRENT_SCHEMA_VERSION,
    data,
  });
const ok = (data: unknown) => parse(data).ok;

describe('EZD-232 revision_cloud schema', () => {
  it('is an object type that holds no files', () => {
    expect(OBJECT_TYPES).toContain('revision_cloud');
    const r = parse(cloud());
    expect(r.ok).toBe(true);
    if (r.ok) expect(fileRefs(r.object)).toEqual([]);
  });

  it('accepts a manual or automatic cloud, numbered or not yet numbered', () => {
    expect(ok(cloud())).toBe(true);
    expect(ok(cloud({}, { source: 'auto', rev: 1 }))).toBe(true);
    expect(ok(cloud({}, { rev: 0 }))).toBe(true);
  });

  it('needs an outline of three or more corners and a tag point', () => {
    expect(ok(cloud({ geometry: { boundary: SQUARE.slice(0, 3), tag: { x: 0, y: 0 } } }))).toBe(
      true,
    );
    expect(ok(cloud({ geometry: { boundary: SQUARE.slice(0, 2), tag: { x: 0, y: 0 } } }))).toBe(
      false,
    );
    expect(ok(cloud({ geometry: { boundary: SQUARE } }))).toBe(false);
  });

  it('refuses an unknown source, a negative or fractional rev, a missing level and extra fields', () => {
    expect(ok(cloud({}, { source: 'drawn' }))).toBe(false);
    expect(ok(cloud({}, { rev: -1 }))).toBe(false);
    expect(ok(cloud({}, { rev: 1.5 }))).toBe(false);
    expect(ok(cloud({ level: 'floor 1' }))).toBe(false);
    expect(ok(cloud({ status: 'new' }))).toBe(false);
    expect(ok(cloud({}, { color: 'red' }))).toBe(false);
  });
});
