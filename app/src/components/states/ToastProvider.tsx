'use client';
// Toast provider and hook (vault/plans/EZD-015b.md Step 5).
import { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ToastList } from './ToastList';
import { createToastStore } from './toast-store';
import type { Toast, ToastOptions, ToastStore } from './toast-store';

export type ToastApi = { show(options: ToastOptions): string; dismiss(id: string): void };

const ToastContext = createContext<ToastApi | null>(null);
const SERVER_TOASTS: readonly Toast[] = Object.freeze([]);
const getServerToasts = () => SERVER_TOASTS;

function ToastViewport({ store }: { store: ToastStore }) {
  const toasts = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerToasts);
  return <ToastList toasts={toasts} onDismiss={store.dismiss} onAction={store.press} />;
}

export function ToastProvider({ children }: { children?: ReactNode }) {
  const [store] = useState(() => createToastStore());
  const api = useMemo<ToastApi>(() => ({ show: store.show, dismiss: store.dismiss }), [store]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport store={store} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}
