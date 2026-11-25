// EZD-1906a (AC-EZD-1906a-1) shared id helpers. Expected values: editor plan R1/R2 (ids compare without case,
// `id.toLowerCase()`), R9 (`sameIds`: same length and the same id at each place, exact), the copies it replaces in
// tools/gap.ts, tools/drawing-controller.ts and selection/selection-controller.ts.
import { describe, expect, it } from 'vitest';
import { idKey, sameId, sameIds } from './ids';

describe('EZD-1906a ids', () => {
  it('idKey is the id without case', () => {
    expect(idKey('Wall-AB12')).toBe('wall-ab12');
    expect(idKey('wall-ab12')).toBe('wall-ab12');
  });

  it('sameId ignores case and nothing else', () => {
    expect(sameId('Wall-AB12', 'wall-ab12')).toBe(true);
    expect(sameId('wall-1', 'wall-2')).toBe(false);
    expect(sameId('wall-1', 'wall-1 ')).toBe(false);
  });

  it('sameIds needs the same ids in the same order, case included', () => {
    expect(sameIds([], [])).toBe(true);
    expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameIds(['a'], ['a', 'b'])).toBe(false);
    expect(sameIds(['A'], ['a'])).toBe(false);
  });
});
