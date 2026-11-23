// EZD-602 (S06 Controls Device toolbar "Receptacle ... type (duplex, 240V)", "Switch | Places single, 3-way, dimmer
// switches", "Low voltage | Places data, TV, doorbell, speakers"; 03f:13; migrate.ts version rule: added enum values
// keep every stored object valid, so the version stays at 7).
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from './migrate';
import { DEVICE_KINDS, parseStoredObject } from './index';

const device = (attributes: Record<string, unknown>) => ({
  id: '00000000-0000-4000-8000-000000000602',
  type: 'device',
  schema_version: CURRENT_SCHEMA_VERSION,
  data: {
    geometry: { point: { x: 1, y: 2 } },
    status: 'new',
    level: '11111111-1111-4111-8111-111111111111',
    attributes,
  },
});

describe('EZD-602 electrical device kinds', () => {
  it('the device type holds the receptacles, switches and low-voltage devices, at version 7', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    for (const kind of [
      'receptacle_duplex',
      'receptacle_240v',
      'switch_single',
      'switch_3way',
      'switch_dimmer',
      'data',
      'tv',
      'doorbell',
    ]) {
      expect(DEVICE_KINDS).toContain(kind);
      expect(parseStoredObject(device({ kind })).ok).toBe(true);
    }
  });

  it('a receptacle keeps its GFCI/AFCI and circuit', () => {
    const r = parseStoredObject(
      device({
        kind: 'receptacle_duplex',
        protection: 'gfci',
        circuit: '00000000-0000-4000-8000-000000000202',
      }),
    );
    expect(r.ok).toBe(true);
  });

  it('an unknown kind is refused', () => {
    expect(parseStoredObject(device({ kind: 'receptacle_quad' })).ok).toBe(false);
  });
});

// EZD-603 (S06 Controls "Device height note toggle ... Off by default."; R24 #36; 03f:13 "receptacles (GFCI/AFCI,
// height, circuit)"): the per-device note toggle, its label and the device's height, all optional at version 7.
describe('EZD-603 device height notes', () => {
  it('a device keeps its height note toggle, label and height, and a device without them stays valid', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect(
      parseStoredObject(
        device({ kind: 'receptacle_duplex', heightNote: true, heightLabel: 'MW', height: 66 }),
      ).ok,
    ).toBe(true);
    expect(parseStoredObject(device({ kind: 'switch_single', heightNote: false })).ok).toBe(true);
    expect(parseStoredObject(device({ kind: 'data', heightLabel: null, height: null })).ok).toBe(
      true,
    );
    expect(parseStoredObject(device({ kind: 'tv' })).ok).toBe(true);
  });

  it('a height of 0 or below, an empty label and a non-boolean toggle are refused', () => {
    expect(parseStoredObject(device({ kind: 'tv', height: 0 })).ok).toBe(false);
    expect(parseStoredObject(device({ kind: 'tv', height: -4 })).ok).toBe(false);
    expect(parseStoredObject(device({ kind: 'tv', heightLabel: '  ' })).ok).toBe(false);
    expect(parseStoredObject(device({ kind: 'tv', heightNote: 'yes' })).ok).toBe(false);
  });
});
