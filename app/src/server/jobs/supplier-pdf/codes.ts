// EZD-915 (S12 Supplier PDF import "cabinet labels set size and type"; 08 Imports "cabinet labels (W3030, B24…) set
// size and type"; vault/build/assumptions.md EZD-915): the box a supplier cabinet label names. The codes read are
// the seed line's (EZD-401: B base, DB drawer base, SB sink base, W wall; codes without a leading zero, B9 … B36):
// - B, DB, SB then the width: 24" deep and 34 1/2" high (the seed line's base-row boxes; R23);
// - W then the width and, when four digits follow, the height (W3030 is 30 wide by 30 high, as W1530 in
//   packages/geometry/src/cabinets/edit.ts); with no height a wall box is 30" high; wall boxes are 12" deep (EZD-401).
// Anything else (a filler F3, a title, a dimension) is not a cabinet label. Pure. Model inches.
import type { CabinetLabelType } from '../../../lib/imports/review';

export type CabinetLabel = {
  code: string;
  boxType: CabinetLabelType;
  width: number;
  depth: number;
  height: number;
};

export const BASE_DEPTH_IN = 24;
export const BASE_HEIGHT_IN = 34.5;
export const WALL_DEPTH_IN = 12;
export const WALL_HEIGHT_IN = 30;

const BASE_TYPES: Record<string, CabinetLabelType> = { B: 'base', DB: 'drawer_base', SB: 'sink_base' };

/** The box a label names, or null when the text is not a cabinet code. Case and surrounding spaces are ignored. */
export function parseCabinetCode(text: string): CabinetLabel | null {
  const code = text.trim().toUpperCase();
  const base = /^(SB|DB|B)([1-9]\d?)$/.exec(code);
  if (base) {
    return {
      code,
      boxType: BASE_TYPES[base[1]],
      width: Number(base[2]),
      depth: BASE_DEPTH_IN,
      height: BASE_HEIGHT_IN,
    };
  }
  // W then a width of one or two digits, then optionally a two-digit height (W930 is 9 wide by 30 high).
  const wall = /^W([1-9]\d?)([1-9]\d)?$/.exec(code);
  if (wall) {
    return {
      code,
      boxType: 'wall',
      width: Number(wall[1]),
      depth: WALL_DEPTH_IN,
      height: wall[2] === undefined ? WALL_HEIGHT_IN : Number(wall[2]),
    };
  }
  return null;
}
