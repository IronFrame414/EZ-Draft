// EZD-601 (S06 Controls "Circuits tab: Lists circuits for the selected panel", "Devices tab: Lists placed devices
// grouped by room: device type, circuit, GFCI/AFCI", "Panel selector: Switch between main panel and subpanels",
// "Circuit row: ... circuit number, name, breaker/type/count, VA", "Circuit/space footer: Shows "8 circuits ·
// 11 spaces" and total connected VA"; S06 Data shown "number (single or 2-pole e.g. "1-3")"; S06 Decisions 9; board
// S06Electrical left panel; AC-EZD-601-1; vault/build/assumptions.md EZD-601): what the electrical left panel lists,
// read from the open model. Pure: no React.
import {
  outlineAreaSqIn,
  parseStoredObject,
  pointInRing,
  type CircuitProtection,
  type ModelObject,
  type ObjectStatus,
  type RoomObject,
  type WireMaterial,
  type WireSize,
} from '@ezdraft/geometry';
import type { Objects } from '../model/patches';
import { idKey, sameId } from '../shared/ids';

function parsedObjects(objects: Objects): ModelObject[] {
  const out: ModelObject[] = [];
  for (const [id, v] of objects) {
    if (v.type !== 'panel' && v.type !== 'circuit' && v.type !== 'device' && v.type !== 'room')
      continue;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (r.ok) out.push(r.object);
  }
  return out;
}

export type PanelRow = {
  id: string;
  name: string;
  // EZD-604: null while Not set (a new Panel A).
  mainBreaker: number | null;
  serviceSize: number | null;
  parentPanel: string | null;
  spaces: number | null;
};

/** The model's panels: main panels (no parent) first, then subpanels, each in stored order. */
export function panelRows(objects: Objects): PanelRow[] {
  const rows: PanelRow[] = [];
  for (const o of parsedObjects(objects)) {
    if (o.type !== 'panel') continue;
    const a = o.data.attributes;
    rows.push({
      id: o.id,
      name: a.name,
      mainBreaker: a.mainBreaker,
      serviceSize: a.serviceSize,
      parentPanel: a.parentPanel,
      spaces: a.spaces,
    });
  }
  return [
    ...rows.filter((p) => p.parentPanel === null),
    ...rows.filter((p) => p.parentPanel !== null),
  ];
}

/** S06 Data shown: a 1-pole circuit is its space ("12"); a 2-pole one takes the space on the same leg, two on ("1-3"). */
export function circuitNumber(space: number, poles: 1 | 2): string {
  return poles === 2 ? `${space}-${space + 2}` : String(space);
}

export type CircuitRow = {
  id: string;
  number: string;
  space: number;
  name: string;
  breaker: number;
  poles: 1 | 2;
  protection: CircuitProtection | null;
  dedicated: boolean;
  load: number;
  // EZD-604 (S06 Circuit row "breaker/type/count"; board "4 rcpt", "9 fix."): its devices, by sort.
  count: DeviceCount;
  // EZD-604: its wire size (AWG); null on a circuit stored before EZD-604.
  wire: WireSize | null;
  // EZD-610: its wire material (absent reads as copper) and one-way run in feet (null: Not set).
  material: WireMaterial;
  run: number | null;
};

// EZD-604: receptacles; lights and fans (fixtures); every other device.
export type DeviceCount = { receptacles: number; fixtures: number; other: number };

const FIXTURE_KINDS = new Set(['recessed_light', 'ceiling_fan']);

function deviceCounts(all: readonly ModelObject[]): Map<string, DeviceCount> {
  const out = new Map<string, DeviceCount>();
  for (const o of all) {
    if (o.type !== 'device') continue;
    const c = o.data.attributes.circuit;
    if (typeof c !== 'string') continue;
    const n = out.get(idKey(c)) ?? { receptacles: 0, fixtures: 0, other: 0 };
    const kind = o.data.attributes.kind;
    if (kind.startsWith('receptacle_')) n.receptacles++;
    else if (FIXTURE_KINDS.has(kind)) n.fixtures++;
    else n.other++;
    out.set(idKey(c), n);
  }
  return out;
}

/** The circuits on one panel, by space. */
export function circuitRows(objects: Objects, panelId: string | null): CircuitRow[] {
  if (panelId === null) return [];
  const rows: CircuitRow[] = [];
  const all = parsedObjects(objects);
  const counts = deviceCounts(all);
  for (const o of all) {
    if (o.type !== 'circuit' || !sameId(o.data.attributes.panel, panelId)) continue;
    const a = o.data.attributes;
    rows.push({
      id: o.id,
      number: circuitNumber(a.space, a.poles),
      space: a.space,
      name: a.name,
      breaker: a.breaker,
      poles: a.poles,
      protection: a.protection,
      dedicated: a.dedicated,
      load: a.load,
      count: counts.get(idKey(o.id)) ?? { receptacles: 0, fixtures: 0, other: 0 },
      wire: a.wire ?? null,
      material: a.material ?? 'copper',
      run: a.runLength ?? null,
    });
  }
  return rows.sort((x, y) => x.space - y.space);
}

export type PanelTotals = { circuits: number; spaces: number; va: number };

/** The footer: the circuits listed, the spaces they take (a 2-pole circuit takes two) and their connected VA. */
export function panelTotals(rows: readonly CircuitRow[]): PanelTotals {
  let spaces = 0;
  let va = 0;
  for (const r of rows) {
    spaces += r.poles;
    va += r.load;
  }
  return { circuits: rows.length, spaces, va };
}

export type DeviceRow = {
  id: string;
  kind: string;
  status: ObjectStatus;
  // The circuit number, or null when the device is on no circuit.
  circuit: string | null;
  protection: CircuitProtection | null;
};

export type DeviceGroup = {
  // null: the devices in no room on the floor.
  roomId: string | null;
  name: string | null;
  devices: DeviceRow[];
};

/**
 * The devices on one floor grouped by the room each stands in (the smallest room holding its point), rooms in stored
 * order and only rooms with devices, then the devices in no room. A device shows its own protection, else its
 * circuit's.
 */
export function deviceGroups(objects: Objects, floorId: string | null): DeviceGroup[] {
  if (floorId === null) return [];
  const floor = idKey(floorId);
  const all = parsedObjects(objects);
  const circuits = new Map<string, { number: string; protection: CircuitProtection | null }>();
  const rooms: RoomObject[] = [];
  for (const o of all) {
    if (o.type === 'circuit') {
      const a = o.data.attributes;
      circuits.set(idKey(o.id), {
        number: circuitNumber(a.space, a.poles),
        protection: a.protection,
      });
    } else if (o.type === 'room' && idKey(o.data.level) === floor) rooms.push(o);
  }
  const byRoom = new Map<string | null, DeviceRow[]>();
  for (const o of all) {
    if (o.type !== 'device' || idKey(o.data.level) !== floor) continue;
    const at = o.data.geometry.point;
    let room: RoomObject | null = null;
    let best = Infinity;
    for (const r of rooms) {
      const b = r.data.geometry.boundary;
      if (!pointInRing(at, b)) continue;
      const area = outlineAreaSqIn(b);
      if (area < best) {
        room = r;
        best = area;
      }
    }
    const a = o.data.attributes;
    const circuit =
      a.circuit === undefined || a.circuit === null
        ? null
        : (circuits.get(idKey(a.circuit)) ?? null);
    const key = room === null ? null : room.id;
    const list = byRoom.get(key) ?? [];
    list.push({
      id: o.id,
      kind: a.kind,
      status: o.data.status,
      circuit: circuit?.number ?? null,
      protection: a.protection ?? circuit?.protection ?? null,
    });
    byRoom.set(key, list);
  }
  const groups: DeviceGroup[] = [];
  for (const r of rooms) {
    const devices = byRoom.get(r.id);
    if (devices !== undefined) groups.push({ roomId: r.id, name: r.data.attributes.name, devices });
  }
  const loose = byRoom.get(null);
  if (loose !== undefined) groups.push({ roomId: null, name: null, devices: loose });
  return groups;
}
