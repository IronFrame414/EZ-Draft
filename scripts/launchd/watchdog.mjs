#!/usr/bin/env node
// Loop watchdog entry point (EZD-1968), run every 5 min by the LaunchAgent com.ezdraft.build-watchdog.
// Install: node scripts/launchd/build.mjs install-watchdog. The check itself is scripts/loop/watchdog.mjs.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runWatchdog } from '../loop/watchdog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const launchctl = (args) => spawnSync('launchctl', args, { encoding: 'utf8', timeout: 30000 });
const d = runWatchdog({ buildDir: path.join(root, 'vault/build'), now: Date.now(), launchctl, uid: process.getuid() });
console.log(`[${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}] ${d.restart ? 'restarted' : 'no restart'}: ${d.reason}`);
