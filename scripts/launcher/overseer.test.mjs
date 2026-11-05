// EZD-333 O1-O6 (vault/plans/EZD-333.md section 4): a real continuous launcher run checks what a repair unit changed, reverts
// a change to a hard-limit path, closes a fix mode the repair left open, sends Josh only design and user-interface questions,
// logs one line per repair and runs the one-shot probe. The launcher runs only as a copy under a temporary root with a stub
// ledger tool, a fake claude and a stub notify command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { makeLauncherRoot, runLauncher, why, git, mkTmp } from './test-utils/harness.mjs';
import { fingerprint } from '../launcher-idle.mjs';

const CHECK_FAILED = 'none: ledger check failed (1); run --check';
const BUDGET_HOLD = 'none: budget hold (test)';
const AUTO_MERGE = 'none: waiting for the phase 2 PR to auto-merge on a green CI gate (https://github.com/o/r/pull/5)';
const LOG = 'vault/handoff/overseer-log.md';
const FIX = 'vault/handoff/LAUNCHER_FIX.md';

// The check fails until the repair writes `fixed`; the wait ends when it writes `stop`; then the budget hold ends the run.
const root = ({ result, script, writes = ['stop', 'fixed'] }) =>
  makeLauncherRoot({
    stub: { next: [{ text: CHECK_FAILED, until: 'stop' }, { text: BUDGET_HOLD }], check: { failUntil: 'fixed' } },
    rules: [{ prompt: '/repair', writes, result, ...(script ? { script: 'repair-script.cjs' } : {}) }],
  });

// A CommonJS script the fake claude runs in the root (cwd = root) before it prints the result.
const withScript = (r, lines) => {
  writeFileSync(r.at('repair-script.cjs'), [
    "const fs = require('fs');",
    "const path = require('path');",
    "const { execFileSync } = require('child_process');",
    "const g = (...a) => execFileSync('git', a, { encoding: 'utf8' });",
    "const put = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };",
    ...lines,
    '',
  ].join('\n'));
  return r;
};

const logLines = (r) => (existsSync(r.at(LOG)) ? readFileSync(r.at(LOG), 'utf8').split('\n').filter((l) => l.startsWith('- ')) : []);
const LINE = (kind, verdict) => new RegExp(`^- \\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z repair ${kind}: ${verdict}: `);

test('EZD-333 O1 refused commit: a committed and pushed guard change is reverted on develop and origin, logged, not sent (AC-EZD-333-3)', async () => {
  const r = withScript(root({ result: 'REPAIRED: fixed the guard', script: true }), [
    "put('.claude/hooks/guard-bash.mjs', 'weakened\\n');",
    "put('scripts/perf/x.mjs', 'legit\\n');",
    "g('add', '--', '.claude/hooks/guard-bash.mjs', 'scripts/perf/x.mjs');",
    "g('commit', '-q', '-m', 'fix(repair): weaken');",
    "g('push', '-q', 'origin', 'develop');",
  ]);
  const bare = path.join(mkTmp('ezd333-origin-'), 'origin.git');
  assert.equal(git(r.tmp, 'init', '-q', '--bare', bare).status, 0);
  assert.equal(git(r.tmp, 'remote', 'add', 'origin', bare).status, 0);
  assert.equal(git(r.tmp, 'push', '-q', 'origin', 'develop').status, 0);
  const res = await runLauncher(r);
  assert.equal(res.status, 0, why(res));
  assert.ok(!existsSync(r.at('.claude/hooks/guard-bash.mjs')), `guard change still there\n${why(res)}`);
  assert.ok(!existsSync(r.at('scripts/perf/x.mjs')), `the whole refused repair is reverted\n${why(res)}`);
  assert.match(git(r.tmp, 'log', '-1', '--format=%s').stdout, /^Revert /, why(res));
  assert.match(git(r.tmp, '--git-dir', bare, 'log', '-1', '--format=%s', 'develop').stdout, /^Revert /, 'origin/develop holds the revert');
  assert.deepEqual(res.notified, [], why(res));
  assert.equal(res.repairState?.verdict, 'refused', why(res));
  const lines = logLines(r);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], LINE('check', 'REFUSED'));
  assert.ok(lines[0].includes('.claude/hooks/guard-bash.mjs'), lines[0]);
});

test('EZD-333 O2 refused uncommitted: a new test file is deleted and a changed sandbox file restored (AC-EZD-333-3)', async () => {
  const r = withScript(root({ result: 'REPAIRED: x', script: true }), [
    "put('scripts/unit-sandbox.json', '{}\\n');",
    "put('scripts/launcher/new.test.mjs', 'skip\\n');",
  ]);
  const before = readFileSync(r.at('scripts/unit-sandbox.json'), 'utf8');
  const res = await runLauncher(r);
  assert.equal(res.status, 0, why(res));
  assert.equal(readFileSync(r.at('scripts/unit-sandbox.json'), 'utf8'), before, why(res));
  assert.ok(!existsSync(r.at('scripts/launcher/new.test.mjs')), why(res));
  assert.deepEqual(res.notified, [], why(res));
  const lines = logLines(r);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], LINE('check', 'REFUSED'));
  assert.ok(lines[0].includes('scripts/unit-sandbox.json') && lines[0].includes('scripts/launcher/new.test.mjs'), lines[0]);
});

// Code review finding 4: the launcher deletes only a fix file that names this repair (`Repair: <fingerprint>`, skill step 4.2);
// one an interactive session opened meanwhile stays, and the log says so.
test('EZD-333 O3 fix mode closed: the repair\'s own LAUNCHER_FIX.md is removed; one that was there before, or names no repair, stays (AC-EZD-333-3)', async () => {
  const fp = fingerprint(CHECK_FAILED);
  const left = withScript(root({ result: 'REPAIRED: done', script: true }), [`put('${FIX}', '# Fix\\nRepair: ${fp}\\n\\n## Paths\\n- scripts/perf/x.mjs\\n');`]);
  const a = await runLauncher(left);
  assert.equal(a.status, 0, why(a));
  assert.ok(!existsSync(left.at(FIX)), why(a));
  const other = withScript(root({ result: 'REPAIRED: done', script: true }), [`put('${FIX}', '# Fix · interactive\\n');`]);
  const c = await runLauncher(other);
  assert.equal(c.status, 0, why(c));
  assert.equal(readFileSync(other.at(FIX), 'utf8'), '# Fix · interactive\n', why(c));
  assert.ok(c.overseer.some((l) => l.includes('LAUNCHER_FIX.md') && l.includes('left open')), c.overseer.join('\n'));
  const kept = root({ result: 'REPAIRED: done' });
  mkdirSync(path.dirname(kept.at(FIX)), { recursive: true });
  writeFileSync(kept.at(FIX), 'interactive\n');
  const b = await runLauncher(kept);
  assert.equal(b.status, 0, why(b));
  assert.equal(readFileSync(kept.at(FIX), 'utf8'), 'interactive\n', why(b));
});

test('EZD-333 O4 what is sent: a JOSH line that is not a design or UI question is a failed repair, not sent (AC-EZD-333-5)', async () => {
  const r = root({ result: 'JOSH: set the key', writes: ['stop'] });
  const res = await runLauncher(r);
  assert.equal(res.status, 0, why(res));
  assert.deepEqual(res.notified, [], why(res));
  assert.equal(res.repairState?.verdict, 'failed', why(res));
  assert.equal(res.state?.state, 'repair-failed', why(res));
  const lines = logLines(r);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], LINE('check', 'FAILED'));
  assert.ok(lines[0].endsWith('not a design or UI question: set the key'), lines[0]);
});

test('EZD-333 O4b what is sent: a design or UI question reaches Josh once (AC-EZD-333-4)', async () => {
  for (const q of ['design: pick the archive icon', 'UI: which label for the button']) {
    const r = root({ result: `JOSH: ${q}`, writes: ['stop'] });
    const res = await runLauncher(r);
    assert.equal(res.status, 0, why(res));
    assert.deepEqual(res.notified, [`EZ Draft: needs Josh: ${q} (vault/handoff/REPAIR.md)`], why(res));
    assert.match(logLines(r)[0] ?? '', LINE('check', 'JOSH'));
  }
});

test('EZD-333 O5 log: a repair that commits gets one line with its commits and files; a file dirty before is not counted (AC-EZD-333-6)', async () => {
  const r = withScript(root({ result: 'REPAIRED: applied the budget patch', script: true }), [
    "put('scripts/perf/x.mjs', 'fixed\\n');",
    "g('add', '--', 'scripts/perf/x.mjs');",
    "g('commit', '-q', '-m', 'fix(perf): budget');",
  ]);
  writeFileSync(r.at('scripts/unit-sandbox.json'), '{"dirty": "before the repair"}\n');
  const res = await runLauncher(r);
  assert.equal(res.status, 0, why(res));
  assert.equal(readFileSync(r.at('scripts/perf/x.mjs'), 'utf8'), 'fixed\n', why(res));
  assert.equal(readFileSync(r.at('scripts/unit-sandbox.json'), 'utf8'), '{"dirty": "before the repair"}\n', why(res));
  assert.equal(res.repairState?.verdict, 'repaired', why(res));
  const lines = logLines(r);
  assert.equal(lines.length, 1, lines.join('\n'));
  assert.match(lines[0], /^- \S+ repair check: REPAIRED: applied the budget patch; commits [0-9a-f]{7,}\.\.[0-9a-f]{7,}; files: scripts\/perf\/x\.mjs$/);
  assert.match(readFileSync(r.at(LOG), 'utf8'), /^# Overseer log\n/);
});

test('EZD-333 O6 probe: REPAIR_PROBE.md starts one probe repair during any wait; nothing is sent (AC-EZD-333-7)', async () => {
  const r = makeLauncherRoot({
    stub: { next: [{ text: AUTO_MERGE, until: 'probed' }, { text: BUDGET_HOLD }] },
    rules: [{ prompt: '/repair probe', writes: ['probed'], result: 'REPAIRED: probe edited scripts/launcher/fix-mode-probe.txt' }],
  });
  writeFileSync(r.at('vault/handoff/REPAIR_PROBE.md'), 'probe\n');
  const res = await runLauncher(r);
  assert.equal(res.status, 0, why(res));
  assert.deepEqual(res.prompts, ['/repair probe'], why(res));
  assert.ok(!existsSync(r.at('vault/handoff/REPAIR_PROBE.md')), why(res));
  assert.deepEqual(res.notified, [], why(res));
  assert.equal(res.repairState, null, why(res));
  assert.ok(res.repairMd?.split('\n').includes('- Trigger: probe'), res.repairMd);
  assert.match(logLines(r)[0] ?? '', LINE('probe', 'REPAIRED'));
});

// A root whose guard file is committed before the run (the harness commits only scripts/ and vault/).
const withGuard = (r) => {
  mkdirSync(r.at('.claude/hooks'), { recursive: true });
  writeFileSync(r.at('.claude/hooks/guard-bash.mjs'), 'guard\n');
  assert.equal(git(r.tmp, 'add', '--', '.claude/hooks/guard-bash.mjs').status, 0);
  assert.equal(git(r.tmp, 'commit', '-q', '-m', 'guard').status, 0);
  return r;
};

test('EZD-333 O7 refused rename: a committed move of a guard to a name off the list is reverted (AC-EZD-333-3)', async () => {
  const r = withGuard(withScript(root({ result: 'REPAIRED: tidy', script: true }), [
    "g('mv', '.claude/hooks/guard-bash.mjs', 'vault/x.mjs');",
    "g('commit', '-q', '-m', 'fix(repair): tidy');",
  ]));
  const res = await runLauncher(r);
  assert.equal(res.status, 0, why(res));
  assert.equal(readFileSync(r.at('.claude/hooks/guard-bash.mjs'), 'utf8'), 'guard\n', why(res));
  assert.ok(!existsSync(r.at('vault/x.mjs')), why(res));
  assert.match(res.overseer[0] ?? '', /^repair check: REFUSED: .*\.claude\/hooks\/guard-bash\.mjs/, res.overseer.join('\n'));
});

test('EZD-333 O8 earlier work: a hard-limit file dirty before the repair goes back to how it was; the overwritten copy is kept (AC-EZD-333-3)', async () => {
  const r = withScript(root({ result: 'REPAIRED: x', script: true }), ["put('scripts/unit-sandbox.json', '{\"repair\": true}\\n');"]);
  writeFileSync(r.at('scripts/unit-sandbox.json'), '{"dirty": "before"}\n');
  const res = await runLauncher(r);
  assert.equal(res.status, 0, why(res));
  assert.equal(readFileSync(r.at('scripts/unit-sandbox.json'), 'utf8'), '{"dirty": "before"}\n', why(res));
  assert.ok(!existsSync(r.at('vault/handoff/STOP')), why(res));
  const line = res.overseer[0] ?? '';
  assert.match(line, /^repair check: REFUSED: .*scripts\/unit-sandbox\.json/, res.overseer.join('\n'));
  // Code review round 2: what the launcher overwrote stays readable (`git cat-file blob <id>`).
  const kept = line.match(/scripts\/unit-sandbox\.json kept as ([0-9a-f]{40})/);
  assert.ok(kept, line);
  assert.equal(git(r.tmp, 'cat-file', 'blob', kept[1]).stdout, '{"repair": true}\n');
});

// Code review round 2: files that may hold Josh's own edits (his local settings, the Josh-only files) and a fix opened by someone
// else during the repair are never overwritten: the launcher stops and says so, and nothing is undone.
test('EZD-333 O12 maybe Josh\'s: a changed ignored settings file or Josh-only file stops the launcher, nothing undone (AC-EZD-333-3)', async () => {
  for (const [file, before] of [['.claude/settings.local.json', '{"local": "before"}\n'], ['vault/budget.json', null]]) {
    const r = withScript(root({ result: 'REPAIRED: x', script: true }), [`put('${file}', '{"changed": true}\\n');`]);
    if (before !== null) {
      writeFileSync(r.at('.gitignore'), `${readFileSync(r.at('.gitignore'), 'utf8')}${file}\n`);
      mkdirSync(path.dirname(r.at(file)), { recursive: true });
      writeFileSync(r.at(file), before);
      assert.equal(git(r.tmp, 'check-ignore', '-q', file).status, 0, `${file} is ignored`);
    }
    const res = await runLauncher(r, { timeout: 8000 });
    assert.equal(readFileSync(r.at(file), 'utf8'), '{"changed": true}\n', `${file} left as it is\n${why(res)}`);
    assert.ok(existsSync(r.at('vault/handoff/STOP')), `${file}\n${why(res)}`);
    assert.equal(res.notified.length, 1, why(res));
    assert.match(res.overseer[0] ?? '', new RegExp(`^repair check: REFUSED: .*${file.replace(/\./g, '\\.')}.*STOP written`), res.overseer.join('\n'));
  }
});

test('EZD-333 O13 fix opened meanwhile: a LAUNCHER_FIX.md without this repair\'s line plus a hard-limit change stops the launcher, nothing undone (AC-EZD-333-3)', async () => {
  const r = withScript(root({ result: 'REPAIRED: x', script: true }), [
    `put('${FIX}', '# Fix · interactive\\n');`,
    "put('scripts/unit-sandbox.json', '{\"interactive\": true}\\n');",
  ]);
  const res = await runLauncher(r, { timeout: 8000 });
  assert.equal(readFileSync(r.at('scripts/unit-sandbox.json'), 'utf8'), '{"interactive": true}\n', why(res));
  assert.equal(readFileSync(r.at(FIX), 'utf8'), '# Fix · interactive\n', why(res));
  assert.ok(existsSync(r.at('vault/handoff/STOP')), why(res));
  assert.ok(res.overseer.some((l) => /^repair check: REFUSED: .*an interactive fix.*STOP written/.test(l)), res.overseer.join('\n'));
});

test('EZD-333 O9 not the repair\'s commit: a hard-limit commit without the fix(repair) subject is not reverted; STOP and one notice (AC-EZD-333-3)', async () => {
  const r = withGuard(withScript(root({ result: 'REPAIRED: x', script: true }), [
    "put('.claude/hooks/guard-bash.mjs', 'interactive change\\n');",
    "g('add', '--', '.claude/hooks/guard-bash.mjs');",
    "g('commit', '-q', '-m', 'feat(EZD-999): an interactive merge');",
  ]));
  const res = await runLauncher(r, { timeout: 8000 });
  assert.equal(readFileSync(r.at('.claude/hooks/guard-bash.mjs'), 'utf8'), 'interactive change\n', why(res));
  assert.match(git(r.tmp, 'log', '-1', '--format=%s').stdout, /^feat\(EZD-999\)/, why(res));
  assert.ok(existsSync(r.at('vault/handoff/STOP')), why(res));
  assert.equal(res.notified.length, 1, why(res));
  assert.match(res.notified[0], /^EZ Draft: launcher stopped: .*\.claude\/hooks\/guard-bash\.mjs/, why(res));
  assert.match(res.overseer[0] ?? '', /^repair check: REFUSED: .*STOP written/, res.overseer.join('\n'));
});

test('EZD-333 O10 limit: a repair stopped by a plan limit still gets its overseer line (AC-EZD-333-6)', async () => {
  const r = root({ result: 'usage limit reached', writes: ['stop'] });
  const rules = JSON.parse(readFileSync(r.at('fake-rules.json'), 'utf8'));
  rules[0].exit = 1;
  writeFileSync(r.at('fake-rules.json'), JSON.stringify(rules));
  const res = await runLauncher(r);
  assert.match(res.overseer[0] ?? '', /^repair check: FAILED: stopped by a usage limit/, `${res.overseer.join('\n')}\n${why(res)}`);
});

// Security re-review finding 1: a guard change pushed to origin/develop while the checkout's HEAD is moved back is still caught.
test('EZD-333 O11 pushed then hidden: a hard-limit commit on origin that HEAD lacks stops the launcher (AC-EZD-333-3)', async () => {
  const r = withGuard(withScript(root({ result: 'REPAIRED: x', script: true }), [
    "put('.claude/hooks/guard-bash.mjs', 'weakened\\n');",
    "g('add', '--', '.claude/hooks/guard-bash.mjs');",
    "g('commit', '-q', '-m', 'fix(repair): weaken');",
    "g('push', '-q', 'origin', 'develop');",
    "g('reset', '-q', '--soft', 'HEAD~1');",
    "g('restore', '--staged', '--worktree', '--', '.claude/hooks/guard-bash.mjs');",
  ]));
  const bare = path.join(mkTmp('ezd333-origin-'), 'origin.git');
  assert.equal(git(r.tmp, 'init', '-q', '--bare', bare).status, 0);
  assert.equal(git(r.tmp, 'remote', 'add', 'origin', bare).status, 0);
  assert.equal(git(r.tmp, 'push', '-q', 'origin', 'develop').status, 0);
  const res = await runLauncher(r, { timeout: 8000 });
  assert.ok(existsSync(r.at('vault/handoff/STOP')), why(res));
  assert.equal(res.notified.length, 1, why(res));
  assert.match(res.notified[0], /^EZ Draft: launcher stopped: .*\.claude\/hooks\/guard-bash\.mjs/, why(res));
  assert.match(res.overseer[0] ?? '', /^repair check: REFUSED: .*origin\/develop.*STOP written/, res.overseer.join('\n'));
});
