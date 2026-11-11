// EZD-235b Build step 5 (vault/plans/EZD-235b.md): the worker probe's session: warm-up, the window hook and its stop.
import type { WorkerPool } from '../../../editor/workers/worker-pool';
import { PROBE_JOB, PROBE_JOB_MS, type ProbeOutput } from '../../../workers/probe-job';

export type ProbeRunResult = ProbeOutput & { jobMs: number };

export type ProbeHook = { run(): Promise<ProbeRunResult> };

export type ProbeHost = { __ezdraftWorkerProbe?: ProbeHook };

export function startProbeSession(o: {
  pool: Pick<WorkerPool, 'run' | 'dispose'>;
  host: ProbeHost;
  onState: (state: 'ready' | 'failed') => void;
  now?: () => number;
}): () => void {
  const now = o.now ?? (() => performance.now());
  let live = true;
  const hook: ProbeHook = {
    async run() {
      const start = now();
      const out = await o.pool.run<ProbeOutput>(PROBE_JOB, { minMs: PROBE_JOB_MS });
      return {
        rooms: out.rooms,
        passes: out.passes,
        ranMs: out.ranMs,
        where: out.where,
        jobMs: now() - start,
      };
    },
  };
  // The warm-up starts the worker and compiles the job before the check sets any mark.
  void o.pool.run(PROBE_JOB, { minMs: 0 }).then(
    () => {
      if (!live) return;
      o.host.__ezdraftWorkerProbe = hook;
      o.onState('ready');
    },
    () => {
      if (!live) return;
      o.onState('failed');
    },
  );
  return () => {
    if (!live) return;
    live = false;
    delete o.host.__ezdraftWorkerProbe;
    o.pool.dispose();
  };
}
