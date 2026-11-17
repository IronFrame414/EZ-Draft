// EZD-402 (03f "Cabinets as individual boxes: code, width, depth, height, type, face layout, hinge side, finished
// ends, catalog item. Also fillers (scribe allowance), end and decorative panels, appliance panels, toe kick, light
// rail, crown, valance, corner treatments, open shelves"; S04 Data shown). Samples are the cabinet objects at the end
// of samples/v6.json, typed by hand.
import { describe, expect, it } from 'vitest';
import v6 from './samples/v6.json';
import {
  CABINET_BOX_TYPES,
  CURRENT_SCHEMA_VERSION,
  fileRefs,
  OBJECT_TYPES,
  parseModelDocument,
  parseStoredObject,
  type StoredObject,
} from './index';

type Rec = Record<string, unknown>;
type Data = Rec & { attributes: Rec; geometry: Rec };
const V6 = (v6 as unknown as { objects: StoredObject[] }).objects;
const sampleOf = (type: string): StoredObject => {
  const o = V6.find((x) => x.type === type);
  if (o === undefined) throw new Error(`v6.json has no ${type}`);
  return structuredClone(o);
};
const withData = (type: string, change: (d: Data) => void) => {
  const o = sampleOf(type);
  change(o.data as Data);
  return o;
};
const ok = (o: StoredObject) => parseStoredObject(o).ok;

const CABINET_TYPES = [
  'cabinet_run',
  'cabinet_box',
  'cabinet_filler',
  'cabinet_panel',
  'cabinet_corner',
  'cabinet_shelf',
  'cabinet_trim',
];

describe('EZD-402 cabinet object schema', () => {
  it('every cabinet type is a model type, new types keep version 6, and v6.json parses whole', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
    for (const t of CABINET_TYPES) expect(OBJECT_TYPES).toContain(t);
    for (const t of CABINET_TYPES) expect(ok(sampleOf(t))).toBe(true);
    expect(parseModelDocument(structuredClone(v6)).ok).toBe(true);
  });

  it('a box holds code, size, type, face layout, hinge side, finished ends and catalog item', () => {
    const r = parseStoredObject(sampleOf('cabinet_box'));
    expect(r.ok && r.object.type === 'cabinet_box' && r.object.data.attributes).toEqual({
      code: 'SB36',
      boxType: 'sink_base',
      width: 36,
      depth: 24,
      height: 34.5,
      faceLayout: 'false_drawer_doors_2',
      hingeSide: 'pair',
      finishedEnds: 'none',
      catalogItemId: null,
      finish: null,
    });
  });

  it('box types are the eight of S04 Data shown', () => {
    expect([...CABINET_BOX_TYPES]).toEqual([
      'base',
      'wall',
      'tall',
      'vanity',
      'sink_base',
      'drawer_base',
      'corner_blind',
      'appliance_panel',
    ]);
    for (const t of CABINET_BOX_TYPES)
      expect(ok(withData('cabinet_box', (d) => (d.attributes.boxType = t)))).toBe(true);
    expect(ok(withData('cabinet_box', (d) => (d.attributes.boxType = 'island')))).toBe(false);
  });

  it('hinges Left / Pair / Right and finished ends None / Left / Right / Both (S04 Face)', () => {
    for (const h of ['left', 'pair', 'right', 'none'])
      expect(ok(withData('cabinet_box', (d) => (d.attributes.hingeSide = h)))).toBe(true);
    for (const e of ['none', 'left', 'right', 'both'])
      expect(ok(withData('cabinet_box', (d) => (d.attributes.finishedEnds = e)))).toBe(true);
    expect(ok(withData('cabinet_box', (d) => (d.attributes.hingeSide = 'top')))).toBe(false);
    expect(ok(withData('cabinet_box', (d) => (d.attributes.finishedEnds = 'top')))).toBe(false);
  });

  it('sizes are positive; a custom 16 1/2" width is accepted (Round 3)', () => {
    expect(ok(withData('cabinet_box', (d) => (d.attributes.width = 16.5)))).toBe(true);
    for (const f of ['width', 'depth', 'height']) {
      expect(ok(withData('cabinet_box', (d) => (d.attributes[f] = 0)))).toBe(false);
      expect(ok(withData('cabinet_box', (d) => (d.attributes[f] = -1)))).toBe(false);
    }
    expect(ok(withData('cabinet_box', (d) => (d.attributes.code = '')))).toBe(false);
  });

  it('a catalog item is a catalog_item id or none', () => {
    const id = '9b2f7c1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b';
    expect(ok(withData('cabinet_box', (d) => (d.attributes.catalogItemId = id)))).toBe(true);
    expect(ok(withData('cabinet_box', (d) => (d.attributes.catalogItemId = 'SB36-SH')))).toBe(
      false,
    );
  });

  it('a filler carries a scribe allowance from 0 up to its width', () => {
    expect(ok(withData('cabinet_filler', (d) => (d.attributes.scribe = 0)))).toBe(true);
    expect(ok(withData('cabinet_filler', (d) => (d.attributes.scribe = 3)))).toBe(true);
    expect(ok(withData('cabinet_filler', (d) => (d.attributes.scribe = 3.0625)))).toBe(false);
    expect(ok(withData('cabinet_filler', (d) => (d.attributes.scribe = -0.5)))).toBe(false);
    expect(ok(withData('cabinet_filler', (d) => delete d.attributes.scribe))).toBe(false);
  });

  it('panels are end or decorative; trim is toe kick, light rail, crown or valance', () => {
    for (const k of ['end', 'decorative'])
      expect(ok(withData('cabinet_panel', (d) => (d.attributes.kind = k)))).toBe(true);
    expect(ok(withData('cabinet_panel', (d) => (d.attributes.kind = 'appliance')))).toBe(false);
    for (const k of ['toe_kick', 'light_rail', 'crown', 'valance'])
      expect(ok(withData('cabinet_trim', (d) => (d.attributes.kind = k)))).toBe(true);
    expect(ok(withData('cabinet_trim', (d) => (d.geometry.row = 'middle')))).toBe(false);
  });

  it('an open shelf has a whole number of shelves, at least one', () => {
    expect(ok(withData('cabinet_shelf', (d) => (d.attributes.shelfCount = 1)))).toBe(true);
    expect(ok(withData('cabinet_shelf', (d) => (d.attributes.shelfCount = 0)))).toBe(false);
    expect(ok(withData('cabinet_shelf', (d) => (d.attributes.shelfCount = 1.5)))).toBe(false);
  });

  it('a run lists each member once across its rows; unknown fields are refused', () => {
    expect(ok(withData('cabinet_run', (d) => (d.geometry.hostWallId = null)))).toBe(true);
    const dup = withData('cabinet_run', (d) => {
      d.attributes.upper = [(d.attributes.base as string[])[0]!.toUpperCase()];
    });
    expect(ok(dup)).toBe(false);
    expect(ok(withData('cabinet_run', (d) => (d.attributes.name = '  ')))).toBe(false);
    expect(ok(withData('cabinet_run', (d) => (d.geometry.axis = { x: 2, y: 0 })))).toBe(false);
    expect(ok(withData('cabinet_box', (d) => (d.attributes.cost = 120)))).toBe(false);
  });

  it('cabinet objects hold no source_file ids', () => {
    for (const t of CABINET_TYPES) {
      const r = parseStoredObject(sampleOf(t));
      if (!r.ok) throw new Error(`${t} refused`);
      expect(fileRefs(r.object)).toEqual([]);
    }
  });
});
