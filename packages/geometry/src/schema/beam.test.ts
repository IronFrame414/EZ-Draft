// EZD-505 the `beam` type (S05 Controls, beams: Placement "Level beams in vault / Follow slope / On flat ceiling",
// Match "Adjoining room / Custom", Size W x H, Spacing "Mutually exclusive with Count", Length "Default is wall to
// wall span", Direction "Across ridge / With ridge", End detail "Square to slope / Corbel"; 03b rule 5).
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, OBJECT_TYPES, parseModelDocument, parseStoredObject } from './index';
import v7 from './samples/v7.json';

type Rec = Record<string, unknown>;
const sample = () =>
  structuredClone((v7 as { objects: { type: string; data: Rec; id: string }[] }).objects).find(
    (o) => o.type === 'beam',
  )!;

const parse = (change: (d: { geometry: Rec; attributes: Rec }) => void) => {
  const o = sample();
  change(o.data as { geometry: Rec; attributes: Rec });
  return parseStoredObject({ ...o, schema_version: CURRENT_SCHEMA_VERSION }).ok;
};

describe('EZD-505 beam schema', () => {
  it('is a new type at the current version; the v7 sample parses whole', () => {
    expect(OBJECT_TYPES).toContain('beam');
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect(parseModelDocument(structuredClone(v7)).ok).toBe(true);
  });

  it('takes the S05 choices and nothing else', () => {
    for (const p of ['level_in_vault', 'follow_slope', 'on_flat'])
      expect(parse((d) => (d.attributes.placement = p))).toBe(true);
    expect(parse((d) => (d.attributes.placement = 'hanging'))).toBe(false);
    expect(parse((d) => (d.attributes.direction = 'with_ridge'))).toBe(true);
    expect(parse((d) => (d.attributes.direction = 'diagonal'))).toBe(false);
    expect(parse((d) => (d.attributes.endDetail = 'corbel'))).toBe(true);
    expect(parse((d) => (d.attributes.endDetail = 'round'))).toBe(false);
    expect(parse((d) => (d.attributes.match = 'adjoining'))).toBe(true);
    expect(parse((d) => (d.attributes.match = 'other'))).toBe(false);
  });

  it('spacing or count, never both', () => {
    expect(parse((d) => (d.attributes.layout = { by: 'count', count: 5 }))).toBe(true);
    expect(parse((d) => (d.attributes.layout = { by: 'count', count: 0 }))).toBe(false);
    expect(parse((d) => (d.attributes.layout = { by: 'count', count: 2.5 }))).toBe(false);
    expect(parse((d) => (d.attributes.layout = { by: 'spacing', spacing: 0 }))).toBe(false);
    expect(
      parse((d) => (d.attributes.layout = { by: 'spacing', spacing: 48, count: 5 })),
    ).toBe(false);
  });

  it('sizes and heights are positive; length null is wall to wall', () => {
    expect(parse((d) => (d.attributes.length = null))).toBe(true);
    expect(parse((d) => (d.attributes.length = 144))).toBe(true);
    expect(parse((d) => (d.attributes.length = 0))).toBe(false);
    expect(parse((d) => (d.attributes.width = -6))).toBe(false);
    expect(parse((d) => (d.attributes.height = 0))).toBe(false);
    expect(parse((d) => (d.attributes.heightAff = 0))).toBe(false);
  });

  it('sits on a room', () => {
    expect(parse((d) => (d.geometry.roomId = 'not-a-uuid'))).toBe(false);
    expect(parse((d) => (d.geometry.shift = { x: 12 }))).toBe(false);
  });
});
