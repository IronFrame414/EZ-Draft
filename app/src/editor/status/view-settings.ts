// EZD-219 Build step 10 (vault/plans/EZD-219.md Decided "Snap toggles", "Snap increments", "Snap store life",
// "Scale list", "Scale save", "Save failure / offline", "Cursor value"; 03 Q-0664 "View default"; Q-0680; L-062):
// the status bar's view settings without React. Snap settings live for the device session (never stored); the
// plan scale is held per project and saved for an editor, one save at a time, newest choice wins.
import {
  DEFAULT_SNAP_SETTINGS,
  formatLength,
  type Point,
  type SnapSettings,
} from '@ezdraft/geometry';
import { createOnlineSource, type OnlineSource } from '../../lib/network/online';
import { isPlanScale, type PlanScale } from '../../lib/plan/plan-scale';

export const SNAP_INCREMENTS_IN = [0.0625, 0.125, 0.25, 0.5, 1, 6, 12] as const;

export type SnapToggle = 'endpoints' | 'midpoints' | 'angles' | 'faces';

export type SnapSettingsStore = {
  get(): Readonly<SnapSettings>;
  setToggle(kind: SnapToggle, on: boolean): void;
  setIncrement(inches: number): void;
  subscribe(listener: () => void): () => void;
};

const INCREMENT_LABELS: ReadonlyMap<number, string> = new Map([
  [0.0625, '1/16"'],
  [0.125, '1/8"'],
  [0.25, '1/4"'],
  [0.5, '1/2"'],
  [1, '1"'],
  [6, '6"'],
  [12, '12"'],
]);

function listenerSet() {
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify() {
      for (const l of [...listeners]) l();
    },
  };
}

export function createSnapSettings(): SnapSettingsStore {
  let settings: Readonly<SnapSettings> = DEFAULT_SNAP_SETTINGS;
  const ls = listenerSet();
  const change = (next: Partial<SnapSettings>) => {
    settings = Object.freeze({ ...settings, ...next });
    ls.notify();
  };
  return {
    get: () => settings,
    setToggle(kind, on) {
      if (settings[kind] === on) return;
      change({ [kind]: on });
    },
    setIncrement(inches) {
      if (!(SNAP_INCREMENTS_IN as readonly number[]).includes(inches)) return;
      if (settings.incrementIn === inches) return;
      change({ incrementIn: inches });
    },
    subscribe: ls.subscribe,
  };
}

// Decided "Snap store life": one instance for the tab, until reload.
export const deviceSnapSettings: SnapSettingsStore = createSnapSettings();

export type ScaleSetting = {
  get(): PlanScale;
  set(scale: PlanScale): void;
  subscribe(listener: () => void): () => void;
  failed(): boolean;
  retry(): void;
  dispose(): void;
};

export function createScaleSetting(o: {
  scale: PlanScale;
  canEdit: boolean;
  save: (scale: PlanScale) => Promise<boolean>;
  online?: OnlineSource;
}): ScaleSetting {
  const online = o.online ?? createOnlineSource();
  const ls = listenerSet();
  let current = o.scale;
  // The newest choice not yet sent (memory only).
  let held: PlanScale | null = null;
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
      ls.notify();
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
          ls.notify();
        }
      });
  };

  const unsubscribeOnline = o.canEdit
    ? online.subscribe(() => {
        if (!isFailed && online.getSnapshot()) send();
      })
    : () => {};

  return {
    get: () => current,
    set(scale) {
      if (disposed || !isPlanScale(scale) || scale === current) return;
      current = scale;
      ls.notify();
      if (!o.canEdit) return;
      held = scale;
      send();
    },
    subscribe: ls.subscribe,
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

export const PLAN_SCALE_LABELS: Readonly<Record<PlanScale, string>> = Object.freeze({
  0.125: `1/8" = 1'-0"`,
  0.1875: `3/16" = 1'-0"`,
  0.25: `1/4" = 1'-0"`,
  0.375: `3/8" = 1'-0"`,
  0.5: `1/2" = 1'-0"`,
  0.75: `3/4" = 1'-0"`,
  1: `1" = 1'-0"`,
});

export function snapIncrementLabel(inches: number): string {
  return INCREMENT_LABELS.get(inches) ?? formatLength(inches, 16);
}

function axis(v: number): string {
  const n = Math.floor(Math.abs(v) * 2 + 0.5);
  return `${v < 0 && n > 0 ? '-' : ''}${formatLength(n / 2, 2)}`;
}

// Decided "Cursor value": each axis to 1/2", joined by ` , `; no point is a dash.
export function formatCursor(model: Point | null): string {
  if (model === null) return '—';
  return `${axis(model.x)} , ${axis(model.y)}`;
}
