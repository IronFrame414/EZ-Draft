// EZD-407 (AC-EZD-407-1 "A 117" run with 1/2" scribe on a 117 1/2" wall shows green"; phase-04 EZD-407 rule: green
// when wall length − run total is from 0 to the fillers' scribe plus the Defaults fit tolerance, 0 while not set).
import { describe, expect, it } from 'vitest';
import { cabinetRunFit } from './fit';

describe('EZD-407 cabinetRunFit', () => {
  it('AC-EZD-407-1: a 117" run with 1/2" scribe on a 117 1/2" wall fits (tolerance not set)', () => {
    const f = cabinetRunFit({ total: 117, wallLength: 117.5, scribe: 0.5, tolerance: null });
    expect(f.fits).toBe(true);
    expect(f.gap).toBe(0.5);
    expect(f.tolerance).toBe(0);
  });

  it('fits when the run matches the wall exactly (gap 0)', () => {
    expect(cabinetRunFit({ total: 117, wallLength: 117, scribe: 0.5, tolerance: null }).fits).toBe(true);
  });

  it('is flagged when the run is longer than the wall', () => {
    const f = cabinetRunFit({ total: 120, wallLength: 117.5, scribe: 0.5, tolerance: null });
    expect(f.fits).toBe(false);
    expect(f.gap).toBe(-2.5);
  });

  it('is flagged when the gap is more than the scribe and no tolerance is set', () => {
    const f = cabinetRunFit({ total: 117, wallLength: 118.25, scribe: 0.5, tolerance: null });
    expect(f.fits).toBe(false);
    expect(f.gap).toBe(1.25);
  });

  it('the Defaults fit tolerance widens the allowance: a 3/4" gap with 1/2" scribe fits at 1/4"', () => {
    expect(cabinetRunFit({ total: 117, wallLength: 117.75, scribe: 0.5, tolerance: 0.25 }).fits).toBe(true);
    expect(cabinetRunFit({ total: 117, wallLength: 117.875, scribe: 0.5, tolerance: 0.25 }).fits).toBe(false);
  });

  it('the tolerance does not let a run longer than the wall fit', () => {
    expect(cabinetRunFit({ total: 118, wallLength: 117.5, scribe: 0.5, tolerance: 1 }).fits).toBe(false);
  });
});
