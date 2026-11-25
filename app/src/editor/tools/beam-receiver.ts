// EZD-505 (S05 Controls "Beam: Places faux beams on the selected ceiling surface. Edit model."): the Beam tool's click
// receiver: a click in a room places a beam set on that room's ceiling and selects it; a click outside every room
// places nothing and says so. Pure wiring: no React, no DOM.
// EZD-510 (11 Budgets; EZD-222, EZD-1401 precedent): moved here from beam-tool.ts so it loads with the Ceiling view's
// lazy module (lazy/beam-spacing) rather than in the editor's first download.
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { placeBeamSet } from './beam-edits';

type PlaceBeamSet = typeof placeBeamSet;

export type BeamToolDeps = {
  store: ModelStore;
  chosenFloor: () => string | null;
  newStatus: () => 'existing' | 'demo' | 'new';
  newId: () => string;
  select: (ids: readonly string[]) => void;
  onMessage: (key: MessageKey) => void;
  place: PlaceBeamSet;
};

/** The Beam tool's pointer receiver: each click places one set. */
export function beamToolReceiver(deps: BeamToolDeps): PlanPointerReceiver {
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const objects = deps.store.getState().objects;
    const level = openFloorId(objects, deps.chosenFloor());
    if (level === null) return;
    const change = deps.place(objects, level, e.model, deps.newStatus(), deps.newId);
    if (change === null) {
      deps.onMessage('office.beam.click_room');
      return;
    }
    deps.store.applyEdit([change]);
    deps.select([change.id]);
  };
}

/** The receiver placing through this module's own placement: what the editor asks the lazy module for. */
export const beamReceiver = (deps: Omit<BeamToolDeps, 'place'>): PlanPointerReceiver =>
  beamToolReceiver({ ...deps, place: placeBeamSet });
