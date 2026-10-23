// EZD-020 Step 1 (vault/plans/EZD-020.md): the office entry point, Projects and Settings (11 Performance rule 7).
import type { ReactNode } from 'react';

export default function OfficeLayout({ children }: { children: ReactNode }) {
  return (
    <div data-entry="office" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
