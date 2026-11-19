// EZD-733 (phase-07 EZD-733 "Tile pattern, start point and visible cuts ... stored in the model"; S19 "Straight /
// diagonal / herringbone"; vault/build/assumptions.md EZD-733). The samples are the two tile_layout objects typed by
// hand into samples/v6.json (a diagonal floor in the 120" x 96" room, straight tile on the south wall's room face).
import { describe, expect, it } from 'vitest';
import v6 from './samples/v6.json';
import v7 from './samples/v7.json';
import {
  CURRENT_SCHEMA_VERSION,
  OBJECT_TYPES,
  TILE_PATTERNS,
  fileRefs,
  migrateStoredObject,
  parseModelDocument,
  parseStoredObject,
  type ModelObject,
  type StoredObject,
} from './index';

type Rec = Record<string, unknown>;
const objectsOf = (d: unknown) => (d as { objects: StoredObject[] }).objects;
const samples = () => structuredClone(objectsOf(v6).filter((o) => o.type === 'tile_layout'));
const floor = () =>
  samples().find(
    (o) => (o.data as Rec & { geometry: { host: Rec } }).geometry.host.kind === 'floor',
  )!;
const wall = () =>
  samples().find(
    (o) => (o.data as Rec & { geometry: { host: Rec } }).geometry.host.kind === 'wall',
  )!;
const ok = (o: StoredObject) => parseStoredObject(o).ok;
const edit = (
  o: StoredObject,
  f: (d: Rec & { geometry: Rec & { host: Rec }; attributes: Rec }) => void,
) => {
  f(o.data as Rec & { geometry: Rec & { host: Rec }; attributes: Rec });
  return o;
};

describe('EZD-733 tile layout schema', () => {
  it('tile_layout is a model type; a new type keeps version 7; both samples parse and step to 7 unchanged', () => {
    expect(OBJECT_TYPES).toContain('tile_layout');
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect(TILE_PATTERNS).toEqual(['straight', 'diagonal', 'herringbone']);
    for (const o of samples()) {
      expect(ok(o)).toBe(true);
      const m = migrateStoredObject(o)!;
      expect(m.schema_version).toBe(7);
      expect(m.data).toEqual(o.data);
    }
    expect(parseModelDocument(structuredClone(v6)).ok).toBe(true);
    expect(parseModelDocument(structuredClone(v7)).ok).toBe(true);
  });

  it('stores pattern, tile size, joint and start point; holds no file', () => {
    const r = parseStoredObject(wall());
    expect(r.ok).toBe(true);
    const obj = (r as { ok: true; object: ModelObject }).object;
    expect(obj.type).toBe('tile_layout');
    if (obj.type !== 'tile_layout') return;
    expect(obj.data.attributes).toEqual({
      pattern: 'straight',
      tileWidth: 12,
      tileHeight: 24,
      joint: 0,
    });
    expect(obj.data.geometry.start).toEqual({ x: 6, y: 0 });
    expect(obj.data.geometry.host).toMatchObject({ kind: 'wall', side: 'left', height: 96 });
    expect(fileRefs(obj)).toEqual([]);
  });

  it('refuses a zero or negative tile size, a negative joint, an unknown pattern, side or host', () => {
    expect(ok(edit(floor(), (d) => (d.attributes.tileWidth = 0)))).toBe(false);
    expect(ok(edit(floor(), (d) => (d.attributes.tileHeight = -1)))).toBe(false);
    expect(ok(edit(floor(), (d) => (d.attributes.joint = -0.0625)))).toBe(false);
    expect(ok(edit(floor(), (d) => (d.attributes.joint = 0)))).toBe(true);
    expect(ok(edit(floor(), (d) => (d.attributes.pattern = 'basketweave')))).toBe(false);
    expect(ok(edit(wall(), (d) => (d.geometry.host.side = 'center')))).toBe(false);
    expect(ok(edit(wall(), (d) => (d.geometry.host.height = 0)))).toBe(false);
    expect(ok(edit(wall(), (d) => delete d.geometry.host.height))).toBe(false);
    expect(
      ok(
        edit(
          floor(),
          (d) => (d.geometry.host = { kind: 'ceiling', roomId: d.geometry.host.roomId }),
        ),
      ),
    ).toBe(false);
  });
});
