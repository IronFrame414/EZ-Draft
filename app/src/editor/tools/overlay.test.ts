// EZD-210b O1, O2 (vault/plans/EZD-210b.md section 4; Decided "Overlay shapes", "Overlay writes"; Q-0589 (a)).
// The expected path strings are the plan's, derived from toScreen p -> (2 p.x, -2 p.y) and the sizes in the plan.
import { describe, expect, it } from 'vitest';
import type { Point } from '@ezdraft/geometry';
import { createToolOverlay, overlayShapes } from './overlay';
import type { DrawingFrame } from './drawing-controller';
import type { SnapMarker } from './snap-marker';

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
