// EZD-1993: the part of the browser tests one GitHub CI job runs, from EZD_E2E_PART.
//   unset or ''      every project, as before (the build Mac's gate is unchanged)
//   'devices:<i>/<n>' shard i of n of the four device projects; the perf project is left out
//   'perf'           the perf project alone, with no dependencies (it runs on its own runner, so still alone)
// Plain Playwright sharding cannot be used on the whole config: perf depends on every device project, so the
// device projects count as dependencies and each shard would rerun all of them (playwright runner, buildProjectsClosure).
export type E2ePart = { kind: 'all' } | { kind: 'devices'; current: number; total: number } | { kind: 'perf' };

export const PERF_PROJECT = 'perf';

export function parseE2ePart(value: string | undefined): E2ePart {
  const v = (value ?? '').trim();
  if (v === '') return { kind: 'all' };
  if (v === 'perf') return { kind: 'perf' };
  const m = /^devices:([1-9]\d*)\/([1-9]\d*)$/.exec(v);
  if (m) {
    const current = Number(m[1]);
    const total = Number(m[2]);
    if (current <= total) return { kind: 'devices', current, total };
  }
  throw new Error(`EZD_E2E_PART must be empty, perf or devices:<i>/<n> with 1 <= i <= n, not ${JSON.stringify(value)}`);
}

export function applyE2ePart<P extends { name: string; dependencies?: string[] }>(
  part: E2ePart,
  projects: P[],
): { projects: P[]; shard: { current: number; total: number } | null } {
  if (part.kind === 'all') return { projects, shard: null };
  if (part.kind === 'devices') {
    return {
      projects: projects.filter((p) => p.name !== PERF_PROJECT),
      shard: { current: part.current, total: part.total },
    };
  }
  return {
    projects: projects.filter((p) => p.name === PERF_PROJECT).map((p) => ({ ...p, dependencies: [] })),
    shard: null,
  };
}
