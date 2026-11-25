// The loop's gate run (EZD-1943, audit 2026-11-23 W6). The check timer ends a check that runs past its limit: SIGTERM,
// then SIGKILL 10 s later if it is still running, the same as the claude timer in scripts/loop.mjs. A killed check's
// children (an e2e server, vitest) can keep its output pipes open, so after a kill the run ends on the process exit
// instead of waiting for the pipes to close.
import { spawn } from 'node:child_process';
import { noteSignal } from './signal-log.mjs';

export const KILL_GRACE_MS = 10000;

// EZD-1988: each signal is recorded (scripts/loop/signal-log.mjs) before it is sent; an ended check is not signalled.
function send(p, signal) {
  if (p.exitCode !== null || p.signalCode !== null) return;
  noteSignal({ by: 'loop check timer (scripts/loop/check-run.mjs)', target: p.pid, signal });
  p.kill(signal);
}

// SIGTERM after ms, SIGKILL graceMs later if the child has not exited. Both timers stop when the child exits.
export function killAfter(p, ms, graceMs = KILL_GRACE_MS) {
  let kill = null;
  let fired = false;
  const term = setTimeout(() => {
    fired = true;
    send(p, 'SIGTERM');
    kill = setTimeout(() => send(p, 'SIGKILL'), graceMs);
  }, ms);
  const stop = () => { clearTimeout(term); clearTimeout(kill); };
  p.once('exit', stop);
  return { stop, fired: () => fired };
}

// Runs cmd and resolves { code, signal, out, timedOut } once, with stdout and stderr joined.
export function runCheck({ cmd, args, cwd, env, timeoutMs, graceMs = KILL_GRACE_MS, pipeWaitMs = 2000 }) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let settled = false;
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    const timer = killAfter(p, timeoutMs, graceMs);
    const done = (code, signal) => {
      if (settled) return;
      settled = true;
      timer.stop();
      resolve({ code, signal, out, timedOut: timer.fired() });
    };
    p.on('close', done);
    p.on('exit', (code, signal) => {
      if (!timer.fired()) return;
      setTimeout(() => { p.stdout.destroy(); p.stderr.destroy(); done(code, signal); }, pipeWaitMs).unref();
    });
    p.on('error', (e) => { out += String(e); done(1, null); });
  });
}
