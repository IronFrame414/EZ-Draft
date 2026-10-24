// EZD-020 Step 1 (vault/plans/EZD-020.md): the client link entry point (11 Performance rule 7).
import type { ReactNode } from 'react';

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <div data-entry="client" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
