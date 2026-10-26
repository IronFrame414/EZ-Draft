// EZD-166 (vault/plans/EZD-166.md sections 1 and 3): restart the local Supabase stack when its Auth
// config or templates changed. Node 22 built-ins only. Auth reads supabase/config.toml and the templates
// only at `supabase start`, so a changed file needs stop then start before the reset.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const STACK_CONFIG_MARKER = 'ezd-stack-config-sha256';

/**
 * @typedef {{ ok: boolean, status: number | null, out: string, stdout: string, stderr: string }} CliResult
 * @typedef {{ outcome: 'started' | 'restarted' | 'unchanged' } | { outcome: 'failed', step: 'status' | 'stop' | 'start', result: CliResult }} StackResult
 */

const CONFIG = 'supabase/config.toml';
const TEMPLATES = 'supabase/templates';

// Repo-relative POSIX paths: the config first, then the top-level non-dot files of supabase/templates/
// sorted by plain string comparison. A missing templates folder means config only.
export function stackConfigFiles(root) {
  try {
    statSync(path.join(root, CONFIG));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('stack_config_missing');
    throw error;
  }
  let templates = [];
  try {
    templates = readdirSync(path.join(root, TEMPLATES), { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return [CONFIG, ...templates.map((name) => `${TEMPLATES}/${name}`)];
}

// SHA-256 over each file in stackConfigFiles order: relative path, NUL, byte length, NUL, raw bytes.
export function stackConfigHash(root) {
  const hash = createHash('sha256');
  for (const rel of stackConfigFiles(root)) {
    const bytes = readFileSync(path.join(root, rel));
    hash.update(rel, 'utf8');
    hash.update('\0');
    hash.update(String(bytes.length), 'utf8');
    hash.update('\0');
    hash.update(bytes);
  }
  return hash.digest('hex');
}

// Every worktree and the main checkout share one local stack, so the marker lives in the main checkout's
// supabase/.temp. Outside git, or when git does not answer, the folder itself is used.
export function sharedTempDir(root) {
  const own = path.join(realpathSync(root), 'supabase', '.temp');
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], {
    encoding: 'utf8',
  });
  if (r.error || r.status !== 0) return own;
  const common = String(r.stdout).trim();
  if (path.basename(common) !== '.git') return own;
  return path.join(path.dirname(realpathSync(common)), 'supabase', '.temp');
}

function readMarker(markerFile) {
  try {
    return readFileSync(markerFile, 'utf8').trim();
  } catch {
    return '';
  }
}

function writeMarker(markerFile, hash) {
  mkdirSync(path.dirname(markerFile), { recursive: true });
  writeFileSync(markerFile, `${hash}\n`);
}

/**
 * Brings the stack up to date with the config files. Runs no CLI call when the config is missing.
 * @param {{ cli: (args: string[], o?: { inherit?: boolean }) => CliResult, root: string, markerFile: string }} opts
 * @returns {StackResult}
 */
export function ensureStackCurrent({ cli, root, markerFile }) {
  const hash = stackConfigHash(root);
  const status = cli(['status']);
  if (!status.ok) {
    if (/docker/i.test(status.out)) return { outcome: 'failed', step: 'status', result: status };
    const start = cli(['start'], { inherit: true });
    if (!start.ok) return { outcome: 'failed', step: 'start', result: start };
    writeMarker(markerFile, hash);
    return { outcome: 'started' };
  }
  if (readMarker(markerFile) === hash) return { outcome: 'unchanged' };
  const stop = cli(['stop'], { inherit: true });
  if (!stop.ok) return { outcome: 'failed', step: 'stop', result: stop };
  const start = cli(['start'], { inherit: true });
  if (!start.ok) return { outcome: 'failed', step: 'start', result: start };
  writeMarker(markerFile, hash);
  return { outcome: 'restarted' };
}
