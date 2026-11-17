// EZD-237 T1-T4, T9, T10 (vault/plans/EZD-237.md section 4; AC-EZD-237-1, -2). Expected values: 09m Benchmark
// run rows 1 to 4; 11 Budgets (16 ms desktop, 33 ms iPad, no frame over 100 ms); Decided D-Stats (nearest rank
// p95, values to 0.1 ms), D-Budget (1 ms tolerance), D-Profile (Q-0688 (a)), D-Memory, D-Device, D-Input, D-Page;
// S15i Device column ("Mac · Chrome", "iPad · Safari", "Windows · Edge").
import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_MESSAGE_TYPE,
  benchmarkEditorPath,
  budgetProfile,
  deviceBrowser,
  deviceSystem,
  parseBenchmarkMessage,
  parseBenchmarkRunInput,
  parseRunsPage,
  readDevice,
  readHeapMb,
  runWithinBudget,
  shortVersion,
  stepStats,
  withinBudget,
  type BenchmarkRunInput,
  type StepResult,
} from './benchmark-run';

const step = (p: Partial<StepResult>): StepResult => ({
  frames: 180,
  meanMs: 6,
  p95Ms: 12,
  maxMs: 40,
  over100: 0,
  ...p,
});

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SAFARI_IPAD =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const valid = (): BenchmarkRunInput => ({
  device: {
    userAgent: CHROME_MAC,
    screen: { width: 1600, height: 1000 },
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    maxTouchPoints: 0,
  },
  appVersion: '0123456789abcdef0123456789abcdef01234567',
  results: { pan: step({}), zoom: step({}), drag: step({}), memory: 50 },
});

describe('EZD-237 benchmark run lib', () => {
  it('EZD-237 T1 stepStats: count, mean, nearest-rank p95, max, frames over 100 ms', () => {
    expect(stepStats([10, 20, 30, 40])).toEqual({
      frames: 4,
      meanMs: 25,
      p95Ms: 40,
      maxMs: 40,
      over100: 0,
    });
    // (19 × 16 + 140) / 20 = 22.2; rank ceil(0.95 × 20) = 19 is 16.
    expect(stepStats([...Array<number>(19).fill(16), 140])).toEqual({
      frames: 20,
      meanMs: 22.2,
      p95Ms: 16,
      maxMs: 140,
      over100: 1,
    });
    expect(() => stepStats([])).toThrow(new RangeError('benchmark_no_frames'));
  });

  it('EZD-237 T2 withinBudget: 09m rows 1 to 3 and the 1 ms tolerance', () => {
    expect(withinBudget(step({ meanMs: 6, p95Ms: 12, maxMs: 40, over100: 0 }), 'desktop')).toBe(
      true,
    );
    expect(withinBudget(step({ meanMs: 30, p95Ms: 33, maxMs: 90, over100: 0 }), 'ipad')).toBe(true);
    expect(withinBudget(step({ p95Ms: 20, maxMs: 140, over100: 1 }), 'ipad')).toBe(false);
    expect(withinBudget(step({ p95Ms: 17.6 }), 'desktop')).toBe(true);
    expect(withinBudget(step({ p95Ms: 17.7 }), 'desktop')).toBe(false);
    expect(withinBudget(step({ p95Ms: 34.3 }), 'ipad')).toBe(true);
    expect(withinBudget(step({ p95Ms: 34.4 }), 'ipad')).toBe(false);
    const ok = { pan: step({}), zoom: step({}), drag: step({}), memory: null };
    expect(runWithinBudget(ok, 'desktop')).toBe(true);
    expect(runWithinBudget({ ...ok, zoom: step({ maxMs: 140, over100: 1 }) }, 'desktop')).toBe(
      false,
    );
  });

  it('EZD-237 T3 budgetProfile: any iPad or a touch Mac is the iPad budget (Q-0688 (a))', () => {
    expect(budgetProfile({ userAgent: SAFARI_IPAD, maxTouchPoints: 0 })).toBe('ipad');
    expect(budgetProfile({ userAgent: CHROME_MAC, maxTouchPoints: 5 })).toBe('ipad');
    expect(budgetProfile({ userAgent: CHROME_MAC, maxTouchPoints: 0 })).toBe('desktop');
    expect(budgetProfile({ userAgent: EDGE_WINDOWS, maxTouchPoints: 10 })).toBe('desktop');
  });

  it('EZD-237 T4 readHeapMb and readDevice', () => {
    expect(readHeapMb({ memory: { usedJSHeapSize: 52428800 } })).toBe(50);
    expect(readHeapMb({})).toBeNull();
    expect(readHeapMb({ memory: { usedJSHeapSize: Number.NaN } })).toBeNull();
    const d = readDevice(
      { userAgent: 'x'.repeat(600), hardwareConcurrency: undefined, maxTouchPoints: 5 },
      { width: 1180, height: 820 },
      2,
    );
    expect(d).toEqual({
      userAgent: 'x'.repeat(512),
      screen: { width: 1180, height: 820 },
      devicePixelRatio: 2,
      hardwareConcurrency: null,
      maxTouchPoints: 5,
    });
  });

  it('EZD-237 T9 parseBenchmarkRunInput takes a valid body and refuses anything else', () => {
    expect(parseBenchmarkRunInput(valid())).toEqual({ ok: true, value: valid() });
    const noMemory = valid();
    noMemory.results.memory = null;
    expect(parseBenchmarkRunInput(noMemory).ok).toBe(true);
    const max = valid();
    max.device.userAgent = 'u'.repeat(512);
    max.device.maxTouchPoints = 256;
    max.device.devicePixelRatio = 16;
    max.results.pan = step({ frames: 10000, over100: 10000 });
    max.appVersion = `dev-${'9'.repeat(15)}`;
    expect(parseBenchmarkRunInput(max).ok).toBe(true);

    const bad: unknown[] = [
      {},
      { ...valid(), device: { ...valid().device, userAgent: 'u'.repeat(513) } },
      { ...valid(), results: { ...valid().results, pan: step({ frames: 0 }) } },
      { ...valid(), results: { ...valid().results, pan: step({ frames: 5, over100: 6 }) } },
      { ...valid(), results: { ...valid().results, pan: step({ meanMs: Number.NaN }) } },
      { ...valid(), extra: 1 },
      { ...valid(), appVersion: 'v1' },
      { ...valid(), device: { ...valid().device, maxTouchPoints: 257 } },
    ];
    for (const b of bad) expect(parseBenchmarkRunInput(b)).toEqual({ ok: false });
  });

  it('EZD-237 T10 parseRunsPage: none is 1, 1 to 999999, anything else null', () => {
    const page = (q: string) => parseRunsPage(new URLSearchParams(q));
    expect(page('')).toBe(1);
    expect(page('page=1')).toBe(1);
    expect(page('page=999999')).toBe(999999);
    for (const q of ['page=0', 'page=1000000', 'page=abc', 'page=1.5', 'page=-1'])
      expect(page(q)).toBeNull();
  });

  it('EZD-237 the editor path, device names and short version', () => {
    expect(benchmarkEditorPath('p1')).toBe('/projects/p1?benchmark=run');
    expect([deviceSystem({ userAgent: CHROME_MAC, maxTouchPoints: 0 }), deviceBrowser(CHROME_MAC)]).toEqual(
      ['Mac', 'Chrome'],
    );
    expect([deviceSystem({ userAgent: SAFARI_IPAD, maxTouchPoints: 5 }), deviceBrowser(SAFARI_IPAD)]).toEqual(
      ['iPad', 'Safari'],
    );
    expect([
      deviceSystem({ userAgent: EDGE_WINDOWS, maxTouchPoints: 0 }),
      deviceBrowser(EDGE_WINDOWS),
    ]).toEqual(['Windows', 'Edge']);
    expect(shortVersion('0123456789abcdef0123456789abcdef01234567')).toBe('0123456');
    expect(shortVersion('dev-1730000000')).toBe('dev-1730000000');
  });

  it('EZD-237 frame messages: only the three known shapes pass', () => {
    const progress = { type: BENCHMARK_MESSAGE_TYPE, kind: 'progress', step: 'zoom', frame: 30 };
    expect(parseBenchmarkMessage(progress)).toEqual(progress);
    const result = { type: BENCHMARK_MESSAGE_TYPE, kind: 'result', results: valid().results };
    expect(parseBenchmarkMessage(result)).toEqual(result);
    const error = { type: BENCHMARK_MESSAGE_TYPE, kind: 'error', code: 'plan_not_ready' };
    expect(parseBenchmarkMessage(error)).toEqual(error);
    expect(parseBenchmarkMessage({ ...progress, frame: 181 })).toBeNull();
    expect(parseBenchmarkMessage({ ...error, code: 'save_failed' })).toBeNull();
    expect(parseBenchmarkMessage({ ...progress, type: 'other' })).toBeNull();
    expect(parseBenchmarkMessage('x')).toBeNull();
  });
});
