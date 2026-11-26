// EZD-708b (phase-07 EZD-708b "E1.0 electrical plan sheet from the model"; Q-0763 "E1.0 is the layout with devices and
// symbols"; Acceptance RCP "lights on RCP appear on E1.0 with the same circuit"; AC-EZD-708b-1; 11 rule 7, EZD-020
// import boundaries): the electrical plan drawn on E1.0 (and E2.0 ... for further floors), a lazy module because it
// is editor code. Loaded by import() from the sheet worker (workers/sheet-job.ts runSheetJob) and the PDF export job,
// so both print the same list (R7). A plan viewport on an electrical sheet draws the floor plan of its view with every
// device's symbol and height note (each device's own toggle, R24 #36; editor/ceiling/detail-marks.ts), the circuit
// tags, circuit lines and every home run (editor/electrical/circuit-drawing.ts, as the Electrical tab with the Home
// runs chip on) and the switch legs (editor/electrical/switch-legs.ts). The circuits and panels are read from the whole
// model, since a circuit's panel may stand on another floor; a light on the RCP is the same device object, so it
// carries the same circuit tag here.
import {
  buildDrawingList,
  type DrawingList,
  type SheetSvg,
  type SheetView,
  type StoredObject,
} from '@ezdraft/geometry';
import {
  DETECTOR_RADIUS_IN,
  FAN_RADIUS_IN,
  existingDetailItems,
} from '../../editor/ceiling/detail-marks';
import { circuitItems } from '../../editor/electrical/circuit-drawing';
import { switchLegItems } from '../../editor/electrical/switch-legs';
import type { ObjectValue } from '../../lib/outbox/model-api';
import { SHEET_LABEL_PT, drawInArea, readInput, viewObjects } from '../../workers/sheet-job';

// The radius of a device's symbol, as detail-marks.ts draws it (the plan's deviceRadius).
const radiusOf = (kind: string): number =>
  kind === 'ceiling_fan' ? FAN_RADIUS_IN : DETECTOR_RADIUS_IN;

// The electrical plan of one viewport (its floor, its view).
export function electricalViewportDrawingList(
  objects: readonly StoredObject[],
  level: string,
  view?: SheetView,
): DrawingList {
  const all = new Map<string, ObjectValue>();
  for (const o of objects)
    all.set(o.id, {
      type: o.type,
      schemaVersion: o.schema_version,
      data: o.data as Record<string, unknown>,
    });
  return buildDrawingList(
    { objects: viewObjects(objects, view) },
    { level, dimensionTextPt: SHEET_LABEL_PT, roomHatch: null, roomLabelPt: SHEET_LABEL_PT },
    [],
    {
      extraItems: (onFloor, _lvl, pt) => [
        ...existingDetailItems(onFloor, pt),
        ...circuitItems(onFloor, pt, { all, circuit: null, homeRuns: true, radiusOf }),
        ...switchLegItems(onFloor, all, radiusOf),
      ],
    },
  );
}

// One electrical viewport's sheet SVG (an `electrical` sheet job input), with its print marks.
export function electricalSheetJob(input: unknown): SheetSvg {
  const { objects, level, scale, area, view } = readInput(input);
  return drawInArea(electricalViewportDrawingList(objects, level, view), scale, area);
}
