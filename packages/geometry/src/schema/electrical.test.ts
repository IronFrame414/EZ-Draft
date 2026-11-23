// EZD-601 the `panel` and `circuit` types and the device's circuit and protection (S06 Data shown: circuits
// "number (single or 2-pole e.g. "1-3"), name, breaker amps, poles, GFCI/AFCI/dual function, dedicated flag, ... VA";
// panel "name, main breaker, service size, spaces"; devices "type, circuit, GFCI/AFCI"; 03b rule 5: a change that
// keeps every stored object valid keeps the version).
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  EXISTING_APPLIANCE_KINDS,
  fileRefs,
  OBJECT_TYPES,
  parseModelDocument,
  parseStoredObject,
  type StoredObject,
} from './index';
import v7 from './samples/v7.json';

type Rec = Record<string, unknown>;
const objects = () => structuredClone((v7 as unknown as { objects: StoredObject[] }).objects);
const first = (type: string) => objects().find((o) => o.type === type)!;

const parse = (type: string, change: (d: { attributes: Rec } & Rec) => void) => {
  const o = first(type);
  change(o.data as { attributes: Rec } & Rec);
  return parseStoredObject(o).ok;
};

describe('EZD-601 panel and circuit schema', () => {
  it('panel and circuit are new types at the current version; the v7 sample parses whole', () => {
    expect(OBJECT_TYPES).toContain('panel');
    expect(OBJECT_TYPES).toContain('circuit');
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
    expect(parseModelDocument(structuredClone(v7)).ok).toBe(true);
  });

  it('a circuit is 1- or 2-pole with GFCI, AFCI, dual function or no protection', () => {
    expect(parse('circuit', (d) => (d.attributes.poles = 1))).toBe(true);
    expect(parse('circuit', (d) => (d.attributes.poles = 3))).toBe(false);
    for (const p of ['gfci', 'afci', 'dual', null])
      expect(parse('circuit', (d) => (d.attributes.protection = p))).toBe(true);
    expect(parse('circuit', (d) => (d.attributes.protection = 'rcd'))).toBe(false);
    expect(parse('circuit', (d) => (d.attributes.space = 0))).toBe(false);
    expect(parse('circuit', (d) => (d.attributes.load = -1))).toBe(false);
    expect(parse('circuit', (d) => (d.attributes.panel = 'Panel A'))).toBe(false);
  });

  it('a subpanel names its parent; a main panel has none', () => {
    expect(parse('panel', (d) => (d.attributes.parentPanel = null))).toBe(true);
    expect(
      parse('panel', (d) => (d.attributes.parentPanel = '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f99')),
    ).toBe(true);
    expect(parse('panel', (d) => (d.attributes.name = ''))).toBe(false);
    expect(parse('panel', (d) => (d.attributes.spaces = 0))).toBe(false);
  });

  it('a stored device without circuit or protection stays valid; with them it parses', () => {
    expect(parse('device', () => {})).toBe(true);
    expect(
      parse('device', (d) => {
        d.attributes.circuit = '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f02';
        d.attributes.protection = 'gfci';
      }),
    ).toBe(true);
    expect(parse('device', (d) => (d.attributes.circuit = null))).toBe(true);
    expect(parse('device', (d) => (d.attributes.protection = 'rcd'))).toBe(false);
  });
});

// EZD-604 (phase-06 EZD-604 row; vault/build/assumptions.md EZD-604 "New panel values ... the three values Not set";
// "New circuit defaults | 20 A, 1 pole, 12 AWG copper"): the panel's Not-set values, the circuit's wire size and the
// devices' click order, all without a version step.
describe('EZD-604 panel defaults, wire and order', () => {
  it('a panel with main breaker, spaces and service size Not set parses', () => {
    expect(
      parse('panel', (d) => {
        d.attributes.mainBreaker = null;
        d.attributes.spaces = null;
        d.attributes.serviceSize = null;
      }),
    ).toBe(true);
    expect(parse('panel', (d) => (d.attributes.mainBreaker = 0))).toBe(false);
  });

  it('a circuit stored before EZD-604 (no wire, no order) still parses; wire is an AWG size', () => {
    expect(parse('circuit', () => {})).toBe(true);
    expect(parse('circuit', (d) => (d.attributes.wire = '12'))).toBe(true);
    expect(parse('circuit', (d) => (d.attributes.wire = '6'))).toBe(true);
    expect(parse('circuit', (d) => (d.attributes.wire = '1/0'))).toBe(true);
    expect(parse('circuit', (d) => (d.attributes.wire = '13'))).toBe(false);
    expect(parse('circuit', (d) => (d.attributes.wire = 12))).toBe(false);
  });

  it('a circuit keeps its devices in click order, by id', () => {
    expect(
      parse(
        'circuit',
        (d) =>
          (d.attributes.order = [
            '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f02',
            '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f01',
          ]),
      ),
    ).toBe(true);
    expect(parse('circuit', (d) => (d.attributes.order = ['not-an-id']))).toBe(false);
  });
});

// EZD-606 (phase-06 EZD-606 "Existing panel fields on the panel object in model_json (brand, label photo)"; S06
// Controls "Existing panel ... existing large appliances (range, dryer, AC, water heater)"; 03c panel
// "label_photo_id"; 03b rule 5).
describe('EZD-606 existing panel fields', () => {
  const PHOTO = '8b2f1d4e-6c3a-4f9b-8d72-1e5a4c3b2f77';

  it('a panel stored before EZD-606 (no brand, label photo or appliances) still parses', () => {
    expect(parse('panel', () => {})).toBe(true);
    expect(CURRENT_SCHEMA_VERSION).toBe(7);
  });

  it('brand is a non-empty name or null; the label photo is a file id or null', () => {
    expect(parse('panel', (d) => (d.attributes.brand = 'Square D'))).toBe(true);
    expect(parse('panel', (d) => (d.attributes.brand = null))).toBe(true);
    expect(parse('panel', (d) => (d.attributes.brand = ''))).toBe(false);
    expect(parse('panel', (d) => (d.attributes.brand = 'x'.repeat(81)))).toBe(false);
    expect(parse('panel', (d) => (d.attributes.labelPhoto = PHOTO))).toBe(true);
    expect(parse('panel', (d) => (d.attributes.labelPhoto = null))).toBe(true);
    expect(parse('panel', (d) => (d.attributes.labelPhoto = 'photo.jpg'))).toBe(false);
  });

  it('the existing large appliances are range, dryer, AC and water heater, with VA or null', () => {
    expect([...EXISTING_APPLIANCE_KINDS]).toEqual(['range', 'dryer', 'ac', 'water_heater']);
    expect(
      parse(
        'panel',
        (d) =>
          (d.attributes.appliances = [
            { kind: 'range', va: 12000 },
            { kind: 'water_heater', va: null },
          ]),
      ),
    ).toBe(true);
    expect(parse('panel', (d) => (d.attributes.appliances = [{ kind: 'pool_pump', va: 1 }]))).toBe(
      false,
    );
    expect(parse('panel', (d) => (d.attributes.appliances = [{ kind: 'range', va: 0 }]))).toBe(
      false,
    );
  });

  it('the save check reads the label photo as a panel_photo file', () => {
    const o = first('panel');
    (o.data as { attributes: Rec }).attributes.labelPhoto = PHOTO;
    const r = parseStoredObject(o);
    expect(r.ok).toBe(true);
    if (r.ok) expect(fileRefs(r.object)).toEqual([{ fileId: PHOTO, kinds: ['panel_photo'] }]);
    const bare = parseStoredObject(first('panel'));
    if (bare.ok) expect(fileRefs(bare.object)).toEqual([]);
  });
});
