// EZD-511 the `act_grid` type (S05 Controls "Acoustical grid ... Places a 2x2 or 2x4 ACT grid in a room; set direction
// and start point."; S05 Data shown "ACT grid: module, direction, start point, border sizes"; vault/build/assumptions.md
// EZD-511 "ACT grid data": roomId, module 2x2 or 2x4, direction, start point, balanced flag; borders never stored).
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, OBJECT_TYPES, parseModelDocument, parseStoredObject } from './index';
import v6 from './samples/v6.json';
import v7 from './samples/v7.json';

type Rec = Record<string, unknown>;
type Stored = { type: string; data: Rec; id: string; schema_version: number };
const objects = () => structuredClone((v7 as { objects: Stored[] }).objects);
const sample = () => objects().find((o) => o.type === 'act_grid')!;

const parse = (change: (d: { geometry: Rec; attributes: Rec; status: unknown }) => void) => {
  const o = sample();
  change(o.data as { geometry: Rec; attributes: Rec; status: unknown });
  return parseStoredObject({ ...o, schema_version: CURRENT_SCHEMA_VERSION }).ok;
};

describe('EZD-511 act_grid schema', () => {
  it('is a new type at the current version; both samples hold one and parse whole', () => {
    expect(OBJECT_TYPES).toContain('act_grid');
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect(parseModelDocument(structuredClone(v6)).ok).toBe(true);
    expect(parseModelDocument(structuredClone(v7)).ok).toBe(true);
    const grid = sample();
    const room = objects().find((o) => o.type === 'room' && o.id === (grid.data.geometry as Rec).roomId);
    expect(room).toBeDefined();
    expect(room!.data.level).toBe(grid.data.level);
  });

  it('module is 2x2 or 2x4', () => {
    expect(parse((d) => (d.attributes.module = '2x4'))).toBe(true);
    expect(parse((d) => (d.attributes.module = '4x4'))).toBe(false);
    expect(parse((d) => delete d.attributes.module)).toBe(false);
  });

  it('direction is with or across the long wall', () => {
    expect(parse((d) => (d.attributes.direction = 'across_long_wall'))).toBe(true);
    expect(parse((d) => (d.attributes.direction = 'diagonal'))).toBe(false);
  });

  it('holds a start point and the balanced flag; border sizes are never stored', () => {
    expect(parse((d) => (d.attributes.balanced = false))).toBe(true);
    expect(parse((d) => (d.attributes.balanced = 'yes'))).toBe(false);
    expect(parse((d) => delete d.geometry.start)).toBe(false);
    expect(parse((d) => (d.geometry.roomId = 'not-a-uuid'))).toBe(false);
    expect(parse((d) => (d.attributes.borders = [12, 12]))).toBe(false);
  });

  it('carries a status like every drawn object', () => {
    for (const s of ['existing', 'demo', 'new']) expect(parse((d) => (d.status = s))).toBe(true);
    expect(parse((d) => (d.status = 'proposed'))).toBe(false);
  });
});
