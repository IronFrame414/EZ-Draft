// EZD-250 T26-T27: a failed CI gate check on the phase PR is repairable, every other CI state keeps the wait
// (vault/plans/EZD-250.md sections 3 and 4; D12, D12a, D13, D18; Q-0379 (b)). The `gh` command is a shim on PATH
// that prints stdout, stderr and an exit code from marker files and records its arguments; never a live GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { mkTmp, GH_ARGV, makeLauncherRoot, runLauncher, why } from './test-utils/harness.mjs';
import { makeLedgerCopy } from './test-utils/ledger-copy.mjs';

const PR = 'https://github.com/o/r/pull/5';
const LINK = 'https://github.com/o/r/actions/runs/7/job/9';
const FAILED = `none: phase 1 PR CI gate check failed (${PR}; ${LINK})`;
const WAITING = `none: waiting for the phase 1 PR to auto-merge on a green CI gate (${PR})`;
const item = (name, bucket, link) => JSON.stringify([{ name, bucket, link }]);

test('EZD-250 T26 CI check: only a failed gate check makes the wait repairable (AC-EZD-250-1)', () => {
  // The fixture of vault/plans/EZD-250.md section 4: phase 1 PR open, not a git repository, so the state is pr-open.
  const l = makeLedgerCopy({ phaseZeroDone: true });
  rmSync(l.file('cost/phase-01.md'), { force: true });
  mkdirSync(l.file('tickets/gates'), { recursive: true });
  writeFileSync(l.file('tickets/gates/phase-01.md'), `PR: ${PR}\nDevelop at PR: 0000000\nMerged: no\n`);
  const shimDir = mkTmp('ezd250-gh-');
  const f = (n) => path.join(shimDir, n);
  writeFileSync(f('gh'), ['#!/bin/sh', `printf '%s\\n' "$*" >> "${f('argv')}"`, `cat "${f('stdout')}"`, `cat "${f('stderr')}" >&2`, `exit "$(cat "${f('exit')}")"`, ''].join('\n'));
  chmodSync(f('gh'), 0o755);
  const run = (stdout, stderr, code) => {
    writeFileSync(f('stdout'), stdout);
    writeFileSync(f('stderr'), stderr);
    writeFileSync(f('exit'), String(code));
    rmSync(f('argv'), { force: true });
    const r = l.tool('next_ticket.mjs', ['--next-unit'], {
      PATH: `${shimDir}${path.delimiter}${process.env.PATH}`,
      GIT_CEILING_DIRECTORIES: path.dirname(l.dir),
    });
    const argv = existsSync(f('argv')) ? readFileSync(f('argv'), 'utf8').split('\n').filter(Boolean) : [];
    return { next: r.stdout.trim(), argv };
  };
  const cases = [
    ['a', run(item('gate', 'fail', LINK), '', 1), FAILED],
    ['b', run(item('gate', 'pending', 'x'), '', 8), WAITING],
    ['c', run(JSON.stringify([{ name: 'lint', bucket: 'fail', link: 'x' }, { name: 'gate', bucket: 'pass', link: 'y' }]), '', 1), WAITING],
    ['d', run('', 'not logged in\n', 4), `none: waiting for the phase 1 PR to auto-merge on a green CI gate (${PR}; CI status unreadable: not logged in)`],
    ['e', run('', '', 3), `none: waiting for the phase 1 PR to auto-merge on a green CI gate (${PR}; CI status unreadable: gh exited 3)`],
    ['f', run(item('gate', 'fail', ''), '', 1), `none: phase 1 PR CI gate check failed (${PR}; no link)`],
  ];
  for (const [name, got, want] of cases) {
    assert.equal(got.next, want, `case (${name})`);
    assert.ok(got.argv.length >= 1 && got.argv.every((a) => a === GH_ARGV), `case (${name}) gh argv: ${JSON.stringify(got.argv)}`);
  }
});

test('EZD-250 T27 repair on red CI: a failed CI gate check starts a repair unit of kind ci (AC-EZD-250-1)', async () => {
  const root = makeLauncherRoot({
    stub: {
      next: [{ text: FAILED, until: 'fixed' }, { text: 'build EZD-901', until: 'built' }, { text: 'none: budget hold (test)' }],
    },
    rules: [
      { prompt: '/repair', writes: ['fixed'], result: 'REPAIRED: fix ticket EZD-901 for Gate' },
      { prompt: '/build-ticket EZD-901', writes: ['built'] },
    ],
  });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, ['/repair ci', '/build-ticket EZD-901'], why(r));
  assert.ok(r.repairMd?.split('\n').includes('- Trigger: ci'), `REPAIR.md lacks "- Trigger: ci"\n${r.repairMd}`);
  assert.deepEqual(r.notified, [], why(r));
});
