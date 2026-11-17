// EZD-214 (S03 Controls — status bar "View"; S03 Decisions; 03 Q-0664 "View default"; 05 Q-0664 "Views and
// permissions"; Q-0667; Q-0670; 09m Phase switch): the editor's phase view and Phase eyes, without React. The view
// starts from the project's saved phase_default; the eyes belong to the device session and reset to the view's
// defaults on each View switch. An editor's View choice is saved, one save at a time, newest wins, held while
// offline (Q-0670 (a)); a failed online save shows "Changes not saved" with Retry (Q-0670 (b)). A view-only user's
// switch changes the display only.
import type { ObjectStatus } from '@ezdraft/geometry';
import { createOnlineSource, type OnlineSource } from '../../lib/network/online';
import {
  eyeDefaults,
  isPhaseView,
  newObjectStatus,
  statusShown,
  type PhaseEyes,
  type PhaseFilter,
  type PhaseView,
} from '../../lib/plan/phase-view';

export type PhaseState = Readonly<{ view: PhaseView; eyes: PhaseEyes }>;

export type PhaseSetting = PhaseFilter & {
  get(): PhaseState;
  setView(view: PhaseView): void;
  setEye(status: ObjectStatus, on: boolean): void;
  newObjectStatus(): ObjectStatus;
  subscribe(listener: () => void): () => void;
  failed(): boolean;
  retry(): void;
  dispose(): void;
};

export function createPhaseSetting(o: {
  view: PhaseView;
  canEdit: boolean;
  save: (view: PhaseView) => Promise<boolean>;
  online?: OnlineSource;
}): PhaseSetting {
  const online = o.online ?? createOnlineSource();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of [...listeners]) l();
  };
  let state: PhaseState = Object.freeze({ view: o.view, eyes: eyeDefaults(o.view) });
  let version = 0;
  let held: PhaseView | null = null;
  let inFlight = false;
  let isFailed = false;
  let disposed = false;

  const send = () => {
    if (disposed || inFlight || held === null || !online.getSnapshot()) return;
    const value = held;
    held = null;
    inFlight = true;
    if (isFailed) {
      isFailed = false;
      notify();
    }
    o.save(value)
      .then(
        (ok) => ok === true,
        () => false,
      )
      .then((ok) => {
        inFlight = false;
        if (disposed) return;
        if (ok) {
          send();
          return;
        }
        if (held === null) held = value;
        if (online.getSnapshot()) {
          isFailed = true;
          notify();
        }
      });
  };

  const unsubscribeOnline = o.canEdit
    ? online.subscribe(() => {
        if (!isFailed && online.getSnapshot()) send();
      })
    : () => {};

  const change = (next: PhaseState) => {
    state = Object.freeze(next);
    version += 1;
    notify();
  };

  return {
    get: () => state,
    version: () => version,
    shown: (status) => statusShown(state.eyes, status),
    newObjectStatus: () => newObjectStatus(state.view),
    setView(view) {
      if (disposed || !isPhaseView(view) || view === state.view) return;
      change({ view, eyes: eyeDefaults(view) });
      if (!o.canEdit) return;
      held = view;
      send();
    },
    setEye(status, on) {
      if (disposed || state.eyes[status] === undefined || state.eyes[status] === on) return;
      change({ view: state.view, eyes: Object.freeze({ ...state.eyes, [status]: on }) });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    failed: () => isFailed,
    retry() {
      if (isFailed) send();
    },
    dispose() {
      disposed = true;
      held = null;
      unsubscribeOnline();
    },
  };
}
