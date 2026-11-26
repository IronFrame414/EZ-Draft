// EZD-228 (09e "Bath clearance checks (Round 3, warnings only): toilet, lavatory, tub and shower clearances and
// shower size, with values set by the owner under Defaults and checked by Check"; S15d "Bath clearances"; 09d B-07 to
// B-09 and 09d:34 "start at these code minimums"; AC-EZD-228-1, -2; vault/build/assumptions.md EZD-228): the bath
// clearance check, a company rule set run by the code check engine (EZD-611a). Pure; model inches, y up.
//
// The values come from the project values the engine is given (`ctx.project.bathClearances`, the Defaults row
// `bath_clearances`). A value that is not set makes its check "cannot check" naming the value, never a pass.
// Measured from what is drawn: walls by their finished faces (Q-0559), fixtures by their outlines, tile showers by
// their footprints. Demo objects are leaving, so they take no part. Exactly the required value passes.
import type { CodeRule, RuleContext, RuleOutcome, RuleSet } from '../code-check/engine';
import { fixtureOutline } from '../fixtures/fixtures';
import { showerFrame, showerSide } from '../fixtures/tile-shower';
import type { ModelObject, Point } from '../schema';
import { COMPARISON_TOLERANCE_IN } from '../tolerance';
import { wallFaceLines } from '../walls/wall';

const tol = COMPARISON_TOLERANCE_IN;

// The named values of the Defaults row (lengths in inches, the area in square inches).
export type BathClearances = {
  // Toilet or lavatory centerline to a side wall, partition, vanity or tub.
  side: number;
  // Toilet or lavatory center to the center of the next toilet or lavatory.
  centerToCenter: number;
  // Clear in front of a toilet or lavatory.
  front: number;
  // Clear in front of a tub. The code gives none (09d B-08), so it has no default.
  tubFront: number;
  // Clear in front of a shower opening.
  showerFront: number;
  // Clear width of a shower access opening.
  showerAccess: number;
  // Shower inside area, square inches.
  showerArea: number;
  // Shower least inside dimension.
  showerLeast: number;
};
export type BathClearanceKey = keyof BathClearances;

// 09d:34: the Defaults values start at the code minimums (B-07 to B-09; R3-061, P-035). The tub has none.
export const BATH_CLEARANCE_CODE_MINIMUMS: Readonly<Omit<BathClearances, 'tubFront'>> = {
  side: 15,
  centerToCenter: 30,
  front: 21,
  showerFront: 24,
  showerAccess: 22,
  showerArea: 900,
  showerLeast: 30,
};

// Where the engine's project values hold the effective Defaults row.
export const BATH_CLEARANCES_PROJECT_KEY = 'bathClearances';

// The value each check names when it cannot check (EZD-612 shows "{need} not set in Defaults").
export const BATH_CLEARANCE_NEED: Readonly<Record<BathClearanceKey, string>> = {
  side: 'Side clearance',
  centerToCenter: 'Center to center clearance',
  front: 'Front clearance',
  tubFront: 'Tub front clearance',
  showerFront: 'Shower front clearance',
  showerAccess: 'Shower opening width',
  showerArea: 'Minimum shower area',
  showerLeast: 'Minimum shower dimension',
};

// Company rules sit outside the catalog's id ranges (assumptions EZD-611a "Rules that are not in the catalog").
export const BATH_CLEARANCE_RULE_IDS = {
  side: 'BC-001',
  centerToCenter: 'BC-002',
  front: 'BC-003',
  showerSize: 'BC-004',
  showerFront: 'BC-005',
  showerAccess: 'BC-006',
} as const;

type Fixture = Extract<ModelObject, { type: 'fixture' }>;
type TileShower = Extract<ModelObject, { type: 'tile_shower' }>;
type Segment = { a: Point; b: Point };

// A local frame: `u` along `axis`, `v` along `back` (the fixture's back is +v), half sizes hw and hd.
export type BathFrame = { c: Point; axis: Point; back: Point; hw: number; hd: number };

const SIDE_KINDS: ReadonlySet<string> = new Set(['toilet', 'lavatory']);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The value named `key` from the project values, or null when it is not set. */
export function bathClearanceValue(project: Readonly<Record<string, unknown>>, key: BathClearanceKey): number | null {
  const all = project[BATH_CLEARANCES_PROJECT_KEY];
  if (typeof all !== 'object' || all === null) return null;
  const v = (all as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

function fixtureFrame(f: Fixture): BathFrame {
  const { center, axis } = f.data.geometry;
  return {
    c: center,
    axis,
    back: { x: -axis.y, y: axis.x },
    hw: f.data.attributes.width / 2,
    hd: f.data.attributes.depth / 2,
  };
}

const local = (fr: BathFrame, p: Point) => {
  const dx = p.x - fr.c.x;
  const dy = p.y - fr.c.y;
  return { u: dx * fr.axis.x + dy * fr.axis.y, v: dx * fr.back.x + dy * fr.back.y };
};

const ring = (pts: readonly Point[]): Segment[] => pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length]! }));

function levelOf(o: ModelObject): string | null {
  const d = o.data as { level?: unknown };
  return typeof d.level === 'string' ? d.level : null;
}

function statusOf(o: ModelObject): string | null {
  const d = o.data as { status?: unknown };
  return typeof d.status === 'string' ? d.status : null;
}

// What stands on the floor near a fixture: wall faces, other fixtures' outlines (a hood hangs above) and tile shower
// footprints, on the same level and not Demo. `includeFixture` picks which fixtures count.
function obstacles(
  self: ModelObject,
  objects: readonly ModelObject[],
  includeFixture: (f: Fixture) => boolean,
): Segment[] {
  const level = levelOf(self);
  const out: Segment[] = [];
  for (const o of objects) {
    if (same(o.id, self.id) || statusOf(o) === 'demo') continue;
    const l = levelOf(o);
    if (level === null || l === null || !same(l, level)) continue;
    if (o.type === 'wall') {
      const { left, right } = wallFaceLines(o.data);
      out.push({ a: left.start, b: left.end }, { a: right.start, b: right.end });
    } else if (o.type === 'fixture') {
      if (o.data.attributes.kind !== 'hood' && includeFixture(o)) out.push(...ring(fixtureOutline(o.data)));
    } else if (o.type === 'tile_shower') {
      out.push(...ring(o.data.geometry.footprint));
    }
  }
  return out;
}

// The part of a segment (in local u, v) whose `which` coordinate lies in [lo, hi]; null when none does.
function clip(
  p: { u: number; v: number },
  q: { u: number; v: number },
  which: 'u' | 'v',
  lo: number,
  hi: number,
): [{ u: number; v: number }, { u: number; v: number }] | null {
  const a = p[which];
  const b = q[which];
  let t0 = 0;
  let t1 = 1;
  const d = b - a;
  if (Math.abs(d) <= 1e-12) {
    if (a < lo || a > hi) return null;
  } else {
    const ta = (lo - a) / d;
    const tb = (hi - a) / d;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
    if (t0 > t1) return null;
  }
  const at = (t: number) => ({ u: p.u + (q.u - p.u) * t, v: p.v + (q.v - p.v) * t });
  return [at(t0), at(t1)];
}

/**
 * Centerline to the nearest obstacle beside the fixture, across the fixture's depth (its back face excluded, so the
 * wall it stands against is not a side). Infinity when nothing is beside it.
 */
export function sideClearance(fr: BathFrame, segs: readonly Segment[]): number {
  let best = Infinity;
  for (const s of segs) {
    const part = clip(local(fr, s.a), local(fr, s.b), 'v', -fr.hd, fr.hd - tol);
    if (!part) continue;
    const [p, q] = part;
    const d = p.u * q.u <= 0 ? 0 : Math.min(Math.abs(p.u), Math.abs(q.u));
    best = Math.min(best, d);
  }
  return best;
}

/** Front face to the nearest obstacle straight in front of it, across the fixture's width. Infinity when none. */
export function frontClearance(fr: BathFrame, segs: readonly Segment[]): number {
  let best = Infinity;
  for (const s of segs) {
    const across = clip(local(fr, s.a), local(fr, s.b), 'u', -fr.hw + tol, fr.hw - tol);
    if (!across) continue;
    const ahead = clip(across[0], across[1], 'v', -Infinity, -fr.hd + tol);
    if (!ahead) continue;
    const nearest = Math.max(ahead[0].v, ahead[1].v);
    best = Math.min(best, Math.max(0, -fr.hd - nearest));
  }
  return best;
}

// True when the open segments a-b and c-d cross.
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Center to center to the next toilet or lavatory beside the fixture (B-07, B-08): the centerline to centerline
 * offset along the fixture's width, for a fixture that overlaps its depth band with no wall between the two. A
 * fixture across a wall (another bath) or in front or behind is not beside it. Infinity when none is.
 */
export function nextFixtureOffset(f: Fixture, objects: readonly ModelObject[]): number {
  const fr = fixtureFrame(f);
  const walls: Segment[] = [];
  for (const o of objects) {
    if (o.type !== 'wall' || o.data.status === 'demo' || !same(o.data.level, f.data.level)) continue;
    const { left, right } = wallFaceLines(o.data);
    walls.push({ a: left.start, b: left.end }, { a: right.start, b: right.end });
  }
  let best = Infinity;
  for (const x of objects) {
    if (x.type !== 'fixture' || same(x.id, f.id) || !SIDE_KINDS.has(x.data.attributes.kind)) continue;
    if (x.data.status === 'demo' || !same(x.data.level, f.data.level)) continue;
    const vs = fixtureOutline(x.data).map((p) => local(fr, p).v);
    if (Math.min(...vs) >= fr.hd - tol || Math.max(...vs) <= -fr.hd + tol) continue;
    const c = x.data.geometry.center;
    if (walls.some((w) => crosses(fr.c, c, w.a, w.b))) continue;
    best = Math.min(best, Math.abs(local(fr, c).u));
  }
  return best;
}

// A tile shower's opening is side 0 (the curb side, EZD-226); its front faces out of the shower.
function showerOpeningFrame(o: TileShower): BathFrame {
  const s = showerSide(o.data.geometry.footprint, 0);
  return {
    c: { x: (s.start.x + s.end.x) / 2, y: (s.start.y + s.end.y) / 2 },
    axis: s.dir,
    back: s.inward,
    hw: s.length / 2,
    hd: 0,
  };
}

/** A shower's inside area (less a fixed bench, P-035) and least dimension. */
export function showerSize(o: Fixture | TileShower): { area: number; least: number } {
  if (o.type === 'fixture') {
    const { width, depth } = o.data.attributes;
    return { area: width * depth, least: Math.min(width, depth) };
  }
  const { width, depth } = showerFrame(o.data.geometry.footprint);
  const bench = o.data.attributes.bench;
  return { area: width * depth - (bench ? bench.width * bench.depth : 0), least: Math.min(width, depth) };
}

/** A tile shower's opening: side 0 less its fixed glass (a door opens, so it counts as open). */
export function showerOpeningWidth(o: TileShower): number {
  const s = showerSide(o.data.geometry.footprint, 0);
  const fixed = o.data.attributes.glass
    .filter((g) => g.side === 0 && g.type === 'fixed')
    .reduce((sum, g) => sum + g.length, 0);
  return Math.max(0, s.length - fixed);
}

const kindOf = (o: ModelObject): string | null => (o.type === 'fixture' ? o.data.attributes.kind : null);
const isShower = (o: ModelObject) => o.type === 'tile_shower' || kindOf(o) === 'shower_prefab';

const r = (n: number) => Math.round(n * 10000) / 10000;

function atLeast(
  measured: number,
  key: BathClearanceKey,
  ctx: RuleContext,
  fixture: string,
  measure: string,
): RuleOutcome {
  const required = bathClearanceValue(ctx.project, key);
  if (required === null) return { status: 'missing', need: BATH_CLEARANCE_NEED[key] };
  if (measured >= required - tol) return { status: 'pass' };
  return { status: 'fail', values: { fixture, measure, measured: r(measured), required } };
}

const fixtureName = (o: ModelObject) => (o.type === 'tile_shower' ? 'shower' : (kindOf(o) ?? o.type));

const BASE = {
  code: 'company',
  type: 'automatic',
  trigger: 'new_work',
  sections: {},
  url: null,
} as const;

/** The bath clearance rules (company code). */
export const BATH_CLEARANCE_RULES: readonly CodeRule[] = [
  {
    ...BASE,
    id: BATH_CLEARANCE_RULE_IDS.side,
    appliesTo: ['fixture'],
    when: (o) => SIDE_KINDS.has(kindOf(o) ?? ''),
    test: (o, ctx) => {
      const f = o as Fixture;
      // Other toilets and lavatories are the center to center rule's.
      const segs = obstacles(f, ctx.model.objects, (x) => !SIDE_KINDS.has(x.data.attributes.kind));
      return atLeast(sideClearance(fixtureFrame(f), segs), 'side', ctx, fixtureName(f), 'side');
    },
  },
  {
    ...BASE,
    id: BATH_CLEARANCE_RULE_IDS.centerToCenter,
    appliesTo: ['fixture'],
    when: (o) => SIDE_KINDS.has(kindOf(o) ?? ''),
    test: (o, ctx) => {
      const f = o as Fixture;
      const best = nextFixtureOffset(f, ctx.model.objects);
      return atLeast(best, 'centerToCenter', ctx, fixtureName(f), 'center_to_center');
    },
  },
  {
    ...BASE,
    id: BATH_CLEARANCE_RULE_IDS.front,
    appliesTo: ['fixture'],
    when: (o) => SIDE_KINDS.has(kindOf(o) ?? '') || kindOf(o) === 'tub',
    test: (o, ctx) => {
      const f = o as Fixture;
      const d = frontClearance(fixtureFrame(f), obstacles(f, ctx.model.objects, () => true));
      return atLeast(d, f.data.attributes.kind === 'tub' ? 'tubFront' : 'front', ctx, fixtureName(f), 'front');
    },
  },
  {
    ...BASE,
    id: BATH_CLEARANCE_RULE_IDS.showerSize,
    appliesTo: ['fixture', 'tile_shower'],
    when: isShower,
    test: (o, ctx) => {
      const needArea = bathClearanceValue(ctx.project, 'showerArea');
      const needLeast = bathClearanceValue(ctx.project, 'showerLeast');
      if (needArea === null) return { status: 'missing', need: BATH_CLEARANCE_NEED.showerArea };
      if (needLeast === null) return { status: 'missing', need: BATH_CLEARANCE_NEED.showerLeast };
      const { area, least } = showerSize(o as Fixture | TileShower);
      if (area >= needArea - tol && least >= needLeast - tol) return { status: 'pass' };
      return {
        status: 'fail',
        values: {
          fixture: 'shower',
          measure: 'size',
          area: r(area),
          least: r(least),
          requiredArea: needArea,
          requiredLeast: needLeast,
        },
      };
    },
  },
  {
    ...BASE,
    id: BATH_CLEARANCE_RULE_IDS.showerFront,
    appliesTo: ['fixture', 'tile_shower'],
    when: isShower,
    test: (o, ctx) => {
      const fr = o.type === 'tile_shower' ? showerOpeningFrame(o) : fixtureFrame(o as Fixture);
      const d = frontClearance(fr, obstacles(o, ctx.model.objects, () => true));
      return atLeast(d, 'showerFront', ctx, 'shower', 'front');
    },
  },
  {
    ...BASE,
    id: BATH_CLEARANCE_RULE_IDS.showerAccess,
    appliesTo: ['tile_shower'],
    test: (o, ctx) => atLeast(showerOpeningWidth(o as TileShower), 'showerAccess', ctx, 'shower', 'opening'),
  },
];

/** The bath clearance rule set for each edition given (company rules run whatever the edition). */
export function bathClearanceRuleSets(editions: readonly string[]): RuleSet[] {
  return editions.map((edition) => ({ code: 'company', edition, rules: BATH_CLEARANCE_RULES }));
}
