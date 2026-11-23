// EZD-604 (phase-06 EZD-604 "Panel object in model_json ... with a default "Panel A"; New circuit in the next open
// space (disabled when none); rename by double-click; assign by clicking devices; circuit line and home run drawn;
// circuit tags; breaker, wire, name editable; 2-pole numbers like 1-3"; S06 Controls "New circuit | Creates a new
// circuit in the next open space. ... Disabled when no spaces left.", "Circuit row double-click | Rename circuit
// inline.", "Device toolbar: Circuit | Assign circuit by clicking devices in turn. Circuit line drawn automatically.";
// vault/build/assumptions.md EZD-604): New circuit, its edits and assigning devices to it. Each is one change set, so
// one undo step. Pure: no React, no DOM.
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  type ObjectStatus,
  type WireSize,
} from '@ezdraft/geometry';
import type { ObjectValue } from '../../lib/outbox/model-api';
import type { Change, Objects } from '../model/patches';

const lower = (s: string) => s.toLowerCase();

// vault/build/assumptions.md EZD-604 "New circuit defaults": 20 A, 1 pole, 12 AWG copper (NE2-071 pairing).
export const NEW_CIRCUIT = { breaker: 20, poles: 1, wire: '12' } as const;

// NEC 240.6(A) standard ampere ratings up to 100 A, the breaker choices of a circuit.
export const BREAKER_SIZES = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100] as const;

function find(objects: Objects, id: string, type: string): [string, ObjectValue] | null {
  for (const [k, v] of objects) if (lower(k) === lower(id)) return v.type === type ? [k, v] : null;
  return null;
}

type CircuitAttrs = {
  panel: string;
  space: number;
  poles: 1 | 2;
  order?: string[];
  [k: string]: unknown;
};

/** The spaces the panel's circuits take (a 2-pole circuit takes its space and the one two on), `skip` left out. */
function takenSpaces(objects: Objects, panelId: string, skip: string | null = null): Set<number> {
  const taken = new Set<number>();
  for (const [k, v] of objects) {
    if (v.type !== 'circuit' || (skip !== null && lower(k) === lower(skip))) continue;
    const a = (v.data as { attributes?: Partial<CircuitAttrs> }).attributes;
    if (a === undefined || typeof a.panel !== 'string' || lower(a.panel) !== lower(panelId))
      continue;
    if (typeof a.space !== 'number') continue;
    taken.add(a.space);
    if (a.poles === 2) taken.add(a.space + 2);
  }
  return taken;
}

function panelSpaces(objects: Objects, panelId: string): number | null {
  const p = find(objects, panelId, 'panel');
  const n = (p?.[1].data as { attributes?: { spaces?: unknown } } | undefined)?.attributes?.spaces;
  return typeof n === 'number' ? n : null;
}

/**
 * The lowest space a new 1-pole circuit can take on the panel, or null when every space is taken. While the panel's
 * spaces are Not set there is always a next space (vault/build/assumptions.md EZD-604).
 */
export function nextOpenSpace(objects: Objects, panelId: string | null): number | null {
  if (panelId === null) return 1;
  const taken = takenSpaces(objects, panelId);
  const spaces = panelSpaces(objects, panelId);
  for (let s = 1; spaces === null || s <= spaces; s++) if (!taken.has(s)) return s;
  return null;
}

export type NewCircuitCtx = {
  /** The panel the list shows; null when the model has none yet (Panel A is made first). */
  panelId: string | null;
  /** The open floor, the level of a new panel. */
  level: string | null;
  newId: () => string;
  status: ObjectStatus;
  /** "Circuit {n}" in the user's language. */
  name: (number: string) => string;
  /** "Panel A" in the user's language. */
  panelName: string;
};

/**
 * New circuit: one 1-pole circuit in the panel's next open space with the defaults, and, when the model has no panel,
 * the default panel first (name "Panel A", the View's new-object status, the open floor, values Not set). Null when
 * there is no space left or no floor for a new panel.
 */
export function newCircuitChanges(
  objects: Objects,
  ctx: NewCircuitCtx,
): { changes: Change[]; circuitId: string } | null {
  const changes: Change[] = [];
  let panelId = ctx.panelId;
  let level: string;
  if (panelId === null) {
    if (ctx.level === null) return null;
    level = ctx.level;
    panelId = ctx.newId();
    const data = {
      // The panel has no plan position yet (EZD-630 places it); the origin stands in.
      geometry: { point: { x: 0, y: 0 } },
      status: ctx.status,
      level,
      attributes: {
        name: ctx.panelName,
        parentPanel: null,
        serviceSize: null,
        mainBreaker: null,
        spaces: null,
      },
    };
    if (
      !parseStoredObject({
        id: panelId,
        type: 'panel',
        schema_version: CURRENT_SCHEMA_VERSION,
        data,
      }).ok
    )
      return null;
    changes.push({ id: panelId, value: { type: 'panel', schemaVersion: CURRENT_SCHEMA_VERSION, data } });
  } else {
    const p = find(objects, panelId, 'panel');
    if (p === null) return null;
    panelId = p[0];
    level = String((p[1].data as { level?: unknown }).level);
  }
  const space = nextOpenSpace(objects, ctx.panelId === null ? null : panelId);
  if (space === null) return null;
  const id = ctx.newId();
  const data = {
    status: ctx.status,
    level,
    attributes: {
      panel: panelId,
      space,
      poles: NEW_CIRCUIT.poles,
      name: ctx.name(String(space)),
      breaker: NEW_CIRCUIT.breaker,
      protection: null,
      dedicated: false,
      load: 0,
      wire: NEW_CIRCUIT.wire,
      order: [],
    },
  };
  if (!parseStoredObject({ id, type: 'circuit', schema_version: CURRENT_SCHEMA_VERSION, data }).ok)
    return null;
  changes.push({ id, value: { type: 'circuit', schemaVersion: CURRENT_SCHEMA_VERSION, data } });
  return { changes, circuitId: id };
}

export type CircuitEdit =
  | { field: 'name'; text: string }
  | { field: 'breaker'; amps: number }
  | { field: 'wire'; size: WireSize }
  | { field: 'poles'; poles: 1 | 2 };

/**
 * One edit of a circuit (S06 Selected circuit "Fields editable with Edit model (breaker, wire, name)"; poles for the
 * 2-pole numbers). Null when the value is not valid: an empty name, or 2 poles while the space two on is taken or past
 * the panel's spaces.
 */
export function circuitEditChange(objects: Objects, id: string, edit: CircuitEdit): Change | null {
  const c = find(objects, id, 'circuit');
  if (c === null) return null;
  const [key, value] = c;
  const a = (value.data as { attributes: CircuitAttrs }).attributes;
  let patch: Record<string, unknown>;
  if (edit.field === 'name') {
    const name = edit.text.trim();
    if (name === '') return null;
    patch = { name };
  } else if (edit.field === 'breaker') patch = { breaker: edit.amps };
  else if (edit.field === 'wire') patch = { wire: edit.size };
  else {
    if (edit.poles === 2 && a.poles !== 2) {
      const taken = takenSpaces(objects, a.panel, key);
      const spaces = panelSpaces(objects, a.panel);
      const second = a.space + 2;
      if (taken.has(second) || (spaces !== null && second > spaces)) return null;
    }
    patch = { poles: edit.poles };
  }
  const data = { ...value.data, attributes: { ...a, ...patch } };
  if (
    !parseStoredObject({ id: key, type: 'circuit', schema_version: value.schemaVersion, data }).ok
  )
    return null;
  return { id: key, value: { ...value, data } };
}

/**
 * Puts the devices on the circuit (null: on no circuit), in the order given. Each device that changes circuit is
 * taken out of its old circuit's order and added at the end of the new one's, so the circuit line runs through the
 * devices in the order they were clicked. A device already on the circuit is left where it is, so the result may be
 * empty (nothing to change). Null when an id is not a device or the circuit is not a circuit.
 */
export function assignChanges(
  objects: Objects,
  deviceIds: readonly string[],
  circuitId: string | null,
): Change[] | null {
  let target: string | null = null;
  if (circuitId !== null) {
    const c = find(objects, circuitId, 'circuit');
    if (c === null) return null;
    target = c[0];
  }
  const devices: Change[] = [];
  // The circuits whose order changes, by stored id, as edited copies.
  const orders = new Map<string, { value: ObjectValue; order: string[] }>();
  const orderOf = (cid: string) => {
    const hit = find(objects, cid, 'circuit');
    if (hit === null) return null;
    const got = orders.get(hit[0]);
    if (got !== undefined) return got;
    const a = (hit[1].data as { attributes: CircuitAttrs }).attributes;
    const entry = { value: hit[1], order: [...(a.order ?? [])] };
    orders.set(hit[0], entry);
    return entry;
  };
  for (const id of deviceIds) {
    const d = find(objects, id, 'device');
    if (d === null) return null;
    const [key, value] = d;
    const a = (value.data as { attributes: Record<string, unknown> }).attributes;
    const was = typeof a.circuit === 'string' ? a.circuit : null;
    if (was !== null && target !== null && lower(was) === lower(target)) {
      const own = orderOf(target);
      if (own !== null && !own.order.some((x) => lower(x) === lower(key))) own.order.push(key);
      continue;
    }
    if (was !== null) {
      const old = orderOf(was);
      if (old !== null) old.order = old.order.filter((x) => lower(x) !== lower(key));
    }
    if (target !== null) orderOf(target)!.order.push(key);
    const data = { ...value.data, attributes: { ...a, circuit: target } };
    if (
      !parseStoredObject({ id: key, type: 'device', schema_version: value.schemaVersion, data }).ok
    )
      return null;
    devices.push({ id: key, value: { ...value, data } });
  }
  const circuits: Change[] = [];
  for (const [key, { value, order }] of orders) {
    const a = (value.data as { attributes: CircuitAttrs }).attributes;
    const before = a.order ?? [];
    if (before.length === order.length && before.every((x, i) => x === order[i])) continue;
    const data = { ...value.data, attributes: { ...a, order } };
    if (
      !parseStoredObject({ id: key, type: 'circuit', schema_version: value.schemaVersion, data })
        .ok
    )
      return null;
    circuits.push({ id: key, value: { ...value, data } });
  }
  return [...devices, ...circuits];
}

/**
 * The devices on the circuit in circuit-line order: those in its stored `order` first, in that order, then the rest
 * in stored model order (devices put on it before EZD-604, or by a path that kept no order).
 */
export function circuitDeviceIds(objects: Objects, circuitId: string): string[] {
  const c = find(objects, circuitId, 'circuit');
  if (c === null) return [];
  const order = ((c[1].data as { attributes: CircuitAttrs }).attributes.order ?? []).map(lower);
  const on: string[] = [];
  for (const [k, v] of objects) {
    if (v.type !== 'device') continue;
    const a = (v.data as { attributes?: { circuit?: unknown } }).attributes;
    if (typeof a?.circuit === 'string' && lower(a.circuit) === lower(c[0])) on.push(k);
  }
  const rank = (id: string) => {
    const i = order.indexOf(lower(id));
    return i < 0 ? Infinity : i;
  };
  return on
    .map((id, i) => ({ id, i, r: rank(id) }))
    .sort((x, y) => (x.r === y.r ? x.i - y.i : x.r - y.r))
    .map((x) => x.id);
}

/** The letter a panel's circuits are tagged with: "Panel A" gives "A" (board home-run tag "A-14"). */
export function panelLetter(name: string): string {
  const rest = name.replace(/^\s*panel\s+/i, '').trim();
  return rest === '' ? name.trim() : rest;
}
