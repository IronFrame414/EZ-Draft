#!/usr/bin/env node
// Build v3 (2026-11-13): runs scripts/loop.mjs as the launchd agent com.ezdraft.build, restarted after a crash,
// a reboot or an app update. Replaces com.ezdraft.launcher and com.ezdraft.watchdog (scripts/launchd/install.mjs).
//   node scripts/launchd/build.mjs install | uninstall | status
// EZD-1968: install-watchdog | uninstall-watchdog manage com.ezdraft.build-watchdog, which runs scripts/launchd/watchdog.mjs
// every 5 min and restarts com.ezdraft.build when the loop hangs (scripts/loop/watchdog.mjs). Josh installs it.
// Pause without uninstalling: touch vault/build/STOP (the current ticket finishes first).
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plist } from './install.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LABEL = 'com.ezdraft.build';
const agents = path.join(os.homedir(), 'Library/LaunchAgents');
const logDir = path.join(os.homedir(), 'Library/Logs/ezdraft');
const file = path.join(agents, `${LABEL}.plist`);
const uid = process.getuid();
const lc = (...a) => spawnSync('launchctl', a, { encoding: 'utf8' });
const W_LABEL = 'com.ezdraft.build-watchdog';
const wFile = path.join(agents, `${W_LABEL}.plist`);
const show = (label) => {
  const r = lc('print', `gui/${uid}/${label}`);
  if (r.status !== 0) return `${label}: not loaded`;
  const g = (k) => (r.stdout.match(new RegExp(`^\\s*${k} = (.*)$`, 'm')) || [])[1] || '-';
  return `${label}: ${g('state')} · pid ${g('pid')} · last exit ${g('last exit code')}`;
};
// Right after a bootout, launchd can still be tearing the old job down and answers "5: Input/output error";
// a retry a few seconds later loads it (seen on every restart, 2026-11-16).
const load = (plistFile) => {
  let r = lc('bootstrap', `gui/${uid}`, plistFile);
  for (let i = 0; r.status !== 0 && i < 5; i++) { spawnSync('sleep', ['3']); r = lc('bootstrap', `gui/${uid}`, plistFile); }
  return r;
};

const cmd = process.argv[2];
if (cmd === 'install') {
  mkdirSync(agents, { recursive: true }); mkdirSync(logDir, { recursive: true });
  lc('bootout', `gui/${uid}/${LABEL}`);
  writeFileSync(file, plist(LABEL, { program: [process.execPath, path.join(root, 'scripts/loop.mjs')], keepAlive: true, log: path.join(logDir, 'build.log') }));
  const r = load(file);
  console.log(`${LABEL}: ${r.status === 0 ? 'loaded' : `load failed: ${(r.stderr || r.stdout).trim()}`}`);
} else if (cmd === 'uninstall') {
  lc('bootout', `gui/${uid}/${LABEL}`);
  if (existsSync(file)) unlinkSync(file);
  console.log(`${LABEL}: removed`);
} else if (cmd === 'install-watchdog') {
  mkdirSync(agents, { recursive: true }); mkdirSync(logDir, { recursive: true });
  lc('bootout', `gui/${uid}/${W_LABEL}`);
  writeFileSync(wFile, plist(W_LABEL, { program: [process.execPath, path.join(root, 'scripts/launchd/watchdog.mjs')], interval: 300, log: path.join(logDir, 'watchdog.log') }));
  const r = load(wFile);
  console.log(`${W_LABEL}: ${r.status === 0 ? 'loaded (checks the loop every 5 min)' : `load failed: ${(r.stderr || r.stdout).trim()}`}`);
} else if (cmd === 'uninstall-watchdog') {
  lc('bootout', `gui/${uid}/${W_LABEL}`);
  if (existsSync(wFile)) unlinkSync(wFile);
  console.log(`${W_LABEL}: removed`);
} else if (cmd === 'status') {
  console.log(show(LABEL));
  console.log(show(W_LABEL));
  console.log(`log: ${path.join(logDir, 'build.log')} · watchdog log: ${path.join(logDir, 'watchdog.log')} · loop log: vault/build/loop.log`);
} else { console.error('usage: node scripts/launchd/build.mjs install|uninstall|install-watchdog|uninstall-watchdog|status'); process.exit(2); }
