'use client';
// EZD-235b Build step 6 (vault/plans/EZD-235b.md): the hidden worker probe for ?inject=worker-job.
import { useEffect, useState, type ReactElement } from 'react';
import { createWorkerPool } from '../../../editor/workers/worker-pool';
import { startProbeSession, type ProbeHost } from './probe-session';

export function WorkerProbe(): ReactElement {
  const [state, setState] = useState<'starting' | 'ready' | 'failed'>('starting');

  useEffect(() => {
    const pool = createWorkerPool({
      create: () =>
        new Worker(new URL('../../../workers/probe.worker.ts', import.meta.url), {
          type: 'module',
        }),
      size: 1,
    });
    return startProbeSession({ pool, host: window as unknown as ProbeHost, onState: setState });
  }, []);

  return <div hidden data-testid="worker-probe" data-worker-probe={state} />;
}
