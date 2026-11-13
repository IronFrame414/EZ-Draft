#!/usr/bin/env node
// Build v3 (2026-11-13): runs scripts/loop.mjs as the launchd agent com.ezdraft.build, restarted after a crash,
// a reboot or an app update. Replaces com.ezdraft.launcher and com.ezdraft.watchdog (scripts/launchd/install.mjs).
//   node scripts/launchd/build.mjs install | uninstall | status
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

const cmd = process.argv[2];
if (cmd === 'install') {
  mkdirSync(agents, { recursive: true }); mkdirSync(logDir, { recursive: true });
  lc('bootout', `gui/${uid}/${LABEL}`);
  writeFileSync(file, plist(LABEL, { program: [process.execPath, path.join(root, 'scripts/loop.mjs')], keepAlive: true, log: path.join(logDir, 'build.log') }));
  const r = lc('bootstrap', `gui/${uid}`, file);
  console.log(`${LABEL}: ${r.status === 0 ? 'loaded' : `load failed: ${(r.stderr || r.stdout).trim()}`}`);
} else if (cmd === 'uninstall') {
  lc('bootout', `gui/${uid}/${LABEL}`);
  if (existsSync(file)) unlinkSync(file);
  console.log(`${LABEL}: removed`);
} else if (cmd === 'status') {
  const r = lc('print', `gui/${uid}/${LABEL}`);
  if (r.status !== 0) console.log(`${LABEL}: not loaded`);
  else { const g = (k) => (r.stdout.match(new RegExp(`^\\s*${k} = (.*)$`, 'm')) || [])[1] || '-'; console.log(`${LABEL}: ${g('state')} · pid ${g('pid')} · last exit ${g('last exit code')}`); }
  console.log(`log: ${path.join(logDir, 'build.log')} · loop log: vault/build/loop.log`);
} else { console.error('usage: node scripts/launchd/build.mjs install|uninstall|status'); process.exit(2); }
