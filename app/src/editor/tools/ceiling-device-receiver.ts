// EZD-507 (S05 Controls "Recessed light: Click to place a can", "Ceiling fan: Click to place a fan" and the other
// ceiling device tools; AC-EZD-507-1, -2): a device tool's click receiver: a click places that tool's chosen kind at
// the click with the View's status and selects it. Pure wiring: no React, no DOM.
// EZD-510 (11 Budgets; EZD-222, EZD-1401 precedent): moved here from ceiling-device-tool.ts so it loads with the
// Ceiling view's lazy module (lazy/rcp) rather than in the editor's first download.
// EZD-511 (S05 Controls "Recessed light ... in ACT areas, troffers snap into tiles"; vault/build/assumptions.md EZD-511
// "Troffers"): a light clicked in a room with an ACT grid is placed at the centre of the tile under the click.
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import { openFloorId } from '../plan/batches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import type { CeilingDeviceToolId, DeviceChoice } from './ceiling-device-tool';
import { snapToActTile } from './act-grid-edits';
import { placeCeilingDevice } from './fixture-tool';

type PlaceCeilingDevice = typeof placeCeilingDevice;

export type DeviceToolDeps = {
  store: ModelStore;
  tool: CeilingDeviceToolId;
  choice: Pick<DeviceChoice, 'get'>;
  chosenFloor: () => string | null;
  newStatus: () => 'existing' | 'demo' | 'new';
  newId: () => string;
  select: (ids: readonly string[]) => void;
  onMessage: (key: MessageKey) => void;
  place: PlaceCeilingDevice;
  /** EZD-511: the Defaults "ACT minimum border" as a share of the tile; half a tile when not given. */
  actMinShare?: () => number;
};

/** A device tool's pointer receiver: each click places one device of the tool's chosen kind and selects it. */
export function deviceToolReceiver(deps: DeviceToolDeps): PlanPointerReceiver {
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const objects = deps.store.getState().objects;
    const level = openFloorId(objects, deps.chosenFloor());
    if (level === null) return;
    const kind = deps.choice.get(deps.tool);
    const at =
      kind === 'recessed_light'
        ? snapToActTile(objects, level, e.model, deps.actMinShare?.() ?? 0.5)
        : e.model;
    const change = deps.place(kind, at, {
      level,
      newId: deps.newId,
      status: deps.newStatus(),
    });
    if (change === null) {
      deps.onMessage('office.ceiling.device.place_failed');
      return;
    }
    deps.store.applyEdit([change]);
    deps.select([change.id]);
  };
}

/** The receiver placing through this module's own placement: what the editor asks the lazy module for. */
export const deviceReceiver = (deps: Omit<DeviceToolDeps, 'place'>): PlanPointerReceiver =>
  deviceToolReceiver({ ...deps, place: placeCeilingDevice });
