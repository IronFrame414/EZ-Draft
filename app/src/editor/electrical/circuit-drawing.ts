// EZD-604 (phase-06 EZD-604 "circuit line and home run drawn; circuit tags"; S06 Controls "Device toolbar: Circuit |
// Assign circuit by clicking devices in turn. Circuit line drawn automatically.", "Circuit row | Click selects the
// circuit: highlights its devices and home run on canvas", "Show chips: ... Home runs"; board S06Electrical (a "14"
// tag beside each device of circuit 14, the line through them, and the home-run arrow tagged "A-14"); AC-EZD-604-1;
// vault/build/assumptions.md EZD-604): the plan marks of the circuits on one floor. Every device on a circuit gets its
// circuit number as a tag to the left of its symbol; the circuit line joins its devices in click order; the home run
// is an arrow from the circuit's first device, away from the rest, tagged with the panel letter and the number. Home
// runs show for every circuit with the Home runs chip on, else for the circuit chosen in the left panel. Every item
// carries a device's id and layer, so it highlights with its devices and hides with their status. Pure.
import {
  DRAWING_FONTS,
  measureTextPt,
  parseStoredObject,
  type DrawingItem,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import type { Objects } from '../model/patches';
import { PT_TO_MODEL_IN } from '../plan/glyph-atlas';
import { circuitDeviceIds, panelLetter } from './circuits';
import { circuitNumber } from './electrical';

// Model inches: the gap between a symbol and its tag, the home-run arrow's length and its head's sides.
export const CIRCUIT_TAG_GAP_IN = 2;
export const HOME_RUN_IN = 36;
export const ARROW_HEAD_IN = 6;
const ARROW_HEAD_DEG = 25;

export type CircuitDrawOpts = {
  /** The whole model: circuits and panels may stand on another floor's list. */
  all: Objects;
  /** The circuit chosen in the left panel. */
  circuit: string | null;
  homeRuns: boolean;
  /** EZD-605: the Switch legs chip; the plan draws switch legs (switch-legs.ts) while it is on. */
  switchLegs?: boolean;
  /** The radius of a device's symbol. */
  radiusOf: (kind: string) => number;
};

type CircuitInfo = { id: string; number: string; tag: string };

const lower = (s: string) => s.toLowerCase();

function circuitInfo(all: Objects): Map<string, CircuitInfo> {
  const panels = new Map<string, string>();
  const circuits: { id: string; panel: string; number: string }[] = [];
  for (const [id, v] of all) {
    if (v.type !== 'panel' && v.type !== 'circuit') continue;
    const r = parseStoredObject({ id, type: v.type, schema_version: v.schemaVersion, data: v.data });
    if (!r.ok) continue;
    const o = r.object;
    if (o.type === 'panel') panels.set(lower(o.id), panelLetter(o.data.attributes.name));
    else if (o.type === 'circuit') {
      const a = o.data.attributes;
      circuits.push({ id: o.id, panel: a.panel, number: circuitNumber(a.space, a.poles) });
    }
  }
  const out = new Map<string, CircuitInfo>();
  for (const c of circuits) {
    const letter = panels.get(lower(c.panel));
    out.set(lower(c.id), {
      id: c.id,
      number: c.number,
      tag: letter === undefined ? c.number : `${letter}-${c.number}`,
    });
  }
  return out;
}

const add = (p: Point, u: Point, k: number): Point => ({ x: p.x + u.x * k, y: p.y + u.y * k });
const rotate = (u: Point, deg: number): Point => {
  const r = (deg * Math.PI) / 180;
  return { x: u.x * Math.cos(r) - u.y * Math.sin(r), y: u.x * Math.sin(r) + u.y * Math.cos(r) };
};

/**
 * The home run's direction from the first device: away from the middle of the circuit's other devices on the floor;
 * straight down the plan (-y) when it has none or they sit on it.
 */
export function homeRunDirection(first: Point, others: readonly Point[]): Point {
  if (others.length > 0) {
    const mx = others.reduce((s, p) => s + p.x, 0) / others.length;
    const my = others.reduce((s, p) => s + p.y, 0) / others.length;
    const dx = first.x - mx;
    const dy = first.y - my;
    const len = Math.hypot(dx, dy);
    if (len > 1e-9) return { x: dx / len, y: dy / len };
  }
  return { x: 0, y: -1 };
}

export function circuitItems(
  onFloor: readonly ModelObject[],
  textPt: number,
  opts: CircuitDrawOpts,
): DrawingItem[] {
  const info = circuitInfo(opts.all);
  if (info.size === 0) return [];
  const font = DRAWING_FONTS['dm-mono-400'];
  const text = (
    base: { layer: DrawingItem['layer']; objectId: string },
    s: string,
    at: Point,
  ): DrawingItem => ({
    ...base,
    kind: 'text',
    text: s,
    font: 'dm-mono-400',
    sizePt: textPt,
    widthPt: measureTextPt(font, s, textPt),
    at,
    rotationDeg: 0,
    align: 'center',
  });
  const out: DrawingItem[] = [];
  type Dev = { id: string; at: Point; r: number; layer: DrawingItem['layer'] };
  const devices = new Map<string, Dev>();
  const onCircuit = new Set<string>();
  for (const o of onFloor) {
    if (o.type !== 'device') continue;
    const a = o.data.attributes;
    const c = typeof a.circuit === 'string' ? info.get(lower(a.circuit)) : undefined;
    if (c === undefined) continue;
    const at = o.data.geometry.point;
    const r = opts.radiusOf(a.kind);
    const dev = { id: o.id, at, r, layer: o.data.status };
    devices.set(lower(o.id), dev);
    onCircuit.add(lower(c.id));
    const w = measureTextPt(font, c.number, textPt) * PT_TO_MODEL_IN;
    out.push(
      text({ layer: dev.layer, objectId: o.id }, c.number, {
        x: at.x - r - CIRCUIT_TAG_GAP_IN - w / 2,
        y: at.y,
      }),
    );
  }
  for (const key of onCircuit) {
    const c = info.get(key)!;
    const chain = circuitDeviceIds(opts.all, c.id)
      .map((id) => devices.get(lower(id)))
      .filter((d): d is Dev => d !== undefined);
    for (let i = 1; i < chain.length; i++) {
      const a = chain[i - 1]!;
      const b = chain[i]!;
      const len = Math.hypot(b.at.x - a.at.x, b.at.y - a.at.y);
      if (len <= a.r + b.r) continue;
      const u = { x: (b.at.x - a.at.x) / len, y: (b.at.y - a.at.y) / len };
      out.push({
        layer: a.layer,
        objectId: a.id,
        kind: 'line',
        role: 'beyond',
        from: add(a.at, u, a.r),
        to: add(b.at, u, -b.r),
      });
    }
    const shown = opts.homeRuns || (opts.circuit !== null && lower(opts.circuit) === key);
    const first = chain[0];
    if (!shown || first === undefined) continue;
    const u = homeRunDirection(
      first.at,
      chain.slice(1).map((d) => d.at),
    );
    const base = { layer: first.layer, objectId: first.id };
    const from = add(first.at, u, first.r);
    const tip = add(from, u, HOME_RUN_IN);
    out.push({ ...base, kind: 'line', role: 'beyond', from, to: tip });
    for (const deg of [ARROW_HEAD_DEG, -ARROW_HEAD_DEG])
      out.push({
        ...base,
        kind: 'line',
        role: 'beyond',
        from: tip,
        to: add(tip, rotate(u, 180 + deg), ARROW_HEAD_IN),
      });
    const w = measureTextPt(font, c.tag, textPt) * PT_TO_MODEL_IN;
    // Past the tip by the gap and half the tag along the arrow, so it clears the tip whichever way the arrow runs.
    const off = CIRCUIT_TAG_GAP_IN + Math.abs(u.x) * (w / 2) + Math.abs(u.y) * ((textPt * PT_TO_MODEL_IN) / 2);
    out.push(text(base, c.tag, add(tip, u, off)));
  }
  return out;
}
