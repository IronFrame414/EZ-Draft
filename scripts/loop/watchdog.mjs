// Loop watchdog (EZD-1968, Josh 2026-11-23): launchd restarts the loop when it crashes, but not when it hangs. A hung
// process cannot watch itself, so a separate LaunchAgent (com.ezdraft.build-watchdog, every 5 min, entry point
// scripts/launchd/watchdog.mjs) runs this check. It reads files and calls launchctl only; it never edits state.json or git.
//   - heartbeat.jsonl's last beat older than 15 min, or no loop.log line for 6 h  → kickstart -k com.ezdraft.build
//   - at most one restart an hour (the last "WATCHDOG restarted the loop" line in loop.log is the record)
//   - nothing while vault/build/STOP exists, nothing when com.ezdraft.build is not loaded (Josh uninstalled it)
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { lastBeat } from './heartbeat.mjs';

export const LABEL = 'com.ezdraft.build';
export const WATCHDOG_LABEL = 'com.ezdraft.build-watchdog';
export const INTERVAL_S = 300;
export const BEAT_STALE_MS = 15 * 60000;
export const LOG_QUIET_MS = 6 * 3600000;
export const RESTART_EVERY_MS = 3600000;
export const MARK = 'WATCHDOG restarted the loop:';

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const mins = (ms) => Math.round(ms / 60000);

// loop.log lines are `[2026-11-24T02:51:22Z] message` (scripts/loop.mjs log()).
// Returns the time of the last line the loop itself wrote (watchdog lines skipped) and of the last watchdog restart.
export function readLoopLog(text) {
  let lastLine = null;
  let lastRestart = null;
  for (const line of String(text || '').split('\n')) {
    const m = /^\[(\d{4}-\d\d-\d\dT[\d:.]+Z)\] (.*)$/.exec(line);
    if (!m) continue;
    const t = Date.parse(m[1]);
    if (Number.isNaN(t)) continue;
    if (m[2].startsWith(MARK)) lastRestart = t;
    else lastLine = t;
  }
  return { lastLine, lastRestart };
}

// Pure decision. Times are epoch ms; null means the file or line is missing.
export function decide({ now, beatTs, lastLogTs, lastRestartTs, stop, loaded }) {
  if (stop) return { restart: false, reason: 'STOP file present' };
  if (!loaded) return { restart: false, reason: `${LABEL} is not loaded` };
  let why = null;
  if (beatTs == null) why = 'no heartbeat found';
  else if (now - beatTs > BEAT_STALE_MS) why = `last heartbeat ${iso(beatTs)} is ${mins(now - beatTs)} min old`;
  else if (lastLogTs != null && now - lastLogTs > LOG_QUIET_MS) why = `no new loop.log line since ${iso(lastLogTs)} (${((now - lastLogTs) / 3600000).toFixed(1)} h)`;
  if (!why) return { restart: false, reason: 'loop is making progress' };
  if (lastRestartTs != null && now - lastRestartTs < RESTART_EVERY_MS) {
    return { restart: false, reason: `${why}; already restarted at ${iso(lastRestartTs)} (at most once an hour)` };
  }
  return { restart: true, reason: why };
}

// One watchdog pass. `launchctl(args)` returns { status, stdout, stderr }; `now` is epoch ms.
export function runWatchdog({ buildDir, now, launchctl, uid }) {
  const P = { heartbeat: path.join(buildDir, 'heartbeat.jsonl'), log: path.join(buildDir, 'loop.log'), stop: path.join(buildDir, 'STOP') };
  const stop = existsSync(P.stop);
  const target = `gui/${uid}/${LABEL}`;
  const loaded = stop ? true : launchctl(['print', target]).status === 0;
  const beat = lastBeat(P.heartbeat);
  const beatTs = beat?.ts ? Date.parse(beat.ts) : null;
  const { lastLine, lastRestart } = readLoopLog(existsSync(P.log) ? readFileSync(P.log, 'utf8') : '');
  const d = decide({ now, beatTs: Number.isNaN(beatTs) ? null : beatTs, lastLogTs: lastLine, lastRestartTs: lastRestart, stop, loaded });
  if (!d.restart) return d;
  const r = launchctl(['kickstart', '-k', target]);
  const failed = r.status !== 0 ? ` (kickstart failed: ${String(r.stderr || r.stdout || '').trim() || `exit ${r.status}`})` : '';
  appendFileSync(P.log, `[${iso(now)}] ${MARK} ${d.reason}${failed}\n`);
  return { ...d, kickstart: r.status };
}
