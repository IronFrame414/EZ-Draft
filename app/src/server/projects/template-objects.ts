// EZD-221a Build step 5 (vault/plans/EZD-221a.md Decided "buildTemplateObjects", "Throw outcome", "Ids"; Q-0565;
// Q-0558; Q-0559; Q-0569 (b); Q-0570): a template's four walls and one room, sent to create_project_with_objects,
// which replaces each `level` with the new project's floor.
import { randomUUID } from 'node:crypto';
import { CURRENT_SCHEMA_VERSION, createWallData, thicknessSideFor } from '@ezdraft/geometry';
import { TEMPLATE_ROOM_NAMES, type TemplateBody } from '../../lib/projects/templates';

export const TEMPLATE_LEVEL_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

export type TemplateObjectRow = {
  id: string;
  type: 'wall' | 'room';
  schema_version: number;
  data: Record<string, unknown>;
};

export function buildTemplateObjects(
  t: TemplateBody,
  newId: () => string = randomUUID,
): TemplateObjectRow[] {
  const W = t.width;
  const L = t.length;
  const c = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: L },
    { x: 0, y: L },
  ];
  const chain = c.map((start, i) => ({ start, end: c[(i + 1) % 4]! }));
  const side = thicknessSideFor({ kind: 'closed', chain });
  const rows: TemplateObjectRow[] = [];
  for (const line of chain) {
    const r = createWallData({
      start: line.start,
      end: line.end,
      level: TEMPLATE_LEVEL_PLACEHOLDER,
      thicknessSide: side,
    });
    if (r.ok === false) throw new Error('template_wall_refused');
    const data = { ...r.data, attributes: { ...r.data.attributes, height: t.ceilingHeight } };
    rows.push({ id: newId(), type: 'wall', schema_version: CURRENT_SCHEMA_VERSION, data });
  }
  rows.push({
    id: newId(),
    type: 'room',
    schema_version: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { boundary: c.map((p) => ({ x: p.x, y: p.y })) },
      status: 'existing',
      level: TEMPLATE_LEVEL_PLACEHOLDER,
      attributes: { name: TEMPLATE_ROOM_NAMES[t.key] },
      closureOverride: null,
    },
  });
  return rows;
}
