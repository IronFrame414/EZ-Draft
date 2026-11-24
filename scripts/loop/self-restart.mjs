// Self-restart (EZD-1967, Josh 2026-11-23): the running loop keeps the code it started with, and agents cannot restart
// com.ezdraft.build. So after the loop merges a commit that changes its own code (scripts/loop.mjs or scripts/loop/,
// tests under __tests__ excluded), it starts no new ticket, lets running tickets finish (the same drain as the STOP
// file), dry-runs the new code with `node scripts/loop.mjs --plan 1` from the main checkout (2 min limit), and exits
// with code 75. launchd's KeepAlive {SuccessfulExit: false} relaunches any non-zero exit; exit 0 would leave it down.
// A failed dry run logs LOOP CHANGE NOT LOADED and the loop keeps building on its running code until the next loop merge.
import { spawnSync as realSpawnSync } from 'node:child_process';

export const RESTART_EXIT = 75;
export const DRY_RUN_TIMEOUT_MS = 2 * 60000;
export const DRY_RUN_ARGS = ['scripts/loop.mjs', '--plan', '1'];

export function isLoopFile(p) {
  const f = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (f.split('/').includes('__tests__')) return false;
  return f === 'scripts/loop.mjs' || f.startsWith('scripts/loop/');
}
export const touchesLoop = (files) => (files || []).some(isLoopFile);

// Files a commit changed. `git(args)` returns { ok, out } (scripts/loop.mjs git()).
export function changedFiles(sha, git) {
  const r = git(['diff-tree', '--no-commit-id', '--name-only', '-r', sha]);
  return r.ok ? r.out.split('\n').map((l) => l.trim()).filter(Boolean) : [];
}

// The line that names the error: Node prints a `file:///…:12` location line and the source line before
// "SyntaxError: …", so the first line that mentions an error wins, else the first non-empty line.
export function firstErrorLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => /error/i.test(l)) || lines[0] || '';
}

export function runDryRun({ cwd, spawnSync = realSpawnSync, node = process.execPath, timeoutMs = DRY_RUN_TIMEOUT_MS }) {
  const r = spawnSync(node, DRY_RUN_ARGS, { cwd, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] });
  const timedOut = r.error?.code === 'ETIMEDOUT' || (r.signal && r.status == null);
  if (timedOut) return { ok: false, error: `dry run timed out after ${Math.round(timeoutMs / 60000)} min` };
  if (r.error) return { ok: false, error: `dry run could not start: ${r.error.message}` };
  if (r.status !== 0) return { ok: false, error: firstErrorLine(r.stderr) || firstErrorLine(r.stdout) || `dry run exited with code ${r.status}` };
  return { ok: true };
}

// One per loop process. `pending` is the short sha of the newest merged loop change not yet loaded.
export function createSelfRestart({ log, exit, dryRun }) {
  let pending = null;
  return {
    onMerge(sha, files) {
      if (!touchesLoop(files)) return false;
      pending = sha;
      return true;
    },
    draining: () => pending != null,
    pending: () => pending,
    // Called by the loop's drain branch on every pass. Does nothing while tickets are running.
    tryRestart(active) {
      if (pending == null || active > 0) return 'waiting';
      const sha = pending;
      const r = dryRun();
      if (r.ok) {
        log(`RESTARTING for loop change ${sha}`);
        exit(RESTART_EXIT);
        return 'restarting';
      }
      log(`LOOP CHANGE NOT LOADED: ${r.error}`);
      pending = null;
      return 'not-loaded';
    },
  };
}
