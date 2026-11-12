// EZD-210b O1, O2 (vault/plans/EZD-210b.md section 4; Decided "Overlay shapes", "Overlay writes"; Q-0589 (a)).
// The expected path strings are the plan's, derived from toScreen p -> (2 p.x, -2 p.y) and the sizes in the plan.
import { describe, expect, it } from 'vitest';
import {
  createOpeningData,
  doorSymbol,
  formatChipDistance,
  openingOffsets,
  wallChips,
  type OpeningObject,
  type PickShape,
  type Point,
} from '@ezdraft/geometry';
import {
  createToolOverlay,
  openingOverlay,
  overlayShapes,
  previewPath,
  selectionShapes,
} from './overlay';
import type { DrawingFrame, OpeningFrame } from './drawing-controller';
import type { SnapMarker } from './snap-marker';
import { baseObjects, objs, ROOM, uid, wallsOf, withWalls } from './test-utils/fixtures';

const toScreen = (p: Point): Point => ({ x: 2 * p.x, y: -2 * p.y });
const pt = (x: number, y: number): Point => ({ x, y });

function frame(over: Partial<DrawingFrame>): DrawingFrame {
  return {
    rect: false,
    from: null,
    to: null,
    marker: null,
    anchor: null,
    referenceDirection: null,
    wallDirection: null,
    opening: null,
    ...over,
  };
}

function marker(kind: SnapMarker['kind'], shape: SnapMarker['shape'], at: Point): SnapMarker {
  return { kind, shape, at, wallId: null, angleDeg: null };
}

describe('EZD-210b overlay', () => {
  it('O1 overlayShapes: band as a line or a rectangle, one marker per shape, in screen px with y flipped', () => {
    expect(overlayShapes(frame({ from: pt(0, 0), to: pt(10, 5) }), toScreen).band).toBe(
      'M 0 0 L 20 -10',
    );
    expect(
      overlayShapes(frame({ rect: true, from: pt(0, 0), to: pt(10, -5) }), toScreen).band,
    ).toBe('M 0 0 L 20 0 L 20 10 L 0 10 Z');
    expect(overlayShapes(frame({ from: null, to: pt(10, 5) }), toScreen).band).toBeNull();
    expect(overlayShapes(null, toScreen)).toEqual({ band: null, marker: null });

    const at = pt(5, 5);
    const m = (mk: SnapMarker, over: Partial<DrawingFrame> = {}) =>
      overlayShapes(frame({ marker: mk, ...over }), toScreen).marker;
    expect(m(marker('endpoint', 'square', at))).toEqual({
      kind: 'endpoint',
      shape: 'square',
      d: 'M 5 -15 L 15 -15 L 15 -5 L 5 -5 Z',
    });
    expect(m(marker('midpoint', 'triangle', at))?.d).toBe('M 10 -16 L 15 -7 L 5 -7 Z');
    expect(m(marker('increment', 'cross', at))?.d).toBe('M 6 -10 L 14 -10 M 10 -14 L 10 -6');
    expect(m(marker('face', 'bar', at), { wallDirection: pt(1, 0) })?.d).toBe('M 4 -10 L 16 -10');
    expect(m(marker('face', 'bar', at), { wallDirection: pt(0, 1) })?.d).toBe('M 10 -4 L 10 -16');
    expect(overlayShapes(frame({ marker: null }), toScreen).marker).toBeNull();

    const arc = { ...marker('angle', 'arc', pt(10, 10)), angleDeg: 45 };
    expect(m(arc, { anchor: pt(0, 0), referenceDirection: pt(1, 0) })?.d).toBe(
      'M 16 0 A 16 16 0 0 0 11.3 -11.3',
    );
    const straight = { ...marker('angle', 'arc', pt(10, 0)), angleDeg: 0 };
    expect(m(straight, { anchor: pt(0, 0), referenceDirection: pt(1, 0) })?.d).toBe('M 0 0 L 16 0');
  });

  it('O2 createToolOverlay writes the attributes and clears the marker ones when it goes', () => {
    const fake = () => {
      const attrs = new Map<string, string>();
      return {
        attrs,
        setAttribute(name: string, value: string) {
          attrs.set(name, value);
        },
        removeAttribute(name: string) {
          attrs.delete(name);
        },
      };
    };
    const band = fake();
    const markerEl = fake();
    band.attrs.set('display', 'none');
    markerEl.attrs.set('display', 'none');
    const overlay = createToolOverlay({ band, marker: markerEl }, toScreen);

    overlay.draw(frame({ marker: marker('endpoint', 'square', pt(5, 5)) }));
    expect(markerEl.attrs.get('d')).toBe('M 5 -15 L 15 -15 L 15 -5 L 5 -5 Z');
    expect(markerEl.attrs.get('data-snap-kind')).toBe('endpoint');
    expect(markerEl.attrs.get('data-shape')).toBe('square');
    expect(markerEl.attrs.has('display')).toBe(false);
    expect(band.attrs.get('display')).toBe('none');

    overlay.draw(null);
    expect(band.attrs.get('display')).toBe('none');
    expect(markerEl.attrs.get('display')).toBe('none');
    expect(markerEl.attrs.has('data-snap-kind')).toBe(false);
    expect(markerEl.attrs.has('data-shape')).toBe(false);
  });
});

// EZD-211b O1 (vault/plans/EZD-211b.md section 4, Decided "openingOverlay"). toScreen p -> (8/3 p.x, -8/3 p.y).
// The door symbol strings are built here by the plan's formula from the shared `doorSymbol`.
describe('EZD-211b opening overlay', () => {
  const PPI = 8 / 3;
  const toScreenP = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
  const round1 = (v: number): string => String(Math.round(v * 10) / 10);
  const xy1 = (p: Point): string => `${round1(p.x)} ${round1(p.y)}`;

  const walls = wallsOf(
    withWalls(baseObjects(), 1, [pt(0, 0), pt(144, 0), pt(144, 120), pt(0, 120)], true),
  );
  const host = walls.find((w) => w.id === uid(1))!;

  function openingOf(kind: 'door' | 'window', cx: number): OpeningObject {
    return {
      id: uid(50),
      type: 'opening',
      data: createOpeningData({ kind, host, center: pt(cx, 0), swing: 'left' }),
    };
  }

  function frameOf(o: OpeningObject, over: Partial<OpeningFrame> = {}): OpeningFrame {
    return {
      data: o.data,
      host,
      offsets: openingOffsets(o, host, walls),
      owned: false,
      chipSide: 'right',
      dot: true,
      chips: true,
      ...over,
    };
  }

  it('EZD-211b O1 openingOverlay: span, leaf, arc, dims, ticks, chips and dot in screen px', () => {
    const door = openingOf('door', 54);
    const A = frameOf(door);
    expect(A.offsets?.left).toBeCloseTo(36, 9);
    expect(A.offsets?.right).toBeCloseTo(72, 9);

    const sym = doorSymbol(door, host)!;
    const H = toScreenP(sym.hinge);
    const E = toScreenP(sym.leafEnd);
    const onCircle = (deg: number): Point => ({
      x: sym.hinge.x + sym.radius * Math.cos((deg * Math.PI) / 180),
      y: sym.hinge.y + sym.radius * Math.sin((deg * Math.PI) / 180),
    });
    const cands = [toScreenP(onCircle(sym.startAngle)), toScreenP(onCircle(sym.endAngle))];
    const dist = (p: Point) => Math.hypot(p.x - E.x, p.y - E.y);
    const C = dist(cands[0]!) >= dist(cands[1]!) ? cands[0]! : cands[1]!;
    const edge = toScreenP({ x: sym.hinge.x + sym.radius, y: sym.hinge.y });
    const r = Math.hypot(edge.x - H.x, edge.y - H.y);
    const cross = (C.x - H.x) * (E.y - H.y) - (C.y - H.y) * (E.x - H.x);
    const leaf = `M ${xy1(H)} L ${xy1(E)}`;
    const arc = `M ${xy1(C)} A ${round1(r)} ${round1(r)} 0 0 ${cross > 0 ? 1 : 0} ${xy1(E)}`;

    const DIMS = 'M 0 36 L 96 36 M 384 36 L 192 36';
    const TICKS = 'M 0 28 L 0 44 M 96 28 L 96 44 M 384 28 L 384 44 M 192 28 L 192 44';
    const SPAN = 'M 96 0 L 192 0 L 192 12 L 96 12 Z';

    const a = openingOverlay(A, toScreenP)!;
    expect(a.dims).toBe(DIMS);
    expect(a.ticks).toBe(TICKS);
    expect(a.left!.x).toBeCloseTo(48, 9);
    expect(a.left!.y).toBeCloseTo(36, 9);
    expect(a.left!.text).toBe('3\' 0"');
    expect(a.right!.x).toBeCloseTo(288, 9);
    expect(a.right!.y).toBeCloseTo(36, 9);
    expect(a.right!.text).toBe('6\' 0"');
    expect(a.span).toBe(SPAN);
    expect(a.leaf).toBe(leaf);
    expect(a.arc).toBe(arc);
    expect(a.arc).toMatch(/^M .+ A 96 96 0 0 [01] .+$/);
    expect(a.dot!.x).toBeCloseTo(H.x, 9);
    expect(a.dot!.y).toBeCloseTo(H.y, 9);

    const b = openingOverlay(frameOf(door, { owned: true }), toScreenP)!;
    expect(b.span).toBe('');
    expect(b.leaf).toBeNull();
    expect(b.arc).toBeNull();
    expect(b.dims).toBe(DIMS);

    const c = openingOverlay(frameOf(door, { chips: false }), toScreenP)!;
    expect(c.dims).toBe('');
    expect(c.ticks).toBe('');
    expect(c.left).toBeNull();
    expect(c.right).toBeNull();
    expect(c.span).toBe(SPAN);
    expect(c.leaf).toBe(leaf);
    expect(c.arc).toBe(arc);
    expect(c.dot!.x).toBeCloseTo(H.x, 9);
    expect(c.dot!.y).toBeCloseTo(H.y, 9);

    const d = openingOverlay(frameOf(openingOf('window', 54), { dot: false }), toScreenP)!;
    expect(d.leaf).toBeNull();
    expect(d.arc).toBeNull();
    expect(d.dot).toBeNull();
    expect(d.span).toBe(SPAN);

    const e = openingOverlay(
      frameOf(door, {
        offsets: { ...A.offsets!, left: 24, leftCorner: { at: 12, wallId: null } },
      }),
      toScreenP,
    )!;
    expect(e.dims.startsWith('M 32 36 L 96 36')).toBe(true);
    expect(e.left!.x).toBeCloseTo(64, 9);
    expect(e.left!.y).toBeCloseTo(36, 9);
    expect(e.left!.text).toBe('2\' 0"');

    expect(openingOverlay(frameOf(door, { offsets: null }), toScreenP)).toBeNull();
  });
});

// EZD-212b T11 (vault/plans/EZD-212b.md section 4, D9). Strings are the plan's: path numbers have one decimal.
describe('EZD-212b move preview overlay', () => {
  it('EZD-212b T11 preview path', () => {
    const quad: PickShape = {
      kind: 'quad',
      points: [pt(0, 0), pt(10, 0), pt(10, 5), pt(0, 5)],
      area: 50,
    };
    const bar: PickShape = { kind: 'bar', from: pt(1, 1), to: pt(2, 2), area: 0 };
    expect(previewPath([quad, bar], (q) => q)).toBe('M 0 0 L 10 0 L 10 5 L 0 5 Z M 1 1 L 2 2');
    expect(previewPath([], (q) => q)).toBeNull();

    const fake = () => {
      const attrs = new Map<string, string>();
      return {
        attrs,
        setAttribute(name: string, value: string) {
          attrs.set(name, value);
        },
        removeAttribute(name: string) {
          attrs.delete(name);
        },
      };
    };
    const band = fake();
    const markerEl = fake();
    const preview = fake();
    for (const e of [band, markerEl, preview]) e.attrs.set('display', 'none');
    const overlay = createToolOverlay({ band, marker: markerEl, preview }, toScreen);

    overlay.draw(frame({ preview: [quad] }));
    expect(preview.attrs.get('d')).toEqual(expect.any(String));
    expect(preview.attrs.get('d')!.startsWith('M ')).toBe(true);
    expect(preview.attrs.has('display')).toBe(false);

    overlay.draw(frame({}));
    expect(preview.attrs.get('display')).toBe('none');
    overlay.draw(null);
    expect(preview.attrs.get('display')).toBe('none');
  });
});

// EZD-212c O1, O2 (vault/plans/EZD-212c.md section 4, D8). toScreen p -> (8/3 p.x, -8/3 p.y). Expected strings are the
// plan's (P212a chips 57.75 and 81.75; 09k Chip display 57.75 -> 4' 10"), not the code's.
describe('EZD-212c selection overlay', () => {
  const PPI = 8 / 3;
  const toScreenP = (p: Point): Point => ({ x: p.x * PPI, y: -p.y * PPI });
  const PART = withWalls(ROOM, 5, [pt(60, 0), pt(60, 120)], false, 'center');
  const sel = () => ({
    handles: [pt(60, 0), pt(60, 120)],
    active: 1,
    wallChips: wallChips(objs(PART), uid(5)),
    size: { at: pt(50, 0), normal: pt(0, -1), text: formatChipDistance(28) },
  });

  it('EZD-212c O1 selection shapes', () => {
    const s = selectionShapes(sel(), toScreenP);
    expect(s.handles).toHaveLength(2);
    expect(s.handles[0]!.x).toBeCloseTo(160, 9);
    expect(s.handles[0]!.y).toBeCloseTo(0, 9);
    expect(s.handles[1]!.x).toBeCloseTo(160, 9);
    expect(s.handles[1]!.y).toBeCloseTo(-320, 9);
    expect(s.active).toBe(1);
    expect(s.leaders).toBe('M 154 -160 L 0 -160 M 166 -160 L 384 -160');
    expect(s.ticks).toBe(
      'M 154 -154 L 154 -166 M 0 -154 L 0 -166 M 166 -166 L 166 -154 M 384 -166 L 384 -154',
    );
    expect(s.left!.x).toBeCloseTo(77, 9);
    expect(s.left!.y).toBeCloseTo(-160, 9);
    expect(s.left!.text).toBe('4\' 10"');
    expect(s.right!.x).toBeCloseTo(275, 9);
    expect(s.right!.y).toBeCloseTo(-160, 9);
    expect(s.right!.text).toBe('6\' 10"');
    expect(s.size!.x).toBeCloseTo(400 / 3, 9);
    expect(s.size!.y).toBeCloseTo(36, 9);
    expect(s.size!.text).toBe('2\' 4"');

    for (const none of [null, undefined]) {
      const e = selectionShapes(none, toScreenP);
      expect(e.handles).toEqual([]);
      expect(e.active).toBeNull();
      expect(e.leaders).toBe('');
      expect(e.ticks).toBe('');
      expect(e.left).toBeNull();
      expect(e.right).toBeNull();
      expect(e.size).toBeNull();
    }
  });

  it('EZD-212c O2 overlay writes', () => {
    const fake = () => {
      const attrs = new Map<string, string>();
      return {
        attrs,
        setAttribute(name: string, value: string) {
          attrs.set(name, value);
        },
        removeAttribute(name: string) {
          attrs.delete(name);
        },
      };
    };
    const chip = () => ({
      slot: { style: { transform: '', display: 'none' } },
      button: { textContent: null as string | null },
    });
    const band = fake();
    const markerEl = fake();
    const h0 = fake();
    const h1 = fake();
    const leaders = fake();
    const ticks = fake();
    const chips = [chip(), chip()] as const;
    const size = chip();
    for (const e of [band, markerEl, h0, h1, leaders, ticks]) e.attrs.set('display', 'none');
    const overlay = createToolOverlay(
      {
        band,
        marker: markerEl,
        selection: { handles: [h0, h1], leaders, ticks, chips, size },
      },
      toScreenP,
    );

    overlay.draw(frame({ selection: sel() }));
    expect(h0.attrs.get('cx')).toBe('160');
    expect(h0.attrs.get('cy')).toBe('0');
    expect(h1.attrs.get('cx')).toBe('160');
    expect(h1.attrs.get('cy')).toBe('-320');
    expect(h0.attrs.has('data-active')).toBe(false);
    expect(h1.attrs.get('data-active')).toBe('true');
    expect(h0.attrs.has('display')).toBe(false);
    expect(h1.attrs.has('display')).toBe(false);
    expect(leaders.attrs.get('d')).toBe('M 154 -160 L 0 -160 M 166 -160 L 384 -160');
    expect(leaders.attrs.has('display')).toBe(false);
    expect(ticks.attrs.get('d')).toEqual(expect.any(String));
    expect(ticks.attrs.has('display')).toBe(false);
    expect(chips[0].slot.style.display).toBe('');
    expect(chips[0].slot.style.transform).toBe('translate(77px, -160px) translate(-50%, -50%)');
    expect(chips[0].button.textContent).toBe('4\' 10"');
    expect(chips[1].slot.style.display).toBe('');
    expect(chips[1].button.textContent).toBe('6\' 10"');
    expect(size.slot.style.display).toBe('');
    expect(size.slot.style.transform).toBe('translate(133.3px, 36px) translate(-50%, -50%)');
    expect(size.button.textContent).toBe('2\' 4"');

    overlay.draw(frame({ selection: null }));
    for (const e of [h0, h1, leaders, ticks]) expect(e.attrs.get('display')).toBe('none');
    expect(chips[0].slot.style.display).toBe('none');
    expect(chips[1].slot.style.display).toBe('none');
    expect(size.slot.style.display).toBe('none');
  });
});
