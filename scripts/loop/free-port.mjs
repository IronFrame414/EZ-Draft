// EZD-1970 (overwatch 2026-11-24): an orphaned `pnpm start -p 3010` held lane 1's web port for 3 h after its check was
// stopped, and Playwright's reuseExistingServer made every later lane-1 e2e run test that stale build. Before its e2e
// step, scripts/check.mjs frees this lane's web port (3000 + 10 x lane, laneAppPorts in scripts/db/lane.mjs): each
// process listening on it has its whole process group sent SIGTERM, then SIGKILL 10 s later, and the port is watched
// until it is free (up to 30 s). One line per process: "freed port <port>: stale server pid <pid>". Nothing listening:
// no line, no wait. Still taken after the wait: the check fails with "PORT BUSY: ...".
// Playwright starts its web server in its own process group, so the check's step-group kill (EZD-1965) does not reach
// it; listenerGroups() gives check.mjs those groups to kill when it ends.
// The commands and times come from the environment so tests use stubs:
//   EZD_PORT_LSOF_CMD       the lookup command (default `lsof`; `-nP -iTCP:<port> -sTCP:LISTEN -t` is appended)
//   EZD_PORT_KILL_GRACE_MS  the 10 s between SIGTERM and SIGKILL
//   EZD_PORT_FREE_WAIT_MS   the 30 s wait for the port to be free
//   EZD_CHECK_WEB_PORT      the port itself (tests only; default the lane's web port)
// Node built-ins only.
import { spawn, spawnSync } from 'node:child_process';
import { laneAppPorts } from '../db/lane.mjs';
import { sendSignal } from './signal-log.mjs';

export const PORT_KILL_GRACE_MS = 10000;
export const PORT_FREE_WAIT_MS = 30000;
const POLL_MS = 200;

const num = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d; };

export function portConfig(env = process.env, lane = env.EZD_LANE ?? '0') {
  const own = Number(env.EZD_CHECK_WEB_PORT);
  return {
    port: Number.isInteger(own) && own > 0 ? own : laneAppPorts(Number(lane) || 0).web,
    lsof: env.EZD_PORT_LSOF_CMD || 'lsof',
    graceMs: num(env.EZD_PORT_KILL_GRACE_MS, PORT_KILL_GRACE_MS),
    waitMs: num(env.EZD_PORT_FREE_WAIT_MS, PORT_FREE_WAIT_MS),
  };
}

const lsofArgs = (port) => ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'];
const pidsFrom = (text) => [...new Set(String(text ?? '').split('\n').map((l) => Number(l.trim())).filter((n) => Number.isInteger(n) && n > 1))];

// The pids listening on the port, async. A missing lsof or an empty answer (lsof exits 1) means none.
export function listeners(cfg) {
  return new Promise((resolve) => {
    let out = '';
    let p;
    try { p = spawn(cfg.lsof, lsofArgs(cfg.port), { stdio: ['ignore', 'pipe', 'ignore'] }); } catch { resolve([]); return; }
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve([]));
    p.on('close', () => resolve(pidsFrom(out)));
  });
}

// The same, sync, for the exit handler.
export function listenersSync(cfg) {
  try {
    const r = spawnSync(cfg.lsof, lsofArgs(cfg.port), { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' });
    return pidsFrom(r.stdout);
  } catch { return []; }
}

function pgidOf(pid) {
  try {
    const r = spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000 });
    const g = Number(String(r.stdout).trim());
    return Number.isInteger(g) && g > 1 ? g : 0;
  } catch { return 0; }
}
let ownPgid;
const selfPgid = () => (ownPgid ??= pgidOf(process.pid));

// What to signal for a listener: its process group as a negative number, or the pid alone when its group is unknown
// or is this process's own group (never signal ourselves).
export function killTarget(pid) {
  const g = pgidOf(pid);
  return g && g !== selfPgid() ? -g : pid;
}
// The process groups (positive ids) of the port's listeners, for check.mjs's step-group kill at exit.
export function listenerGroups(cfg) {
  return [...new Set(listenersSync(cfg).map(killTarget).filter((t) => t < 0).map((t) => -t))];
}

// EZD-1988: recorded in the shared signal record before it is sent.
const signal = (t, sig) => { sendSignal(t, sig, 'check port free (scripts/loop/free-port.mjs)'); };
const alive = (t) => { try { process.kill(t, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Frees the port. Resolves { ok, port, freed: [pid], busy: [pid], lines: [text] }; each line is printed by log.
export async function freePort(cfg, log = console.log) {
  const found = await listeners(cfg);
  const res = { ok: true, port: cfg.port, freed: [], busy: [], lines: [] };
  if (!found.length) return res;
  const targets = found.map(killTarget);
  for (const t of targets) signal(t, 'SIGTERM');
  const start = Date.now();
  let killed = false;
  let left = found;
  for (;;) {
    if (!killed && Date.now() - start >= cfg.graceMs) {
      for (const t of targets) if (alive(t)) signal(t, 'SIGKILL');
      killed = true;
    }
    left = await listeners(cfg);
    if (!left.length || Date.now() - start >= cfg.waitMs) break;
    await sleep(POLL_MS);
  }
  res.freed = found.filter((p) => !left.includes(p));
  res.busy = left;
  for (const p of res.freed) res.lines.push(`freed port ${cfg.port}: stale server pid ${p}`);
  if (left.length) {
    res.ok = false;
    res.lines.push(`PORT BUSY: port ${cfg.port} still taken by pid ${left.join(', ')} after ${Math.round(cfg.waitMs / 1000)} s; e2e not run`);
  }
  for (const l of res.lines) log(l);
  return res;
}
