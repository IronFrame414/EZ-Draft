// EZD-250 T16, T17, T20 and EZD-267 N2, kept when the guard grants were removed (REMEDIATION 2.8): a plan's Build steps
// paths, the ones the write guard denies its builder, and the next-unit hold on them. Runs under temporary roots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repo, mkTmp, planText } from './test-utils/harness.mjs';
import { makeLedgerCopy } from './test-utils/ledger-copy.mjs';

const loadPlanPaths = () => import(pathToFileURL(path.join(repo, 'vault/tools/plan-paths.mjs')).href);
const q = (p) => `\`${p}\``;
const copyHooks = (dir) => {
  mkdirSync(path.join(dir, '.claude/hooks'), { recursive: true });
  for (const f of ['guard-paths.mjs', 'lib.mjs']) copyFileSync(path.join(repo, '.claude/hooks', f), path.join(dir, '.claude/hooks', f));
};

test('EZD-250 T16 plan paths: the Path cells of the Build steps table, once each, in order (AC-EZD-250-4)', async () => {
  const { planPaths } = await loadPlanPaths();
  const text = planText('EZD-990', [q('scripts/run.mjs'), q('app/src/a.ts'), q('scripts/launcher/a.test.mjs'), `${q('vault/tools/x.mjs')} and ${q('vault/tools/y.mjs')}`, q('scripts/run.mjs')]);
  assert.deepEqual(planPaths(text), ['scripts/run.mjs', 'app/src/a.ts', 'scripts/launcher/a.test.mjs', 'vault/tools/x.mjs', 'vault/tools/y.mjs']);
});

test('EZD-250 T17 guarded: the plan paths the real hook denies the builder, not test files; no hook denies nothing (AC-EZD-250-4)', async () => {
  const { guardedPaths } = await loadPlanPaths();
  const dir = mkTmp('ezd250-hook-');
  copyHooks(dir);
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/plans/EZD-990.md'), planText('EZD-990', [q('app/src/a.ts'), q('scripts/run.mjs'), q('scripts/launcher/a.test.mjs'), q('vault/tools/next_ticket.mjs')]));
  assert.deepEqual(guardedPaths({ root: dir, id: 'EZD-990' }), ['scripts/run.mjs', 'vault/tools/next_ticket.mjs']);
  rmSync(path.join(dir, '.claude/hooks/guard-paths.mjs'));
  assert.deepEqual(guardedPaths({ root: dir, id: 'EZD-990' }), []);
});

// EZD-300 hold (Josh 2026-11-03, vault/handoff/EZD-300-UNBLOCK.md): a step the plan gives the orchestrator holds the
// ticket only when the guard denies the orchestrator inside a unit too; builder rows keep the T17 rule.
test('EZD-300 hold: an orchestrator step is held only for a path the guard denies the orchestrator in a unit', async () => {
  const { guardedPaths } = await loadPlanPaths();
  const dir = mkTmp('ezd300-hold-');
  copyHooks(dir);
  mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'vault/handoff'), { recursive: true });
  writeFileSync(path.join(dir, 'vault/handoff/LAUNCHER_FIX.md'), 'fix mode open in an interactive session\n');
  writeFileSync(path.join(dir, 'vault/plans/EZD-990.md'), planText('EZD-990', [
    `${q('vault/handoff/a.patch')} (orchestrator writes; Josh applies)`,
    `${q('docs/architecture.md')} \`### CI\` (orchestrator)`,
    `${q('.github/workflows/ci.yml')} (orchestrator)`,
    `${q('scripts/run.mjs')} (Orchestrator, after merge)`,
    `${q('vault/tools/next_ticket.mjs')} (builder)`,
    `${q('scripts/launcher/a.test.mjs')} (test-author)`,
  ]));
  assert.deepEqual(guardedPaths({ root: dir, id: 'EZD-990' }), ['.github/workflows/ci.yml', 'scripts/run.mjs', 'vault/tools/next_ticket.mjs']);
});

function holdCopy() {
  const l = makeLedgerCopy({ synthetic: [['EZD-9992', 'ready'], ['EZD-9993', 'ready']] });
  copyHooks(l.dir);
  writeFileSync(l.file('plans/EZD-9992.md'), planText('EZD-9992', [q('app/src/a.ts'), q('scripts/run.mjs')]));
  return l;
}

test('EZD-250 T20 next unit: a ticket whose plan needs a guarded path is held while another builds, and Josh is named when all are held (AC-EZD-250-4)', () => {
  const l = holdCopy();
  const next = () => l.tool('next_ticket.mjs', ['--next-unit']).stdout.trim();
  assert.equal(next(), 'build EZD-9993');
  l.setStatus('EZD-9993', 'blocked');
  assert.equal(next(), 'none: waiting on Josh (guarded paths for EZD-9992: scripts/run.mjs; a change to them goes through fix mode)');
});

test('EZD-267 N2 hold names paths: the held next-unit text lists the files (AC-EZD-267-2)', () => {
  const l = holdCopy();
  l.setStatus('EZD-9993', 'blocked');
  writeFileSync(l.file('plans/EZD-9992.md'), planText('EZD-9992', [q('app/src/a.ts'), q('scripts/run.mjs'), q('vault/tools/a.mjs')]));
  assert.equal(l.tool('next_ticket.mjs', ['--next-unit']).stdout.trim(), 'none: waiting on Josh (guarded paths for EZD-9992: scripts/run.mjs, vault/tools/a.mjs; a change to them goes through fix mode)');
});
