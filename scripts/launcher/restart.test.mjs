// EZD-250 T14-T15: the launcher reloads its own code after a merge (vault/plans/EZD-250.md sections 3 and 4; D9).
// The launcher runs only as a copy under a temporary root with a stub ledger tool and a fake claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeLauncherRoot, runLauncher, why } from './test-utils/harness.mjs';

const stub = { next: [{ text: 'build EZD-901', until: 'built' }, { text: 'none: budget hold (test)' }] };
const RESTART_LINE = /^\[run \d{2}:\d{2}:\d{2}\] launcher code changed \(scripts\/run\.mjs\); restarting$/;
const APPENDED = "\nimport('node:fs').then((f) => f.writeFileSync(new URL('../restarted', import.meta.url), String(process.pid)));\n";

test('EZD-250 T14 restart: a changed launcher file restarts the launcher in place, once (AC-EZD-250-3)', async () => {
  const root = makeLauncherRoot({
    stub,
    rules: [{ prompt: '/build-ticket EZD-901', writes: ['built'], append: [{ file: 'scripts/run.mjs', text: APPENDED }] }],
  });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  const restartLines = r.log.split('\n').filter((l) => l.includes('launcher code changed'));
  assert.equal(restartLines.length, 1, why(r));
  assert.match(restartLines[0], RESTART_LINE, why(r));
  assert.equal(readFileSync(root.at('restarted'), 'utf8'), String(r.pid), why(r));
  assert.equal(r.prompts.length, 1, why(r));
});

test('EZD-250 T15 no restart: changed tests and ledger files do not restart the launcher (AC-EZD-250-3)', async () => {
  const root = makeLauncherRoot({
    stub,
    rules: [
      {
        prompt: '/build-ticket EZD-901',
        writes: ['built'],
        append: [
          { file: 'scripts/launcher/a.test.mjs', text: 'export {};\n' },
          { file: 'vault/tickets/STATUS.md', text: 'changed\n' },
        ],
      },
    ],
  });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.ok(!r.log.includes('launcher code changed'), why(r));
  assert.equal(r.prompts.length, 1, why(r));
});

const CANNOT_RESTART_LINE = /^\[run \d{2}:\d{2}:\d{2}\] cannot restart in place; exiting for launchd$/;

test('EZD-258 T3 restart impossible: no process.execve logs and exits 75 for launchd (AC-EZD-258-1)', async () => {
  const root = makeLauncherRoot({
    stub,
    rules: [{ prompt: '/build-ticket EZD-901', writes: ['built'], append: [{ file: 'scripts/run.mjs', text: '\n// changed\n' }] }],
  });
  // Preload that removes process.execve from the launcher process, as a runtime without it would.
  writeFileSync(root.at('no-execve.mjs'), 'delete process.execve;\n');
  const NODE_OPTIONS = [process.env.NODE_OPTIONS, '--import=' + pathToFileURL(root.at('no-execve.mjs')).href].filter(Boolean).join(' ');
  const r = await runLauncher(root, { env: { NODE_OPTIONS } });
  assert.equal(r.status, 75, why(r));
  const lines = r.log.split('\n');
  const restartAt = lines.flatMap((l, i) => (RESTART_LINE.test(l) ? [i] : []));
  assert.equal(restartAt.length, 1, why(r));
  assert.match(lines[restartAt[0] + 1] ?? '', CANNOT_RESTART_LINE, why(r));
  assert.equal(lines.filter((l) => CANNOT_RESTART_LINE.test(l)).length, 1, why(r));
  assert.deepEqual(r.notified, [], why(r));
  assert.equal(r.prompts.length, 1, why(r));
  assert.equal(r.state?.state, 'restarting', why(r));
});
