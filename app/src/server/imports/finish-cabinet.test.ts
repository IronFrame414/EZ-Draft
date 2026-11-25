// EZD-915 (S02 Decisions "Finish import requires every item to be resolved"; vault/build/assumptions.md EZD-915): an
// accepted supplier cabinet resolves its item, and Finish import still writes the walls; the cabinet itself is not
// written to the model yet (finish_import takes walls, openings and rooms only), so it adds no object and no count.
import { describe, expect, it } from 'vitest';
import type { ReviewItem } from '../../lib/imports/review';
import { finishItems } from '../../lib/imports/review-fix';
import { importedCounts, importObjects } from './finish-import';

const wall: ReviewItem = {
  id: 'wall-1',
  type: 'wall',
  number: 1,
  side: 'north',
  confidence: 95,
  geometry: { start: { x: 0, y: 0 }, end: { x: 60, y: 0 } },
  thickness: 4.5,
};
const cabinet: ReviewItem = {
  id: 'cabinet-1',
  type: 'cabinet',
  number: 1,
  confidence: 95,
  code: 'B24',
  boxType: 'base',
  width: 24,
  depth: 24,
  height: 34.5,
  center: { x: 12, y: -12 },
  outline: { min: { x: 0, y: -24 }, max: { x: 24, y: 0 } },
  run: 1,
  check: { plan: 'agrees', elevation: 'agrees', planSize: { long: 24, short: 24 }, elevationSize: { width: 24, height: 34.5 } },
};

let n = 0;
const ctx = {
  level: '00000000-0000-4000-8000-000000000001',
  appUserId: '00000000-0000-4000-8000-000000000002',
  now: '2026-11-22T12:00:00.000Z',
  firstRoomNumber: 1,
  newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
};

describe('EZD-915 Finish import with supplier cabinets', () => {
  it('an accepted cabinet writes no object; the wall is still written', () => {
    const accepted = finishItems([wall, cabinet], { 'wall-1': 'accepted', 'cabinet-1': 'accepted' }, {});
    const r = importObjects(accepted, {}, ctx);
    expect(r).not.toBeNull();
    expect(r!.objects.map((o) => o.type)).toEqual(['wall']);
    expect(importedCounts(accepted)).toEqual({ walls: 1, windows: 0, doors: 0, rooms: 0 });
  });
});
