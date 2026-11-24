// EZD-605 (S06 Controls "Device toolbar: Switch leg | Canvas toolbar | Draw a switch leg from switch to fixtures
// (dashed). | Same." (Edit model, paused in view only); AC-EZD-605-1; vault/build/assumptions.md EZD-605): the Switch
// leg tool's receiver. A click on a switch makes it the leg being drawn and selects it with its leg's lights; each
// later click on a light or fan adds it to that leg (switch-legs.ts addToLeg: it joins, widens or starts the switch's
// zone), as one undo step, and keeps the leg selected. A light clicked before any switch gives a hint. A click off
// every device does nothing. Pure: no React.
import type { ObjectStatus, Point } from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import type { Objects } from '../model/patches';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { selectedDevices } from './device-toolbar';
import { addToLeg, LEG_FIXTURE_KINDS, SWITCH_KINDS, switchLegOf } from './switch-legs';

export type SwitchLegToolDeps = {
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  pickAt: (model: Point) => string[];
  newStatus: () => ObjectStatus;
  newId: () => string;
  select: (ids: readonly string[]) => void;
  onMessage: (key: MessageKey) => void;
};

function kindOf(objects: Objects, id: string): string | null {
  const v = objects.get(id);
  const kind = (v?.data as { attributes?: { kind?: unknown } } | undefined)?.attributes?.kind;
  return typeof kind === 'string' ? kind : null;
}

export function switchLegToolReceiver(deps: SwitchLegToolDeps): PlanPointerReceiver {
  let source: string | null = null;
  const selectLeg = (id: string) => {
    const leg = switchLegOf(deps.store.getState().objects, id);
    deps.select([id, ...(leg?.fixtureIds ?? [])]);
  };
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const objects = deps.store.getState().objects;
    const picked = selectedDevices(objects, deps.pickAt(e.model));
    const sw = picked.find((id) => SWITCH_KINDS.includes(kindOf(objects, id) ?? ''));
    if (sw !== undefined) {
      source = sw;
      selectLeg(sw);
      return;
    }
    const fixture = picked.find((id) => LEG_FIXTURE_KINDS.includes(kindOf(objects, id) ?? ''));
    if (fixture === undefined) return;
    if (source === null || !objects.has(source)) {
      source = null;
      deps.onMessage('office.electrical.leg.pick_switch');
      return;
    }
    const r = addToLeg(objects, source, fixture, { status: deps.newStatus(), newId: deps.newId });
    if (!r.ok) {
      deps.onMessage(r.reason === 'no_room' ? 'office.electrical.leg.no_room' : 'office.electrical.leg.failed');
      return;
    }
    if (r.changes.length > 0) deps.store.applyEdit(r.changes);
    selectLeg(source);
  };
}
