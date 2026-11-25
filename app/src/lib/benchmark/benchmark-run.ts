// EZD-237 (vault/plans/EZD-237.md section 3 C2, Decided D-Stats, D-Budget, D-Profile, D-Memory, D-Device, D-Input,
// D-Page; 11 Budgets; 09m Benchmark run rows 1 to 4; Q-0664; Q-0688 (a); S15i System status boards): the benchmark
// run's shapes, its frame statistics and budget check, the device it ran on, the request checks, and the messages
// the editor frame sends to the Benchmark card while it plays. Browser and server.
import * as z from 'zod/mini';

export const BENCHMARK_PAGE_SIZE = 50;
export const BENCHMARK_STEP_FRAMES = 180;
export const BENCHMARK_STEPS = ['pan', 'zoom', 'drag'] as const;
export type BenchmarkStep = (typeof BENCHMARK_STEPS)[number];

// 11 Budgets: a frame every 16 ms on desktop (60 fps) and 33 ms on the iPad (30 fps); no frame over 100 ms.
export const FRAME_BUDGET_MS = { desktop: 1000 / 60, ipad: 1000 / 30 } as const;
export const FRAME_TOLERANCE_MS = 1;
export const MAX_FRAME_MS = 100;

export type BudgetProfile = 'desktop' | 'ipad';
export type StepResult = {
  frames: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
  over100: number;
};
export type BenchmarkResults = {
  pan: StepResult;
  zoom: StepResult;
  drag: StepResult;
  memory: number | null;
};
export type BenchmarkDevice = {
  userAgent: string;
  screen: { width: number; height: number };
  devicePixelRatio: number;
  hardwareConcurrency: number | null;
  maxTouchPoints: number;
};
export type BenchmarkRunInput = {
  device: BenchmarkDevice;
  appVersion: string;
  results: BenchmarkResults;
};
export type BenchmarkRunRow = BenchmarkRunInput & { id: string; runAt: string };
export type BenchmarkRunPage = {
  rows: BenchmarkRunRow[];
  total: number;
  page: number;
  pageSize: number;
};

const round1 = (x: number) => Math.round(x * 10) / 10;

// D-Stats: count, mean, nearest-rank p95 and max (each to 0.1 ms), and the frames over 100 ms.
export function stepStats(intervals: readonly number[]): StepResult {
  if (intervals.length === 0) throw new RangeError('benchmark_no_frames');
  const sorted = [...intervals].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((s, x) => s + x, 0);
  return {
    frames: n,
    meanMs: round1(sum / n),
    p95Ms: round1(sorted[Math.ceil(0.95 * n) - 1]!),
    maxMs: round1(sorted[n - 1]!),
    over100: sorted.filter((x) => x > MAX_FRAME_MS).length,
  };
}

// D-Budget: p95 within the profile's frame budget (1 ms tolerance) and no frame over 100 ms.
export function withinBudget(step: StepResult, profile: BudgetProfile): boolean {
  return step.p95Ms <= FRAME_BUDGET_MS[profile] + FRAME_TOLERANCE_MS && step.over100 === 0;
}

export function runWithinBudget(results: BenchmarkResults, profile: BudgetProfile): boolean {
  return BENCHMARK_STEPS.every((s) => withinBudget(results[s], profile));
}

// D-Profile (Q-0688 (a)): any iPad, or a touch-capable Mac (iPadOS reports Macintosh), is the iPad budget.
export function budgetProfile(
  device: Pick<BenchmarkDevice, 'userAgent' | 'maxTouchPoints'>,
): BudgetProfile {
  const ua = device.userAgent;
  if (ua.includes('iPad')) return 'ipad';
  if (ua.includes('Macintosh') && device.maxTouchPoints > 1) return 'ipad';
  return 'desktop';
}

// D-Memory: usedJSHeapSize in MB (0.1), or null where the browser does not expose it (09m row 4).
export function readHeapMb(perf: { memory?: { usedJSHeapSize?: unknown } }): number | null {
  const bytes = perf.memory?.usedJSHeapSize;
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return null;
  return round1(bytes / 1048576);
}

export const USER_AGENT_MAX = 512;

// D-Device: the user agent (512 characters at most), screen size, pixel ratio, cores and touch points.
export function readDevice(
  nav: { userAgent: string; hardwareConcurrency?: unknown; maxTouchPoints?: unknown },
  scr: { width: number; height: number },
  ratio: number,
): BenchmarkDevice {
  const cores = nav.hardwareConcurrency;
  const touch = nav.maxTouchPoints;
  return {
    userAgent: nav.userAgent.slice(0, USER_AGENT_MAX),
    screen: { width: scr.width, height: scr.height },
    devicePixelRatio: ratio,
    hardwareConcurrency:
      typeof cores === 'number' && Number.isInteger(cores) && cores >= 1 ? cores : null,
    maxTouchPoints: typeof touch === 'number' && Number.isInteger(touch) && touch >= 0 ? touch : 0,
  };
}

const ms = z.number().check(z.gte(0), z.lte(600000));
const stepSchema = z
  .strictObject({
    frames: z.int().check(z.gte(1), z.lte(10000)),
    meanMs: ms,
    p95Ms: ms,
    maxMs: ms,
    over100: z.int().check(z.gte(0), z.lte(10000)),
  })
  .check(z.refine((s) => s.over100 <= s.frames));
export const benchmarkResultsSchema = z.strictObject({
  pan: stepSchema,
  zoom: stepSchema,
  drag: stepSchema,
  memory: z.nullable(z.number().check(z.gte(0), z.lte(1000000))),
});
export const benchmarkDeviceSchema = z.strictObject({
  userAgent: z.string().check(z.minLength(1), z.maxLength(USER_AGENT_MAX)),
  screen: z.strictObject({
    width: z.int().check(z.gte(1), z.lte(100000)),
    height: z.int().check(z.gte(1), z.lte(100000)),
  }),
  devicePixelRatio: z.number().check(z.gt(0), z.lte(16)),
  hardwareConcurrency: z.nullable(z.int().check(z.gte(1), z.lte(1024))),
  maxTouchPoints: z.int().check(z.gte(0), z.lte(256)),
});
export const APP_VERSION_PATTERN = /^([0-9a-f]{40}|dev-[0-9]{1,15})$/;
const inputSchema = z.strictObject({
  device: benchmarkDeviceSchema,
  appVersion: z.string().check(z.regex(APP_VERSION_PATTERN)),
  results: benchmarkResultsSchema,
});

// D-Input: any failure, extra key or missing key is { ok: false }.
export function parseBenchmarkRunInput(
  raw: unknown,
): { ok: true; value: BenchmarkRunInput } | { ok: false } {
  const parsed = inputSchema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}

// D-Page: no page is 1; 1 to 999,999 is that page; anything else is null (400).
export function parseRunsPage(params: URLSearchParams): number | null {
  const raw = params.get('page');
  if (raw === null) return 1;
  return /^[1-9][0-9]{0,5}$/.test(raw) ? Number(raw) : null;
}

export function benchmarkEditorPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}?benchmark=run`;
}

// S15i Device column ("Mac · Chrome", "iPad · Safari", "Windows · Edge"): the system and browser named in the
// user agent; null parts read as Other (wording to confirm, vault/build/assumptions.md).
export function deviceSystem(device: Pick<BenchmarkDevice, 'userAgent' | 'maxTouchPoints'>) {
  const ua = device.userAgent;
  if (budgetProfile(device) === 'ipad') return 'iPad';
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Macintosh') || ua.includes('Mac OS')) return 'Mac';
  if (ua.includes('CrOS')) return 'ChromeOS';
  if (ua.includes('Linux')) return 'Linux';
  return null;
}

export function deviceBrowser(userAgent: string) {
  if (userAgent.includes('Edg/') || userAgent.includes('EdgiOS/')) return 'Edge';
  if (userAgent.includes('Firefox/') || userAgent.includes('FxiOS/')) return 'Firefox';
  if (userAgent.includes('Chrome/') || userAgent.includes('CriOS/')) return 'Chrome';
  if (userAgent.includes('Safari/')) return 'Safari';
  return null;
}

// D-Version: a 40-hex commit shows its first 7 characters; anything else as stored.
export function shortVersion(appVersion: string): string {
  return /^[0-9a-f]{40}$/.test(appVersion) ? appVersion.slice(0, 7) : appVersion;
}

// Messages from the editor frame to the Benchmark card (S15i: the run plays with its progress in the card).
export const BENCHMARK_MESSAGE_TYPE = 'ezdraft-benchmark';
export const BENCHMARK_RUNNER_ERRORS = [
  'not_authorized',
  'not_benchmark',
  'plan_not_ready',
  'failed',
] as const;
export type BenchmarkRunnerError = (typeof BENCHMARK_RUNNER_ERRORS)[number];
export type BenchmarkMessage =
  | { type: typeof BENCHMARK_MESSAGE_TYPE; kind: 'progress'; step: BenchmarkStep; frame: number }
  | { type: typeof BENCHMARK_MESSAGE_TYPE; kind: 'result'; results: BenchmarkResults }
  | { type: typeof BENCHMARK_MESSAGE_TYPE; kind: 'error'; code: BenchmarkRunnerError };

const messageSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    type: z.literal(BENCHMARK_MESSAGE_TYPE),
    kind: z.literal('progress'),
    step: z.enum(BENCHMARK_STEPS),
    frame: z.int().check(z.gte(0), z.lte(BENCHMARK_STEP_FRAMES)),
  }),
  z.strictObject({
    type: z.literal(BENCHMARK_MESSAGE_TYPE),
    kind: z.literal('result'),
    results: benchmarkResultsSchema,
  }),
  z.strictObject({
    type: z.literal(BENCHMARK_MESSAGE_TYPE),
    kind: z.literal('error'),
    code: z.enum(BENCHMARK_RUNNER_ERRORS),
  }),
]);

export function parseBenchmarkMessage(raw: unknown): BenchmarkMessage | null {
  const parsed = messageSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
