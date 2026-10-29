#!/usr/bin/env node
// Runs the launcher and its watchdog as macOS launchd agents (2026-10-23, Josh: the build keeps working all day). A
// launcher in a terminal tab dies with that terminal or with the app that owns it (the Claude app's update restart
// killed it on 2026-10-23 01:52 UTC); a launchd agent does not, and launchd restarts it if it crashes.
//
//   node scripts/launchd/install.mjs install     write both plists to ~/Library/LaunchAgents and load them (starts the build)
//   node scripts/launchd/install.mjs uninstall   unload both and remove the plists (a running unit is killed; prefer STOP first)
//   node scripts/launchd/install.mjs status      loaded, running pid, last exit, log paths
//
// The launcher agent restarts only after a crash or a kill (KeepAlive SuccessfulExit false): when the launcher stops on
// purpose (a repeated failure, a ledger error, a plan limit) it notifies Josh and exits 0, and stays stopped. To pause,
// touch vault/handoff/STOP (the running unit finishes); remove it to resume. The watchdog runs every 5 minutes (EZD-250).
// PATH is the PATH of the shell that ran `install`, so node, pnpm, claude and docker resolve as they do there.
import { writeFileSync, mkdirSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } };
const config = readJson(path.join(root, 'scripts/launcher.config.json'), {});
const logDir = config.log_dir || path.join(os.homedir(), 'Library/Logs/ezdraft');
const agentsDir = path.join(os.homedir(), 'Library/LaunchAgents');
const uid = process.getuid();
const LABELS = { launcher: 'com.ezdraft.launcher', watchdog: 'com.ezdraft.watchdog' };
// Every 5 minutes, so the watchdog's 15-minute idle rule fires by minute 20 (EZD-250 D17).
export const WATCHDOG_INTERVAL_S = 300;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function plist(label, { program, interval, keepAlive, log }) {
  // fnm's per-shell folders (fnm_multishells) vanish with the shell, so the real Node folder goes first instead.
  const dirs = [path.dirname(process.execPath), ...String(process.env.PATH).split(':').filter((d) => d && !/fnm_multishells/.test(d))];
  const env = { PATH: [...new Set(dirs)].join(':'), HOME: os.homedir(), LANG: process.env.LANG || 'en_US.UTF-8' };
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>${program.map((a) => `<string>${esc(a)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${esc(root)}</string>
  <key>EnvironmentVariables</key>
  <dict>${Object.entries(env).map(([k, v]) => `<key>${k}</key><string>${esc(v)}</string>`).join('')}</dict>
  <key>RunAtLoad</key><true/>
${keepAlive ? '  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>\n  <key>ThrottleInterval</key><integer>60</integer>\n' : ''}${interval ? `  <key>StartInterval</key><integer>${interval}</integer>\n` : ''}  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${esc(log)}</string>
  <key>StandardErrorPath</key><string>${esc(log)}</string>
</dict>
</plist>
`;
}

const lc = (...a) => spawnSync('launchctl', a, { encoding: 'utf8' });
const fileOf = (label) => path.join(agentsDir, `${label}.plist`);

function install() {
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  const node = process.execPath;
  const defs = {
    [LABELS.launcher]: { program: [node, path.join(root, 'scripts/run.mjs')], keepAlive: true, log: path.join(logDir, 'launcher.log') },
    [LABELS.watchdog]: { program: [node, path.join(root, 'scripts/watchdog.mjs')], interval: WATCHDOG_INTERVAL_S, log: path.join(logDir, 'watchdog.log') },
  };
  for (const [label, d] of Object.entries(defs)) {
    lc('bootout', `gui/${uid}/${label}`);
    writeFileSync(fileOf(label), plist(label, d));
    const r = lc('bootstrap', `gui/${uid}`, fileOf(label));
    console.log(`${label}: ${r.status === 0 ? 'loaded' : `load failed: ${(r.stderr || r.stdout).trim()}`}`);
  }
  console.log(`logs: ${logDir}`);
}

function uninstall() {
  for (const label of Object.values(LABELS)) {
    lc('bootout', `gui/${uid}/${label}`);
    if (existsSync(fileOf(label))) unlinkSync(fileOf(label));
    console.log(`${label}: removed`);
  }
}

function status() {
  for (const label of Object.values(LABELS)) {
    const r = lc('print', `gui/${uid}/${label}`);
    if (r.status !== 0) { console.log(`${label}: not loaded`); continue; }
    const get = (k) => (r.stdout.match(new RegExp(`^\\s*${k} = (.*)$`, 'm')) || [])[1] || '-';
    console.log(`${label}: ${get('state')} · pid ${get('pid')} · last exit ${get('last exit code')}`);
  }
  console.log(`logs: ${logDir}`);
}

const cmd = process.argv[2];
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') { console.error('launchd agents are macOS only'); process.exit(2); }
  if (cmd === 'install') install();
  else if (cmd === 'uninstall') uninstall();
  else if (cmd === 'status') status();
  else { console.error('usage: node scripts/launchd/install.mjs install|uninstall|status'); process.exit(2); }
}
