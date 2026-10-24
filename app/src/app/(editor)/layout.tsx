// EZD-020 Step 1 (vault/plans/EZD-020.md): the editor entry point (11 Performance rule 7).
import type { ReactNode } from 'react';

export default function EditorLayout({ children }: { children: ReactNode }) {
  return (
    <div data-entry="editor" style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
