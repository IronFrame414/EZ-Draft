// EZD-507 (S05 Controls "Recessed light", "Ceiling fan", "Smoke or CO detector", "Speaker or low voltage" (in-ceiling
// speaker, camera or Wi-Fi access point), "Access panel" (access panel or attic hatch), "Fixture type tag edit" (type
// tag, lumens, color temperature, trim, catalog item); 03f:13 electrical devices; Q-0704 03-data-model row 2 "Detectors
// ... use the electrical device type that EZD-507 and 03f:13 use", "The access type has kind attic_hatch; EZD-507 adds
// access_panel"; migrate.ts version rule: a change that keeps every stored object valid keeps the version).
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from './migrate';
import { ACCESS_KINDS, DEVICE_KINDS, parseStoredObject } from './index';
import v7 from './samples/v7.json';

const LEVEL = '11111111-1111-4111-8111-111111111111';
const ID = '00000000-0000-4000-8000-000000000507';

const device = (attributes: Record<string, unknown>) => ({
  id: ID,
  type: 'device',
  schema_version: CURRENT_SCHEMA_VERSION,
  data: { geometry: { point: { x: 10, y: 20 } }, status: 'new', level: LEVEL, attributes },
});

describe('EZD-507 ceiling device schema', () => {
  it('the device type holds every ceiling device kind, the detectors kept', () => {
    for (const kind of [
      'recessed_light',
      'ceiling_fan',
      'smoke_detector',
      'co_detector',
      'smoke_co_detector',
      'speaker',
      'camera',
      'wifi_ap',
    ])
      expect(DEVICE_KINDS).toContain(kind);
    for (const kind of DEVICE_KINDS) expect(parseStoredObject(device({ kind })).ok).toBe(true);
  });

  it('the access type holds the access panel and the attic hatch', () => {
    expect([...ACCESS_KINDS].sort()).toEqual(['access_panel', 'attic_hatch']);
    for (const kind of ACCESS_KINDS) {
      const r = parseStoredObject({
        id: ID,
        type: 'access',
        schema_version: CURRENT_SCHEMA_VERSION,
        data: {
          geometry: { center: { x: 0, y: 0 }, axis: { x: 1, y: 0 } },
          status: 'existing',
          level: LEVEL,
          attributes: { kind, width: 14, depth: 14 },
        },
      });
      expect(r.ok).toBe(true);
    }
  });

  it('a light stores its fixture type: tag, lumens, color temperature, trim and catalog item', () => {
    const r = parseStoredObject(
      device({
        kind: 'recessed_light',
        typeTag: 'A',
        lumens: 800,
        colorTemp: 3000,
        trim: 'White baffle',
        catalogItemId: '00000000-0000-4000-8000-000000000900',
      }),
    );
    expect(r.ok).toBe(true);
    expect(
      r.ok && (r.object.data as { attributes: Record<string, unknown> }).attributes,
    ).toMatchObject({
      typeTag: 'A',
      lumens: 800,
      colorTemp: 3000,
      trim: 'White baffle',
    });
    // Each may be null (not set).
    expect(
      parseStoredObject(
        device({
          kind: 'recessed_light',
          typeTag: null,
          lumens: null,
          colorTemp: null,
          trim: null,
          catalogItemId: null,
        }),
      ).ok,
    ).toBe(true);
  });

  it('refuses lumens or a color temperature not a whole number above 0, an empty tag and a catalog id not a uuid', () => {
    for (const bad of [
      { lumens: 0 },
      { lumens: -800 },
      { lumens: 800.5 },
      { colorTemp: 0 },
      { colorTemp: 2700.5 },
      { typeTag: '' },
      { trim: '' },
      { catalogItemId: 'can-4' },
      { unknownField: 1 },
    ])
      expect(parseStoredObject(device({ kind: 'recessed_light', ...bad })).ok).toBe(false);
    expect(parseStoredObject(device({ kind: 'sprinkler' })).ok).toBe(false);
  });

  it('keeps the schema version: every stored device and access object of v7 still parses unchanged', () => {
    const objects = (v7 as { objects: Array<{ type: string }> }).objects;
    for (const o of objects.filter((x) => x.type === 'device' || x.type === 'access'))
      expect(parseStoredObject(structuredClone(o) as never).ok).toBe(true);
    // A detector stored before EZD-507, with no fixture type fields, still parses.
    expect(parseStoredObject(device({ kind: 'smoke_detector' })).ok).toBe(true);
  });
});
