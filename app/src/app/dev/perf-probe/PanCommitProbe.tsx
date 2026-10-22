'use client';
import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

// EZD-017 Step 9 (vault/plans/EZD-017.md): a deliberate regression for the perf check (T2). One React commit
// per pointer move over the canvas region, so `react-commits-during-pan` must fail when it is mounted.
export function PanCommitProbe() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if ((event.target as Element).closest('[data-shell-region="canvas"]') !== null) {
        flushSync(() => setCount((c) => c + 1));
      }
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, []);
  return (
    <span hidden data-perf-probe-count="">
      {count}
    </span>
  );
}
