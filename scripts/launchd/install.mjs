#!/usr/bin/env node
// Removes the retired launchd agents com.ezdraft.launcher and com.ezdraft.watchdog (they ran scripts/run.mjs and
// scripts/watchdog.mjs, deleted by EZD-1951). The build runs as com.ezdraft.build: scripts/launchd/build.mjs.
//   node scripts/launchd/install.mjs uninstall   unload both retired agents and remove their plists
//   node scripts/launchd/install.mjs status      loaded or not
import { existsSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const agentsDir = path.join(os.homedir(), 'Library/LaunchAgents');
const uid = process.getuid();
const RETIRED = ['com.ezdraft.launcher', 'com.ezdraft.watchdog'];
const lc = (...a) => spawnSync('launchctl', a, { encoding: 'utf8' });
const fileOf = (label) => path.join(agentsDir, `${label}.plist`);

if (process.platform !== 'darwin') { console.error('launchd agents are macOS only'); process.exit(2); }
const cmd = process.argv[2];
if (cmd === 'uninstall') {
  for (const label of RETIRED) {
    lc('bootout', `gui/${uid}/${label}`);
    if (existsSync(fileOf(label))) unlinkSync(fileOf(label));
    console.log(`${label}: removed`);
  }
} else if (cmd === 'status') {
  for (const label of RETIRED) console.log(`${label}: ${lc('print', `gui/${uid}/${label}`).status === 0 ? 'loaded (retired; run uninstall)' : 'not loaded'}`);
} else { console.error('usage: node scripts/launchd/install.mjs uninstall|status'); process.exit(2); }
