// EZD-604 (S06 Controls "Device toolbar: Circuit | Assign circuit by clicking devices in turn. Circuit line drawn
// automatically."; vault/build/assumptions.md EZD-604): each click on a device puts it on the chosen circuit as one
// undo step and keeps the circuit's devices selected; a click on empty plan or with no circuit chosen does nothing.
import { describe, expect, it } from 'vitest';
import { createModelStore } from '../model/model-store';
import type { PlanPointerEvent } from '../plan/input';
import { uid } from '../tools/test-utils/fixtures';
import { circuitToolReceiver } from './circuit-tool';
import { electricalObjects } from './test-fixture';

const click = (x: number, y: number): PlanPointerEvent => ({
  kind: 'click',
  model: { x, y },
  screen: { x, y },
  pointerType: 'mouse',
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});

describe('EZD-604 Circuit tool', () => {
  it('clicked devices join the chosen circuit in turn; each click is one undo step', () => {
    const store = createModelStore({ objects: electricalObjects() });
    const C16 = uid(203);
    // The fixture's family-room CO detector (303) and the loose smoke detector (304), picked by position.
    const at = new Map([
      ['250,80', uid(303)],
      ['500,500', uid(304)],
    ]);
    let selected: readonly string[] = [];
    let circuit: string | null = C16;
    const receive = circuitToolReceiver({
      store,
      pickAt: (p) => {
        const id = at.get(`${p.x},${p.y}`);
        return id === undefined ? [] : [id];
      },
      circuit: () => circuit,
      select: (ids) => (selected = ids),
      onMessage: () => {},
    });
    receive(click(500, 500));
    receive(click(250, 80));
    const attrs = (id: string) =>
      (store.getState().objects.get(id)!.data as { attributes: Record<string, unknown> })
        .attributes;
    expect(attrs(uid(304)).circuit).toBe(C16);
    expect(attrs(uid(303)).circuit).toBe(C16);
    expect(attrs(C16).order).toEqual([uid(304), uid(303)]);
    expect(selected).toEqual([uid(304), uid(303)]);
    expect(store.getState().past).toHaveLength(2);
    // Empty plan, then no circuit chosen: nothing changes.
    receive(click(1, 1));
    circuit = null;
    receive(click(500, 500));
    expect(store.getState().past).toHaveLength(2);
    store.undo();
    expect(attrs(uid(303)).circuit).toBeUndefined();
    expect(attrs(C16).order).toEqual([uid(304)]);
  });
});
