// EZD-610 (S06 Selected circuit block "breaker, wire, run length, voltage drop ... Voltage drop shows a warning above
// the threshold in settings"; S06 Decisions 8; 09b E-17 and "Voltage drop formula"; board S06Electrical "V-drop @16A
// 3.1%", "V-drop 3.1% is over the 3% limit (Defaults). Use 10/2 or shorten the run."; vault/build/assumptions/
// EZD-610.md): what the Selected circuit block shows for the chosen circuit's voltage drop. Pure: no React.
import {
  fixtureOutline,
  parseStoredObject,
  pointInRing,
  type FixtureObject,
  type ModelObject,
  type WireMaterial,
  type WireSize,
} from '@ezdraft/geometry';
import {
  generalCircuitAmps,
  suggestWireSize,
  voltageDrop,
  voltageDropWarns,
} from '@ezdraft/geometry/rules';
import type { Objects } from '../model/patches';
import { circuitDeviceIds } from './circuits';
import { idKey, sameId } from '../shared/ids';

export type CircuitVoltageDrop = {
  /** The current the drop is worked at (I), in amps. */
  amps: number;
  /** The circuit voltage, 120 or 240. */
  volts: number;
  /** Null while the run or the wire is Not set (the row shows "—", no warning). */
  percent: number | null;
  /** The percent to 1 decimal ("3.1"); null with `percent`. */
  shown: string | null;
  /** The company threshold; null while Not set (no warning, the row says "Set in Defaults"). */
  threshold: number | null;
  warns: boolean;
  /** With `warns`: the 09b size to use, or null for "Shorten the run." */
  suggestion: WireSize | null;
};

type CircuitInput = {
  id: string;
  breaker: number;
  poles: 1 | 2;
  dedicated: boolean;
  wire: WireSize | null;
  material: WireMaterial;
  run: number | null;
};

function parsed(v: { type: string; schemaVersion: number; data: unknown }, id: string) {
  const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
  return r.ok ? r.object : null;
}

/**
 * The served appliance's electric utility point on a dedicated circuit (vault/build/assumptions/EZD-610.md): the
 * first device on the circuit, in circuit-line order, that sits inside a fixture's outline on its floor names that
 * fixture (the smallest when several hold it, as EZD-234 links a point); the fixture's first electric utility point,
 * in model order, gives the amps and volts. Null when there is none.
 */
export function servedUtility(
  objects: Objects,
  circuitId: string,
): { amps: number; volts: number } | null {
  const fixtures: FixtureObject[] = [];
  const points: ModelObject[] = [];
  for (const [k, v] of objects) {
    if (v.type !== 'fixture' && v.type !== 'utility_point') continue;
    const o = parsed(v, k);
    if (o?.type === 'fixture') fixtures.push(o);
    else if (o?.type === 'utility_point') points.push(o);
  }
  if (fixtures.length === 0 || points.length === 0) return null;
  for (const id of circuitDeviceIds(objects, circuitId)) {
    const v = objects.get(id);
    if (v === undefined) continue;
    const d = parsed(v, id);
    if (d?.type !== 'device') continue;
    let best: FixtureObject | null = null;
    for (const f of fixtures) {
      if (!sameId(f.data.level, d.data.level)) continue;
      if (!pointInRing(d.data.geometry.point, fixtureOutline(f.data))) continue;
      const area = f.data.attributes.width * f.data.attributes.depth;
      if (best === null || area < best.data.attributes.width * best.data.attributes.depth) best = f;
    }
    if (best === null) continue;
    for (const p of points) {
      if (p.type !== 'utility_point') continue;
      const a = p.data.attributes;
      if (a.kind !== 'electric' || a.amps === null || a.volts === null) continue;
      if (a.servesObjectId !== null && idKey(a.servesObjectId) === idKey(best.id))
        return { amps: a.amps, volts: a.volts };
    }
  }
  return null;
}

/**
 * The chosen circuit's voltage drop: 80% of the breaker on a general circuit, the served appliance's utility point
 * amps on a dedicated one (80% of the breaker when it has none); 240 V on a 2-pole circuit, else 120 V, or the
 * utility point's volts when its amps are used.
 */
export function circuitVoltageDrop(
  objects: Objects,
  c: CircuitInput,
  threshold: number | null,
): CircuitVoltageDrop {
  const served = c.dedicated ? servedUtility(objects, c.id) : null;
  const amps = served?.amps ?? generalCircuitAmps(c.breaker);
  const volts = served?.volts ?? (c.poles === 2 ? 240 : 120);
  const none = { amps, volts, threshold, warns: false, suggestion: null };
  if (c.run === null || c.wire === null) return { ...none, percent: null, shown: null };
  const input = { wire: c.wire, material: c.material, amps, runFt: c.run, volts };
  const { percent } = voltageDrop(input);
  const warns = voltageDropWarns(percent, threshold);
  return {
    ...none,
    percent,
    shown: percent.toFixed(1),
    warns,
    suggestion: warns && threshold !== null ? suggestWireSize(input, threshold) : null,
  };
}

/** The company's "Voltage-drop warning" percent from the effective Defaults; null while Not set. */
export const voltageDropThreshold = (d: Readonly<Record<string, unknown>>): number | null => {
  const v = d['voltage_drop_warning'];
  return typeof v === 'number' ? v : null;
};
