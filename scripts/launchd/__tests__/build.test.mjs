// AC-EZD-1951-1 and -3: the build agents' plists point at files that exist, and no plist written from scripts/launchd
// runs the retired launcher. Reads the source and the side-effect-free plist.mjs only; never calls launchctl.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { BUILD_LABEL, WATCHDOG_LABEL, plist, program, root } from '../plist.mjs';

const RETIRED = ['scripts/run.mjs', 'scripts/unit-steps.mjs', 'scripts/watchdog.mjs', 'scripts/gate.mjs', 'scripts/launcher-idle.mjs'];

test('AC-EZD-1951-3: com.ezdraft.build runs scripts/loop.mjs, which exists', () => {
  assert.equal(BUILD_LABEL, 'com.ezdraft.build');
  const [node, script] = program(BUILD_LABEL);
  assert.equal(node, process.execPath);
  assert.equal(script, path.join(root, 'scripts/loop.mjs'));
  assert.ok(existsSync(script), script);
  const text = plist(BUILD_LABEL, { program: program(BUILD_LABEL), keepAlive: true, log: '/tmp/build.log' });
  assert.ok(text.includes(`<string>${script}</string>`), text);
  assert.ok(text.includes('<key>Label</key><string>com.ezdraft.build</string>'), text);
});

test('AC-EZD-1951-3: com.ezdraft.build-watchdog runs scripts/launchd/watchdog.mjs, which exists', () => {
  const [, script] = program(WATCHDOG_LABEL);
  assert.equal(script, path.join(root, 'scripts/launchd/watchdog.mjs'));
  assert.ok(existsSync(script), script);
});

test('AC-EZD-1951-3: build.mjs writes both plists from plist.mjs programs', () => {
  const src = readFileSync(path.join(root, 'scripts/launchd/build.mjs'), 'utf8');
  assert.match(src, /from '\.\/plist\.mjs'/);
  assert.match(src, /plist\(LABEL, \{ program: program\(LABEL\)/);
  assert.match(src, /plist\(W_LABEL, \{ program: program\(W_LABEL\)/);
});

test('AC-EZD-1951-1: the retired files are gone and no scripts/launchd file runs them', () => {
  for (const f of RETIRED) assert.equal(existsSync(path.join(root, f)), false, `${f} still exists`);
  assert.equal(existsSync(path.join(root, 'scripts/launcher')), false, 'scripts/launcher/ still exists');
  assert.equal(existsSync(path.join(root, 'scripts/ledger')), false, 'scripts/ledger/ still exists');
  const dir = path.join(root, 'scripts/launchd');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
    const src = readFileSync(path.join(dir, f), 'utf8');
    for (const r of RETIRED) assert.ok(!src.includes(`'${r}'`), `${f} names ${r}`);
  }
});
