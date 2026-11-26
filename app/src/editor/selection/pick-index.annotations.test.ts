// EZD-216 (S03 Select "click selects the smallest object"; Q-0685 (a) Delete and Move act on a selected dimension or
// note): a placed dimension is picked on its dimension line (not on the points it measures), a note on its text.
// Sizes: dimension text 1/8" and notes 3/32" on paper (AC-EZD-216-5), at the default plan scale.
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, type Point } from '@ezdraft/geometry';
import { planAnnotation } from '../plan/batches';
import { DEFAULT_PLAN_SCALE } from '../../lib/plan/plan-scale';
import { baseObjects, F1, uid } from '../tools/test-utils/fixtures';
import { createPickIndex } from './pick-index';

const pt = (x: number, y: number): Point => ({ x, y });
const TOL = 1;

function objects() {
  const o = baseObjects();
  o.set(uid(40), {
    type: 'dimension',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { kind: 'points', from: pt(0, 60), to: pt(150, 60) },
      status: 'existing',
      level: F1,
      attributes: { kind: 'linear', offset: 24, override: null, auto: null, room: null },
    },
  });
  o.set(uid(41), {
    type: 'text',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data: {
      geometry: { position: pt(300, 40), leader: null },
      status: 'existing',
      level: F1,
      attributes: { text: 'VERIFY IN FIELD', paperSize: '3/32' },
    },
  });
  return o;
}

describe('EZD-216 picking dimensions and notes', () => {
  it('a dimension on its line at the offset; a note on its text', () => {
    const index = createPickIndex({ annotation: () => planAnnotation(DEFAULT_PLAN_SCALE) });
    index.sync(objects(), F1, []);
    expect(index.has(uid(40))).toBe(true);
    expect(index.pick(pt(75, 84), TOL)).toEqual([uid(40)]);
    expect(index.pick(pt(75, 60), TOL)).toEqual([]);
    expect(index.pick(pt(75, 120), TOL)).toEqual([]);
    expect(index.pick(pt(300, 40), TOL)).toEqual([uid(41)]);
    expect(index.pick(pt(600, 40), TOL)).toEqual([]);
  });
});
