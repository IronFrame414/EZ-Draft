// EZD-604 (S06 Controls "Device toolbar: Circuit | Canvas toolbar | Assign circuit by clicking devices in turn.
// Circuit line drawn automatically. | Same." (Edit model, paused in view only); vault/build/assumptions.md EZD-604):
// the Circuit tool's receiver. Each plan click on a device puts it on the circuit chosen in the left panel, at the end
// of its order, as one undo step, and keeps the circuit's devices selected so it shows highlighted. A click off every
// device, or with no circuit chosen, does nothing. Pure: no React.
import type { Point } from '@ezdraft/geometry';
import type { MessageKey } from '../../server/messages/catalog';
import type { ModelStore } from '../model/model-store';
import type { PlanPointerEvent, PlanPointerReceiver } from '../plan/input';
import { assignChanges, circuitDeviceIds } from './circuits';
import { selectedDevices } from './device-toolbar';

export type CircuitToolDeps = {
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  pickAt: (model: Point) => string[];
  circuit: () => string | null;
  select: (ids: readonly string[]) => void;
  onMessage: (key: MessageKey) => void;
};

export function circuitToolReceiver(deps: CircuitToolDeps): PlanPointerReceiver {
  return (e: PlanPointerEvent) => {
    if (e.kind !== 'click') return;
    const circuit = deps.circuit();
    if (circuit === null) return;
    const objects = deps.store.getState().objects;
    const device = selectedDevices(objects, deps.pickAt(e.model))[0];
    if (device === undefined) return;
    const changes = assignChanges(objects, [device], circuit);
    if (changes === null) {
      deps.onMessage('office.electrical.menu.failed');
      return;
    }
    deps.store.applyEdit(changes);
    deps.select(circuitDeviceIds(deps.store.getState().objects, circuit));
  };
}
