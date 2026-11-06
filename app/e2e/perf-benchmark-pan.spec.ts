// EZD-207c E1-E3 (vault/plans/EZD-207c.md section 4; AC-EZD-207-5). Untagged, so Playwright project `perf`.
// E1 and E2 run the perf CLI against the harness server (copy of app/e2e/perf-check.spec.ts runPerf, latestOf,
// rowOf). E3 opens the benchmark page signed out and records every request. No import.meta or __dirname (L-017).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '../test-harness/e2e/test';

type Row = {
  id: string;
  status: string;
  value: number | null;
  budget: number | string | null;
  owner: string;
  withinBudget?: boolean | null;
  details: Record<string, unknown>;
};
type Results = {
  schema: number;
  pass: boolean;
  profile: string;
  measurements: Row[];
};

// R = the iPad CPU throttle rate, 4 (Q-0616 (a)).
const R = 4;

const PAN_IDS = [
  'react-commits-during-pan',
  'react-commits-during-pan:ipad',
  'long-tasks-during-pan',
  'long-tasks-during-pan:ipad',
  'long-tasks-during-load',
  'long-tasks-during-load:ipad',
  'frame-times-during-pan',
  'frame-times-during-pan:ipad',
];

// Copied from app/e2e/perf-check.spec.ts (itself from app/test-harness/mail-catcher.ts lines 18-28).
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no pnpm-workspace.yaml above ' + process.cwd());
    dir = up;
  }
}

function runPerf(args: string[]): { status: number | null; stdout: string; out: string } {
  const root = findRepoRoot();
  const out = mkdtempSync(os.tmpdir() + '/ezd-perf-');
  const r = spawnSync(
    process.execPath,
    [
      path.join(root, 'scripts', 'perf', 'run.mjs'),
      '--base-url',
      String(test.info().project.use.baseURL),
      ...args,
      '--out',
      out,
    ],
    { cwd: root, encoding: 'utf8', timeout: 170000 },
  );
  return { status: r.status, stdout: (r.stdout ?? '') + (r.stderr ?? ''), out };
}

const latestOf = (out: string): Results =>
  JSON.parse(readFileSync(path.join(out, 'latest.json'), 'utf8')) as Results;

function rowOf(res: Results, id: string): Row {
  const row = res.measurements.find((m) => m.id === id);
  expect(row, id).toBeDefined();
  return row as Row;
}

test.describe('EZD-207c benchmark pan', () => {
  test('EZD-207c done when: the benchmark pan and zoom makes no React commits at desktop and throttled iPad size, frame times a trend', async () => {
    test.setTimeout(180000);
    const r = runPerf(['--pan-url', '/dev/benchmark-plan', '--only', PAN_IDS.join(',')]);
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('PERF PASS');

    const res = latestOf(r.out);
    for (const id of ['react-commits-during-pan', 'react-commits-during-pan:ipad']) {
      const row = rowOf(res, id);
      expect(row.status, id).toBe('pass');
      expect(row.value, id).toBe(0);
      expect(row.details.reactDetected, id).toBe(true);
      expect(row.details.pointerMoves, id).toBe(180);
      expect(row.details.wheelSteps, id).toBe(8);
    }
    for (const id of ['long-tasks-during-pan', 'long-tasks-during-pan:ipad']) {
      const row = rowOf(res, id);
      expect(row.status, id).toBe('pass');
      expect(row.value, id).toBe(0);
    }
    for (const id of ['long-tasks-during-load', 'long-tasks-during-load:ipad']) {
      expect(rowOf(res, id).status, id).toBe('trend');
    }
    for (const id of ['frame-times-during-pan', 'frame-times-during-pan:ipad']) {
      const row = rowOf(res, id);
      expect(row.status, id).toBe('trend');
      const stats = row.details.stats as { count: number };
      expect(stats.count, id).toBeGreaterThanOrEqual(1);
      expect(typeof row.withinBudget, id).toBe('boolean');
      expect(row.details.durationMs as number, id).toBeGreaterThanOrEqual(3008);
    }
    const ipad = rowOf(res, 'frame-times-during-pan:ipad');
    expect(ipad.details.viewport).toEqual({ width: 1180, height: 820 });
    expect(ipad.details.deviceScaleFactor).toBe(2);
    expect(ipad.details.cpuThrottleRate).toBe(R);

    const history = readFileSync(path.join(r.out, 'history.jsonl'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(history.length).toBe(1);
  });

  test('EZD-207c E2 probe fails under each profile', async () => {
    test.setTimeout(180000);
    const ids = ['react-commits-during-pan', 'react-commits-during-pan:ipad'];
    const r = runPerf([
      '--pan-url',
      '/dev/benchmark-plan?inject=pan-commit',
      '--only',
      ids.join(','),
    ]);
    expect(r.status, r.stdout).toBe(1);
    expect(r.stdout).toContain('PERF FAIL');
    for (const id of ids) expect(r.stdout).toContain(id);
    const res = latestOf(r.out);
    for (const id of ids) {
      const row = rowOf(res, id);
      expect(row.status, id).toBe('fail');
      expect(row.value as number, id).toBeGreaterThanOrEqual(1);
      expect(row.value as number, id).toBeLessThanOrEqual(180);
      expect(row.budget, id).toBe(0);
    }
  });

  test('EZD-207c E3 page with no database', async ({ page }) => {
    test.setTimeout(90000);
    const baseURL = String(test.info().project.use.baseURL);
    const urls: string[] = [];
    page.on('request', (req) => urls.push(req.url()));

    await page.goto('/dev/benchmark-plan');
    await expect(page.locator('[data-testid="plan-canvas"][data-plan-state="ready"]')).toBeAttached(
      { timeout: 30000 },
    );
    await expect(page.locator('[data-benchmark-objects]')).toHaveAttribute(
      'data-benchmark-objects',
      '3000',
    );
    const stats = await page.evaluate(() =>
      (
        window as unknown as {
          __ezdraftPlan: { stats(): { drawCalls: number; contexts: number } };
        }
      ).__ezdraftPlan.stats(),
    );
    expect(stats.drawCalls).toBeGreaterThanOrEqual(1);
    expect(stats.contexts).toBe(1);
    await page.waitForFunction(
      () =>
        (
          window as unknown as { __ezdraftPlan: { stats(): { glyphs: number } } }
        ).__ezdraftPlan.stats().glyphs > 0,
      undefined,
      { timeout: 30000 },
    );
    expect(await page.locator('canvas').count()).toBe(1);

    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(u.startsWith(baseURL), u).toBe(true);
      expect(new URL(u).pathname.startsWith('/api/'), u).toBe(false);
    }
  });
});
