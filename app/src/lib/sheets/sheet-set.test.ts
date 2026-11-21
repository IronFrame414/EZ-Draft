// EZD-701 (AC-EZD-701-1, -2). Expected sets: S13 Decision 1 and 09h Sheet set rules (the ten-sheet order), Q-0779
// (A6.0 only with the Reflected ceiling plan box ticked), Q-0764 (the other boxes do not change the set), titles
// from the S13 mockup sheet list.
import { describe, expect, it } from 'vitest';
import { defaultSheetSet } from './sheet-set';

const NINE = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'E1.0', 'E2.0', 'R1.0'];
const TEN = ['A0.0', 'A1.0', 'A2.0', 'A3.0', 'A4.0', 'A5.0', 'A6.0', 'E1.0', 'E2.0', 'R1.0'];

describe('EZD-701 default sheet set', () => {
  it('AC-1: no boxes ticked gives the nine default sheets, no A6.0', () => {
    const set = defaultSheetSet([]);
    expect(set.map((s) => s.number)).toEqual(NINE);
    expect(set.map((s) => s.title)).toEqual([
      'Cover',
      'Existing',
      'Demo',
      'Proposed',
      'Elevations',
      'Details',
      'Electrical',
      'Panel + load calc',
      'Finish schedule + renders',
    ]);
    expect(set.every((s) => s.viewports.length === 0)).toBe(true);
  });

  it('AC-2: the Reflected ceiling plan box adds A6.0 RCP between A5.0 and E1.0', () => {
    const set = defaultSheetSet(['rcp']);
    expect(set.map((s) => s.number)).toEqual(TEN);
    expect(set[6]).toEqual({ number: 'A6.0', title: 'RCP', group: 'architectural', viewports: [] });
  });

  it('the Electrical, Plumbing and Mechanical boxes do not change the set', () => {
    expect(defaultSheetSet(['electrical', 'plumbing', 'mechanical']).map((s) => s.number)).toEqual(NINE);
    expect(defaultSheetSet(['electrical', 'plumbing', 'mechanical', 'rcp']).map((s) => s.number)).toEqual(TEN);
  });

  it('groups the sheets Architectural, Electrical, Renderings', () => {
    expect(defaultSheetSet(['rcp']).map((s) => s.group)).toEqual([
      ...Array<string>(7).fill('architectural'),
      'electrical',
      'electrical',
      'renderings',
    ]);
  });
});
