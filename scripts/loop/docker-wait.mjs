// EZD-1966 (Josh 2026-11-23, unattended week): a Docker Desktop crash or update must not turn every running ticket red.
// Before its database step, scripts/check.mjs asks Docker with `docker info` (20 s limit). If Docker does not answer it
// starts Docker Desktop once (`open -a Docker`), asks again every 30 s for up to 15 min, and reports how long it waited.
// The commands and times come from the environment so tests use stubs:
//   EZD_DOCKER_CMD       the docker command (default `docker`; `info` is appended)
//   EZD_DOCKER_OPEN_CMD  the opener (default `open`; `-a Docker` is appended)
//   EZD_DOCKER_WAIT_MS, EZD_DOCKER_POLL_MS, EZD_DOCKER_INFO_TIMEOUT_MS  the 15 min wait, 30 s poll and 20 s limit
// Node built-ins only.
import { spawn } from 'node:child_process';

export const DOCKER_INFO_TIMEOUT_MS = 20000;
export const DOCKER_POLL_MS = 30000;
export const DOCKER_WAIT_MS = 15 * 60000;

const num = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d; };

export function dockerConfig(env = process.env) {
  return {
    docker: env.EZD_DOCKER_CMD || 'docker',
    open: env.EZD_DOCKER_OPEN_CMD || 'open',
    infoTimeoutMs: num(env.EZD_DOCKER_INFO_TIMEOUT_MS, DOCKER_INFO_TIMEOUT_MS),
    pollMs: num(env.EZD_DOCKER_POLL_MS, DOCKER_POLL_MS),
    waitMs: num(env.EZD_DOCKER_WAIT_MS, DOCKER_WAIT_MS),
  };
}

// Runs one command with a time limit; resolves true on exit 0. The child gets its own process group, handed to
// `track` so a stopped check kills it (EZD-1965), and is SIGKILLed when it runs past the limit.
function runOnce(cmd, args, { timeoutMs, env, track, untrack }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; clearTimeout(timer); if (p.pid) untrack?.(p.pid); resolve(ok); } };
    const p = spawn(cmd, args, { env, stdio: 'ignore', detached: true });
    if (p.pid) track?.(p.pid);
    const timer = timeoutMs > 0 ? setTimeout(() => { try { process.kill(-p.pid, 'SIGKILL'); } catch {} finish(false); }, timeoutMs) : null;
    p.on('error', () => finish(false));
    p.on('close', (code) => finish(code === 0));
  });
}

// Resolves { ok, started, waitedSecs, line }. `line` is the one line to print (null when Docker answered at once).
export async function waitForDocker({ env = process.env, track, untrack, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const c = dockerConfig(env);
  const info = () => runOnce(c.docker, ['info'], { timeoutMs: c.infoTimeoutMs, env, track, untrack });
  if (await info()) return { ok: true, started: false, waitedSecs: 0, line: null };
  const t0 = Date.now();
  await runOnce(c.open, ['-a', 'Docker'], { timeoutMs: c.infoTimeoutMs, env, track, untrack });
  while (Date.now() - t0 < c.waitMs) {
    await sleep(Math.min(c.pollMs, Math.max(0, c.waitMs - (Date.now() - t0))));
    if (await info()) {
      const waitedSecs = Math.round((Date.now() - t0) / 1000);
      return { ok: true, started: true, waitedSecs, line: `Docker was down; started it and waited ${waitedSecs} s` };
    }
  }
  const waitedSecs = Math.round((Date.now() - t0) / 1000);
  return { ok: false, started: true, waitedSecs,
    line: `DOCKER DOWN: Docker did not answer \`docker info\` after starting Docker Desktop and waiting ${waitedSecs} s` };
}
