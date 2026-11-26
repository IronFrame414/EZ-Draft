// EZD-228 (09e "Bath clearance checks ... with values set by the owner under Defaults and checked by Check"): the
// project values the code check engine reads from Defaults. Bath clearances are the effective `bath_clearances` row
// (the company value, else the registry default: the code minimums, 09d:34). Browser and server. EZD-612 adds the
// fan blade clearance.
import { BATH_CLEARANCES_PROJECT_KEY } from '@ezdraft/geometry/checks';
import { FAN_CLEARANCE_PROJECT_KEY } from '../code-check/ceiling-rules';
import { effectiveDefaults, type StoredDefaults } from './values';

export function codeCheckDefaults(
  stored: StoredDefaults | null | undefined,
  project?: StoredDefaults | null,
): Record<string, unknown> {
  const eff = effectiveDefaults(stored, project);
  const bath = eff.bath_clearances;
  const out: Record<string, unknown> =
    bath === null || bath === undefined ? {} : { [BATH_CLEARANCES_PROJECT_KEY]: bath };
  // EZD-612: the fan blade clearance (inches) for FC-001; Not set leaves it out (cannot-check).
  const fan = eff.fan_blade_clearance;
  if (typeof fan === 'number') out[FAN_CLEARANCE_PROJECT_KEY] = fan;
  return out;
}
