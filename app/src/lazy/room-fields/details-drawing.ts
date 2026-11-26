// EZD-229 (Q-0704 03-data-model row 2; AC-EZD-229-1, -2, -4; 09q Transitions; vault/build/assumptions.md EZD-229):
// the plan marks of the existing details and of the derived floor transitions, passed to buildDrawingList as
// `options.extraItems` by the plan controller once the room-fields lazy module loads (11 Budgets; EZD-120c B11). Pure.
// EZD-708a: the existing details' and devices' marks are editor/ceiling/detail-marks.ts (shared with the RCP sheet).
import { DRAWING_FONTS, measureTextPt, type DrawingItem, type ModelObject } from '@ezdraft/geometry';
import { circuitItems, type CircuitDrawOpts } from '../../editor/electrical/circuit-drawing';
import { switchLegItems } from '../../editor/electrical/switch-legs';
import { roomTransitions } from '../../editor/layers/floor-transitions';
import { DETECTOR_RADIUS_IN, FAN_RADIUS_IN, existingDetailItems } from '../../editor/ceiling/detail-marks';

export * from '../../editor/ceiling/detail-marks';

// A transition is a line on the rooms layer (so the Rooms eye hides it) with its level step as text at its middle,
// along the line. Its items carry the first room's id: transitions are not model objects.
export function transitionItems(
  objects: readonly ModelObject[],
  level: string,
  textPt: number,
): DrawingItem[] {
  const out: DrawingItem[] = [];
  const font = DRAWING_FONTS['dm-mono-400'];
  for (const t of roomTransitions(objects, level)) {
    const base = { layer: 'rooms' as const, objectId: t.roomIds[0] };
    out.push({ ...base, kind: 'line', role: 'beyond', from: t.from, to: t.to });
    if (t.label === null) continue;
    let rotationDeg = (Math.atan2(t.to.y - t.from.y, t.to.x - t.from.x) * 180) / Math.PI;
    if (rotationDeg <= -90) rotationDeg += 180;
    else if (rotationDeg > 90) rotationDeg -= 180;
    out.push({
      ...base,
      kind: 'text',
      text: t.label,
      font: 'dm-mono-400',
      sizePt: textPt,
      widthPt: measureTextPt(font, t.label, textPt),
      at: { x: (t.from.x + t.to.x) / 2, y: (t.from.y + t.to.y) / 2 },
      rotationDeg,
      align: 'center',
    });
  }
  return out;
}

// Both, as the plan's `extraItems`.
// EZD-603: `opts.heightNotes` is the left panel's Height notes switch (on when absent).
// EZD-604: `opts.circuits` adds the circuit tags, lines and home runs (circuit-drawing.ts); none when absent.
// EZD-605: with its `switchLegs` on, the switch legs too (switch-legs.ts).
export function planDetailItems(
  objects: readonly ModelObject[],
  level: string,
  textPt: number,
  opts: {
    heightNotes?: boolean;
    circuits?: Omit<CircuitDrawOpts, 'radiusOf'>;
  } = {},
): DrawingItem[] {
  return [
    ...existingDetailItems(objects, textPt, opts),
    ...transitionItems(objects, level, textPt),
    ...(opts.circuits === undefined
      ? []
      : circuitItems(objects, textPt, { ...opts.circuits, radiusOf: deviceRadius })),
    // EZD-605: the switch legs, dashed, while the Switch legs chip is on.
    ...(opts.circuits?.switchLegs === true
      ? switchLegItems(objects, opts.circuits.all, deviceRadius)
      : []),
  ];
}

// EZD-604: the radius of a device's symbol, as drawn above.
export const deviceRadius = (kind: string): number =>
  kind === 'ceiling_fan' ? FAN_RADIUS_IN : DETECTOR_RADIUS_IN;
