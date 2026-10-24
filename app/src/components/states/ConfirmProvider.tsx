'use client';
// Confirm provider and hook (vault/plans/EZD-015b.md Step 6).
import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { createConfirmController } from './confirm-controller';
import type { ConfirmChoice, ConfirmController, ConfirmOptions } from './confirm-controller';

export type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmChoice>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

function ConfirmHost({ controller }: { controller: ConfirmController }) {
  const request = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => null);
  return request ? (
    <ConfirmDialog key={request.id} request={request} onChoose={controller.choose} />
  ) : null;
}

export function ConfirmProvider({ children }: { children?: ReactNode }) {
  const [controller] = useState(() => createConfirmController());
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
