// Build v3 (2026-11-13): refuses edits to locked tests that already exist on develop, and writes to .env files.
// Locked: app/src/server/db/rls.*.test.ts and any *.golden.test.ts. New locked-pattern files may be created.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  let file = '';
  try { file = JSON.parse(input)?.tool_input?.file_path ?? ''; } catch { process.exit(0); }
  if (!file) process.exit(0);
  const abs = path.resolve(file);
  const base = path.basename(abs);
  if (/^\.env(\..*)?$/.test(base) && base !== '.env.example') deny(`writing ${base} is not allowed`);
  const locked = /(^|\/)app\/src\/server\/db\/rls\.[^/]*\.test\.ts$/.test(abs) || /\.golden\.test\.ts$/.test(abs);
  if (!locked || !existsSync(abs)) process.exit(0);
  let top = '';
  try { top = execFileSync('git', ['-C', path.dirname(abs), 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch { process.exit(0); }
  const rel = path.relative(top, abs);
  try {
    execFileSync('git', ['-C', top, 'cat-file', '-e', `develop:${rel}`], { stdio: 'ignore' });
  } catch { process.exit(0); }
  deny(`${rel} is a locked test (CLAUDE.md rule 3). Add a new test file instead.`);
});

function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
  process.exit(0);
}
