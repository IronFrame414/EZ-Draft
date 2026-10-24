// EZD-020 E1-E7 (vault/plans/EZD-020.md section 4). Untagged, so desktop only. Spawn-CLI tests request no page
// fixture (one browser only; EZD-017 T1 pattern). No import.meta or __dirname (lesson L-017).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '../test-harness/e2e/test';

type Row = {
  id: string;
  status: string;
  value: number | null;
  details: Record<string, unknown> & {
    url?: string;
    forbidden?: unknown[];
    missingMaps?: unknown[];
    modules?: Record<string, number>;
    watch?: Record<string, number | null>;
    files?: unknown[];
  };
};
type Results = { measurements: Row[] };

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
const K = 1000;

function runPerf(only: string): {
  status: number | null;
  stdout: string;
  out: string;
  res: Results;
} {
  const root = findRepoRoot();
  const out = mkdtempSync(os.tmpdir() + '/ezd-entries-');
  const r = spawnSync(
    process.execPath,
    [
      path.join(root, 'scripts', 'perf', 'run.mjs'),
      '--base-url',
      BASE,
      '--only',
      only,
      '--out',
      out,
    ],
    { cwd: root, encoding: 'utf8', timeout: 170000 },
  );
  const latest = path.join(out, 'latest.json');
  const res = existsSync(latest)
    ? (JSON.parse(readFileSync(latest, 'utf8')) as Results)
    : { measurements: [] };
  return { status: r.status, stdout: (r.stdout ?? '') + (r.stderr ?? ''), out, res };
}

function rowOf(res: Results, id: string): Row {
  const row = res.measurements.find((m) => m.id === id);
  expect(row, id).toBeDefined();
  return row as Row;
}

const WATCH = ['@sentry/', '@supabase/realtime-js', '@radix-ui/', 'radix-ui'];
const MARKER = 'ezd-lazy-sample-7f3a';

test.describe('EZD-020 entry points and lazy chunks', () => {
  test('EZD-020 done when: the client link and field pack bundles contain no editor or 3D code @smoke', async () => {
    test.setTimeout(180000);
    const r = runPerf('entry-contents:field-pack,entry-contents:client-link');
    expect(r.status, r.stdout).toBe(0);
    const urls: Record<string, string> = {
      'entry-contents:field-pack': '/dev/entry/field',
      'entry-contents:client-link': '/dev/entry/client',
    };
    for (const id of Object.keys(urls)) {
      const row = rowOf(r.res, id);
      expect(row.status, id).toBe('pass');
      expect(row.value, id).toBe(0);
      expect(row.details.forbidden, id).toEqual([]);
      expect(row.details.missingMaps ?? [], id).toHaveLength(0);
      expect(row.details.url, id).toBe(urls[id]);
      const keys = Object.keys(row.details.modules ?? {});
      expect(
        keys.some((k) => k.startsWith('app:')),
        id,
      ).toBe(true);
      expect(keys, id).toContain('app:lib/messages/MessagesProvider.tsx');
      expect(keys, id).toContain('pkg:react-dom');
    }
  });

  test('EZD-020 E2 the method sees editor code where it is', async () => {
    test.setTimeout(180000);
    const r = runPerf('entry-contents:editor');
    expect(r.status, r.stdout).toBe(0);
    const row = rowOf(r.res, 'entry-contents:editor');
    expect(row.status).toBe('pass');
    expect(row.value).toBe(0);
    expect(
      Object.keys(row.details.modules ?? {}).some((k) => k.startsWith('app:components/shell/')),
    ).toBe(true);
  });

  test('EZD-020 E3 office and sign-in', async () => {
    test.setTimeout(180000);
    const r = runPerf('entry-contents:office,entry-contents:sign-in');
    expect(r.status, r.stdout).toBe(0);
    for (const id of ['entry-contents:office', 'entry-contents:sign-in']) {
      const row = rowOf(r.res, id);
      expect(row.status, id).toBe('pass');
      expect(row.value, id).toBe(0);
    }
  });

  test('EZD-020 E4 size budgets now active', async () => {
    test.setTimeout(180000);
    const r = runPerf('js-size:projects-settings,js-size:field-pack,js-size:client-link');
    expect(r.status, r.stdout).toBe(0);
    const urls: Record<string, string> = {
      'js-size:projects-settings': '/dev/entry/office',
      'js-size:field-pack': '/dev/entry/field',
      'js-size:client-link': '/dev/entry/client',
    };
    for (const [id, url] of Object.entries(urls)) {
      const row = rowOf(r.res, id);
      expect(row.status, id).toBe('pass');
      expect(row.value as number, id).toBeGreaterThan(0);
      expect(row.value as number, id).toBeLessThanOrEqual(200 * K);
      expect(row.details.url, id).toBe(url);
      const files = row.details.files as unknown[];
      expect(files.length, id).toBeGreaterThan(0);
      for (const f of files) {
        const u = typeof f === 'string' ? f : String((f as { url?: string }).url);
        const p = u.startsWith('http') ? new URL(u).pathname : u;
        expect(p.startsWith('/_next/static/'), `${id} ${u}`).toBe(true);
      }
    }
  });

  test('EZD-020 E5 lazy module loads on first use', async ({ page }) => {
    test.setTimeout(60000);
    const scripts: { url: string; body: string }[] = [];
    const pending: Promise<void>[] = [];
    page.on('response', (resp) => {
      const url = resp.url();
      const type = resp.headers()['content-type'] ?? '';
      if (resp.request().resourceType() === 'script' || /javascript/.test(type)) {
        pending.push(
          resp
            .text()
            .then((body) => {
              scripts.push({ url, body });
            })
            .catch(() => undefined),
        );
      }
    });
    await page.goto('/dev/lazy');
    await page.waitForLoadState('load');
    await page.waitForTimeout(1000);
    await Promise.all(pending);
    expect(scripts.some((s) => s.body.includes(MARKER))).toBe(false);
    await expect(page.getByTestId('lazy-result')).toHaveText('');

    const before = scripts.length;
    await page.getByTestId('lazy-load').click();
    await expect(page.getByTestId('lazy-result')).toHaveText(MARKER);
    await Promise.all(pending);
    const added = scripts.slice(before);
    expect(
      added.some(
        (s) => new URL(s.url).pathname.startsWith('/_next/static/') && s.body.includes(MARKER),
      ),
    ).toBe(true);

    const afterFirst = scripts.length;
    await page.getByTestId('lazy-load').click();
    await page.waitForTimeout(500);
    await Promise.all(pending);
    expect(scripts.length).toBe(afterFirst);
  });

  test('EZD-020 E6 entries render under their groups', async ({ page }) => {
    for (const name of ['office', 'editor', 'field', 'client']) {
      const resp = await page.goto(`/dev/entry/${name}`);
      expect(resp?.status(), name).toBe(200);
      await expect(page.locator(`[data-entry="${name}"]`), name).toHaveCount(1);
      if (name === 'editor') {
        await expect(page.locator('[data-shell-region="frame"]')).toHaveCount(1);
      }
      if (name === 'field' || name === 'client') {
        await expect(page.locator('[data-phone-region="frame"]'), name).toHaveCount(1);
        await expect(page.locator('[data-shell-region]'), name).toHaveCount(0);
      }
    }
  });

  test('EZD-020 E7 bundle report from the real build', async () => {
    test.setTimeout(180000);
    const r = runPerf('entry-contents:field-pack,entry-contents:editor,js-size:field-pack');
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toContain('BUNDLE REPORT');
    const md = readFileSync(path.join(r.out, 'bundle-report.md'), 'utf8');
    for (const id of ['entry-contents:field-pack', 'entry-contents:editor']) {
      const at = md.indexOf(`## ${id}`);
      expect(at, id).toBeGreaterThanOrEqual(0);
      const next = md.indexOf('\n## ', at + 1);
      const section = md.slice(at, next === -1 ? undefined : next);
      expect(section, id).toContain('pkg:react-dom');
      for (const w of WATCH) expect(section, `${id} ${w}`).toContain(w);
    }
    const fieldAt = md.indexOf('## entry-contents:field-pack');
    const fieldNext = md.indexOf('\n## ', fieldAt + 1);
    const fieldSection = md.slice(fieldAt, fieldNext === -1 ? undefined : fieldNext);
    const size = rowOf(r.res, 'js-size:field-pack').value as number;
    expect(
      fieldSection.includes(String(size)) || fieldSection.includes(size.toLocaleString('en-US')),
    ).toBe(true);
    const root = findRepoRoot();
    if (existsSync(path.join(root, 'app', 'src', 'instrumentation-client.ts'))) {
      for (const id of ['entry-contents:field-pack', 'entry-contents:editor']) {
        expect(rowOf(r.res, id).details.watch?.['@sentry/'] ?? 0, id).toBeGreaterThan(0);
      }
    }
  });
});
