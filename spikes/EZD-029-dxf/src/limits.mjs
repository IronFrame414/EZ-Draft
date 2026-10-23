// EZD-029 job runtime limits (vault/plans/EZD-029.md Step 4; the EZD-028 Step 5 pattern).

// Q-0027 (a): Vercel Pro default function limits, 300 s and 2 GB (2048 MB).
export const SECONDS = 300;
export const MEMORY_MB = 2048;

// EZD-009 Step 4: the run budget is (limit - 30) x 1000 ms.
export const SLICE_MARGIN_SECONDS = 30;

/**
 * @param {{ exitCode: number | null, timedOut: boolean, maxRssMb: number }} run
 * @param {{ seconds: number, memoryMb: number }} limits
 * @returns {{ pass: boolean, reason: 'timeout' | 'crashed' | 'memory' | null }}
 */
export function judge({ exitCode, timedOut, maxRssMb }, limits) {
  if (timedOut) return { pass: false, reason: 'timeout' };
  if (exitCode !== 0) return { pass: false, reason: 'crashed' };
  if (maxRssMb >= limits.memoryMb) return { pass: false, reason: 'memory' };
  return { pass: true, reason: null };
}
