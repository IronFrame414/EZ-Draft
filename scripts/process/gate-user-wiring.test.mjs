// EZD-354 G1 (vault/plans/EZD-354.md section 4): in user mode scripts/gate.mjs stops before any check when the preflight or the snapshot fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const realUser = pathToFileURL(path.join(repo, 'scripts/gate-user.mjs')).href;
const secret = ['x', '.env'].join('/');

function fixture(overrides) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ezd354-g1-'));
  mkdirSync(path.join(root, 'scripts/db'), { recursive: true });
  for (const f of ['gate.mjs', 'gate-summary.mjs', 'gate-lock.mjs', 'gate-env.mjs', 'gate-port.mjs', 'excluded-form.mjs']) copyFileSync(path.join(repo, 'scripts', f), path.join(root, 'scripts', f));
  copyFileSync(path.join(repo, 'scripts/db/lane.mjs'), path.join(root, 'scripts/db/lane.mjs'));
  mkdirSync(path.join(root, 'vault/tools'), { recursive: true });
  for (const f of ['security-paths.mjs', 'trusted-git.mjs']) copyFileSync(path.join(repo, 'vault/tools', f), path.join(root, 'vault/tools', f));
  mkdirSync(path.join(root, '.claude/agents'), { recursive: true });
  mkdirSync(path.join(root, 'vault/tickets'), { recursive: true });
  writeFileSync(path.join(root, 'vault/tickets/tickets.json'), JSON.stringify({ tickets: [] })); // gate.mjs reads the phase scope from its own checkout
  const stub = [
    `export * from '${realUser}';`,
    `import { GateUserError, preflightLines } from '${realUser}';`,
    'export const userMode = () => true;',
    overrides,
    '',
  ].join('\n');
  writeFileSync(path.join(root, 'scripts/gate-user.mjs'), stub);
  const dir = path.join(root, 'work');
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { typecheck: 'node -e "require(\'fs\').writeFileSync(\'ran\',\'1\')"' } }));
  const home = path.join(root, 'home');
  const tmp = path.join(root, 'tmp');
  mkdirSync(home);
  mkdirSync(tmp);
  return { root, dir, home, tmp };
}

function runGate(f) {
  const env = { PATH: process.env.PATH, HOME: f.home, LANG: 'en_US.UTF-8', TMPDIR: f.tmp, TMP: f.tmp, TEMP: f.tmp };
  const r = spawnSync(process.execPath, [path.join(f.root, 'scripts/gate.mjs'), f.dir], { encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: r.stdout || '', all: (r.stdout || '') + (r.stderr || '') };
}

test('EZD-354 G1 gate stops before any check', () => {
  const cases = [
    ['a', 'export const runPreflight = () => ({ ok: false, line: preflightLines.F5 });', "GATE FAIL: gate user: ezdraft can read Josh's home folder (docs/runbook.md, Gate user step 1)."],
    ['b', [
      'export const runPreflight = () => ({ ok: true, gateUid: 502 });',
      `export const makeSnapshot = () => { throw Object.assign(new GateUserError('gate user: snapshot refused'), { reason: 'secret_name', path: '${secret}' }); };`,
    ].join('\n'), `GATE FAIL: gate user: the snapshot would copy a secret file: ${secret}.`],
  ];
  for (const [id, overrides, line] of cases) {
    const f = fixture(overrides);
    try {
      const r = runGate(f);
      assert.equal(r.status, 1, `G1 (${id}) exit 1: ${r.all}`);
      assert.ok(r.out.includes(line), `G1 (${id}) stdout has the F-line: ${r.all}`);
      assert.equal(existsSync(path.join(f.dir, 'ran')), false, `G1 (${id}) no check ran`);
      assert.ok(!r.out.includes('=== install') && !r.out.includes('=== typecheck'), `G1 (${id}) no install or typecheck step`);
    } finally {
      rmSync(f.root, { recursive: true, force: true });
    }
  }
});
