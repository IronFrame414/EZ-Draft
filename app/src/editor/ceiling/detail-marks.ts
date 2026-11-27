// EZD-229, EZD-507, EZD-603, EZD-731 (see lazy/room-fields/details-drawing.ts for their sources): the plan marks of
// the existing details and the ceiling and wall devices. Moved here by EZD-708a (11 rule 7, EZD-020 import
// boundaries) so the RCP sheet's lazy module (lazy/rcp-sheet) draws the same marks on A6.0 without loading the
// room-fields module; details-drawing.ts re-exports everything here. Pure.
import {
  DRAWING_FONTS,
  fixtureOutline,
  measureTextPt,
  type DrawingItem,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import { heightNoteText } from '../electrical/height-note';
import { PT_TO_MODEL_IN } from '../plan/glyph-atlas';

// The radius of a detector's circle in model inches (vault/build/assumptions.md EZD-229).
export const DETECTOR_RADIUS_IN = 4;

// The letters inside a detector's circle.
// EZD-507 (vault/build/assumptions.md EZD-507): and inside a speaker's, camera's or Wi-Fi AP's. The smoke detector
// is lettered "SD" as on board S05Ceiling (it was "S" while EZD-229's boards were waived).
export const DETECTOR_TEXT = {
  smoke_detector: 'SD',
  co_detector: 'CO',
  smoke_co_detector: 'S/CO',
  speaker: 'SPK',
  camera: 'CAM',
  wifi_ap: 'WAP',
  // EZD-602 (vault/build/assumptions.md EZD-602): the toolbar's other devices, lettered the same way; a duplex
  // receptacle draws as its circle with two parallel lines instead.
  receptacle_240v: '240',
  switch_single: 'S',
  switch_3way: 'S3',
  switch_dimmer: 'SDM',
  data: 'D',
  tv: 'TV',
  doorbell: 'DB',
} as const;

// EZD-507 (board S05Ceiling cans and fan; vault/build/assumptions.md EZD-507): a recessed light is a plain circle of
// the detector's radius; a ceiling fan is a circle of this radius with three blades from its centre.
export const FAN_RADIUS_IN = 12;
const FAN_BLADE_DEG = [90, 210, 330] as const;

// EZD-731 (AC-EZD-731-1; vault/build/assumptions.md EZD-731): the letters inside a piece of mechanical equipment's
// outline.
export const EQUIPMENT_TEXT = { air_handler: 'AH', condenser: 'CU' } as const;

// EZD-229 (Q-0704 03-data-model row 2; vault/build/assumptions.md EZD-229): the plan marks of the existing details, in
// their status layer. A supply register is its outline with both diagonals, a return its outline with one; an attic
// hatch is a hidden outline with both diagonals (it is overhead); a detector is a circle with its letters; a soffit is
// its hidden outline; a chase is its outline.
// EZD-731: an air handler or a condenser is its outline with its letters at the centre.
// EZD-507: an access panel draws as the attic hatch; a recessed light is a plain circle; a ceiling fan is its circle
// with three blades; a speaker, camera or Wi-Fi AP is a circle with its letters, as a detector.
// EZD-603 (S06 "Device height note toggle ... Shows a height note (e.g. "MW +66"") on the plan for that device";
// AC-EZD-603-1; board S06Electrical "W +66"" beside the device; vault/build/assumptions.md EZD-603): a device whose
// note is on, with a height, gets its note as text to the right of its symbol, on the device's own layer and id.
// `heightNotes` false (the left panel's Height notes Off) draws none.
export const HEIGHT_NOTE_GAP_IN = 2;
export function existingDetailItems(
  objects: readonly ModelObject[],
  textPt: number,
  opts: { heightNotes?: boolean } = {},
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
      for (let i = 0; i < ring.length; i++)
        out.push(line(role, ring[i]!, ring[(i + 1) % ring.length]!));
    };
    if (
      o.type === 'hvac' &&
      (o.data.attributes.kind === 'air_handler' || o.data.attributes.kind === 'condenser')
    ) {
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
      const kind = o.data.attributes.kind;
      const note = opts.heightNotes === false ? null : heightNoteText(o.data.attributes);
      if (note !== null) {
        const widthPt = measureTextPt(font, note, textPt);
        const r = kind === 'ceiling_fan' ? FAN_RADIUS_IN : DETECTOR_RADIUS_IN;
        out.push({
          ...base,
          kind: 'text',
          text: note,
          font: 'dm-mono-400',
          sizePt: textPt,
          widthPt,
          at: {
            x: center.x + r + HEIGHT_NOTE_GAP_IN + (widthPt * PT_TO_MODEL_IN) / 2,
            y: center.y,
          },
          rotationDeg: 0,
          align: 'center',
        });
      }
      const circle = (radius: number): DrawingItem => ({
        ...base,
        kind: 'arc',
        role: 'beyond',
        center,
        radius,
        startAngle: 0,
        endAngle: 360,
      });
      if (kind === 'recessed_light') {
        out.push(circle(DETECTOR_RADIUS_IN));
        continue;
      }
      if (kind === 'ceiling_fan') {
        out.push(circle(FAN_RADIUS_IN));
        for (const deg of FAN_BLADE_DEG) {
          const r = (deg * Math.PI) / 180;
          const tip = {
            x: center.x + FAN_RADIUS_IN * Math.cos(r),
            y: center.y + FAN_RADIUS_IN * Math.sin(r),
          };
          out.push(line('beyond', center, tip));
        }
        continue;
      }
      if (kind === 'receptacle_duplex') {
        // EZD-602: the duplex receptacle symbol, a circle crossed by two parallel lines a third of its radius apart.
        out.push(circle(DETECTOR_RADIUS_IN));
        const r = DETECTOR_RADIUS_IN * 1.5;
        const g = DETECTOR_RADIUS_IN / 3;
        for (const dx of [-g, g])
          out.push(
            line(
              'beyond',
              { x: center.x + dx, y: center.y - r },
              { x: center.x + dx, y: center.y + r },
            ),
          );
        continue;
      }
      const text = DETECTOR_TEXT[kind];
      const sizePt = textPt;
      out.push(circle(DETECTOR_RADIUS_IN));
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
