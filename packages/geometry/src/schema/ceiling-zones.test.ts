// EZD-510 the `switch_zone` type (S05 Controls "Switching zones: Draws switching zones and dimmers on the RCP"; S05
// Data shown "Switching zones and dimmers"; vault/build/assumptions.md EZD-510 "Zone data": roomId, a closed polygon
// drawn by clicks, dimmer true or false; AC-EZD-510-1 "Zones draw and save with the room").
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, OBJECT_TYPES, parseModelDocument, parseStoredObject } from './index';
import v7 from './samples/v7.json';

type Rec = Record<string, unknown>;
type Stored = { type: string; data: Rec; id: string; schema_version: number };
const objects = () => structuredClone((v7 as { objects: Stored[] }).objects);
const sample = () => objects().find((o) => o.type === 'switch_zone')!;

const parse = (change: (d: { geometry: Rec; attributes: Rec; status: unknown }) => void) => {
  const o = sample();
  change(o.data as { geometry: Rec; attributes: Rec; status: unknown });
  return parseStoredObject({ ...o, schema_version: CURRENT_SCHEMA_VERSION }).ok;
};

describe('EZD-510 switch_zone schema', () => {
  it('is a new type at the current version; the v7 sample parses whole', () => {
    expect(OBJECT_TYPES).toContain('switch_zone');
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect(parseModelDocument(structuredClone(v7)).ok).toBe(true);
  });

  it('AC-EZD-510-1 saves with its room: the sample zone names a room of the same floor', () => {
    const zone = sample();
    const geometry = zone.data.geometry as { roomId: string };
    const room = objects().find((o) => o.type === 'room' && o.id === geometry.roomId);
    expect(room).toBeDefined();
    expect(room!.data.level).toBe(zone.data.level);
    const parsed = parseStoredObject(zone);
    expect(parsed.ok && parsed.object.type === 'switch_zone').toBe(true);
  });

  it('is a closed outline of at least three points', () => {
    expect(
      parse(
        (d) =>
          (d.geometry.boundary = [
            { x: 0, y: 0 },
            { x: 24, y: 0 },
            { x: 0, y: 24 },
          ]),
      ),
    ).toBe(true);
    expect(
      parse(
        (d) =>
          (d.geometry.boundary = [
            { x: 0, y: 0 },
            { x: 24, y: 0 },
          ]),
      ),
    ).toBe(false);
    expect(parse((d) => (d.geometry.roomId = 'not-a-uuid'))).toBe(false);
    expect(parse((d) => delete d.geometry.roomId)).toBe(false);
  });

  it('dimmer is true or false, nothing else', () => {
    expect(parse((d) => (d.attributes.dimmer = false))).toBe(true);
    expect(parse((d) => (d.attributes.dimmer = true))).toBe(true);
    expect(parse((d) => (d.attributes.dimmer = 'yes'))).toBe(false);
    expect(parse((d) => delete d.attributes.dimmer)).toBe(false);
    expect(parse((d) => (d.attributes.lights = []))).toBe(false);
  });

  it('carries a status like every drawn object', () => {
    for (const s of ['existing', 'demo', 'new']) expect(parse((d) => (d.status = s))).toBe(true);
    expect(parse((d) => (d.status = 'proposed'))).toBe(false);
  });
});
