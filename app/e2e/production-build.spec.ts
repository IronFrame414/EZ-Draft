// EZD-036 B1-B3 (vault/plans/EZD-036.md section 4). File checks on the existing build, plus one spawned
// server. No page or browser. No import.meta or __dirname (lesson L-017).
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '../test-harness/e2e/test';

function appDir(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return path.join(dir, 'app');
    const up = path.dirname(dir);
    if (up === dir) throw new Error('no pnpm-workspace.yaml above ' + process.cwd());
    dir = up;
  }
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function requireBuild(app: string): string {
  const next = path.join(app, '.next');
  if (!existsSync(path.join(next, 'BUILD_ID'))) throw new Error('run pnpm build first');
  return next;
}

const OUTBOX = ['__ezdEmailStubOutbox', '__ezdSentryStubOutbox'];

function chunkRefs(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  return [...text.matchAll(/R\.c\("([^"]+)"\)/g)].map((m) => m[1]);
}

test.describe('EZD-036 production build', () => {
  test('EZD-036 B1: the Edge output has no node:fs, node:path or stub outbox', () => {
    const next = requireBuild(appDir());
    const files = walk(path.join(next, 'server', 'edge')).filter((f) => f.endsWith('.js'));
    const bad: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const needle of ['"node:fs"', '"node:path"', ...OUTBOX]) {
        if (text.includes(needle)) bad.push(`${path.relative(next, f)} contains ${needle}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test('EZD-036 B2: no eager chunk of any server entry holds a stub outbox', () => {
    const next = requireBuild(appDir());
    const entries = [
      path.join(next, 'server', 'instrumentation.js'),
      ...walk(path.join(next, 'server', 'app')).filter((f) => /[\\/](route|page)\.js$/.test(f)),
    ];
    const monitoring = path.join(next, 'server', 'app', 'api', 'monitoring', 'route.js');
    expect(existsSync(entries[0])).toBe(true);
    expect(existsSync(monitoring)).toBe(true);
    expect(chunkRefs(entries[0]).length).toBeGreaterThanOrEqual(1);
    expect(chunkRefs(monitoring).length).toBeGreaterThanOrEqual(1);

    const resolve = (ref: string): string => {
      expect(ref.endsWith('.js'), ref).toBe(true);
      const p = path.join(next, ref);
      expect(existsSync(p), ref).toBe(true);
      return p;
    };
    const eager = new Set<string>();
    for (const e of entries) for (const ref of chunkRefs(e)) eager.add(resolve(ref));
    const monitoringText = [...new Set(chunkRefs(monitoring))]
      .map((r) => readFileSync(resolve(r), 'utf8'))
      .join('\n');
    expect(monitoringText).toContain('email_stub_not_allowed');
    expect(monitoringText).toContain('https://public@ezdraft.invalid/1');

    const all = walk(path.join(next, 'server', 'chunks')).filter((f) => f.endsWith('.js'));
    expect(
      all.some((f) => readFileSync(f, 'utf8').includes('sentry_stub_not_allowed')),
      'control sentry_stub_not_allowed',
    ).toBe(true);
    for (const name of OUTBOX) {
      expect(
        all.some((f) => readFileSync(f, 'utf8').includes(name)),
        `control ${name}`,
      ).toBe(true);
    }

    const bad: string[] = [];
    for (const f of eager) {
      const text = readFileSync(f, 'utf8');
      for (const name of OUTBOX)
        if (text.includes(name)) bad.push(`${path.relative(next, f)} ${name}`);
    }
    for (const e of entries) {
      const text = readFileSync(e, 'utf8');
      for (const name of OUTBOX)
        if (text.includes(name)) bad.push(`${path.relative(next, e)} ${name}`);
    }
    expect(bad).toEqual([]);
  });

  test('EZD-036 B3: next start prints no server-runtime-injection line', async () => {
    test.setTimeout(120000);
    const app = appDir();
    requireBuild(app);
    const child = spawn(
      process.execPath,
      [
        path.join(app, 'node_modules', 'next', 'dist', 'bin', 'next'),
        'start',
        '-p',
        '3036',
        '-H',
        '127.0.0.1',
      ],
      {
        cwd: app,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          EZD_TEST_DB_URL: '',
          EMAIL_TRANSPORT: 'stub',
          EMAIL_FROM: 'EZ Draft Test <test@example.test>',
          SENTRY_TRANSPORT: 'stub',
          AI_MODE: 'stub',
          NEXT_TELEMETRY_DISABLED: '1',
          NODE_OPTIONS:
            '--import ' +
            pathToFileURL(path.join(app, 'test-harness', 'net-guard', 'preload.mjs')).href,
        },
      },
    );
    let output = '';
    let exited = false;
    child.stdout.on('data', (d) => (output += String(d)));
    child.stderr.on('data', (d) => (output += String(d)));
    child.on('exit', () => (exited = true));
    try {
      const deadline = Date.now() + 60000;
      let ready = false;
      while (Date.now() < deadline && !exited && !ready) {
        try {
          const res = await fetch('http://127.0.0.1:3036/manifest.webmanifest');
          ready = res.status === 200;
        } catch {
          // not up yet
        }
        if (!ready) await new Promise((r) => setTimeout(r, 250));
      }
      expect(ready, output).toBe(true);
      await new Promise((r) => setTimeout(r, 2000));
      expect(exited).toBe(false);
      expect(output).toContain('Ready');
      expect(output).not.toContain('server-runtime-injection');
    } finally {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        if (exited) return resolve();
        const t = setTimeout(() => {
          child.kill('SIGKILL');
          resolve();
        }, 5000);
        child.on('exit', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  });
});
