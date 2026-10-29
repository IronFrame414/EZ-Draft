#!/usr/bin/env node
// Watchdog for the launcher (2026-10-23, Josh: the build keeps working all day). launchd runs it every 5 minutes (EZD-250)
// (scripts/launchd/install.mjs). It needs no model to check: it reads processes and file times. Only when it alerts does
// it ask Haiku 5.5 for one plain sentence about the launcher log; if that fails the alert carries the last log line.
//
//   node scripts/watchdog.mjs           one check: notify through notify_cmd and restart the launcher service when it is down
//   node scripts/watchdog.mjs --check   print the state; notify nothing, restart nothing
//
// It stays quiet while vault/handoff/STOP, BUDGET_HOLD.md or WINDOW_PAUSE.md exists, while the launcher says it is
// waiting (on Josh, a pause or a limit), and after a stop the launcher already notified about. The same alert is sent
// at most once every 3 hours. Config: scripts/launcher.config.json (notify_cmd, claude_bin, log_dir), as run.mjs.
// EZD-250 D16: it also alerts when the launcher has been idle 15 minutes while a unit is ready, or after a failed repair,
// from <log_dir>/launcher-state.json (written by run.mjs) and the ledger tool's --next-unit.
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STALL_MIN = 45; // a unit with no transcript or log write for this long is stuck
export const IDLE_MIN = 30; // a launcher with no unit and no waiting reason for this long is stuck
export const REPEAT_MS = 3 * 60 * 60 * 1000;
export const READY_IDLE_MIN = 15; // idle this long with a ready unit, or after a failed repair, alerts (EZD-250 D16)
const WAITING_RE = /waiting|none:|paused|retrying|until |budget hold|resuming|STOP exists/i;
// The launcher's idle poll (scripts/launcher-idle.mjs), so a fresh poll that found nothing is not called idle. Loaded
// without failing when the watchdog runs as a lone copy (EZD-178); then every ready idle counts.
const NONE_POLL_MS = await import('./launcher-idle.mjs').then((m) => m.NONE_POLL_MS, () => null);
const minutesSince = (iso, now) => {
  const t = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? null : (now - t) / 60000;
};

// Pure decision, tested in scripts/process/watchdog.test.mjs.
export function decide({ pause, launcherRunning, unitRunning, idleMin, logTail, readyUnit = null, launcherState = null, now = Date.now() }) {
  const lines = logTail.split('\n').map((l) => l.trim()).filter(Boolean);
  const lastLine = lines.at(-1) || '';
  if (pause) return { status: 'paused', why: pause };
  if (!launcherRunning) {
    // A clean stop the launcher already told Josh about (it notifies, then exits 0; launchd does not restart it).
    if (lines.slice(-3).some((l) => /NOTIFY: /.test(l))) return { status: 'stopped', why: 'launcher stopped and already notified' };
    return { status: 'down', alert: 'the launcher is not running', key: 'down', restart: true };
  }
  if (unitRunning && idleMin >= STALL_MIN) return { status: 'stalled', alert: `no activity for ${Math.round(idleMin)} minutes while a unit is running`, key: 'stalled' };
  const st = launcherState && typeof launcherState === 'object' ? launcherState : {};
  const idle = minutesSince(st.at, now) ?? idleMin;
  if (!unitRunning && st.state === 'repair-failed' && idle >= READY_IDLE_MIN)
    return { status: 'repair-failed', alert: `a repair failed and the launcher has been idle for ${Math.round(idle)} minutes`, key: 'repair-failed' };
  const limitWait = st.state === 'limit-wait' && typeof st.until === 'string' && Date.parse(st.until) > now;
  const polled = minutesSince(st.polledAt, now);
  const freshNone = NONE_POLL_MS !== null && polled !== null && polled <= NONE_POLL_MS / 60000 + 1 && typeof st.next === 'string' && st.next.startsWith('none:');
  if (!unitRunning && readyUnit && idle >= READY_IDLE_MIN && !limitWait && !freshNone)
    return { status: 'idle-ready', alert: `the launcher has been idle for ${Math.round(idle)} minutes while ${readyUnit} is ready`, key: 'idle-ready' };
  if (!unitRunning && idleMin >= IDLE_MIN && !WAITING_RE.test(lastLine)) return { status: 'idle', alert: `the launcher has started nothing for ${Math.round(idleMin)} minutes`, key: 'idle' };
  return { status: 'ok' };
}

export function shouldSend(state, key, now) {
  return !(state && state.key === key && now - state.at < REPEAT_MS);
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const readJson = (p, fb) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fb; } };
  const config = readJson(path.join(root, 'scripts/launcher.config.json'), {});
  const logDir = config.log_dir || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Logs/ezdraft') : path.join(root, '.launcher'));
  mkdirSync(logDir, { recursive: true });
  const launcherLog = path.join(logDir, 'launcher.log');
  const statePath = path.join(logDir, 'watchdog-state.json');
  const checkOnly = process.argv.includes('--check');
  const now = Date.now();

  const handoff = path.join(root, 'vault/handoff');
  const pause = ['STOP', 'BUDGET_HOLD.md', 'WINDOW_PAUSE.md'].find((f) => existsSync(path.join(handoff, f))) || null;
  const ps = spawnSync('ps', ['-axo', 'command'], { encoding: 'utf8' }).stdout || '';
  const procs = ps.split('\n');
  const launcherRunning = procs.some((l) => /node\S* .*scripts\/run\.mjs/.test(l) && !/--(status|dry-run)/.test(l));
  const unitRunning = procs.some((l) => /claude -p \//.test(l));

  // Last activity: the launcher log, and every transcript in this project's Claude Code folder (sessions and their
  // subagents write to them continuously while they work).
  let last = existsSync(launcherLog) ? statSync(launcherLog).mtimeMs : 0;
  const projects = path.join(os.homedir(), '.claude/projects', root.replace(/[^A-Za-z0-9]/g, '-'));
  const walk = (dir, depth) => {
    let names = [];
    try { names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      const p = path.join(dir, n);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { if (depth < 2) walk(p, depth + 1); } else if (n.endsWith('.jsonl') && st.mtimeMs > last) last = st.mtimeMs;
    }
  };
  walk(projects, 0);
  const idleMin = last ? (now - last) / 60000 : Infinity;
  const logTail = existsSync(launcherLog) ? readFileSync(launcherLog, 'utf8').split('\n').slice(-60).join('\n') : '';

  // EZD-250 D16: the ready unit (null when nothing can run or the ledger tool fails) and the launcher's own state.
  const nu = spawnSync(process.execPath, [path.join(root, 'vault/tools/next_ticket.mjs'), '--next-unit'], { cwd: root, encoding: 'utf8' });
  const nextText = nu.status === 0 ? (nu.stdout || '').trim() : '';
  const readyUnit = nextText && !nextText.startsWith('none:') ? nextText : null;
  const launcherState = readJson(path.join(logDir, 'launcher-state.json'), null);

  const d = decide({ pause, launcherRunning, unitRunning, idleMin, logTail, readyUnit, launcherState, now });
  const line = `${new Date(now).toISOString()} ${d.status}${d.why ? ` (${d.why})` : ''}${d.alert ? `: ${d.alert}` : ''} · launcher ${launcherRunning ? 'up' : 'down'} · unit ${unitRunning ? 'running' : 'none'} · idle ${Number.isFinite(idleMin) ? Math.round(idleMin) : '?'} min`;
  console.log(line);
  if (checkOnly || !d.alert) return;

  const state = readJson(statePath, null);
  if (!shouldSend(state, d.key, now)) return;
  let restarted = '';
  if (d.restart && process.platform === 'darwin') {
    const uid = process.getuid();
    const loaded = spawnSync('launchctl', ['print', `gui/${uid}/com.ezdraft.launcher`], { encoding: 'utf8' }).status === 0;
    if (loaded) restarted = spawnSync('launchctl', ['kickstart', `gui/${uid}/com.ezdraft.launcher`], { encoding: 'utf8' }).status === 0 ? ' Restarted it.' : ' Restart failed.';
    else restarted = ' The launcher service is not installed (node scripts/launchd/install.mjs install).';
  }
  // One plain sentence from Haiku about the log; it runs outside the repo so no project hooks or CLAUDE.md load.
  let summary = '';
  if (logTail) {
    const prompt = `In one plain sentence for a non-programmer, say what this build launcher log shows happened last or where it got stuck. No preamble.\n\n${logTail.slice(-6000)}`;
    const r = spawnSync(config.claude_bin || 'claude', ['-p', prompt, '--model', 'claude-haiku-5-5', '--output-format', 'text', '--max-budget-usd', '0.05'], { cwd: logDir, encoding: 'utf8', timeout: 120000 });
    summary = r.status === 0 ? (r.stdout || '').trim().split('\n')[0].slice(0, 300) : '';
  }
  if (!summary) summary = `Last log line: ${logTail.split('\n').filter(Boolean).at(-1)?.slice(0, 200) || '(no launcher log)'}`;
  const msg = `EZ Draft watchdog: ${d.alert}.${restarted} ${summary}`;
  if (config.notify_cmd) {
    const r = spawnSync('/bin/sh', ['-c', config.notify_cmd], { env: { ...process.env, MSG: msg }, encoding: 'utf8', timeout: 20000 });
    if (r.status !== 0) console.log(`notify failed: ${(r.stderr || '').trim()}`);
  } else console.log('notify_cmd not set; alert only logged');
  console.log(msg);
  writeFileSync(statePath, JSON.stringify({ key: d.key, at: now }) + '\n');
  appendFileSync(path.join(logDir, 'watchdog-alerts.log'), `${new Date(now).toISOString()} ${msg}\n`);
}

const isMain = (() => { try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) main();
