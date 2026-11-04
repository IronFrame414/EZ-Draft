// EZD-004a Step 5 (vault/plans/EZD-004a.md): generated database types. Node 22 built-ins only.
//   node scripts/db/gen-types.mjs [--check] [--file <path>]
// Runs `supabase gen types typescript --local --schema public` and writes the result to
// app/src/server/db/database.types.ts (docs/architecture.md Migrations). `--check` writes nothing and
// exits 1 when the file differs from the CLI output (line endings normalized). `--file` changes the target.
// EZD-200 (vault/plans/EZD-200.md): a failure names its command and stderr on line 1, and the CLI call
// runs under a lock shared by every checkout, so concurrent checks take turns.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runLocalSql } from './sql.mjs';
import { sharedTempDir } from './stack-config.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const supabaseBin = path.join(repo, 'node_modules', '.bin', 'supabase');
const defaultFile = path.join(repo, 'app', 'src', 'server', 'db', 'database.types.ts');
const defaultLockDir = () => path.join(sharedTempDir(repo), 'ezd-gen-types.lock');

export const GEN_TYPES_ARGS = ['gen', 'types', 'typescript', '--local', '--schema', 'public'];
export const GEN_TYPES_LOCK_WAIT_MS = 120000;

const OWNER_FILE = /^owner(-\d+-[0-9a-f]{12})?\.json$/;
const TAKE_SUFFIX = /^(\d+)-[0-9a-f]{12}$/;

const normalize = (s) => s.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
const DOCKER_HINT = 'Local Supabase needs Docker running (start Docker Desktop).';

// The first line that differs between the two texts (line endings normalized), 1-based. `null` on a side
// means that text ended before the line. `null` when the two texts are equal.
export function firstDifference(current, generated) {
  const a = normalize(current).split('\n').slice(0, -1);
  const b = normalize(generated).split('\n').slice(0, -1);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] !== b[i]) {
      return { line: i + 1, current: i < a.length ? a[i] : null, generated: i < b.length ? b[i] : null };
    }
  }
  return null;
}

const sleepCell = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms) => Atomics.wait(sleepCell, 0, 0, ms);

// EPERM means the process exists under another user, so it is alive.
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

// The owner of the lock held in lockDir: the first owner file in it, with the pid the file names (null when
// the file has no positive integer pid). null when the lock dir is missing, empty or holds no owner file.
export function readLockOwner(lockDir) {
  let names;
  try {
    names = readdirSync(lockDir).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const name = names.find((n) => OWNER_FILE.test(n));
  if (name === undefined) return null;
  let text;
  try {
    text = readFileSync(path.join(lockDir, name), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let pid = null;
  try {
    const owner = JSON.parse(text);
    if (Number.isInteger(owner?.pid) && owner.pid > 0) pid = owner.pid;
  } catch {
    pid = null;
  }
  return { name, pid };
}

// Takeover of a lock whose owner is dead: unlinks that owner's own file (the one name the observer saw),
// then removes the directory if it is empty. A file already gone means another process reaped or released
// it, so nothing is removed. Never removes a held lock: a held lock has its owner file, so rmdir fails.
export function reapStaleLock(lockDir, seen) {
  try {
    unlinkSync(path.join(lockDir, seen.name));
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  try {
    rmdirSync(lockDir);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
  }
  return true;
}

function lockDirEmptyOrMissing(lockDir) {
  try {
    return readdirSync(lockDir).length === 0;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

// Removes the take folders of dead processes (litter of a killed take) next to lockDir.
function sweepTakeLitter(lockDir) {
  const dir = path.dirname(lockDir);
  const prefix = `${path.basename(lockDir)}.take-`;
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(prefix)) continue;
    const m = TAKE_SUFFIX.exec(name.slice(prefix.length));
    if (m === null || pidAlive(Number(m[1]))) continue;
    rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

// Takes the lock by renaming a fully written folder into place, so the lock never exists without its owner
// file. Returns the token of the owner file, or null when the lock dir is held (not empty).
function takeLock(lockDir) {
  mkdirSync(path.dirname(lockDir), { recursive: true });
  const token = `${process.pid}-${randomBytes(6).toString('hex')}`;
  const take = `${lockDir}.take-${token}`;
  try {
    mkdirSync(take);
    writeFileSync(
      path.join(take, `owner-${token}.json`),
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
    );
    renameSync(take, lockDir);
  } catch (error) {
    rmSync(take, { recursive: true, force: true });
    if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST') return null;
    throw error;
  }
  sweepTakeLitter(lockDir);
  return token;
}

// Releases the lock this process took: its own owner file, then the directory when it is empty. A newer
// take that renamed over the emptied directory keeps its lock (rmdir fails on its owner file).
function releaseLock(lockDir, token) {
  try {
    unlinkSync(path.join(lockDir, `owner-${token}.json`));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    rmdirSync(lockDir);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
  }
}

// Runs fn while holding the lock directory. `{ ok: false }` (and fn never runs) when another live process
// holds the lock for longer than waitMs, or when the lock cannot be identified (never removed then).
export function withTypesLock(fn, opts = {}) {
  const lockDir = opts.lockDir ?? defaultLockDir();
  const waitMs = opts.waitMs ?? GEN_TYPES_LOCK_WAIT_MS;
  const deadline = Date.now() + waitMs;
  let token = null;
  while (token === null) {
    token = takeLock(lockDir);
    if (token !== null) break;
    const owner = readLockOwner(lockDir);
    if (lockDirEmptyOrMissing(lockDir)) continue;
    if (owner !== null && owner.pid !== null && !pidAlive(owner.pid)) {
      reapStaleLock(lockDir, owner);
      continue;
    }
    if (Date.now() >= deadline) {
      return {
        ok: false,
        message: `gen_types_lock_timeout: ${lockDir} held by pid ${owner?.pid ?? 'unknown'} for more than ${waitMs} ms`,
      };
    }
    sleep(100);
  }
  try {
    return { ok: true, value: fn() };
  } finally {
    releaseLock(lockDir, token);
  }
}

// The command as the message shows it: relative to the checkout when the binary is inside it.
function cliCommand(bin) {
  const rel = path.relative(repo, bin);
  const shown = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : bin;
  return `${shown} ${GEN_TYPES_ARGS.join(' ')}`;
}

function cliFailure(r, bin, err) {
  const stderr = r.stderr ?? '';
  const first = stderr.split('\n').find((line) => line.trim() !== '');
  const firstText = first === undefined ? '(no stderr)' : first.trimEnd();
  const combined = `${r.stdout ?? ''}${stderr}${r.error ? r.error.message : ''}`;
  const body = [
    `gen_types_cli_failed: ${cliCommand(bin)} exited ${r.status ?? 'none'} (signal ${r.signal ?? 'none'}): ${firstText}`,
  ];
  if (/docker/i.test(combined)) body.push(DOCKER_HINT);
  body.push(`supabase gen types failed (exit ${r.status ?? 'error'})`);
  body.push(`spawn error: ${r.error ? `${r.error.code ?? 'no_code'} ${r.error.message}` : 'none'}`);
  body.push('stderr:');
  body.push(stderr.replace(/\n+$/, '') || '(empty)');
  body.push('stdout (last 2000 characters):');
  body.push((r.stdout ?? '').slice(-2000).replace(/\n+$/, ''));
  err(`${body.join('\n')}\n`);
  return 1;
}

async function databaseVersion() {
  const r = await runLocalSql("select coalesce(max(version), 'none') from supabase_migrations.schema_migrations;");
  return r.code === 0 ? r.stdout.trim() || 'unknown' : 'unknown';
}

function checkoutVersion() {
  const versions = readdirSync(path.join(repo, 'supabase', 'migrations'))
    .map((f) => /^(\d{14})_.+\.sql$/.exec(f)?.[1])
    .filter((v) => v !== undefined)
    .sort();
  return versions.at(-1) ?? 'none';
}

/**
 * Runs the type check or the write. Resolves 0 or 1; writes through out/err.
 * @param {{ check: boolean, file?: string, bin?: string, lockDir?: string, waitMs?: number, out?: (s: string) => void, err?: (s: string) => void }} opts
 * @returns {Promise<number>}
 */
export async function runGenTypes(opts) {
  const out = opts.out ?? ((s) => process.stdout.write(s));
  const err = opts.err ?? ((s) => process.stderr.write(s));
  const bin = opts.bin ?? supabaseBin;
  const target = opts.file ? path.resolve(opts.file) : defaultFile;
  const locked = withTypesLock(
    () =>
      spawnSync(bin, GEN_TYPES_ARGS, {
        cwd: repo,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    { lockDir: opts.lockDir, waitMs: opts.waitMs },
  );
  if (!locked.ok) {
    err(`${locked.message}\n`);
    return 1;
  }
  const r = locked.value;
  if (r.error || r.status !== 0) return cliFailure(r, bin, err);

  const generated = normalize(r.stdout);
  if (opts.check) {
    if (!existsSync(target)) {
      err(`${target} is missing; run pnpm db:types\n`);
      return 1;
    }
    const current = normalize(readFileSync(target, 'utf8'));
    if (current === generated) return 0;
    const diff = firstDifference(current, generated);
    const database = await databaseVersion();
    err(
      [
        `gen_types_mismatch: ${target} line ${diff.line} differs (database migration ${database}, checkout migration ${checkoutVersion()})`,
        `${target} differs from the local database types; run pnpm db:types and commit`,
        `file:      ${diff.current ?? '(end of file)'}`,
        `generated: ${diff.generated ?? '(end of output)'}`,
      ].join('\n') + '\n',
    );
    return 1;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, generated);
  out(`wrote ${target}\n`);
  return 0;
}

// CLI entry: only when this file is the script node was started with (the test drivers import it).
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const fileIdx = args.indexOf('--file');
  const unknown = args.filter((a, i) => a !== '--check' && a !== '--file' && !(fileIdx >= 0 && i === fileIdx + 1));
  if (unknown.length) {
    process.stderr.write(`usage: node scripts/db/gen-types.mjs [--check] [--file <path>]\n`);
    process.exitCode = 1;
  } else {
    const file = fileIdx >= 0 && args[fileIdx + 1] ? args[fileIdx + 1] : undefined;
    process.exitCode = await runGenTypes({ check, file });
  }
}
