// EZD-218 (S03 Controls — left panel; S03 Decisions "The layer filter is a lock icon on each layer row"; 00g
// "Layer", "Eye", "Layer lock"; 03 Q-0664 "View default"; Q-0678 (a); AC-EZD-218-2, -3): the left panel's layers
// without React. A layer is a Phase row (Existing, Demo, New) or Rooms; overlay rows join when their object kinds
// ship (Q-0674 (b)). The Phase eyes are EZD-214's; this store adds the Rooms eye and every lock. Eyes and locks
// belong to the device session and reset on reload (a new store per editor open).
//
// Membership: an object is in the Phase layer of its status; a room is also in Rooms. It is drawn only when every
// layer it is in is shown, and can be selected only when none of its layers is locked.
// EZD-729 (AC-EZD-729-1; S03 "Layers tab sections: Phase, Overlays, Rooms"; vault/build/assumptions.md EZD-729): the
// Plumbing layer. A sink's derived supply and drain locations and every water or drain utility point are in it, as
// well as in their Phase layer; its eye starts on and resets on reload.
import { PLUMBING_LOCATION_TYPE, type ObjectStatus } from '@ezdraft/geometry';
import type { PhaseEyes, PhaseFilter } from '../../lib/plan/phase-view';

export const LAYER_IDS = ['existing', 'demo', 'new', 'rooms', 'plumbing'] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export type LayerLocks = Readonly<Record<LayerId, boolean>>;

export type LayerState = Readonly<{ roomsEye: boolean; plumbingEye: boolean; locks: LayerLocks }>;

const isStatus = (s: unknown): s is ObjectStatus => s === 'existing' || s === 'demo' || s === 'new';

const inPlumbing = (type: string, kind: unknown) =>
  type === PLUMBING_LOCATION_TYPE || (type === 'utility_point' && (kind === 'water' || kind === 'drain'));

// `kind` is the object's attributes.kind, when it has one.
export function objectLayers(type: string, status: unknown, kind?: unknown): LayerId[] {
  const out: LayerId[] = [];
  if (isStatus(status)) out.push(status);
  if (type === 'room') out.push('rooms');
  if (inPlumbing(type, kind)) out.push('plumbing');
  return out;
}

export function objectVisible(
  eyes: PhaseEyes,
  roomsEye: boolean,
  type: string,
  status: unknown,
  kind?: unknown,
  plumbingEye = true,
): boolean {
  return objectLayers(type, status, kind).every((l) =>
    l === 'rooms' ? roomsEye : l === 'plumbing' ? plumbingEye : eyes[l],
  );
}

export function objectSelectable(
  locks: LayerLocks,
  type: string,
  status: unknown,
  kind?: unknown,
): boolean {
  return objectLayers(type, status, kind).every((l) => !locks[l]);
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
    setPlumbingEye(on: boolean): void;
    setLock(layer: LayerId, on: boolean): void;
    // What selection reads: shown and not locked.
    readonly selectable: PhaseFilter & Listenable;
  };

const UNLOCKED: LayerLocks = Object.freeze({
  existing: false,
  demo: false,
  new: false,
  rooms: false,
  plumbing: false,
});

export function createLayerSetting(phase: LayerPhase): LayerSetting {
  let state: LayerState = Object.freeze({ roomsEye: true, plumbingEye: true, locks: UNLOCKED });
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
  const shownObject = (type: string, status: unknown, kind?: unknown) =>
    objectVisible(phase.get().eyes, state.roomsEye, type, status, kind, state.plumbingEye);
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
      change({ ...state, roomsEye: on });
    },
    setPlumbingEye(on) {
      if (state.plumbingEye === on) return;
      change({ ...state, plumbingEye: on });
    },
    setLock(layer, on) {
      if (state.locks[layer] === undefined || state.locks[layer] === on) return;
      change({ ...state, locks: Object.freeze({ ...state.locks, [layer]: on }) });
    },
    selectable: {
      version,
      subscribe,
      shown: (status) => shown(status) && objectSelectable(state.locks, '', status),
      shownObject: (type, status, kind) =>
        shownObject(type, status, kind) && objectSelectable(state.locks, type, status, kind),
    },
  };
}
