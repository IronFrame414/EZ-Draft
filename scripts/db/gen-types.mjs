// EZD-004a Step 5 (vault/plans/EZD-004a.md): generated database types. Node 22 built-ins only.
//   node scripts/db/gen-types.mjs [--check] [--file <path>]
// Runs `supabase gen types typescript --local --schema public` and writes the result to
// app/src/server/db/database.types.ts (docs/architecture.md Migrations). `--check` writes nothing and
// exits 1 when the file differs from the CLI output (line endings normalized). `--file` changes the target.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const supabaseBin = path.join(repo, 'node_modules', '.bin', 'supabase');
const defaultFile = path.join(repo, 'app', 'src', 'server', 'db', 'database.types.ts');

const args = process.argv.slice(2);
const check = args.includes('--check');
const fileIdx = args.indexOf('--file');
const target = fileIdx >= 0 && args[fileIdx + 1] ? path.resolve(args[fileIdx + 1]) : defaultFile;
const unknown = args.filter((a, i) => a !== '--check' && a !== '--file' && !(fileIdx >= 0 && i === fileIdx + 1));
if (unknown.length) {
  process.stderr.write(`usage: node scripts/db/gen-types.mjs [--check] [--file <path>]\n`);
  process.exit(1);
}

const r = spawnSync(supabaseBin, ['gen', 'types', 'typescript', '--local', '--schema', 'public'], {
  cwd: repo,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});
if (r.error || r.status !== 0) {
  const out = (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error.message) : '');
  if (/docker/i.test(out)) process.stderr.write('Local Supabase needs Docker running (start Docker Desktop).\n');
  process.stderr.write(`supabase gen types failed (exit ${r.status ?? 'error'})\n${r.stderr || ''}`);
  process.exit(1);
}

const normalize = (s) => s.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
const generated = normalize(r.stdout);

if (check) {
  if (!existsSync(target)) {
    process.stderr.write(`${target} is missing; run pnpm db:types\n`);
    process.exit(1);
  }
  const current = normalize(readFileSync(target, 'utf8'));
  if (current !== generated) {
    process.stderr.write(`${target} differs from the local database types; run pnpm db:types and commit\n`);
    process.exit(1);
  }
  process.exit(0);
}

mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, generated);
process.stdout.write(`wrote ${target}\n`);
