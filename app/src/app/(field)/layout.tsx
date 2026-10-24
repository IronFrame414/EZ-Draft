// EZD-020 Step 1 (vault/plans/EZD-020.md): the phone field pack entry point (11 Performance rule 7).
import type { ReactNode } from 'react';

export default function FieldLayout({ children }: { children: ReactNode }) {
  return (
    <div data-entry="field" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
