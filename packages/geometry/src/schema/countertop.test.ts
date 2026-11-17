// EZD-411 (03c countertop_piece "label (A/B…), outline, material_item_id, thickness, edges[]"; countertop_edge
// "segment, kind (exposed / wall / seating / flush), overhang, backsplash_height, profile_id ... Profile applies to
// exposed edges only"; 09f "wall edges take backsplash"). The sample is the countertop_piece at the end of
// samples/v6.json, typed by hand (board S04b piece A + B as one L top).
import { describe, expect, it } from 'vitest';
import v6 from './samples/v6.json';
import {
  COUNTERTOP_EDGE_KINDS,
  CURRENT_SCHEMA_VERSION,
  fileRefs,
  OBJECT_TYPES,
  parseModelDocument,
  parseStoredObject,
  type StoredObject,
} from './index';

type Rec = Record<string, unknown>;
type Data = Rec & { attributes: Rec & { edges: Rec[] }; geometry: Rec & { outline: Rec[] } };
const V6 = (v6 as unknown as { objects: StoredObject[] }).objects;
const sample = (): StoredObject => {
  const o = V6.find((x) => x.type === 'countertop_piece');
  if (o === undefined) throw new Error('v6.json has no countertop_piece');
  return structuredClone(o);
};
const withData = (change: (d: Data) => void) => {
  const o = sample();
  change(o.data as Data);
  return o;
};
const ok = (o: StoredObject) => parseStoredObject(o).ok;
const PROFILE = '5f0c2a1e-9b3d-4e7a-8c6f-1a2b3c4d5e6f';

describe('EZD-411 countertop object schema', () => {
  it('countertop_piece is a model type, the new type keeps version 6, and v6.json parses whole', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(6);
    expect(OBJECT_TYPES).toContain('countertop_piece');
    expect(ok(sample())).toBe(true);
    expect(parseModelDocument(structuredClone(v6)).ok).toBe(true);
  });

  it('a piece holds label, name, outline, material, thickness and one edge per outline side', () => {
    const r = parseStoredObject(sample());
    if (!r.ok || r.object.type !== 'countertop_piece') throw new Error('refused');
    const d = r.object.data;
    expect(d.attributes.label).toBe('A');
    expect(d.attributes.name).toBe('Back wall');
    expect(d.attributes.materialItemId).toBeNull();
    expect(d.attributes.thickness).toBe(1.1811);
    expect(d.geometry.outline).toHaveLength(6);
    expect(d.attributes.edges.map((e) => e.kind)).toEqual(['wall', 'wall', 'exposed', 'exposed', 'flush', 'wall']);
    expect(d.attributes.edges[0]).toEqual({ kind: 'wall', overhang: 0, backsplashHeight: 4, profileId: null });
    expect(fileRefs(r.object)).toEqual([]);
  });

  it('edge kinds are exposed, wall, seating and flush', () => {
    expect([...COUNTERTOP_EDGE_KINDS]).toEqual(['exposed', 'wall', 'seating', 'flush']);
    expect(ok(withData((d) => (d.attributes.edges[2]!.kind = 'seating')))).toBe(true);
    expect(ok(withData((d) => (d.attributes.edges[2]!.kind = 'splash')))).toBe(false);
  });

  it('the edge list matches the outline side for side', () => {
    expect(ok(withData((d) => d.attributes.edges.pop()))).toBe(false);
    expect(ok(withData((d) => d.attributes.edges.push({ ...d.attributes.edges[0]! })))).toBe(false);
    expect(ok(withData((d) => d.geometry.outline.pop()))).toBe(false);
  });

  it('an outline needs at least three corners', () => {
    expect(
      ok(
        withData((d) => {
          d.geometry.outline = d.geometry.outline.slice(0, 2);
          d.attributes.edges = d.attributes.edges.slice(0, 2);
        }),
      ),
    ).toBe(false);
  });

  it('profile goes on exposed edges only; backsplash on wall edges only', () => {
    expect(ok(withData((d) => (d.attributes.edges[2]!.profileId = PROFILE)))).toBe(true);
    expect(ok(withData((d) => (d.attributes.edges[4]!.profileId = PROFILE)))).toBe(true);
    expect(ok(withData((d) => (d.attributes.edges[0]!.profileId = PROFILE)))).toBe(false);
    expect(ok(withData((d) => (d.attributes.edges[2]!.backsplashHeight = 4)))).toBe(false);
    expect(ok(withData((d) => (d.attributes.edges[5]!.backsplashHeight = null)))).toBe(true);
  });

  it('refuses a negative overhang, a non-positive thickness, a bad label and an unknown key', () => {
    expect(ok(withData((d) => (d.attributes.edges[2]!.overhang = -1)))).toBe(false);
    expect(ok(withData((d) => (d.attributes.thickness = 0)))).toBe(false);
    expect(ok(withData((d) => (d.attributes.label = 'a')))).toBe(false);
    expect(ok(withData((d) => (d.attributes.label = 'AA')))).toBe(true);
    expect(ok(withData((d) => (d.attributes.label = '')))).toBe(false);
    expect(ok(withData((d) => (d.attributes.seams = [])))).toBe(false);
    expect(ok(withData((d) => (d.attributes.edges[2]!.segment = 2)))).toBe(false);
  });
});
