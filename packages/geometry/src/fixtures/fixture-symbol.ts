// EZD-422 Build (AC-EZD-422-1, -2; Q-0705 standard drafting marks; S03 Fixtures; Josh 2026-11-17 "the symbols need
// to be unique to each item"; vault/build/assumptions.md EZD-422): the plan symbol of each fixture kind, drawn inside
// its own width and depth and turned with its axis, so the front is always the side the Front faces. All lines are
// 'beyond' in the fixture's status layer, as the outline was before. Proportions are fractions of the width (W) and
// depth (D) so a symbol keeps its look at any size. Pure.
import type { DrawingItem } from '../drawing/types';
import { DRAWING_FONTS, measureTextPt } from '../drawing/text';
import type { Point } from '../schema';
import type { FixtureKind } from '../schema/fixture';
import { fixtureOutline, type FixtureObject } from './fixtures';

// Segments per full turn of an oval or a rounded corner's quarter (ovals have no drawing item of their own).
export const OVAL_SEGMENTS = 32;
export const CORNER_SEGMENTS = 4;
// The drain circle's diameter in a tub, prefab shower or sink bowl (a tile shower's center drain mark is 4").
export const FIXTURE_DRAIN_MARK_IN = 3;
// The hood's dashed outline: dash and gap lengths in model inches.
export const HOOD_DASH_IN = 3;
export const HOOD_GAP_IN = 2;

// The standard letters drawn in an appliance's outline.
export const FIXTURE_LETTERS: Partial<Record<FixtureKind, string>> = {
  refrigerator: 'REF',
  dishwasher: 'DW',
  disposal: 'GD',
  washer: 'W',
  dryer: 'D',
  water_heater: 'WH',
};

// u runs along the width (+ is along `axis`), v along the depth (+ is the back, - the front), both from the center.
type Local = { u: number; v: number };

export function fixtureSymbolItems(o: FixtureObject, textPt: number): DrawingItem[] {
  const { center: c, axis: a } = o.data.geometry;
  const { kind, width: W, depth: D } = o.data.attributes;
  const hw = W / 2;
  const hd = D / 2;
  const n = { x: -a.y, y: a.x };
  const at = (p: Local): Point => ({ x: c.x + a.x * p.u + n.x * p.v, y: c.y + a.y * p.u + n.y * p.v });
  const base = { layer: o.data.status, objectId: o.id } as const;
  const items: DrawingItem[] = [];

  const line = (p: Local, q: Local) =>
    items.push({ ...base, kind: 'line', role: 'beyond', from: at(p), to: at(q) });
  const ring = (pts: readonly Local[]) => {
    for (let i = 0; i < pts.length; i++) line(pts[i]!, pts[(i + 1) % pts.length]!);
  };
  const box = (u0: number, v0: number, u1: number, v1: number): Local[] => [
    { u: u0, v: v1 },
    { u: u1, v: v1 },
    { u: u1, v: v0 },
    { u: u0, v: v0 },
  ];
  const outline = () => {
    const r = fixtureOutline(o.data);
    for (let i = 0; i < 4; i++)
      items.push({ ...base, kind: 'line', role: 'beyond', from: r[i]!, to: r[(i + 1) % 4]! });
  };
  const circle = (p: Local, radius: number) =>
    items.push({ ...base, kind: 'arc', role: 'beyond', center: at(p), radius, startAngle: 0, endAngle: 360 });
  const oval = (p: Local, ru: number, rv: number) => {
    const pts: Local[] = [];
    for (let i = 0; i < OVAL_SEGMENTS; i++) {
      const t = (2 * Math.PI * i) / OVAL_SEGMENTS;
      pts.push({ u: p.u + ru * Math.cos(t), v: p.v + rv * Math.sin(t) });
    }
    ring(pts);
  };
  // A rectangle with its corners rounded to radius r, as one closed polyline.
  const rounded = (u0: number, v0: number, u1: number, v1: number, r: number) => {
    const pts: Local[] = [];
    const corners: [number, number, number][] = [
      [u1 - r, v1 - r, 0],
      [u0 + r, v1 - r, 90],
      [u0 + r, v0 + r, 180],
      [u1 - r, v0 + r, 270],
    ];
    for (const [cu, cv, start] of corners)
      for (let i = 0; i <= CORNER_SEGMENTS; i++) {
        const t = ((start + (90 * i) / CORNER_SEGMENTS) * Math.PI) / 180;
        pts.push({ u: cu + r * Math.cos(t), v: cv + r * Math.sin(t) });
      }
    ring(pts);
  };
  const dashed = (p: Local, q: Local) => {
    const len = Math.hypot(q.u - p.u, q.v - p.v);
    const du = (q.u - p.u) / len;
    const dv = (q.v - p.v) / len;
    for (let s = 0; s < len; s += HOOD_DASH_IN + HOOD_GAP_IN) {
      const e = Math.min(s + HOOD_DASH_IN, len);
      line({ u: p.u + du * s, v: p.v + dv * s }, { u: p.u + du * e, v: p.v + dv * e });
    }
  };
  const burners = () => {
    const r = 0.18 * Math.min(W, D);
    for (const [u, v] of [
      [-0.25, 0.25],
      [0.25, 0.25],
      [0.25, -0.25],
      [-0.25, -0.25],
    ] as const)
      circle({ u: u * W, v: v * D }, r);
  };
  const letters = (text: string) => {
    const font = DRAWING_FONTS['dm-mono-400'];
    // Along the axis, turned so the letters never read upside down.
    let deg = (Math.atan2(a.y, a.x) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg <= -90) deg += 180;
    items.push({
      ...base,
      kind: 'text',
      text,
      font: 'dm-mono-400',
      sizePt: textPt,
      widthPt: measureTextPt(font, text, textPt),
      at: { x: c.x, y: c.y },
      rotationDeg: deg === 0 ? 0 : deg,
      align: 'center',
    });
  };
  const drain = FIXTURE_DRAIN_MARK_IN / 2;

  switch (kind) {
    case 'toilet': {
      // Tank: the back 30% of the depth, full width. Bowl: an oval filling the front 70%, 80% of the width.
      const tankFront = hd - 0.3 * D;
      ring(box(-hw, tankFront, hw, hd));
      oval({ u: 0, v: (tankFront - hd) / 2 }, 0.4 * W, (tankFront + hd) / 2);
      break;
    }
    case 'lavatory':
      outline();
      oval({ u: 0, v: 0 }, 0.35 * W, 0.3 * D);
      break;
    case 'tub': {
      // Inner basin inset 10% of the smaller side, corners rounded; the drain at the -u end.
      const m = 0.1 * Math.min(W, D);
      const r = 0.25 * (Math.min(W, D) - 2 * m);
      outline();
      rounded(-hw + m, -hd + m, hw - m, hd - m, r);
      circle({ u: -hw + m + r, v: 0 }, drain);
      break;
    }
    case 'shower_prefab': {
      // The pan's lip inset 6% of the smaller side, its two diagonals, and the center drain.
      const m = 0.06 * Math.min(W, D);
      outline();
      ring(box(-hw + m, -hd + m, hw - m, hd - m));
      line({ u: -hw + m, v: hd - m }, { u: hw - m, v: -hd + m });
      line({ u: hw - m, v: hd - m }, { u: -hw + m, v: -hd + m });
      circle({ u: 0, v: 0 }, drain);
      break;
    }
    case 'sink': {
      // Two bowls split at the center line, a deck at the back for the faucet, a drain in each bowl.
      const v0 = -hd + 0.1 * D;
      const v1 = hd - 0.2 * D;
      const side = hw - 0.06 * W;
      const mid = 0.03 * W;
      outline();
      ring(box(-side, v0, -mid, v1));
      ring(box(mid, v0, side, v1));
      circle({ u: -(side + mid) / 2, v: (v0 + v1) / 2 }, drain);
      circle({ u: (side + mid) / 2, v: (v0 + v1) / 2 }, drain);
      break;
    }
    case 'cooktop':
      // Set in the countertop, which draws around it: the burners only.
      burners();
      break;
    case 'range':
      outline();
      burners();
      break;
    case 'hood': {
      const r = box(-hw, -hd, hw, hd);
      for (let i = 0; i < 4; i++) dashed(r[i]!, r[(i + 1) % 4]!);
      break;
    }
    case 'water_heater':
      circle({ u: 0, v: 0 }, Math.min(W, D) / 2);
      letters(FIXTURE_LETTERS.water_heater!);
      break;
    case 'refrigerator':
    case 'dishwasher':
    case 'disposal':
    case 'washer':
    case 'dryer':
      outline();
      letters(FIXTURE_LETTERS[kind]!);
      break;
  }
  return items;
}
