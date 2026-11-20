// EZD-407 (S04 Controls "Fit chip ("Run 117" fits wall 117 1/2" · 1/2" scribe") | Canvas header | ... Green when run +
// scribe matches the wall; flagged when it does not"; S04 States "Run mismatch: fit chip turns to warning with the
// difference"; 09f "Run total vs wall length: fits when the difference after fillers and scribe is within the fit
// tolerance in Defaults"; phase-04 EZD-407 "gap = wall length − run total; green when the gap is from 0 to the scribe
// allowance of the run's fillers plus the Defaults fit tolerance (treated as 0 while not set), amber otherwise with the
// gap shown"; AC-EZD-407-1; vault/build/assumptions.md EZD-407): whether a run fits its wall. Both ends inclusive, at
// the 1/64" comparison tolerance (03g).
import { COMPARISON_TOLERANCE_IN } from '../tolerance';

export type CabinetRunFit = {
  fits: boolean;
  total: number;
  wallLength: number;
  scribe: number;
  tolerance: number;
  // Wall length less the run total: above 0 the run is short of the wall, below 0 it is longer.
  gap: number;
};

export function cabinetRunFit(o: {
  total: number;
  wallLength: number;
  scribe: number;
  // The Defaults fit tolerance; null (not set) counts as 0.
  tolerance: number | null;
}): CabinetRunFit {
  const tolerance = o.tolerance !== null && o.tolerance > 0 ? o.tolerance : 0;
  const gap = o.wallLength - o.total;
  const allowance = o.scribe + tolerance;
  const fits =
    gap >= -COMPARISON_TOLERANCE_IN && gap <= allowance + COMPARISON_TOLERANCE_IN;
  return { fits, total: o.total, wallLength: o.wallLength, scribe: o.scribe, tolerance, gap };
}
