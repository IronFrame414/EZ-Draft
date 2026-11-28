// EZD-2043 Build (Q-0920; AC-EZD-2043-1, -2; vault/build/assumptions/EZD-2043.md): the plan symbol of each utility
// point kind, replacing the EZD-234 one diamond. Every kind is a circle UTILITY_MARK_IN across centred on its point:
// electric 120 V crossed by 2 short parallel lines (the duplex receptacle mark, drawn as EZD-602 draws it: lines a
// third of the radius from the centre, 1.5 radii each way), electric 240 V by 3 such lines with "240" beside it, gas
// "G", water "W", drain "D" inside. All in the point's status layer, 'beyond'. Sizes are model inches, so the symbol
// is the same size relative to the plan on the canvas and on every sheet; text is UTILITY_TEXT_IN tall in model
// inches, turned into points with the drawing's annotation scale. Pure.
import type { DrawingItem } from '../drawing/types';
import { DRAWING_FONTS, measureTextPt } from '../drawing/text';
import type { AnnotationScale } from '../dimensions/items';
import type { Point } from '../schema';
import type { UtilityPointObject } from './fixtures';

// The circle's diameter (the old diamond's 6" across each way).
export const UTILITY_MARK_IN = 6;
// The letters' and the "240" tag's size in model inches: 3/32" (the 6.75 pt sheet text minimum, 09h) at the
// 1/4" = 1'-0" sheet scale.
export const UTILITY_TEXT_IN = 4.5;
// The clear space between the circle and the "240" tag, model inches.
export const UTILITY_TAG_GAP_IN = 1;

export type UtilitySymbolId = 'electric_120' | 'electric_240' | 'gas' | 'water' | 'drain';

export const UTILITY_LETTERS = { gas: 'G', water: 'W', drain: 'D' } as const;
export const UTILITY_240_TAG = '240';

// Which symbol a utility point draws: electric by its volts, the others by kind.
export function utilitySymbolId(o: UtilityPointObject): UtilitySymbolId {
  const a = o.data.attributes;
  if (a.kind === 'electric') return a.volts === 240 ? 'electric_240' : 'electric_120';
  return a.kind;
}

export function utilitySymbolItems(o: UtilityPointObject, annotation: AnnotationScale): DrawingItem[] {
  const c = o.data.geometry.point;
  const base = { layer: o.data.status, objectId: o.id } as const;
  const r = UTILITY_MARK_IN / 2;
  const items: DrawingItem[] = [
    { ...base, kind: 'arc', role: 'beyond', center: { ...c }, radius: r, startAngle: 0, endAngle: 360 },
  ];
  const font = DRAWING_FONTS['dm-mono-400'];
  const sizePt = UTILITY_TEXT_IN / annotation.modelInPerPt;
  const text = (t: string, at: Point) =>
    items.push({
      ...base,
      kind: 'text',
      text: t,
      font: 'dm-mono-400',
      sizePt,
      widthPt: measureTextPt(font, t, sizePt),
      at,
      rotationDeg: 0,
      align: 'center',
    });
  const bars = (offsets: readonly number[]) => {
    const half = 1.5 * r;
    for (const dx of offsets)
      items.push({
        ...base,
        kind: 'line',
        role: 'beyond',
        from: { x: c.x + dx, y: c.y - half },
        to: { x: c.x + dx, y: c.y + half },
      });
  };
  const g = r / 3;
  const id = utilitySymbolId(o);
  switch (id) {
    case 'electric_120':
      bars([-g, g]);
      break;
    case 'electric_240': {
      bars([-g, 0, g]);
      const widthIn = measureTextPt(font, UTILITY_240_TAG, sizePt) * annotation.modelInPerPt;
      text(UTILITY_240_TAG, { x: c.x + r + UTILITY_TAG_GAP_IN + widthIn / 2, y: c.y });
      break;
    }
    default:
      text(UTILITY_LETTERS[id], { ...c });
  }
  return items;
}
