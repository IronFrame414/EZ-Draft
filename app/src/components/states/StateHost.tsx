// Mounts the toast and confirm providers once per entry point (vault/plans/EZD-015b.md Step 6).
import type { ReactNode } from 'react';
import { ToastProvider } from './ToastProvider';
import { ConfirmProvider } from './ConfirmProvider';

export function StateHost({ children }: { children?: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
