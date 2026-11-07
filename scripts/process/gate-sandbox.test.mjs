// D-008 (2026-11-02): scripts/gate.mjs stops with GATE SANDBOX STOP before any check when it cannot write .claude/agents
// (the unit sandbox), and runs on when it can. Each test copies gate.mjs, gate-summary.mjs, gate-lock.mjs and gate-env.mjs into a throwaway root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, chmodSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ezd-gate-sandbox-'));
  mkdirSync(path.join(root, 'scripts'));
  for (const f of ['gate.mjs', 'gate-summary.mjs', 'gate-lock.mjs', 'gate-env.mjs', 'gate-user.mjs', 'excluded-form.mjs']) copyFileSync(path.join(here, '..', f), path.join(root, 'scripts', f));
  mkdirSync(path.join(root, 'scripts/db'));
  copyFileSync(path.join(here, '..', 'db/lane.mjs'), path.join(root, 'scripts/db/lane.mjs'));
  mkdirSync(path.join(root, 'vault/tools'), { recursive: true });
  copyFileSync(path.join(here, '../..', 'vault/tools/security-paths.mjs'), path.join(root, 'vault/tools/security-paths.mjs'));
  copyFileSync(path.join(here, '../..', 'vault/tools/trusted-git.mjs'), path.join(root, 'vault/tools/trusted-git.mjs')); // EZD-345 D16: gate.mjs and security-paths.mjs import it
  mkdirSync(path.join(root, '.claude/agents'), { recursive: true });
  const dir = path.join(root, 'work');
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'package.json'), '{"name":"x","scripts":{}}');
  return { root, dir };
}
const gate = (f) => spawnSync(process.execPath, [path.join(f.root, 'scripts/gate.mjs'), f.dir, '--print-scope'], { encoding: 'utf8', env: { ...process.env, EZD_GATE_AS_SELF: '1' } }); // EZD-354 D4

test('D-008 the gate stops with GATE SANDBOX STOP and the exact command when .claude/agents is not writable', { skip: process.getuid?.() === 0 }, () => {
  const f = fixture();
  chmodSync(path.join(f.root, '.claude/agents'), 0o555);
  try {
    const r = gate(f);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.match(r.stdout, /^GATE SANDBOX STOP: .*`node scripts\/gate\.mjs .* --print-scope` again as its own Bash call/m);
  } finally {
    chmodSync(path.join(f.root, '.claude/agents'), 0o755);
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('D-008 the gate runs on and leaves no probe file when .claude/agents is writable', () => {
  const f = fixture();
  const r = gate(f);
  assert.doesNotMatch(r.stdout, /GATE SANDBOX STOP/);
  assert.deepEqual(readdirSync(path.join(f.root, '.claude/agents')), []);
  rmSync(f.root, { recursive: true, force: true });
});

function stopWith(content) {
  const f = fixture();
  writeFileSync(path.join(f.root, 'scripts/unit-sandbox.json'), content);
  chmodSync(path.join(f.root, '.claude/agents'), 0o555);
  try {
    return { f, r: gate(f) };
  } finally {
    chmodSync(path.join(f.root, '.claude/agents'), 0o755);
  }
}

test('EZD-317 T5a the GATE SANDBOX STOP names the excluded command from unit-sandbox.json', { skip: process.getuid?.() === 0 }, () => {
  const { f, r } = stopWith('{"sandbox":{"excludedCommands":["node /fx/scripts/gate.mjs *"]}}');
  try {
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(`\`node /fx/scripts/gate.mjs ${f.dir} --print-scope\` again as its own Bash call`), r.stdout);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('EZD-317 T5d an unreadable unit-sandbox.json keeps the relative gate command', { skip: process.getuid?.() === 0 }, () => {
  const { f, r } = stopWith('{');
  try {
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.ok(r.stdout.includes(`\`node scripts/gate.mjs ${f.dir} --print-scope\``), r.stdout);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
