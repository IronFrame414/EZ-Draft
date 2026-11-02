// Tests for scripts/ui-run.mjs (debt D-013): the ui-verifier's one Playwright command outside the unit sandbox runs only a
// .spec.ts file under the ticket worktree's app/e2e/. Each test copies the script into a throwaway root; a stub pnpm on PATH
// records what would run, so no browser starts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, symlinkSync, chmodSync, rmSync, existsSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'ui-run.mjs');

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd-ui-run-'));
  mkdirSync(path.join(dir, 'scripts'));
  copyFileSync(SCRIPT, path.join(dir, 'scripts/ui-run.mjs'));
  const app = path.join(dir, '.claude/worktrees/EZD-002/app');
  mkdirSync(path.join(app, 'e2e'), { recursive: true });
  writeFileSync(path.join(app, 'e2e/shots.spec.ts'), '');
  writeFileSync(path.join(app, 'playwright.config.ts'), '');
  writeFileSync(path.join(dir, 'outside.spec.ts'), '');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'pnpm'), `#!/bin/sh\necho "$(pwd -P)|$*" > "${path.join(dir, 'ran.txt')}"\nexit 7\n`);
  chmodSync(path.join(bin, 'pnpm'), 0o755);
  return { dir, app, ran: path.join(dir, 'ran.txt') };
}
const run = (f, ...a) => spawnSync(process.execPath, [path.join(f.dir, 'scripts/ui-run.mjs'), ...a], {
  encoding: 'utf8', env: { ...process.env, PATH: `${path.join(f.dir, 'bin')}${path.delimiter}${process.env.PATH}` },
});

test('D-013 ui-run runs one e2e spec with Playwright from the worktree app folder and passes its exit code through', () => {
  const f = fixture();
  const r = run(f, 'EZD-002', 'e2e/shots.spec.ts');
  assert.equal(r.status, 7, r.stdout + r.stderr);
  const [cwd, args] = readFileSync(f.ran, 'utf8').trim().split('|');
  assert.equal(cwd, realpathSync(f.app));
  assert.equal(args, 'exec playwright test e2e/shots.spec.ts --reporter=line');
  rmSync(f.dir, { recursive: true, force: true });
});

test('D-013 ui-run refuses anything but a .spec.ts file under the worktree app/e2e/, and runs nothing', () => {
  const f = fixture();
  symlinkSync(path.join(f.dir, 'outside.spec.ts'), path.join(f.app, 'e2e/link.spec.ts'));
  writeFileSync(path.join(f.app, 'e2e/helper.ts'), '');
  const cases = [
    ['EZD-002', '../../../../outside.spec.ts'],
    ['EZD-002', 'e2e/link.spec.ts'],
    ['EZD-002', 'e2e/helper.ts'],
    ['EZD-002', 'playwright.config.ts'],
    ['EZD-002', 'e2e/missing.spec.ts'],
    ['EZD-003', 'e2e/shots.spec.ts'],
    ['../x', 'e2e/shots.spec.ts'],
    ['EZD-002'],
    ['EZD-002', 'e2e/shots.spec.ts', '--headed'],
  ];
  for (const c of cases) {
    const r = run(f, ...c);
    assert.equal(r.status, 2, `${c.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /^UI-RUN REFUSED: /, c.join(' '));
  }
  assert.ok(!existsSync(f.ran));
  rmSync(f.dir, { recursive: true, force: true });
});
