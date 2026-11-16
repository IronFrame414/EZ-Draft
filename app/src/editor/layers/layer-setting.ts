// EZD-218 (S03 Controls — left panel; S03 Decisions "The layer filter is a lock icon on each layer row"; 00g
// "Layer", "Eye", "Layer lock"; 03 Q-0664 "View default"; Q-0678 (a); AC-EZD-218-2, -3): the left panel's layers
// without React. A layer is a Phase row (Existing, Demo, New) or Rooms; overlay rows join when their object kinds
// ship (Q-0674 (b)). The Phase eyes are EZD-214's; this store adds the Rooms eye and every lock. Eyes and locks
// belong to the device session and reset on reload (a new store per editor open).
//
// Membership: an object is in the Phase layer of its status; a room is also in Rooms. It is drawn only when every
// layer it is in is shown, and can be selected only when none of its layers is locked.
import type { ObjectStatus } from '@ezdraft/geometry';
import type { PhaseEyes, PhaseFilter } from '../../lib/plan/phase-view';

export const LAYER_IDS = ['existing', 'demo', 'new', 'rooms'] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export type LayerLocks = Readonly<Record<LayerId, boolean>>;

export type LayerState = Readonly<{ roomsEye: boolean; locks: LayerLocks }>;

const isStatus = (s: unknown): s is ObjectStatus => s === 'existing' || s === 'demo' || s === 'new';

export function objectLayers(type: string, status: unknown): LayerId[] {
  const out: LayerId[] = [];
  if (isStatus(status)) out.push(status);
  if (type === 'room') out.push('rooms');
  return out;
}

export function objectVisible(
  eyes: PhaseEyes,
  roomsEye: boolean,
  type: string,
  status: unknown,
): boolean {
  return objectLayers(type, status).every((l) => (l === 'rooms' ? roomsEye : eyes[l]));
}

export function objectSelectable(locks: LayerLocks, type: string, status: unknown): boolean {
  return objectLayers(type, status).every((l) => !locks[l]);
}

type Listenable = { subscribe(listener: () => void): () => void };

export type LayerPhase = Listenable & {
  get(): { eyes: PhaseEyes };
  version(): number;
  setEye(status: ObjectStatus, on: boolean): void;
};

export type LayerSetting = PhaseFilter &
  Listenable & {
    get(): LayerState;
    eyes(): PhaseEyes;
    setEye(status: ObjectStatus, on: boolean): void;
    setRoomsEye(on: boolean): void;
    setLock(layer: LayerId, on: boolean): void;
    // What selection reads: shown and not locked.
    readonly selectable: PhaseFilter & Listenable;
  };

const UNLOCKED: LayerLocks = Object.freeze({
  existing: false,
  demo: false,
  new: false,
  rooms: false,
});

export function createLayerSetting(phase: LayerPhase): LayerSetting {
  let state: LayerState = Object.freeze({ roomsEye: true, locks: UNLOCKED });
  let own = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of [...listeners]) l();
  };
  const change = (next: LayerState) => {
    state = Object.freeze(next);
    own += 1;
    notify();
  };
  // Both counts only grow, so the sum changes with either.
  const version = () => phase.version() + own;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const off = phase.subscribe(listener);
    return () => {
      listeners.delete(listener);
      off();
    };
  };
  const shownObject = (type: string, status: unknown) =>
    objectVisible(phase.get().eyes, state.roomsEye, type, status);
  const shown = (status: unknown) => shownObject('', status);

  return {
    version,
    shown,
    shownObject,
    subscribe,
    get: () => state,
    eyes: () => phase.get().eyes,
    setEye: (status, on) => phase.setEye(status, on),
    setRoomsEye(on) {
      if (state.roomsEye === on) return;
      change({ roomsEye: on, locks: state.locks });
    },
    setLock(layer, on) {
      if (state.locks[layer] === undefined || state.locks[layer] === on) return;
      change({ roomsEye: state.roomsEye, locks: Object.freeze({ ...state.locks, [layer]: on }) });
    },
    selectable: {
      version,
      subscribe,
      shown: (status) => shown(status) && objectSelectable(state.locks, '', status),
      shownObject: (type, status) =>
        shownObject(type, status) && objectSelectable(state.locks, type, status),
    },
  };
}
