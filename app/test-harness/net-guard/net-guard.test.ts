// EZD-021 T12, T13, T15, T16 (vault/plans/EZD-021.md section 4): the live-network guard. T12 and T13 start child
// processes (Vitest probes, Node with the preload) and read their exit codes and output; T15 reads the
// Playwright config and teardown; T16 checks the Vitest wiring from inside a test. Expected values come from
// the plan: loopback is allowed, every other host fails the run, naming the host.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net, { connect as netConnect, type AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import vitestConfig from '../../vitest.config.mjs';
import { netGuardFixture } from '../e2e/net-guard-fixture';
import { GUARD_MARKER, blockedAttempts, socketTargetHost } from './net-guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..', '..');
const repoRoot = path.resolve(appDir, '..');
const preload = path.join(here, 'preload.mjs');
const norm = (p: string) => p.replace(/\\/g, '/');

function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.EZD_TEST_GREP; // docs/architecture.md Test scope: a spawned runner sets its own scope
  delete env.NODE_OPTIONS;
  return env;
}

function runProbe(probe: string) {
  const run = spawnSync(
    'pnpm',
    [
      '--filter',
      '@ezdraft/app',
      'exec',
      'vitest',
      'run',
      '--config',
      'test-harness/net-guard/probe.vitest.config.mts',
      `test-harness/net-guard/probes/${probe}`,
    ],
    { cwd: repoRoot, encoding: 'utf8', env: childEnv(), timeout: 120000 },
  );
  return { status: run.status, output: `${run.stdout}\n${run.stderr}` };
}

let tmp = '';
beforeAll(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd021-net-'));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('EZD-021 live-network guard', () => {
  // T12
  it('EZD-021 T12 a test that reaches a live provider fails the suite @smoke', () => {
    const hosts = runProbe('live-hosts.probe.ts');
    expect(hosts.status, hosts.output).not.toBe(0);
    for (const host of [
      'api.anthropic.com',
      'generativelanguage.googleapis.com',
      'api.openai.com',
      'api.bfl.ai',
      'api.resend.com',
      'o1.ingest.sentry.io',
    ]) {
      expect(hosts.output, host).toContain(host);
    }

    const ai = runProbe('live-ai.probe.ts');
    expect(ai.status, ai.output).not.toBe(0);
    for (const host of [
      'api.anthropic.com',
      'generativelanguage.googleapis.com',
      'api.openai.com',
      'api.bfl.ai',
    ]) {
      expect(ai.output, host).toContain(host);
    }

    const loop = runProbe('loopback.probe.ts');
    expect(loop.status, loop.output).toBe(0);
  }, 240000);

  // T13
  it('EZD-021 T13 the preload guards plain Node processes and the node:test runner', async () => {
    const live = path.join(tmp, 'live.mjs');
    writeFileSync(
      live,
      `import https from 'node:https';
try { await fetch('https://api.openai.com/v1/images/edits'); } catch {}
try { https.get('https://api.resend.com/'); } catch {}
`,
    );
    const logA = path.join(tmp, 'a.log');
    const a = spawnSync(process.execPath, ['--import', preload, live], {
      encoding: 'utf8',
      env: childEnv({ EZD_NET_GUARD_LOG: logA }),
    });
    expect(a.status, a.stderr).toBe(1);
    const linesA = readFileSync(logA, 'utf8').split('\n').filter(Boolean);
    expect(linesA).toHaveLength(2);
    expect(linesA.map((l) => (JSON.parse(l) as { host: string }).host).sort()).toEqual([
      'api.openai.com',
      'api.resend.com',
    ]);
    expect(a.stderr).toContain('api.openai.com');
    expect(a.stderr).toContain('api.resend.com');

    // (b) a loopback server only: exit 0 and an empty log
    const server = http.createServer((_req, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const loop = path.join(tmp, 'loop.mjs');
      writeFileSync(
        loop,
        `const r = await fetch('http://127.0.0.1:${port}/'); if ((await r.text()) !== 'ok') process.exit(3);\n`,
      );
      const logB = path.join(tmp, 'b.log');
      const b = await new Promise<{ status: number | null; stderr: string }>((resolve) => {
        // async spawn: the loopback server lives in this process and must keep answering
        const child = spawn(process.execPath, ['--import', preload, loop], {
          env: childEnv({ EZD_NET_GUARD_LOG: logB }),
        });
        let stderr = '';
        child.stderr.on('data', (d) => (stderr += String(d)));
        child.on('close', (status) => resolve({ status, stderr }));
      });
      expect(b.status, b.stderr).toBe(0);
      expect(existsSync(logB) ? readFileSync(logB, 'utf8') : '').toBe('');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // (c) the node:test runner's own child process gets the guard
    const probeTest = path.join(tmp, 'probe.test.mjs');
    writeFileSync(
      probeTest,
      `import { test } from 'node:test';
test('swallows a live fetch', async () => { try { await fetch('https://api.anthropic.com/v1/messages'); } catch {} });
`,
    );
    const c = spawnSync(process.execPath, ['--import', preload, '--test', probeTest], {
      encoding: 'utf8',
      env: childEnv(),
    });
    expect(c.status, `${c.stdout}\n${c.stderr}`).not.toBe(0);
  }, 60000);

  // T15
  it('EZD-021 T15 the Playwright config and teardown are wired to the guard', async () => {
    const saved = { ...process.env };
    try {
      const config = (await import('../../playwright.config')).default as unknown as {
        webServer: { env: Record<string, string> };
      };
      const env = config.webServer.env;
      expect(env.AI_MODE).toBe('stub');
      expect(norm(env.AI_STUB_DIR).endsWith('app/.e2e/ai-stub')).toBe(true);
      expect(norm(env.EZD_NET_GUARD_LOG).endsWith('app/.e2e/net-guard.log')).toBe(true);
      expect(env.NODE_OPTIONS).toContain('--import');
      const url = /--import\s+(file:\S+preload\.mjs)/.exec(env.NODE_OPTIONS)?.[1];
      expect(url, 'a file: URL of preload.mjs').toBeDefined();
      expect(existsSync(fileURLToPath(url as string))).toBe(true);
      expect(env.NEXT_TELEMETRY_DISABLED).toBe('1');
      expect(env.npm_config_update_notifier).toBe('false');
      // EZD-016a T5 values unchanged
      expect(env.EMAIL_TRANSPORT).toBe('stub');

      const { default: teardown } = await import('../e2e/global-teardown');
      const log = path.join(tmp, 'teardown.log');
      process.env.EZD_NET_GUARD_LOG = log;
      writeFileSync(
        log,
        JSON.stringify({ via: 'fetch', method: 'GET', host: 'api.bfl.ai', at: 1 }) + '\n',
      );
      await expect(teardown()).rejects.toThrow('api.bfl.ai');
      writeFileSync(log, '');
      await expect(teardown()).resolves.toBeUndefined();
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      for (const [k, v] of Object.entries(saved)) process.env[k] = v;
    }
  }, 60000);

  // T16
  it('EZD-021 T16 Vitest runs on stub providers with the guard installed', () => {
    expect(process.env.AI_MODE).toBe('stub');
    expect((globalThis.fetch as unknown as Record<symbol, unknown>)[GUARD_MARKER]).toBe(true);
    expect(vitestConfig.test?.setupFiles).toContain('test-harness/net-guard/vitest.setup.ts');
  });

  // T14 (a), the part the expected-failure spec cannot show: the fixture names the host it blocked.
  it('EZD-021 T14 (a) the browser fixture fails the test and names api.anthropic.com', async () => {
    type Handler = (route: { request(): { url(): string }; abort(): Promise<void> }) => unknown;
    let handler: Handler | undefined;
    let matcher: ((url: URL) => boolean) | undefined;
    const context = {
      route: async (m: (url: URL) => boolean, h: Handler) => {
        matcher = m;
        handler = h;
      },
      routeWebSocket: async () => {},
    };
    const [fixture] = netGuardFixture as unknown as [
      (args: unknown, provide: (v: void) => Promise<void>) => Promise<void>,
    ];
    const url = 'https://api.anthropic.com/v1/messages';
    const run = fixture({ context, netGuardLog: path.join(tmp, 'none.log') }, async () => {
      expect(matcher?.(new URL(url))).toBe(true);
      expect(matcher?.(new URL('http://127.0.0.1:3000/api/health'))).toBe(false);
      await handler?.({ request: () => ({ url: () => url }), abort: async () => {} });
    });
    await expect(run).rejects.toThrow('api.anthropic.com');
  });
});

const SOCKET_HOSTS = [
  'api.anthropic.com',
  'api.openai.com',
  'api.resend.com',
  'api.bfl.ai',
  'o1.ingest.sentry.io',
];

describe('EZD-159 network guard blocks sockets', () => {
  // T1
  it('EZD-159 T1 a test opening a socket to a live host fails with NetGuardError @smoke', () => {
    const run = runProbe('live-sockets.probe.ts');
    expect(run.status, run.output).not.toBe(0);
    for (const host of SOCKET_HOSTS) {
      expect(run.output, host).toContain(`NetGuardError: Live network blocked in tests: ${host}`);
    }
    expect(run.output).toMatch(/Tests\s+5 failed \(5\)/);
  }, 240000);

  // T2
  it('EZD-159 T2 the preload records each blocked socket call', () => {
    const script = path.join(tmp, 't2.mjs');
    writeFileSync(
      script,
      `import net from 'node:net';
import tls from 'node:tls';
import { connect as tlsConnect } from 'node:tls';
const calls = [
  () => tls.connect(443, 'api.anthropic.com'),
  () => net.connect(443, 'api.openai.com'),
  () => net.createConnection({ host: 'api.resend.com', port: 443 }),
  () => new net.Socket().connect(443, 'api.bfl.ai'),
  () => new WebSocket('wss://o1.ingest.sentry.io/api/1/'),
  () => tlsConnect({ host: 'generativelanguage.googleapis.com', port: 443 }),
];
calls.forEach((fn, i) => {
  try { fn(); console.log(JSON.stringify({ call: i + 1, name: 'none', code: 'none' })); }
  catch (e) { console.log(JSON.stringify({ call: i + 1, name: e.name, code: e.code })); }
});
`,
    );
    const log = path.join(tmp, 't2.log');
    const run = spawnSync(process.execPath, ['--import', preload, script], {
      encoding: 'utf8',
      env: childEnv({ EZD_NET_GUARD_LOG: log }),
      timeout: 30000,
    });
    expect(run.status, run.stderr).toBe(1);
    const out = run.stdout
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { name: string; code: string });
    expect(out).toHaveLength(6);
    for (const o of out) {
      expect(o.name).toBe('NetGuardError');
      expect(o.code).toBe('live_network_blocked_in_tests');
    }
    const lines = readFileSync(log, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { via: string; method: string; host: string });
    expect(lines.map((l) => [l.via, l.method, l.host])).toEqual([
      ['tls', 'CONNECT', 'api.anthropic.com'],
      ['net', 'CONNECT', 'api.openai.com'],
      ['net', 'CONNECT', 'api.resend.com'],
      ['net', 'CONNECT', 'api.bfl.ai'],
      ['websocket', 'GET', 'o1.ingest.sentry.io'],
      ['tls', 'CONNECT', 'generativelanguage.googleapis.com'],
    ]);
    for (const host of [
      'api.anthropic.com',
      'api.openai.com',
      'api.resend.com',
      'api.bfl.ai',
      'o1.ingest.sentry.io',
      'generativelanguage.googleapis.com',
    ]) {
      expect(run.stderr, host).toContain(host);
    }
  }, 60000);

  // T3
  it('EZD-159 T3 loopback sockets and Unix socket paths are allowed', () => {
    const script = path.join(tmp, 't3.mjs');
    writeFileSync(
      script,
      `import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
let tcp = 0;
let ipc = 0;
const tcpServer = net.createServer((s) => { tcp++; s.on('error', () => {}); });
const sockPath = path.join(os.tmpdir(), \`ezd159-\${process.pid}.sock\`);
try { fs.rmSync(sockPath, { force: true }); } catch {}
const ipcServer = net.createServer((s) => { ipc++; s.on('error', () => {}); });
await new Promise((r) => tcpServer.listen(0, '127.0.0.1', r));
await new Promise((r) => ipcServer.listen(sockPath, r));
const port = tcpServer.address().port;
const quiet = (c) => { c.on('error', () => {}); return c; };
const clients = [
  quiet(net.connect(port, '127.0.0.1')),
  quiet(net.createConnection({ port, host: '127.0.0.1' })),
  quiet(new net.Socket().connect(port, '127.0.0.1')),
  quiet(tls.connect({ port, host: '127.0.0.1', rejectUnauthorized: false })),
  quiet(net.connect(sockPath)),
];
const ws = new WebSocket(\`ws://127.0.0.1:\${port}/\`);
ws.onerror = () => {};
const start = Date.now();
while ((tcp < 5 || ipc < 1) && Date.now() - start < 5000) await new Promise((r) => setTimeout(r, 20));
console.log(JSON.stringify({ tcp, ipc }));
for (const c of clients) c.destroy();
try { ws.close(); } catch {}
tcpServer.close();
ipcServer.close();
fs.rmSync(sockPath, { force: true });
process.exit();
`,
    );
    const log = path.join(tmp, 't3.log');
    const run = spawnSync(process.execPath, ['--import', preload, script], {
      encoding: 'utf8',
      env: childEnv({ EZD_NET_GUARD_LOG: log }),
      timeout: 30000,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout.trim()).toBe('{"tcp":5,"ipc":1}');
    expect(existsSync(log) ? readFileSync(log, 'utf8') : '').toBe('');
    expect(run.stderr).not.toContain('Live network blocked');
  }, 60000);

  // T4
  it('EZD-159 T4 socketTargetHost reads every argument form', () => {
    const before = blockedAttempts().length;
    const sock = {};
    const cases: Array<[string, unknown[], 'net' | 'tls', string | null]> = [
      ['a', [443, 'api.example.test'], 'net', 'api.example.test'],
      ['b', [5432], 'net', 'localhost'],
      ['c', ['5432', '127.0.0.1'], 'net', '127.0.0.1'],
      ['d', ['/tmp/ezd.sock'], 'net', null],
      ['e', [{ host: 'api.example.test', port: 443 }], 'net', 'api.example.test'],
      ['f', [{ port: 443 }], 'net', 'localhost'],
      ['g', [{ port: 443, host: '' }], 'net', 'localhost'],
      ['h', [{ path: '/tmp/ezd.sock', host: 'api.example.test' }], 'net', null],
      ['i', [[{ host: 'api.example.test', port: 443 }, null]], 'net', 'api.example.test'],
      ['j', [{ socket: sock, host: 'api.example.test', port: 443 }], 'net', 'api.example.test'],
      ['k', [{ socket: sock, host: 'api.example.test' }], 'tls', null],
      ['l', [443, 'a.example.test', { host: 'b.example.test' }], 'tls', 'b.example.test'],
      ['m', [443, { host: 'c.example.test' }], 'tls', 'c.example.test'],
      ['n', [443, 'd.example.test'], 'tls', 'd.example.test'],
      ['o', ['/tmp/ezd.sock', { host: 'api.example.test' }], 'tls', null],
      ['p', [], 'net', 'localhost'],
    ];
    for (const [name, args, kind, expected] of cases) {
      expect(socketTargetHost(args, kind), name).toBe(expected);
    }
    expect(blockedAttempts().length).toBe(before);
  });

  // T5
  it('EZD-159 T5 Vitest runs with every socket wrapper installed', () => {
    const marked = (fn: unknown) => (fn as Record<symbol, unknown>)[GUARD_MARKER];
    expect(marked(net.connect), 'net.connect').toBe(true);
    expect(marked(net.createConnection), 'net.createConnection').toBe(true);
    expect(marked(net.Socket.prototype.connect), 'Socket.prototype.connect').toBe(true);
    expect(marked(tls.connect), 'tls.connect').toBe(true);
    expect(marked(globalThis.WebSocket), 'WebSocket').toBe(true);
    expect(marked(netConnect), 'named import connect').toBe(true);
    expect(typeof WebSocket).toBe('function');
    expect(WebSocket.OPEN).toBe(1);
  });

  // T6
  it('EZD-159 T6 the browser fixture blocks a live page WebSocket and names it', async () => {
    type WsHandler = (ws: { url(): string; close(): Promise<void> }) => unknown;
    let matcher: ((url: URL) => boolean) | undefined;
    let handler: WsHandler | undefined;
    let closed = false;
    const context = {
      route: async () => {},
      routeWebSocket: async (m: (url: URL) => boolean, h: WsHandler) => {
        matcher = m;
        handler = h;
      },
    };
    const [fixture] = netGuardFixture as unknown as [
      (args: unknown, provide: (v: void) => Promise<void>) => Promise<void>,
    ];
    const run = fixture({ context, netGuardLog: path.join(tmp, 'none.log') }, async () => {
      expect(matcher?.(new URL('wss://api.anthropic.com/'))).toBe(true);
      expect(matcher?.(new URL('ws://127.0.0.1:54321/realtime/v1/websocket'))).toBe(false);
      await handler?.({
        url: () => 'wss://api.anthropic.com/',
        close: async () => {
          closed = true;
        },
      });
    });
    await expect(run).rejects.toThrow('Live network blocked in browser tests: api.anthropic.com');
    expect(closed).toBe(true);
  });
});
