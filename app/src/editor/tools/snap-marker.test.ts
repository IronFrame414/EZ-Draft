// EZD-210a S1 (vault/plans/EZD-210a.md sections 1 Decided "Snap marker", 3 C32-C35, 4). Sources: Q-0589 (a);
// S03 Snap; P206 `snap`; AC-EZD-210-10.
import { SNAP_KINDS, type Point, type SnapResult } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { SNAP_MARKER_SHAPES, snapMarker } from './index';
import { uid } from './test-utils/fixtures';

const p = (x: number, y: number): Point => ({ x, y });
const NO_CTX = { anchor: null, referenceDirection: null };

describe('EZD-210a snap marker', () => {
  it('EZD-210a S1 snap marker per kind', () => {
    const cases: [SnapResult['kind'], string | null, string][] = [
      ['endpoint', uid(1), 'square'],
      ['midpoint', uid(1), 'triangle'],
      ['face', uid(1), 'bar'],
      ['increment', null, 'cross'],
    ];
    for (const [kind, wallId, shape] of cases) {
      const result: SnapResult = { point: p(1, 2), kind, wallId };
      const m = snapMarker(result, NO_CTX);
      expect(m).toEqual({ kind, shape, at: p(1, 2), wallId, angleDeg: null });
      expect(m!.at).not.toBe(result.point);
    }
    const angle = (point: Point, ref: Point | null) =>
      snapMarker(
        { point, kind: 'angle', wallId: null },
        { anchor: p(0, 0), referenceDirection: ref },
      );
    const a90 = angle(p(0, 10), p(1, 0));
    expect(a90?.shape).toBe('arc');
    expect(a90?.angleDeg).toBe(90);
    expect(angle(p(7, 7), p(1, 0))?.angleDeg).toBe(45);
    expect(angle(p(-10, 0), null)?.angleDeg).toBe(180);
    expect(angle(p(-10, 0), p(0, 1))?.angleDeg).toBe(90);
    expect(snapMarker({ point: p(1, 2), kind: null, wallId: null }, NO_CTX)).toBeNull();
    expect(SNAP_MARKER_SHAPES).toEqual({
      endpoint: 'square',
      midpoint: 'triangle',
      face: 'bar',
      angle: 'arc',
      increment: 'cross',
    });
    const shapes = SNAP_KINDS.map((k) => SNAP_MARKER_SHAPES[k]);
    expect(shapes.every((s) => typeof s === 'string')).toBe(true);
    expect(new Set(shapes).size).toBe(5);
  });
});
