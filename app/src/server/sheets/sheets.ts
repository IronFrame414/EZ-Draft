// EZD-701 (AC-EZD-701-1, -2): a project's permit set, read through the member's session so project RLS applies.
// Another company's project, or one outside the member's scope, reads as null.
import { SCHEDULE_OBJECT_TYPES, scheduleRowsOf, withScheduleSheets } from '../../lib/sheets/cabinet-schedule-table';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isScopeTrade } from '../../lib/projects/new-project';
import {
  parseStoredObject,
  SHEET_SET_KINDS,
  type SheetSetData,
  type SheetSetKind,
} from '@ezdraft/geometry';
import {
  defaultSheetSet,
  defaultSheetSetData,
  sheetsForSet,
  withFloorSheets,
  type Sheet,
  type SheetFloor,
  type SheetSetSummary,
} from '../../lib/sheets/sheet-set';
import type { Database } from '../db/database.types';

export async function loadProjectSheets(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<Sheet[] | null> {
  const { data, error } = await client
    .from('project')
    .select('scope_trades')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return null;
  return defaultSheetSet(data.scope_trades.filter(isScopeTrade));
}

// EZD-726 (S13 Set selector; 03b rule 3; AC-EZD-726-1): the set selector query. Exactly one permit set and one
// client set, permit first, each with its sheets. A set is the project's live sheet_set model object of that kind
// (the lowest id if a save ever left two); a kind with none stored, or whose object does not parse, is the default
// set. Read through the member's session so project and model_object RLS apply: another company's project, or one
// outside the member's scope, reads as null.
// EZD-703 (Q-0509): each floor after the lowest adds its copies of the floor-plan sheets (withFloorSheets), and a set
// returns its stored viewports and changed-viewport sheets (null while it has none).
export async function loadProjectSheetSets(
  client: SupabaseClient<Database>,
  projectId: string,
): Promise<SheetSetSummary[] | null> {
  const project = await client
    .from('project')
    .select('scope_trades')
    .eq('id', projectId)
    .maybeSingle();
  if (project.error) throw project.error;
  if (project.data === null) return null;
  const trades = project.data.scope_trades.filter(isScopeTrade);
  const rows = await client
    .from('model_object')
    .select('object_id, type, schema_version, data')
    .eq('project_id', projectId)
    .in('type', ['sheet_set', 'floor', ...SCHEDULE_OBJECT_TYPES])
    .eq('deleted', false)
    .order('object_id');
  if (rows.error) throw rows.error;
  // EZD-703 (Q-0509): the project's floors, by order then id (as the editor lists them), for the floor-plan copies.
  const floorRows: (SheetFloor & { order: number })[] = [];
  const stored = new Map<SheetSetKind, { id: string; data: SheetSetData }>();
  // EZD-707: the cabinet schedule's rows decide how many continuation sheets follow A4.0.
  const scheduleRows = scheduleRowsOf(
    rows.data.map((row) => ({ id: row.object_id, type: row.type, schema_version: row.schema_version, data: row.data })),
  ).length;
  for (const row of rows.data) {
    if (row.type !== 'sheet_set' && row.type !== 'floor') continue;
    const parsed = parseStoredObject({
      id: row.object_id,
      type: row.type,
      schema_version: row.schema_version,
      data: row.data,
    });
    if (parsed.ok && parsed.object.type === 'floor') {
      floorRows.push({ id: parsed.object.id, name: parsed.object.data.name, order: parsed.object.data.order });
      continue;
    }
    if (!parsed.ok || parsed.object.type !== 'sheet_set') continue;
    const { id, data } = parsed.object;
    if (!stored.has(data.kind)) stored.set(data.kind, { id, data });
  }
  const floors: SheetFloor[] = floorRows
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id, name }) => ({ id, name }));
  return SHEET_SET_KINDS.map((kind) => {
    const set = stored.get(kind);
    const d = set?.data ?? defaultSheetSetData(kind);
    return {
      id: set?.id ?? null,
      kind,
      size: d.size,
      keyPlacement: d.keyPlacement,
      lastIssuedVersionId: d.lastIssuedVersionId,
      sheets: withScheduleSheets(withFloorSheets(sheetsForSet(kind, trades), floors), d.size, scheduleRows),
      viewports: d.viewports ?? null,
      viewportSheets: d.viewportSheets ?? null,
    };
  });
}
