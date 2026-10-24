// EZD-027 frame statistics (vault/plans/EZD-027.md Step 5). Pure. Nearest-rank percentiles;
// "over X" counts values strictly greater than 1000/60, 1000/30 and 100 ms (11 Budgets).
export const BUDGET_DESKTOP_MS = 1000 / 60;
export const BUDGET_IPAD_MS = 1000 / 30;
export const MAX_FRAME_MS = 100;

function rank(sorted, p) {
  return sorted[Math.ceil((p / 100) * sorted.length) - 1];
}

export function frameStats(intervals) {
  const n = intervals.length;
  if (n === 0) {
    return { count: 0, mean: null, p50: null, p95: null, p99: null, max: null, over16_7: 0, over33_3: 0, over100: 0 };
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  let sum = 0;
  for (const v of intervals) sum += v;
  return {
    count: n,
    mean: sum / n,
    p50: rank(sorted, 50),
    p95: rank(sorted, 95),
    p99: rank(sorted, 99),
    max: sorted[n - 1],
    over16_7: intervals.filter((v) => v > BUDGET_DESKTOP_MS).length,
    over33_3: intervals.filter((v) => v > BUDGET_IPAD_MS).length,
    over100: intervals.filter((v) => v > MAX_FRAME_MS).length,
  };
}
