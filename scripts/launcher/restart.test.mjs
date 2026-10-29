// EZD-250 T14-T15: the launcher reloads its own code after a merge (vault/plans/EZD-250.md sections 3 and 4; D9).
// The launcher runs only as a copy under a temporary root with a stub ledger tool and a fake claude.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
