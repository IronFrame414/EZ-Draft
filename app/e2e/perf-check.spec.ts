// EZD-017 T1, T2 (vault/plans/EZD-017.md section 4; T-a). Runs the perf CLI against the harness server on
// 127.0.0.1:3000. Untagged, so desktop only. No import.meta or __dirname (lesson L-017); no page or browser
// fixture is requested. Budgets: table B (editor 500,000; sign-in pages 200,000; commits 0; long tasks 0);
// 180 pointer moves = 2 x 90 (P2); pending rows from table R.
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
  viewport: { width: number; height: number };
  machine: unknown;
  browser: unknown;
  measurements: Row[];
};

// Copied from app/test-harness/mail-catcher.ts lines 18-28 (T-a).
function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no pnpm-workspace.yaml above ' + process.cwd());
    dir = up;
  }
}

const BASE = 'http://127.0.0.1:3000';

function runPerf(args: string[]): { status: number | null; stdout: string; out: string } {
  const root = findRepoRoot();
  const out = mkdtempSync(os.tmpdir() + '/ezd-perf-');
  const r = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'perf', 'run.mjs'), '--base-url', BASE, ...args, '--out', out],
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

const PENDING = [
  'js-size:projects-settings',
  'js-size:field-pack',
  'js-size:client-link',
  'draw-calls-per-frame',
  'buffers-rebuilt-per-edit',
  'rows-written-per-save',
  'project-open-ms',
  'tab-switch-ms',
  'autosave-ms',
  'tool-pick-ms',
  'projects-first-cards-ms',
];

test.describe('EZD-017 performance check', () => {
  test('EZD-017 done when: the check passes on the empty shell (T1)', async () => {
    test.setTimeout(180000);
    const r = runPerf([]);
    // (a)
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('PERF PASS');

    // (b)
    const res = latestOf(r.out);
    expect(res.schema).toBe(1);
    expect(res.pass).toBe(true);
    expect(res.profile).toBe('desktop');
    expect(res.viewport).toEqual({ width: 1600, height: 1000 });
    expect(typeof res.machine).toBe('object');
    expect(res.machine).not.toBeNull();
    expect(typeof res.browser).toBe('object');
    expect(res.browser).not.toBeNull();

    // (c)
    const commits = rowOf(res, 'react-commits-during-pan');
    expect(commits.status).toBe('pass');
    expect(commits.value).toBe(0);
    expect(commits.budget).toBe(0);
    expect(commits.details.reactDetected).toBe(true);
    expect(commits.details.renderers as number).toBeGreaterThanOrEqual(1);
    expect(commits.details.pointerMoves).toBe(180);

    // (d)
    const editor = rowOf(res, 'js-size:editor');
    expect(editor.details.url).toBe('/dev/shell');
    expect(editor.status).toBe('pass');
    expect(editor.value as number).toBeGreaterThan(0);
    expect(editor.value as number).toBeLessThanOrEqual(500000);
    const files = editor.details.files as { url: string }[];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f.url.startsWith('/_next/static/'), f.url).toBe(true);

    // (e)
    for (const [id, url] of [
      ['js-size:sign-in', '/sign-in'],
      ['js-size:auth-confirm', '/auth/confirm'],
    ]) {
      const row = rowOf(res, id);
      expect(row.details.url, id).toBe(url);
      expect(row.status, id).toBe('pass');
      expect(row.value as number).toBeGreaterThan(0);
      expect(row.value as number).toBeLessThanOrEqual(200000);
    }

    // (f)
    const ltPan = rowOf(res, 'long-tasks-during-pan');
    expect(ltPan.status).toBe('pass');
    expect(ltPan.value).toBe(0);
    expect(ltPan.budget).toBe(0);
    const ltLoad = rowOf(res, 'long-tasks-during-load');
    expect(ltLoad.status).toBe('trend');
    expect(typeof ltLoad.value).toBe('number');
    expect(ltLoad.value as number).toBeGreaterThanOrEqual(0);

    // (g)
    const frames = rowOf(res, 'frame-times-during-pan');
    expect(frames.status).toBe('trend');
    const stats = frames.details.stats as { count: number };
    expect(stats.count).toBeGreaterThanOrEqual(1);
    expect(typeof frames.withinBudget).toBe('boolean');

    // (h)
    for (const id of PENDING) {
      const row = rowOf(res, id);
      expect(row.status, id).toBe('pending');
      expect(typeof row.owner, id).toBe('string');
      expect(row.owner.trim().length, id).toBeGreaterThan(0);
    }

    // (i)
    const history = readFileSync(path.join(r.out, 'history.jsonl'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '');
    expect(history).toHaveLength(1);
  });

  test('EZD-017 done when: an extra React commit during a pan fails the check (T2)', async () => {
    test.setTimeout(180000);
    // (a)
    const a = runPerf([
      '--pan-url',
      '/dev/perf-probe?inject=pan-commit',
      '--only',
      'react-commits-during-pan',
    ]);
    expect(a.status, a.stdout).toBe(1);
    expect(a.stdout).toContain('PERF FAIL');
    expect(a.stdout).toContain('react-commits-during-pan');
    const resA = latestOf(a.out);
    expect(resA.pass).toBe(false);
    const rowA = rowOf(resA, 'react-commits-during-pan');
    expect(rowA.status).toBe('fail');
    expect(rowA.value as number).toBeGreaterThanOrEqual(1);
    expect(rowA.value as number).toBeLessThanOrEqual(180);
    expect(rowA.budget).toBe(0);

    // (b)
    const b = runPerf(['--pan-url', '/dev/perf-probe', '--only', 'react-commits-during-pan']);
    expect(b.status, b.stdout).toBe(0);
    expect(rowOf(latestOf(b.out), 'react-commits-during-pan').value).toBe(0);
  });
});
