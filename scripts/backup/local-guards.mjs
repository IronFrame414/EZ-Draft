// EZD-025 Step 6 (vault/plans/EZD-025.md; Q-0112): guards for a restore that reads Josh's restore file. They run
// only when `--env-file` is given, before the file is read, in this order.
import { realpathSync } from 'node:fs';
import path from 'node:path';

const isSet = (v) => v !== undefined && v !== null && v !== '';

/** The resolved path, symbolic links followed for the part of it that exists. */
function real(p) {
  const resolved = path.resolve(p);
  try {
    return realpathSync.native(resolved);
  } catch {
    const parent = path.dirname(resolved);
    if (parent === resolved) return resolved;
    return path.join(real(parent), path.basename(resolved));
  }
}

/** `{ ok: true }` or `{ ok: false, code }`. */
export function checkLocalGuards({ processEnv, isTTY, envFile, repoRoot }) {
  if (envFile === undefined || envFile === null) return { ok: true };
  if (processEnv.CLAUDECODE !== undefined) return { ok: false, code: 'agent_refused' };
  if (isSet(processEnv.CI) || isSet(processEnv.GITHUB_ACTIONS)) return { ok: false, code: 'ci_refused' };
  if (!isTTY) return { ok: false, code: 'tty_required' };
  if (!path.isAbsolute(envFile)) return { ok: false, code: 'env_file_not_absolute' };
  // On Windows `path` is path.win32, whose relative() ignores drive-letter case and accepts `\` and `/`.
  const rel = path.relative(real(repoRoot), real(envFile));
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    return { ok: false, code: 'env_file_in_repo' };
  }
  return { ok: true };
}
