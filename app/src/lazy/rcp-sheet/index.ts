// EZD-708a (S05 Purpose "produce the reflected ceiling plan (RCP) for the permit set (sheet A6.0)"; Q-0780 "Supply
// diffusers, returns and exhaust fans on the RCP ... print on A6.0 when placed, and nothing requires them";
// AC-EZD-708a-3; 11 rule 7, EZD-020 import boundaries): the RCP sheet's drawing, a lazy module because it is editor
// code. Loaded by import() from the sheet worker (workers/sheet-job.ts runSheetJob) and the PDF export job, so both
// print the same list (R7). A plan viewport on the RCP sheet draws the RCP the Ceiling surface shows
// (editor/ceiling/rcp-list.ts) from the floor list with the ceiling devices' and registers' marks
// (editor/ceiling/detail-marks.ts, height notes off; circuits belong to E1.0). Only what the viewport's view shows is
// drawn, beams, grids and zones included.
import {
  CURRENT_SCHEMA_VERSION,
  buildDrawingList,
  type DrawingList,
  type SheetSvg,
  type SheetView,
  type StoredObject,
} from '@ezdraft/geometry';
import { existingDetailItems } from '../../editor/ceiling/detail-marks';
import { rcpList } from '../../editor/ceiling/rcp-list';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { SHEET_LABEL_PT, drawInArea, readInput, viewObjects } from '../../workers/sheet-job';

// The RCP of one viewport (its floor, its view).
export function rcpViewportDrawingList(
  objects: readonly StoredObject[],
  level: string,
  view?: SheetView,
): DrawingList {
  const shown = viewObjects(objects, view);
  const floor = buildDrawingList(
    { objects: shown },
    { level, dimensionTextPt: SHEET_LABEL_PT, roomHatch: null, roomLabelPt: SHEET_LABEL_PT },
    [],
    { extraItems: (objs, _lvl, pt) => existingDetailItems(objs, pt, { heightNotes: false }) },
  );
  const map = new Map<string, ObjectValue>();
  for (const o of shown)
    map.set(o.id, {
      type: o.type,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: o.data as Record<string, unknown>,
    });
  return rcpList(floor, map) ?? floor;
}

// One RCP viewport's sheet SVG (an `rcp` sheet job input), with its print marks.
export function rcpSheetJob(input: unknown): SheetSvg {
  const { objects, level, scale, area, view } = readInput(input);
  return drawInArea(rcpViewportDrawingList(objects, level, view), scale, area);
}
