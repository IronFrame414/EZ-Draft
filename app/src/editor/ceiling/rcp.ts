// EZD-502 (S05 Layout "Canvas: RCP drawing"; S05 Controls "Both: RCP over a greyed floor plan"; S05 Data shown "ridge
// line and direction"; board S05Ceiling "RIDGE 13' 0""; AC-EZD-502-1): the reflected ceiling plan drawn from the open
// floor's drawing list. Reflected: the RCP keeps the floor plan's orientation, so a point draws at the same place on
// both (vault/build/assumptions.md EZD-502). The RCP keeps the walls and rooms (and their labels) and adds each
// room's ridge line; door swings, windows, fixtures, cabinets, pins and dimensions are floor items. Both draws the
// whole floor plan in one grey under the RCP. Loaded lazily on the first switch to Ceiling or Both (11 rule 7).
// EZD-505 (S05 Controls "Beam"; S05 Validation "Level beams in a vault must sit below the ridge and at or above the
// wall plate; warn otherwise"; Q-0630 "The whole object turns error red"; AC-EZD-505-1): each beam set on a shown
// room draws its beams' outlines in its status colour, or all in error red while the set has a warning.
// EZD-507 (S05 Controls "Recessed light ... Same object as on the electrical plan (06)", "Smoke or CO detector ... Same
// object as electrical plan"; S05 Data shown "Ceiling objects: ... cans, fans, ... detectors, speakers, low voltage,
// access panels"; AC-EZD-507-1): the ceiling devices keep the floor plan's own items (one object id on both); a device
// of another kind (a wall device of the electrical plan) is a floor item.
// EZD-515 (S05 Validation "Ceiling fan blade clearance to walls and beams: warning when closer than the clearance in
// company settings under Defaults", "Hosted ceiling item left off any ceiling surface: red flag"; Q-0630 "The whole
// object turns error red"; AC-EZD-515-1): a fan closer than the clearance, and a hosted ceiling item in no room, draw
// on the flagged layer (as the EZD-505 beam warning; vault/build/assumptions.md EZD-515).
// EZD-510 (S05 Controls "Switching zones ... Draws switching zones and dimmers on the RCP (dashed accent lines)"; board
// S05Ceiling zone outline "stroke-dasharray 4 3" in the accent; AC-EZD-510-1, -2; vault/build/assumptions.md EZD-510):
// each switching zone on a shown room draws as a closed dashed outline in the accent (the legend chip's colour,
// whatever the zone's status); a dimmer zone adds the dimmer mark, an S with a subscript D, at its label point. A
// half-drawn zone draws as an open dashed line through its corners.
// EZD-513 (S05 Controls "Soffit, tray, coffer ... edges get dimensions", "Height and material tag ... Tag reads from
// the ceiling data"; AC-EZD-513-1, -2; vault/build/assumptions.md EZD-513): each soffit, tray, coffer and crown draws
// EZD-708a: the RCP drawing list itself is rcp-list.ts (shared with sheet A6.0); this module adds the editor's panels,
// batches and tool receivers.
import type { DrawingList, Point } from '@ezdraft/geometry';
import type { Objects } from '../model/patches';
import { buildPlanBatches, type PlanBatch } from '../plan/batches';
import { tokenRgb } from '../plan/color';
import { UNDERLAY_RENDER_ORDER } from '../plan/scene';
import type { PlanSurface, SurfaceSetting } from './surface';
import type { PlanController } from '../plan/controller';
import type { PlanPointerReceiver } from '../plan/input';
import { placeSwitchZone, roomAt } from '../tools/switch-zone';
import { placeActGrid } from '../tools/act-grid-edits';
import { actGridReceiver, type ActGridToolDeps } from '../tools/act-grid-tool';
import { switchZoneReceiver, zoneDrawingFor, type ZoneToolDeps } from '../tools/switch-zone-tool';
import {
  framingDrawingFor,
  framingLineReceiver,
  type FramingToolDeps,
} from '../tools/framing-tool';
import { autoLayoutDraftFor } from './auto-layout-draft';
import {
  shapeDrawingFor,
  shapeReceiver as drawShapeReceiver,
  type CeilingToolDeps,
} from './shape-tool';
import { GREYED_FLOOR_TOKEN, NO_CHECKS, rcpList, type RcpChecks } from './rcp-list';

export * from './rcp-list';

// lazy part for Ceiling and Both).
export { FixtureSchedule } from './FixtureSchedule';
export { CeilingLegend, CeilingViewStatus, JoistsStatus } from './CeilingShown';
// EZD-503: the room ceiling summary and the ceiling type editor load with them too.
export { RoomCeiling } from './RoomCeiling';
// EZD-510: the left panel's Lighting section with Switching zones.
export { Lighting, LightingSection } from '../tools/SwitchZonePanel';
export { placeSwitchZone, roomAt } from '../tools/switch-zone';
export { switchZoneReceiver, zoneDrawingFor } from '../tools/switch-zone-tool';
// EZD-511: the ACT grid inspector and the legend's border sizes.
export { ActGridInspector, ActLegend } from '../tools/ActGridPanel';
// EZD-514: the framing line tool's page drawing (the inspector's Framing known section sets its room).
export { framingDrawingFor } from '../tools/framing-tool';
// EZD-509: the Auto-layout cans panel (in the Lighting section).
export { AutoLayout } from './AutoLayout';
// EZD-513: the Soffit, tray, coffer card and the two tools' receivers.
export { ShapeChooser } from './ShapeChooser';
export { tagReceiver } from './shape-tool';
/** The floor plan's batches in one grey, ordered above the PDF underlay and under everything of the RCP. */
export function greyedBatches(floor: DrawingList | null): PlanBatch[] {
  const grey = tokenRgb(GREYED_FLOOR_TOKEN);
  return buildPlanBatches(floor).map((b) => ({
    ...b,
    key: `floor:${b.key}`,
    color: grey,
    order: UNDERLAY_RENDER_ORDER + b.order / 10,
  }));
}

export type SurfaceView = { list: DrawingList | null; batches: PlanBatch[] };

/** What the canvas draws for a ceiling surface: the RCP list (text, selection and hover read it) and the batches. */
export function rcpView(
  floor: DrawingList | null,
  objects: Objects,
  surface: Exclude<PlanSurface, 'floor'>,
  checks: RcpChecks = NO_CHECKS,
  zoneDraft: readonly Point[] = [],
  shapeDraft: readonly Point[] = [],
  cansDraft: readonly Point[] = [],
): SurfaceView {
  const list = rcpList(floor, objects, checks, zoneDraft, shapeDraft, cansDraft);
  const rcp = buildPlanBatches(list);
  return { list, batches: surface === 'both' ? [...greyedBatches(floor), ...rcp] : rcp };
}

/**
 * EZD-510 (11 Budgets): shows the RCP on the canvas and shows it again whenever the zone being drawn changes, so the
 * editor's first download holds none of this. Returns the call that stops the redraws.
 */
export function showRcp(
  plan: Pick<PlanController, 'setSurface'>,
  shown: Exclude<PlanSurface, 'floor'>,
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  checks: RcpChecks,
): () => void {
  const zones = zoneDrawingFor(surface);
  // EZD-513: and again whenever the outline being drawn changes.
  const shapes = shapeDrawingFor(surface);
  // EZD-509: and again whenever the auto-layout preview changes.
  const cans = autoLayoutDraftFor(surface);
  const show = () =>
    plan.setSurface(shown, (floor, objects, sf) =>
      rcpView(floor, objects, sf, checks, zones.get().points, shapes.get().points, cans.get()),
    );
  show();
  const offZones = zones.subscribe(show);
  const offShapes = shapes.subscribe(show);
  const offCans = cans.subscribe(show);
  return () => {
    offZones();
    offShapes();
    offCans();
  };
}

/** EZD-513 (11 Budgets): the Soffit, tray, coffer receiver over the page's outline drawing. */
export function shapeReceiver(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  deps: CeilingToolDeps,
): PlanPointerReceiver {
  return drawShapeReceiver({ ...deps, drawing: shapeDrawingFor(surface) });
}

/** EZD-510 (11 Budgets): the Switching zones receiver over the page's zone drawing, placing through this module. */
export function zoneReceiver(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  deps: Omit<ZoneToolDeps, 'drawing' | 'place'>,
): PlanPointerReceiver {
  return switchZoneReceiver({
    ...deps,
    drawing: zoneDrawingFor(surface),
    place: { roomAt, placeSwitchZone },
  });
}

/** EZD-511 (11 Budgets): the Acoustical grid receiver, placing through this module. */
export function actReceiver(deps: Omit<ActGridToolDeps, 'place'>): PlanPointerReceiver {
  return actGridReceiver({ ...deps, place: placeActGrid });
}

/** EZD-514 (11 Budgets): the framing line receiver over the page's framing drawing. */
export function framingReceiver(
  surface: Pick<SurfaceSetting, 'get' | 'subscribe'>,
  deps: Omit<FramingToolDeps, 'drawing'>,
): PlanPointerReceiver {
  return framingLineReceiver({ ...deps, drawing: framingDrawingFor(surface) });
}
