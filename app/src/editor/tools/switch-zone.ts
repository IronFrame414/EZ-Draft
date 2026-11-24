// EZD-510 (S05 Controls "Switching zones ... Edit model."; S05 Data shown "Switching zones and dimmers"; AC-EZD-510-1,
// -2; vault/build/assumptions.md EZD-510 "Zone data"): a new zone on the room under its first corner, and the zone
// inspector's Dimmer edit. Each is one change (one undo step), checked against the switch_zone schema. Loaded with
// the Ceiling view's lazy module (rcp.ts) and the inspector, never in the editor's first download (11 Budgets).
import {
  CURRENT_SCHEMA_VERSION,
  parseStoredObject,
  type ObjectStatus,
  type Point,
  type SwitchZoneData,
} from '@ezdraft/geometry';
import type { Change, Objects } from '../model/patches';
import { roomAt } from './beam-edits';

export { roomAt };
// EZD-605 (S05 Controls "Zones sync to switch legs on the electrical plan"; AC-EZD-605-1): the inspector's Dimmer edit
// with the zone's switches following it (switch-legs.ts), one change set.
export { zoneDimmerChanges } from '../electrical/switch-legs';

function storeZone(id: string, data: SwitchZoneData): Change | null {
  const r = parseStoredObject({ id, type: 'switch_zone', schema_version: CURRENT_SCHEMA_VERSION, data });
  if (!r.ok) return null;
  return {
    id,
    value: {
      type: 'switch_zone',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: r.object.data as unknown as Record<string, unknown>,
    },
  };
}

/** One new zone on the room under the first corner; null when that corner is in no room or the outline is refused. */
export function placeSwitchZone(
  objects: Objects,
  level: string,
  boundary: readonly Point[],
  dimmer: boolean,
  status: ObjectStatus,
  newId: () => string,
): Change | null {
  const first = boundary[0];
  if (first === undefined) return null;
  const room = roomAt(objects, level, first);
  if (room === null) return null;
  return storeZone(newId(), {
    geometry: { roomId: room.id, boundary: boundary.map((p) => ({ x: p.x, y: p.y })) },
    status,
    level: room.data.level,
    attributes: { dimmer },
  });
}

/** The zone stored under `id` (any case), or null when there is none or it does not parse. */
export function switchZoneOf(objects: Objects, id: string): { id: string; data: SwitchZoneData } | null {
  const lower = id.toLowerCase();
  for (const [key, v] of objects) {
    if (key.toLowerCase() !== lower || v.type !== 'switch_zone') continue;
    const r = parseStoredObject({ id: key, type: v.type, schema_version: v.schemaVersion, data: v.data });
    return r.ok && r.object.type === 'switch_zone' ? { id: key, data: r.object.data } : null;
  }
  return null;
}

/** The inspector's Dimmer edit: one change, or null when the zone is gone or already set so. */
export function setZoneDimmer(objects: Objects, id: string, dimmer: boolean): Change | null {
  const zone = switchZoneOf(objects, id);
  if (zone === null || zone.data.attributes.dimmer === dimmer) return null;
  return storeZone(zone.id, { ...zone.data, attributes: { ...zone.data.attributes, dimmer } });
}

