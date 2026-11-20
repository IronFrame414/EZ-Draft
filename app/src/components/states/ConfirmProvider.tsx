'use client';
// Confirm provider and hook (vault/plans/EZD-015b.md Step 6).
// EZD-215 (11 Budgets; EZD-120c B11): the dialog code (Radix AlertDialog) loads when the first confirm is asked and
// stays cached; the dialog shows once it is there. If it cannot load, the request is answered Cancel, so nothing
// destructive runs and the caller is not left waiting; the next confirm tries the download again. The code is fetched
// on the first press or key on the page (as the editor's inspector), so it is there before the user can go offline
// and ask a confirm.
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { createConfirmController } from './confirm-controller';
import type { ConfirmChoice, ConfirmController, ConfirmOptions } from './confirm-controller';

export type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmChoice>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

const dialogModule = lazyModule(() => import('../../lazy/confirm-dialog'));

function ConfirmHost({ controller }: { controller: ConfirmController }) {
  const request = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => null);
  const [mod, setMod] = useState(() => dialogModule.peek());
  useEffect(() => {
    if (request === null || mod !== undefined) return;
    let live = true;
    dialogModule.load().then(
      (m) => {
        if (live) setMod(m);
      },
      () => {
        if (live) controller.choose('cancel');
      },
    );
    return () => {
      live = false;
    };
  }, [request, mod, controller]);
  if (request === null || mod === undefined) return null;
  const { ConfirmDialog } = mod;
  return <ConfirmDialog key={request.id} request={request} onChoose={controller.choose} />;
}

export function ConfirmProvider({ children }: { children?: ReactNode }) {
  const [controller] = useState(() => createConfirmController());
  useEffect(() => {
    if (dialogModule.peek() !== undefined) return;
    const on = () => {
      off();
      dialogModule.preload();
    };
    const off = () => {
      window.removeEventListener('pointerdown', on, true);
      window.removeEventListener('keydown', on, true);
    };
    window.addEventListener('pointerdown', on, true);
    window.addEventListener('keydown', on, true);
    return off;
  }, []);
  return (
    <ConfirmContext.Provider value={controller.open}>
      {children}
      <ConfirmHost controller={controller} />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used inside a ConfirmProvider');
  return fn;
}
