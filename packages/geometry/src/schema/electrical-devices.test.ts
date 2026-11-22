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
