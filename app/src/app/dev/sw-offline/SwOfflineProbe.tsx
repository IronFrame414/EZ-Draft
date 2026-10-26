'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { registerSpikeWorker, type SpikeSwResult } from './register-spike-worker';

// EZD-164 Step 5 (vault/plans/EZD-164.md D-Probe): registers the spike worker after hydration and shows the
// outcome and the hydration state as attributes on a hidden span.
const subscribe = () => () => {};

export function SwOfflineProbe() {
  const [state, setState] = useState<'idle' | SpikeSwResult>('idle');
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  useEffect(() => {
    let live = true;
    registerSpikeWorker().then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <span
      hidden
      data-testid="sw-offline-probe"
      data-sw-state={state}
      data-sw-hydrated={hydrated ? 'yes' : 'no'}
    />
  );
}
