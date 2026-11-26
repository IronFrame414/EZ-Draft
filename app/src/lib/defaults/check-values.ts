// EZD-228 (09e "Bath clearance checks ... with values set by the owner under Defaults and checked by Check"): the
// project values the code check engine reads from Defaults. Bath clearances are the effective `bath_clearances` row
// (the company value, else the registry default: the code minimums, 09d:34). Browser and server.
import { BATH_CLEARANCES_PROJECT_KEY } from '@ezdraft/geometry/checks';
import { effectiveDefaults, type StoredDefaults } from './values';

export function codeCheckDefaults(
  stored: StoredDefaults | null | undefined,
  project?: StoredDefaults | null,
): Record<string, unknown> {
  const eff = effectiveDefaults(stored, project);
  const bath = eff.bath_clearances;
  return bath === null || bath === undefined ? {} : { [BATH_CLEARANCES_PROJECT_KEY]: bath };
}
