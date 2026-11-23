// EZD-511 (S05 Controls "Acoustical grid | Ceiling rail | Places a 2x2 or 2x4 ACT grid in a room; set direction and
// start point. Grid auto-balances borders. | Edit model."; AC-EZD-511-1): the Acoustical grid tool. While it is on
// (Ceiling or Both, Edit model and the lock), a click in a room with a flat ceiling places a balanced grid on it and
// selects it; a click in a room that has a grid selects that grid (one per room). A click outside every room, or in a
// room whose ceiling is not flat, places nothing and says why. Pure wiring: no React, no DOM.
// 11 Budgets (EZD-222, EZD-1401 precedent): the placement is given by the caller, so it loads with the Ceiling view's
// lazy module (rcp.ts) rather than in the editor's first download.
import type { ObjectStatus } from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { placeActGrid } from './act-grid-edits';

export type ActGridToolDeps = {
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  chosenFloor: () => string | null;
  newStatus: () => ObjectStatus;
  newId: () => string;
  select: (ids: readonly string[]) => void;
  onMessage: (key: MessageKey) => void;
  /** The Defaults "ACT minimum border" as a share of the tile (actMinBorderShare). */
  minShare: () => number;
  place: typeof placeActGrid;
};

/** The Acoustical grid tool's pointer receiver: one grid per click on a room, selected. */
export function actGridReceiver(deps: ActGridToolDeps): PlanPointerReceiver {
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const objects = deps.store.getState().objects;
    const level = openFloorId(objects, deps.chosenFloor());
    if (level === null) return;
    const r = deps.place(objects, level, e.model, deps.newStatus(), deps.newId, deps.minShare());
    if (r.kind === 'refused') {
      deps.onMessage(r.messageKey);
      return;
    }
    if (r.kind === 'placed') {
      deps.store.applyEdit([r.change]);
      deps.select([r.change.id]);
      return;
    }
    deps.select([r.id]);
  };
}
