// EZD-220 (Q-0704 05-screens "Pins draw in the Existing view only: a type rule in EZD-214's display filter, with the
// Phase eyes still overriding"; AC-EZD-220-5; vault/build/assumptions.md EZD-220): the type rule of the display
// filter. A pin is drawn only in the Existing view, and there its Phase eye (Existing) still decides; in Proposed it
// is hidden whatever the eyes say. Every other type follows the eyes alone. Pure.
import type { PhaseView } from '../../lib/plan/phase-view';

const EXISTING_VIEW_ONLY: ReadonlySet<string> = new Set(['pin']);

// `view` undefined (a filter that knows no view) leaves the eyes to decide.
export function viewShowsType(view: PhaseView | undefined, type: string): boolean {
  return view === undefined || view === 'existing' || !EXISTING_VIEW_ONLY.has(type);
}
