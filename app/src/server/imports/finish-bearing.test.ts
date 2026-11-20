// EZD-314 (S02 Validation "Bearing walls detected or marked: flagged; later removal is blocked without engineer";
// AC-EZD-314-6 "a bearing-wall item carries its flag"): Finish import writes a wall the import read as bearing as a
// bearing wall (attributes.bearing true, the flag EZD-215's rule reads), and a wall without the flag as not bearing.
// Also with a fix: a bearing wall moved in review stays bearing. Walls are EZD-307's 144 x 120 in room walls.
import { describe, expect, it } from 'vitest';
import type { ReviewItem } from '../../lib/imports/review';
import { finishItems } from '../../lib/imports/review-fix';
import { importObjects } from './finish-import';

const wall = (
  id: string,
  s: [number, number],
  e: [number, number],
  bearing?: boolean,
): ReviewItem => ({
  id,
  type: 'wall',
  number: 1,
  side: 'south',
  confidence: 95,
  geometry: { start: { x: s[0], y: s[1] }, end: { x: e[0], y: e[1] } },
  thickness: 4.5,
  ...(bearing === undefined ? {} : { bearing }),
});

let n = 0;
const ctx = {
  level: '00000000-0000-4000-8000-000000000001',
  appUserId: '00000000-0000-4000-8000-000000000002',
  now: '2026-11-18T12:00:00.000Z',
  firstRoomNumber: 1,
  newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
};

const bearingOf = (o: { data: unknown }) =>
  (o.data as { attributes: { bearing: boolean } }).attributes.bearing;

describe('EZD-314 Finish import keeps the bearing flag', () => {
  it('AC-EZD-314-6: a bearing wall item becomes a bearing wall; other walls are not bearing', () => {
    const items = [
      wall('w1', [144, 0], [0, 0], true),
      wall('w2', [144, 120], [144, 0], false),
      wall('w3', [0, 120], [144, 120]),
    ];
    const r = importObjects(items, {}, ctx);
    expect(r).not.toBeNull();
    expect(r!.objects.map(bearingOf)).toEqual([true, false, false]);
  });

  it('a bearing wall fixed in review is still bearing', () => {
    const items = [wall('w1', [144, 0], [0, 0], true)];
    const fixes = { w1: { geometry: { start: { x: 140, y: 0 }, end: { x: 0, y: 0 } } } };
    const accepted = finishItems(items, { w1: 'accepted' }, fixes);
    const r = importObjects(accepted, fixes, ctx);
    expect(r).not.toBeNull();
    expect(bearingOf(r!.objects[0])).toBe(true);
    const g = (r!.objects[0].data as { geometry: { start: { x: number } } }).geometry;
    expect(g.start.x).toBe(140);
  });
});
