// EZD-250 T26-T27: a failed CI gate check on the phase PR is repairable, every other CI state keeps the wait
// (vault/plans/EZD-250.md sections 3 and 4; D12, D12a, D13, D18; Q-0379 (b)). The `gh` command is a shim on PATH
// that prints stdout, stderr and an exit code from marker files and records its arguments; never a live GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkTmp, GH_ARGV, makeLauncherRoot, runLauncher, why } from './test-utils/harness.mjs';
import { makeLedgerCopy } from './test-utils/ledger-copy.mjs';

const PR = 'https://github.com/o/r/pull/5';
const LINK = 'https://github.com/o/r/actions/runs/7/job/9';
const FAILED = `none: phase 1 PR CI gate check failed (${PR}; ${LINK})`;
const WAITING = `none: waiting for the phase 1 PR to auto-merge on a green CI gate (${PR})`;
// EZD-336: one `gh pr view --json autoMergeRequest,statusCheckRollup` call; a cancelled or timed-out gate run is repairable,
// and auto-merge being off is its own wait.
const CANCELLED = `none: phase 1 PR CI gate check cancelled (${PR}; ${LINK})`;
const AUTO_OFF = `none: phase 1 PR auto-merge is off (${PR})`;
const GREEN = `none: phase 1 PR gate is green but not merged (${PR})`;
const ON = { mergeMethod: 'MERGE' };
const run_ = (name, status, conclusion, detailsUrl = LINK) => ({ __typename: 'CheckRun', name, status, conclusion, detailsUrl });
// Security review (EZD-336) finding 1: the launcher clears only this repository's develop -> main PR.
const view = (rollup, autoMergeRequest = ON, target = {}) =>
  JSON.stringify({ autoMergeRequest, statusCheckRollup: rollup, baseRefName: 'main', headRefName: 'develop', url: PR, ...target });
const UNEXPECTED = (why) => `none: waiting for the phase 1 PR to auto-merge on a green CI gate (${PR}; PR target unexpected: ${why})`;
const item = (name, bucket, link) =>
  view([run_(name, bucket === 'pending' ? 'IN_PROGRESS' : 'COMPLETED', { fail: 'FAILURE', pass: 'SUCCESS', pending: '' }[bucket], link)]);

test('EZD-250 T26 CI check: only a failed gate check makes the wait repairable (AC-EZD-250-1)', () => {
  // The fixture of vault/plans/EZD-250.md section 4: phase 1 PR open, not a git repository, so the state is pr-open.
  const l = makeLedgerCopy({ phaseZeroDone: true });
  rmSync(l.file('cost/phase-01.md'), { force: true });
  mkdirSync(l.file('tickets/gates'), { recursive: true });
  writeFileSync(l.file('tickets/gates/phase-01.md'), `PR: ${PR}\nDevelop at PR: 0000000\nMerged: no\n`);
  // The copy is a git repository whose origin is the PR's repository (no origin/main, so the state stays pr-open).
  for (const a of [['init', '-q'], ['remote', 'add', 'origin', 'https://github.com/o/r.git']]) assert.equal(spawnSync('git', ['-C', l.dir, ...a]).status, 0, a.join(' '));
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
    // Josh 2026-11-05: only the `gate` check is required, so a green gate with the PR still open is its own wait.
    ['c', run(view([run_('lint', 'COMPLETED', 'FAILURE', 'x'), run_('gate', 'COMPLETED', 'SUCCESS', 'y')]), '', 0), GREEN],
    ['c2', run(view([run_('gate', 'COMPLETED', 'SUCCESS', 'y'), run_('gate', 'IN_PROGRESS', '')]), '', 0), WAITING],
    // EZD-336 cases.
    ['g', run(view([run_('gate', 'COMPLETED', 'CANCELLED')]), '', 0), CANCELLED],
    ['h', run(view([run_('gate', 'COMPLETED', 'TIMED_OUT')]), '', 0), CANCELLED],
    ['i', run(view([run_('gate', 'COMPLETED', 'SUCCESS', 'y'), run_('gate', 'COMPLETED', 'CANCELLED')]), '', 0), CANCELLED],
    ['j', run(view([run_('gate', 'COMPLETED', 'CANCELLED', 'y'), run_('gate', 'COMPLETED', 'FAILURE')]), '', 0), FAILED],
    ['k', run(view([run_('gate', 'COMPLETED', 'SUCCESS')], null), '', 0), AUTO_OFF],
    ['l', run(view([run_('gate', 'IN_PROGRESS', '')], null), '', 0), AUTO_OFF],
    ['m', run(view([run_('gate', 'COMPLETED', 'FAILURE')], null), '', 0), FAILED],
    ['n', run(view([{ __typename: 'StatusContext', context: 'gate', state: 'FAILURE' }, run_('gate', 'COMPLETED', 'SUCCESS')]), '', 0), GREEN],
    ['o', run(view([run_('gate', 'COMPLETED', 'SUCCESS')], null, { baseRefName: 'feature' }), '', 0), UNEXPECTED('base feature, head develop')],
    ['p', run(view([run_('gate', 'COMPLETED', 'SUCCESS')], ON, { headRefName: 'other' }), '', 0), UNEXPECTED('base main, head other')],
    ['q', run(view([run_('gate', 'COMPLETED', 'SUCCESS')], null, { url: 'https://github.com/x/y/pull/5' }), '', 0), UNEXPECTED('url https://github.com/x/y/pull/5')],
    ['r', run(view([run_('gate', 'COMPLETED', 'FAILURE')], null, { baseRefName: 'feature' }), '', 0), FAILED],
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

test('EZD-336 T39 a cancelled or timed-out gate run starts a repair unit of kind ci (AC-EZD-336-3)', async () => {
  const root = makeLauncherRoot({
    stub: { next: [{ text: CANCELLED, until: 'fixed' }, { text: 'none: budget hold (test)' }] },
    rules: [{ prompt: '/repair', writes: ['fixed'], result: 'REPAIRED: re-ran run 7 (the package mirror stalled)' }],
  });
  const r = await runLauncher(root);
  assert.equal(r.status, 0, why(r));
  assert.deepEqual(r.prompts, ['/repair ci'], why(r));
  assert.deepEqual(r.notified, [], why(r));
});

// Josh 2026-11-05 (decisions process.md, a57931ba): Claude Code completes its own PRs; a refused auto-merge or an open PR after a
// green gate is a stop cause the overseer clears. The launcher does both itself (a unit meets the settings `ask` rule), once per
// wait text, logs the result and sends nothing; neither starts a repair unit.
// A gh shim in the root's bin (first on PATH): records its arguments; `pr merge` writes the marker `merged` unless told to fail.
const ghShim = (root, { fail = false } = {}) => {
  writeFileSync(root.at('bin/gh'), [
    '#!/bin/sh',
    `printf '%s\\n' "$*" >> "${root.at('gh-argv.txt')}"`,
    fail ? 'echo "auto merge is not allowed for this repository" >&2; exit 1' : `mkdir -p "${root.at('markers')}"; touch "${root.at('markers/merged')}"; exit 0`,
    '',
  ].join('\n'), { mode: 0o755 });
  chmodSync(root.at('bin/gh'), 0o755);
};
const ghArgv = (root) => (existsSync(root.at('gh-argv.txt')) ? readFileSync(root.at('gh-argv.txt'), 'utf8').split('\n').filter(Boolean) : []);

for (const [id, text, argv, line] of [
  ['T40 auto-merge off', AUTO_OFF, `pr merge ${PR} --auto --merge`, `launcher: AUTO-MERGE: on for ${PR}`],
  ['T42 green, not merged', GREEN, `pr merge ${PR} --merge`, `launcher: MERGE: merged ${PR}`],
]) {
  test(`EZD-336 ${id}: the launcher clears it itself once, logs it, sends nothing (AC-EZD-336-2)`, async () => {
    const root = makeLauncherRoot({ stub: { next: [{ text, until: 'merged' }, { text: 'none: budget hold (test)' }] } });
    ghShim(root);
    const r = await runLauncher(root);
    assert.equal(r.status, 0, why(r));
    assert.deepEqual(ghArgv(root), [argv], why(r));
    assert.deepEqual(r.prompts, [], why(r));
    assert.deepEqual(r.notified, [], why(r));
    assert.deepEqual(r.overseer, [line], why(r));
    // It fails: one try per wait text, a FAILED line, no repair unit, one notice with the error.
    const bad = makeLauncherRoot({ stub: { next: [{ text, untilCalls: 6 }, { text: 'none: budget hold (test)' }] } });
    ghShim(bad, { fail: true });
    const b = await runLauncher(bad);
    assert.equal(b.status, 0, why(b));
    assert.deepEqual(ghArgv(bad), [argv], why(b));
    assert.deepEqual(b.prompts, [], why(b));
    // Code review finding 3 (rule 17, third-party clause): a refused clear is told once, with gh's error, not held in silence.
    assert.deepEqual(b.notified, [`EZ Draft: launcher waiting: ${text.replace(/^none: /, '')}; the launcher could not clear it: auto merge is not allowed for this repository`], why(b));
    assert.deepEqual(b.overseer, [`${line.replace(/: (on for|merged) .*$/, '')}: FAILED: auto merge is not allowed for this repository`], why(b));
  });
}
