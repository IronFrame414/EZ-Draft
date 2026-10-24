'use client';
// EZD-024 Step 11 (vault/plans/EZD-024.md): each click throws an uncaught error from the click handler, which
// the browser SDK's global handler reports through the tunnel. The button shows only a click counter.
import { useState } from 'react';

export function ThrowProbe({ nonce }: { nonce: string }) {
  const [clicks, setClicks] = useState(0);
  return (
    <button
      type="button"
      data-testid="throw"
      onClick={() => {
        setClicks((n) => n + 1);
        throw new Error('EZD-024 browser ' + nonce);
      }}
    >
      {clicks}
    </button>
  );
}
