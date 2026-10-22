// Toast store: plain module, no React (vault/plans/EZD-015b.md Step 5; Q-0058 (a)).
import type { MessageKey } from '../../server/messages/catalog';
import type { MessageParams } from '../../lib/messages';

export const TOAST_DEFAULT_MS = 5000;

export type ToastTone = 'neutral';
export type ToastAction = { label: MessageKey; onPress: () => void };
export type PlainToastOptions = {
  message: MessageKey;
  params?: MessageParams;
  tone?: ToastTone;
  duration?: number | null;
  action?: undefined;
};
export type ActionToastOptions = {
  message: MessageKey;
  params?: MessageParams;
  tone?: ToastTone;
  action: ToastAction;
  duration?: null;
};
export type ToastOptions = PlainToastOptions | ActionToastOptions;
export type Toast = {
  id: string;
  message: MessageKey;
  params?: MessageParams;
  tone: ToastTone;
  action: ToastAction | null;
  duration: number | null;
};
export type ToastTimers = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};
export type ToastStore = {
  show(o: ToastOptions): string;
  dismiss(id: string): void;
  press(id: string): void;
  subscribe(onChange: () => void): () => void;
  getSnapshot(): readonly Toast[];
};

const defaultTimers: ToastTimers = {
  setTimeout: (run, ms) => globalThis.setTimeout(run, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

function resolveDuration(o: ToastOptions): number | null {
  if (o.action) return null;
  const d = o.duration;
  if (d === null) return null;
  if (typeof d === 'number' && Number.isFinite(d) && d > 0) return d;
  return TOAST_DEFAULT_MS;
}

export function createToastStore(timers: ToastTimers = defaultTimers): ToastStore {
  let toasts: readonly Toast[] = Object.freeze([]);
  let counter = 0;
  const handles = new Map<string, unknown>();
  const listeners = new Set<() => void>();

  function notify() {
    for (const l of [...listeners]) l();
  }

  function dismiss(id: string) {
    if (!toasts.some((t) => t.id === id)) return;
    if (handles.has(id)) {
      timers.clearTimeout(handles.get(id));
      handles.delete(id);
    }
    toasts = Object.freeze(toasts.filter((t) => t.id !== id));
    notify();
  }

  function show(o: ToastOptions): string {
    counter += 1;
    const id = String(counter);
    const toast: Toast = {
      id,
      message: o.message,
      ...(o.params ? { params: { ...o.params } } : {}),
      tone: o.tone ?? 'neutral',
      action: o.action ?? null,
      duration: resolveDuration(o),
    };
    toasts = Object.freeze([...toasts, Object.freeze(toast)]);
    if (toast.duration !== null) {
      handles.set(
        id,
        timers.setTimeout(() => dismiss(id), toast.duration),
      );
    }
    notify();
    return id;
  }

  function press(id: string) {
    const toast = toasts.find((t) => t.id === id);
    if (!toast) return;
    dismiss(id);
    if (toast.action) toast.action.onPress();
  }

  return {
    show,
    dismiss,
    press,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => toasts,
  };
}
