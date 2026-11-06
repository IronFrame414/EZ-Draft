// EZD-344 E1-E8 (vault/plans/EZD-344.md sections 3 and 4): every child process of scripts/gate.mjs starts with an exact environment.
// node:test, Node built-ins only. Every secret here is a fixture string; the gate runs against a fixture app with a fixture HOME and fixture git configs.
// Expected values come from the plan's Decided rows D1-D8; secrets are compared through booleans only (L-018).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATE_SET, GIT_ISOLATION, PASS_THROUGH, gateEnv, gateSpawn } from '../gate-env.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function canaries() {
  return {
    GITHUB_TOKEN: 'ezd344-gh',
    GH_TOKEN: 'ezd344-ghcli',
    ANTHROPIC_API_KEY: 'ezd344-key',
    CLAUDE_CODE_OAUTH_TOKEN: 'ezd344-oauth',
    SSH_AUTH_SOCK: '/nonexistent/ezd344.sock',
    GIT_ASKPASS: '/nonexistent/ezd344-askpass',
    SSH_ASKPASS: '/nonexistent/ezd344-sshaskpass',
    GIT_CONFIG_PARAMETERS: "'credential.helper'='!f() { echo password=ezd344-param; }; f'",
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '!f() { echo password=ezd344-count; }; f',
    EZD344_CANARY: 'ezd344-canary',
  };
}

const PROBE = [
  "const { spawnSync } = require('node:child_process');",
  "const fs = require('node:fs');",
  "const os = require('node:os');",
  "const path = require('node:path');",
  "const r = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\\nhost=ezd344.invalid\\n\\n', encoding: 'utf8', timeout: 20000 });",
  "fs.writeFileSync(path.join(os.tmpdir(), 'ezd344-probe.json'), JSON.stringify({ status: r.status, stdout: r.stdout, env: process.env }));",
  'process.exit(0);',
  '',
].join('\n');

// local.mjs is an ES module (.mjs), so the fixture stop script uses imports.
const STOP = [
  "import { writeFileSync } from 'node:fs';",
  "import os from 'node:os';",
  "import path from 'node:path';",
  'writeFileSync(path.join(os.tmpdir(), `ezd344-stop-${process.env.EZD_LANE}.json`), JSON.stringify(process.env));',
  'process.exit(0);',
  '',
].join('\n');

const gitConfig = (secret) => `[credential]\n\thelper = "!f() { echo username=u; echo password=${secret}; }; f"\n`;

function fixture({ lane } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd344-fx-'));
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ezd344-tmp-'));
  mkdirSync(path.join(dir, 'node_modules'));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'ezd344-fx',
      private: true,
      scripts: { typecheck: 'node -e 0', lint: 'node -e 0', build: 'node -e 0', test: 'node probe.cjs' },
    }),
  );
  writeFileSync(path.join(dir, 'probe.cjs'), PROBE);
  const home = path.join(dir, 'home');
  mkdirSync(home);
  writeFileSync(path.join(home, '.gitconfig'), gitConfig('ezd344-global'));
  const sys = path.join(dir, 'sys.gitconfig');
  writeFileSync(sys, gitConfig('ezd344-system'));
  if (lane) {
    mkdirSync(path.join(dir, 'scripts', 'db'), { recursive: true });
    writeFileSync(path.join(dir, 'scripts', 'db', 'local.mjs'), STOP);
  }
  return { dir, home, sys, tmp };
}

function cleanup(fx) {
  rmSync(fx.dir, { recursive: true, force: true });
  rmSync(fx.tmp, { recursive: true, force: true });
}

function runGate(fx, extra) {
  const env = {
    PATH: process.env.PATH,
    HOME: fx.home,
    LANG: 'en_US.UTF-8',
    TMPDIR: fx.tmp,
    TMP: fx.tmp,
    TEMP: fx.tmp,
    GIT_CONFIG_SYSTEM: fx.sys,
    ...canaries(),
    ...extra,
  };
  const r = spawnSync(process.execPath, [path.join(repo, 'scripts', 'gate.mjs'), fx.dir], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: r.stdout || '', err: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
}

test('EZD-344 E1 exact env', () => {
  assert.deepEqual([...PASS_THROUGH], ['PATH', 'HOME', 'LANG', 'TMPDIR', 'TMP', 'TEMP', 'GITHUB_ACTIONS', 'XDG_CACHE_HOME', 'PLAYWRIGHT_BROWSERS_PATH'], 'PASS_THROUGH (D1)');
  assert.deepEqual({ ...GIT_ISOLATION }, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' }, 'GIT_ISOLATION (D2)');
  assert.deepEqual([...GATE_SET], ['CI', 'NO_COLOR', 'EZD_TEST_SCOPE', 'EZD_PHASE', 'EZD_TEST_GREP', 'EZD_LANE', 'SUPABASE_WORKDIR'], 'GATE_SET (D3)');
  assert.ok(Object.isFrozen(PASS_THROUGH) && Object.isFrozen(GIT_ISOLATION) && Object.isFrozen(GATE_SET), 'the three exports are frozen');
  const passed = Object.fromEntries(PASS_THROUGH.map((n) => [n, `v-${n}`]));
  const result = gateEnv({ ...passed, ...canaries(), GIT_CONFIG_SYSTEM: 'x' }, { CI: '1', NO_COLOR: '1', EZD_TEST_SCOPE: 'full' });
  assert.deepEqual(result, { ...passed, ...GIT_ISOLATION, CI: '1', NO_COLOR: '1', EZD_TEST_SCOPE: 'full' }, 'gateEnv result');
  assert.equal(Object.keys(result).length, 15, 'gateEnv key count');
});

test('EZD-344 E2 absent names', () => {
  const result = gateEnv({ PATH: 'p' }, {});
  assert.deepEqual(result, { PATH: 'p', ...GIT_ISOLATION }, 'only PATH and the git isolation pairs');
  assert.equal('HOME' in result, false, 'HOME is absent, not undefined');
});

test('EZD-344 E3 exact compare', () => {
  const parent = { path: 'a', Path: 'b', 'PATH​': 'c', HOMe: 'd', HOME: 'h', GIT_CONFIG_GLOBAL: '/tmp/evil', GIT_CONFIG_NOSYSTEM: '0' };
  assert.deepEqual(gateEnv(parent, {}), { HOME: 'h', ...GIT_ISOLATION }, 'no case folding, no look-alike names, git isolation wins over the parent');
});

test('EZD-344 E4 refusals', () => {
  assert.throws(() => gateEnv({}, { GITHUB_TOKEN: 'x' }), { message: /^gate env: GITHUB_TOKEN is not a gate variable$/ }, 'GITHUB_TOKEN in set');
  assert.throws(() => gateEnv({}, { GIT_CONFIG_GLOBAL: 'x' }), { message: /^gate env: GIT_CONFIG_GLOBAL is not a gate variable$/ }, 'GIT_CONFIG_GLOBAL in set');
  assert.throws(() => gateEnv({}, { CI: 1 }), { message: /^gate env: CI must be a string$/ }, 'CI as a number');
});

test('EZD-344 E5 gateSpawn', () => {
  const env = gateEnv({ PATH: process.env.PATH, ...canaries() }, { CI: '1' });
  const r = gateSpawn(env, process.execPath, ['-e', 'process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))'], {
    encoding: 'utf8',
    env: { EZD344_CANARY: 'opts' },
  });
  assert.equal(r.status, 0, `child status ${r.status} ${r.stderr}`);
  // macOS adds __CF_USER_TEXT_ENCODING to every spawned process; it carries no secret and does not come from the parent env (orchestrator, E5 gap).
  const keys = JSON.parse(r.stdout).filter((k) => !(process.platform === 'darwin' && k === '__CF_USER_TEXT_ENCODING'));
  assert.deepEqual(keys, ['CI', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', 'GIT_TERMINAL_PROMPT', 'PATH'], 'child keys (opts.env ignored)');
});

test('EZD-344 E6 credential fill under the gate', { timeout: 240000 }, () => {
  const fx = fixture({});
  try {
    const r = runGate(fx, {});
    assert.equal(r.status, 0, r.all);
    assert.ok(/^GATE PASS$/m.test(r.out), 'GATE PASS line');
    const probeFile = path.join(fx.tmp, 'ezd344-probe.json');
    assert.ok(existsSync(probeFile), 'the probe wrote its file');
    const probe = JSON.parse(readFileSync(probeFile, 'utf8'));
    assert.equal(String(probe.stdout || '').includes('password='), false, 'credential fill printed a password= line');
    assert.equal(String(probe.stdout || '').includes('ezd344-'), false, 'credential fill printed a fixture secret');
    assert.notEqual(probe.status, 0, 'credential fill must fail without a helper');
    for (const k of [...Object.keys(canaries()), 'GIT_CONFIG_SYSTEM']) assert.equal(k in probe.env, false, `${k} reached the check`);
    assert.equal(probe.env.GIT_CONFIG_NOSYSTEM, '1', 'GIT_CONFIG_NOSYSTEM');
    assert.equal(probe.env.GIT_CONFIG_GLOBAL, '/dev/null', 'GIT_CONFIG_GLOBAL');
    assert.equal(probe.env.GIT_TERMINAL_PROMPT, '0', 'GIT_TERMINAL_PROMPT');
    assert.equal(probe.env.HOME === fx.home, true, 'HOME passes through');
    assert.equal(probe.env.CI, '1', 'CI');
  } finally {
    cleanup(fx);
  }
});

test('EZD-344 E7 lane stop and sweep', { timeout: 240000 }, () => {
  const fx = fixture({ lane: true });
  try {
    const r = runGate(fx, { EZD_LANE: '1' });
    assert.equal(r.status, 0, r.all);
    for (const m of [1, 2, 3]) {
      const file = path.join(fx.tmp, `ezd344-stop-${m}.json`);
      assert.ok(existsSync(file), `lane ${m} stop-lane did not run`);
      const env = JSON.parse(readFileSync(file, 'utf8'));
      for (const k of [...Object.keys(canaries()), 'GIT_CONFIG_SYSTEM']) assert.equal(k in env, false, `${k} reached the lane ${m} stop-lane`);
      assert.equal(env.SUPABASE_WORKDIR === path.join(fx.dir, '.lanes', `lane${m}`), true, `SUPABASE_WORKDIR of lane ${m}`);
      assert.equal(env.GIT_CONFIG_GLOBAL, '/dev/null', `GIT_CONFIG_GLOBAL of lane ${m}`);
    }
  } finally {
    cleanup(fx);
  }
});

test('EZD-344 E8 one path', () => {
  const text = readFileSync(path.join(repo, 'scripts', 'gate.mjs'), 'utf8');
  assert.equal(text.includes('node:child_process'), false, 'scripts/gate.mjs must not import node:child_process');
  assert.ok(text.includes("from './gate-env.mjs'"), "scripts/gate.mjs must import from './gate-env.mjs'");
  assert.ok(text.includes("CI: '1'"), "scripts/gate.mjs must keep CI: '1'");
});
