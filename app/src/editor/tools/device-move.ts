// EZD-602 (S06 "Canvas drag device: Moves device"): the electrical devices of a level, which the move drag takes.
// Kept out of model-changes.ts, which the editor entry loads (11 Budgets); only the drawing engine reads this.
import { parseStoredObject, type ModelObject } from '@ezdraft/geometry';
import type { Objects } from '../model/patches';

export type DeviceObject = Extract<ModelObject, { type: 'device' }>;
export function devicesOn(objects: Objects, level: string): DeviceObject[] {
  const lvl = level.toLowerCase();
  const out: DeviceObject[] = [];
  for (const [id, v] of objects) {
    if (v.type !== 'device') continue;
    if (typeof v.data.level !== 'string' || v.data.level.toLowerCase() !== lvl) continue;
    const r = parseStoredObject({
      id,
      type: v.type,
      schema_version: v.schemaVersion,
      data: v.data,
    });
    if (r.ok && r.object.type === 'device') out.push(r.object);
  }
  return out;
}
