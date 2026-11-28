// EZD-2032 (moved out of handlers/pdf-export.ts, EZD-715 and later): the pages of one sheet set, built from a list
// of stored objects exactly as the export job prints them, so the PDF and the client page's sheet images
// (handlers/client-sheet-images.ts, AC-EZD-2032-1) show the same sheets in the same order with the same drawings.
//
// The set and the floors are read as the Sheets screen reads them (server/sheets/sheets.ts): the lowest-id live set
// object of the kind (with `setId`, that set object; EZD-719 records it on sent_package), else the default set;
// floors by order, then id. Each plan viewport's drawing list is built as the sheet worker builds it
// (workers/sheet-job.ts viewportDrawingList) for its floor (the lowest when it names none or a floor since deleted)
// and view, in its column of the drawing area.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseStoredObject,
  type SheetSetData,
  type SheetSetKind,
  type StoredObject,
} from '@ezdraft/geometry';
import { isScopeTrade } from '../../../lib/projects/new-project';
import {
  defaultSheetSetData,
  sheetDrawingArea,
  isCountertopSheet,
  sheetsForSet,
  withCountertopSheets,
  withFloorSheets,
  type Sheet,
  type SheetFloor,
} from '../../../lib/sheets/sheet-set';
import {
  countertopSheetFor,
  type CountertopSheetNames,
  type CountertopSheetPiece,
} from '../../../lib/sheets/countertop-sheet';
import {
  sheetScaleLabel,
  sheetViewports,
  viewportAreas,
  viewportScaleFactor,
} from '../../../lib/sheets/viewport';
import { AS_NOTED } from '../../../lib/title-block/sheet-title-block';
import { elevationViewportLists, viewportDrawingList } from '../../../workers/sheet-job';
import { fixtureRowsOf, fixtureTableFor, fixtureTablePlan, isRcpSheet } from '../../../lib/sheets/fixture-schedule-table';
import { ecNoteFor, isElectricalSheet } from '../../../lib/sheets/electrical-kinds';
import { livePanelSheets, panelSheetTables } from '../../../lib/sheets/panel-sheet-table';
import {
  SCHEDULE_SHEET,
  schedulePlan,
  scheduleRowsOf,
  scheduleTableFor,
  withScheduleSheets,
} from '../../../lib/sheets/cabinet-schedule-table';
import type { Database } from '../../db/database.types';
import type { PdfSheet, PdfViewport } from './write-pdf';

type Db = SupabaseClient<Database>;

export type SetPagesInput = {
  tenantId: string;
  projectId: string;
  objects: readonly StoredObject[];
  // project.scope_trades (the set's trade sheets).
  scopeTrades: readonly string[];
  kind: SheetSetKind;
  // The set object to print; absent or null, the lowest-id set object of the kind, else the default set.
  setId?: string | null;
};

export type SetPages = {
  data: SheetSetData;
  // The set's sheets in set order.
  sheets: Sheet[];
  pages: Map<string, PdfSheet>;
};

// EZD-720: the names the client set's countertop sheets print, as the Sheets screen reads them: the company's catalog
// materials the pieces use, its edge profiles, and the project's open edge offers.
async function readCountertopNames(
  db: Db,
  tenantId: string,
  projectId: string,
  pieces: readonly CountertopSheetPiece[],
): Promise<CountertopSheetNames> {
  const materialIds = [
    ...new Set(pieces.flatMap((p) => (p.data.attributes.materialItemId === null ? [] : [p.data.attributes.materialItemId]))),
  ];
  const [materials, profiles, offers] = await Promise.all([
    materialIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; name: string }[], error: null })
      : db.from('catalog_item').select('id, name').eq('tenant_id', tenantId).in('id', materialIds),
    db.from('edge_profile').select('id, key, name').eq('tenant_id', tenantId).order('position'),
    db
      .from('selection_offer')
      .select('subject_id, choices')
      .eq('tenant_id', tenantId)
      .eq('project_id', projectId)
      .eq('kind', 'edge_profile')
      .eq('status', 'open'),
  ]);
  if (materials.error) throw materials.error;
  if (profiles.error) throw profiles.error;
  if (offers.error) throw offers.error;
  return {
    materials: materials.data.map(({ id, name }) => ({ id, name })),
    profiles: profiles.data.map(({ id, key, name }) => ({ id, key, name })),
    open: offers.data.map((o) => ({ pieceId: o.subject_id, profileIds: o.choices })),
  };
}

export async function buildSetPages(db: Db, input: SetPagesInput): Promise<SetPages> {
  // The set and the floors, as the Sheets screen reads them (server/sheets/sheets.ts): the lowest-id live set
  // object of the kind, else the default set; floors by order, then id.
  let setData: SheetSetData | null = null;
  const floorRows: (SheetFloor & { order: number })[] = [];
  for (const stored of input.objects) {
    if (stored.type !== 'floor' && stored.type !== 'sheet_set') continue;
    const parsed = parseStoredObject(stored);
    if (!parsed.ok) continue;
    if (parsed.object.type === 'floor')
      floorRows.push({ id: parsed.object.id, name: parsed.object.data.name, order: parsed.object.data.order });
    else if (parsed.object.type === 'sheet_set' && setData === null && parsed.object.data.kind === input.kind &&
        (input.setId == null || parsed.object.id === input.setId))
      setData = parsed.object.data;
  }
  const floors: SheetFloor[] = floorRows
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(({ id, name }) => ({ id, name }));
  const data = setData ?? defaultSheetSetData(input.kind);
  const trades = input.scopeTrades.filter(isScopeTrade);
  // EZD-707: the cabinet schedule prints on A4.0 under the elevations and continues on A4.1, as the preview.
  const scheduleRows = scheduleRowsOf(input.objects);
  // EZD-720 (AC-EZD-720-1, -2): the client set prints the countertop sheets while the model has a piece; the permit
  // set never does.
  const pieces: CountertopSheetPiece[] = [];
  for (const stored of input.objects) {
    if (stored.type !== 'countertop_piece') continue;
    const parsed = parseStoredObject(stored);
    if (parsed.ok && parsed.object.type === 'countertop_piece')
      pieces.push({ id: parsed.object.id, data: parsed.object.data });
  }
  const sheets = withCountertopSheets(
    withScheduleSheets(withFloorSheets(sheetsForSet(data.kind, trades), floors), data.size, scheduleRows.length),
    data.kind,
    pieces.length,
  );
  const countertopNames = sheets.some((s) => isCountertopSheet(s.number))
    ? await readCountertopNames(db, input.tenantId, input.projectId, pieces)
    : null;

  const floorIds = new Set(floors.map((f) => f.id));
  // EZD-708a: the RCP drawing is a lazy module (editor code), loaded only when the set has an RCP sheet.
  const rcpSheet = sheets.some((s) => isRcpSheet(s.number)) ? await import('../../../lazy/rcp-sheet') : null;
  // EZD-708b: the electrical plan drawing is a lazy module too, loaded only when the set has an electrical sheet.
  const electricalSheet = sheets.some((s) => isElectricalSheet(s.number))
    ? await import('../../../lazy/electrical-sheet')
    : null;
  const pages = new Map<string, PdfSheet>();
  for (const sheet of sheets) {
    const vps = sheetViewports(data, sheet.number, floors);
    // EZD-708a: an RCP sheet prints its floor's fixture schedule under its viewports, and its plans as the RCP, as
    // the preview draws them (lazy/sheets/renderer.ts): the schedule of its first plan viewport's floor, none
    // without a plan viewport.
    const rcp = isRcpSheet(sheet.number);
    const firstPlan = vps.find((v) => v.kind === 'plan');
    const rcpFloor = !rcp || firstPlan === undefined
      ? undefined
      : firstPlan?.level != null && floorIds.has(firstPlan.level)
        ? firstPlan.level
        : floors[0]?.id;
    const fixtureRows = rcpFloor === undefined ? [] : fixtureRowsOf(input.objects, rcpFloor);
    // EZD-708b: an electrical sheet prints its plans as the electrical plan, and the EC verification note.
    const electrical = isElectricalSheet(sheet.number);
    const areas = viewportAreas(
      sheet.number === SCHEDULE_SHEET
        ? schedulePlan(data.size, scheduleRows.length).elevations
        : fixtureRows.length > 0
          ? fixtureTablePlan(data.size, fixtureRows.length).drawing
          : sheetDrawingArea(data.size),
      vps.length,
    );
    const viewports: PdfViewport[] = [];
    vps.forEach((vp, i) => {
      if (vp.kind !== 'plan' && vp.kind !== 'elevation') return;
      const level = vp.level !== null && floorIds.has(vp.level) ? vp.level : floors[0]?.id;
      if (level === undefined) return;
      // EZD-707: an elevation viewport prints each of its elevations in its own cell, as the preview draws them.
      if (vp.kind === 'elevation') {
        const scale = viewportScaleFactor(vp.scale);
        for (const cell of elevationViewportLists(input.objects, level, vp.view, vp.walls ?? [], areas[i]!))
          viewports.push({ list: cell.list, scale, area: cell.area });
        return;
      }
      viewports.push({
        list:
          rcp && rcpSheet !== null
            ? rcpSheet.rcpViewportDrawingList(input.objects, level, vp.view)
            : electrical && electricalSheet !== null
              ? electricalSheet.electricalViewportDrawingList(input.objects, level, vp.view)
              : viewportDrawingList(input.objects, level, vp.view),
        scale: viewportScaleFactor(vp.scale),
        area: areas[i]!,
      });
    });
    const table = scheduleTableFor(sheet.number, data.size, scheduleRows);
    if (table !== null) viewports.push({ list: table.list, scale: 1, area: table.area, marks: false });
    const fixtureTable = fixtureTableFor(sheet.number, data.size, fixtureRows);
    if (fixtureTable !== null)
      viewports.push({ list: fixtureTable.list, scale: 1, area: fixtureTable.area, marks: false });
    for (const line of ecNoteFor(sheet.number, data.size) ?? [])
      viewports.push({ list: line.list, scale: 1, area: line.area, marks: false });
    // EZD-708c (AC-EZD-708c-1): the panel sheet prints what Add to E2.0 placed on the set, as the preview: only
    // the panels still in the model.
    const placedPanels = livePanelSheets(
      data.panelSheets ?? [],
      input.objects.filter((o) => o.type === 'panel').map((o) => o.id),
    );
    for (const t of panelSheetTables(sheet.number, data.size, floors.length, placedPanels) ?? [])
      viewports.push({ list: t.list, scale: 1, area: t.area, marks: false });
    if (countertopNames !== null)
      for (const d of countertopSheetFor(sheet.number, data.size, pieces, countertopNames))
        viewports.push(d.marks ? { list: d.list, scale: d.scale, area: d.area } : { list: d.list, scale: d.scale ?? 1, area: d.area, marks: false });
    pages.set(sheet.number, {
      number: sheet.number,
      title: sheet.title,
      scaleLabel: sheetScaleLabel(vps) ?? AS_NOTED,
      stampAreas: data.kind === 'permit',
      viewports,
    });
  }

  return { data, sheets, pages };
}
