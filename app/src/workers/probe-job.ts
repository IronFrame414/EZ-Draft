// EZD-235b Build step 3 (vault/plans/EZD-235b.md): probeRoomAreas, the perf probe's room-area job on the benchmark model.
import {
  generateBenchmarkModel,
  parseStoredObject,
  roomAreaSqFt,
  type Point,
  type StoredObject,
} from '@ezdraft/geometry';

export const PROBE_JOB = 'probe-room-areas';
export const PROBE_JOB_MS = 500;
export const PROBE_MAX_MS = 10000;

export type ProbeOutput = {
  rooms: number;
  passes: number;
  ranMs: number;
  where: 'worker' | 'main';
};

function ranWhere(): 'worker' | 'main' {
  const scope = (globalThis as { WorkerGlobalScope?: abstract new () => unknown })
    .WorkerGlobalScope;
  return typeof scope === 'function' && globalThis instanceof scope ? 'worker' : 'main';
}

export function probeRoomAreas(
  input: unknown,
  now: () => number = () => performance.now(),
  objects: readonly StoredObject[] = generateBenchmarkModel(),
): ProbeOutput {
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new Error('probe_input');
  const minMs = (input as { minMs?: unknown }).minMs;
  if (typeof minMs !== 'number' || !Number.isFinite(minMs) || minMs < 0 || minMs > PROBE_MAX_MS)
    throw new Error('probe_input');

  const boundaries: (readonly Point[])[] = [];
  for (const stored of objects) {
    const parsed = parseStoredObject(stored);
    if (parsed.ok && parsed.object.type === 'room')
      boundaries.push(parsed.object.data.geometry.boundary);
  }

  const t0 = now();
  let passes = 0;
  let t: number;
  do {
    let sum = 0;
    for (const boundary of boundaries) sum += roomAreaSqFt(boundary);
    void sum;
    passes += 1;
    t = now();
  } while (t - t0 < minMs);
  return { rooms: boundaries.length, passes, ranMs: t - t0, where: ranWhere() };
}
