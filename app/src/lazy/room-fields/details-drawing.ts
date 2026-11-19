// EZD-229 (Q-0704 03-data-model row 2; AC-EZD-229-1, -2, -4; 09q Transitions; vault/build/assumptions.md EZD-229):
// the plan marks of the existing details and of the derived floor transitions, passed to buildDrawingList as
// `options.extraItems` by the plan controller once the room-fields lazy module loads (11 Budgets; EZD-120c B11). Pure.
import {
  DRAWING_FONTS,
  fixtureOutline,
  measureTextPt,
  type DrawingItem,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import { roomTransitions } from '../../editor/layers/floor-transitions';

// The radius of a detector's circle in model inches (vault/build/assumptions.md EZD-229).
export const DETECTOR_RADIUS_IN = 4;

// The letters inside a detector's circle.
export const DETECTOR_TEXT = {
  smoke_detector: 'S',
  co_detector: 'CO',
  smoke_co_detector: 'S/CO',
} as const;

// EZD-731 (AC-EZD-731-1; vault/build/assumptions.md EZD-731): the letters inside a piece of mechanical equipment's
// outline.
export const EQUIPMENT_TEXT = { air_handler: 'AH', condenser: 'CU' } as const;

// EZD-229 (Q-0704 03-data-model row 2; vault/build/assumptions.md EZD-229): the plan marks of the existing details, in
// their status layer. A supply register is its outline with both diagonals, a return its outline with one; an attic
// hatch is a hidden outline with both diagonals (it is overhead); a detector is a circle with its letters; a soffit is
// its hidden outline; a chase is its outline.
// EZD-731: an air handler or a condenser is its outline with its letters at the centre.
export function existingDetailItems(
  objects: readonly ModelObject[],
  textPt: number,
): DrawingItem[] {
  const out: DrawingItem[] = [];
  const font = DRAWING_FONTS['dm-mono-400'];
  for (const o of objects) {
    if (
      o.type !== 'hvac' &&
      o.type !== 'access' &&
      o.type !== 'device' &&
      o.type !== 'soffit' &&
      o.type !== 'chase'
    )
      continue;
    const base = { layer: o.data.status, objectId: o.id } as const;
    const line = (role: 'beyond' | 'hidden', from: Point, to: Point): DrawingItem => ({
      ...base,
      kind: 'line',
      role,
      from,
      to,
    });
    const ringItems = (ring: readonly Point[], role: 'beyond' | 'hidden') => {
      for (let i = 0; i < ring.length; i++) out.push(line(role, ring[i]!, ring[(i + 1) % ring.length]!));
    };
    if (o.type === 'hvac' && (o.data.attributes.kind === 'air_handler' || o.data.attributes.kind === 'condenser')) {
      ringItems(fixtureOutline(o.data), 'beyond');
      const text = EQUIPMENT_TEXT[o.data.attributes.kind];
      out.push({
        ...base,
        kind: 'text',
        text,
        font: 'dm-mono-400',
        sizePt: textPt,
        widthPt: measureTextPt(font, text, textPt),
        at: { x: o.data.geometry.center.x, y: o.data.geometry.center.y },
        rotationDeg: 0,
        align: 'center',
      });
    } else if (o.type === 'hvac' || o.type === 'access') {
      const ring = fixtureOutline(o.data);
      const role = o.type === 'access' ? 'hidden' : 'beyond';
      ringItems(ring, role);
      out.push(line(role, ring[0], ring[2]));
      if (o.type === 'access' || o.data.attributes.kind === 'supply')
        out.push(line(role, ring[1], ring[3]));
    } else if (o.type === 'device') {
      const center = o.data.geometry.point;
      const text = DETECTOR_TEXT[o.data.attributes.kind];
      const sizePt = textPt;
      out.push({
        ...base,
        kind: 'arc',
        role: 'beyond',
        center,
        radius: DETECTOR_RADIUS_IN,
        startAngle: 0,
        endAngle: 360,
      });
      out.push({
        ...base,
        kind: 'text',
        text,
        font: 'dm-mono-400',
        sizePt,
        widthPt: measureTextPt(font, text, sizePt),
        at: { x: center.x, y: center.y },
        rotationDeg: 0,
        align: 'center',
      });
    } else if (o.type === 'soffit') {
      ringItems(o.data.geometry.boundary, 'hidden');
    } else {
      ringItems(o.data.geometry.boundary, 'beyond');
    }
  }
  return out;
}

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
export function planDetailItems(
  objects: readonly ModelObject[],
  level: string,
  textPt: number,
): DrawingItem[] {
  return [...existingDetailItems(objects, textPt), ...transitionItems(objects, level, textPt)];
}
