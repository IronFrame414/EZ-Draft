// EZD-602 (11 Budgets; vault/build/assumptions.md EZD-602): the one thing the editor entry holds for the electrical
// device toolbar. The editor puts what every placing tool is given in `base`; the toolbar (lazy, with electrical mode)
// puts its receiver in `tool` while an item is armed and editing is allowed, and the shared tool route
// (wireCeilingTools) routes it on the floor plan. A zustand store, which the entry already carries, so the slot adds
// no code of its own.
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { PlanPointerReceiver } from '../plan/input';

export type ReceiverSlot<B> = StoreApi<{ base: B | null; tool: PlanPointerReceiver | null }>;

export const createReceiverSlot = <B>(): ReceiverSlot<B> =>
  createStore(() => ({ base: null, tool: null }));
