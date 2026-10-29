// EZD-246: review batches of 2 or 3 related medium tickets (plan section 4; fixture per D15: a fresh temporary vault per test).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SPEC = 'spec/sections/11-non-functional-requirements.md#Operations';

// spec: { id, phase, status, complexity, depends, notes, commit, areas (array | null = no Areas line), paths (array of Path cells), specFiles }
const norm = (s) => {
  const id = s.id;
  return {
    phase: 1, status: 'ready', complexity: 'medium', depends: ['EZD-800'], notes: '', commit: '',
    areas: ['process'], paths: [`\`vault/tools/${id}.mjs\``], specFiles: [SPEC], ...s,
  };
};
const planText = (t) => [
  `# ${t.id} · T`, '',
  ...(t.areas ? [`- **Areas:** ${t.areas.join(', ')}`] : []), '',
  '## 1. What to build', '', '### Build steps',
  '| # | Path | New / change | Exports and signatures | Copy the pattern from | Verify with |',
  '| --- | --- | --- | --- | --- | --- |',
  ...t.paths.map((p, i) => `| ${i + 1} | ${p} | new | none | none | none |`),
  '', '## 2. Sources', '', 'none', '',
].join('\n');

function withVault(specs, fn) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-batch-')));
  try {
    cpSync(path.join(root, 'vault/tools'), path.join(dir, 'vault/tools'), { recursive: true });
    const all = [
      { id: 'EZD-800', phase: 1, status: 'done', commit: 'abc1234', complexity: 'low', depends: [], notes: '', areas: ['process'], paths: [], specFiles: [SPEC] },
      ...specs.map(norm),
    ];
    mkdirSync(path.join(dir, 'vault/tickets'), { recursive: true });
    mkdirSync(path.join(dir, 'vault/plans'), { recursive: true });
    writeFileSync(path.join(dir, 'vault/tickets/tickets.json'), JSON.stringify({
      tickets: all.map((t) => ({ id: t.id, phase: t.phase, title: 'T', depends_on: t.depends, spec_files: t.specFiles, decisions: [], mockups: [], acs: [`AC-${t.id}-1`] })),
    }, null, 1) + '\n');
    const head = '| Ticket | Phase | Title | Status | Complexity | Depends on | Commit | Tests | Notes |';
    writeFileSync(path.join(dir, 'vault/tickets/STATUS.md'), [
      head, head.replace(/[^|]+/g, '---'),
      ...all.map((t) => `| ${t.id} | ${t.phase} | T | ${t.status} | ${t.complexity} | ${t.depends.join(', ')} | ${t.commit} | | ${t.notes} |`),
    ].join('\n') + '\n');
    for (const t of all) writeFileSync(path.join(dir, `vault/plans/${t.id}.md`), planText(t));
    const run = (...a) => spawnSync(process.execPath, [path.join(dir, 'vault/tools/next_ticket.mjs'), ...a], { encoding: 'utf8' });
    return fn(run);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const batch = (specs, id) => withVault(specs, (run) => {
  const r = run('--batch', id);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
});
const ids = (...n) => n.map((x) => ({ id: `EZD-${x}` }));
const checkLines = (specs) => withVault(specs, (run) => {
  const r = run('--check');
  return { first: r.stdout.split('\n')[0], lines: r.stdout.split('\n') };
});
const C3 = '- more than 1 ticket in progress: EZD-801, EZD-802 (PROCESS-EZDRAFT.md section 8)';
const busy = (id, extra = {}) => ({ id, status: 'in-progress', ...extra });

describe('EZD-246 batches', () => {
  test('B1 three related, cap 3', () => {
    assert.equal(batch(ids(801, 802, 803, 804), 'EZD-801'), 'EZD-801 EZD-802 EZD-803');
  });

  test('B2 high never batched', () => {
    assert.equal(batch([{ id: 'EZD-801', complexity: 'high' }, { id: 'EZD-802' }], 'EZD-801'), 'EZD-801');
    assert.equal(batch([{ id: 'EZD-801' }, { id: 'EZD-802', complexity: 'high' }, { id: 'EZD-803' }], 'EZD-801'), 'EZD-801 EZD-803');
  });

  test('B3 dependency', () => {
    const specs = [{ id: 'EZD-801' }, { id: 'EZD-802', depends: ['EZD-801'] }, { id: 'EZD-803' }];
    assert.equal(batch(specs, 'EZD-801'), 'EZD-801 EZD-803');
    assert.equal(batch(specs, 'EZD-802'), 'EZD-802');
  });

  test('B4 status, phase, complexity', () => {
    const specs = [{ id: 'EZD-801' }, { id: 'EZD-802', status: 'planned' }, { id: 'EZD-803', phase: 2 }, { id: 'EZD-804', complexity: 'low' }, { id: 'EZD-805' }];
    assert.equal(batch(specs, 'EZD-801'), 'EZD-801 EZD-805');
  });

  test('B5 areas', () => {
    const specs = [{ id: 'EZD-801' }, { id: 'EZD-802', areas: ['ui'] }, { id: 'EZD-803', areas: null }, { id: 'EZD-804' }];
    assert.equal(batch(specs, 'EZD-801'), 'EZD-801 EZD-804');
    assert.equal(batch(specs, 'EZD-803'), 'EZD-803');
  });

  test('B6 spec sections', () => {
    const specs = [
      { id: 'EZD-801' },
      { id: 'EZD-802', specFiles: ['spec/sections/04-app-shell.md'] },
      { id: 'EZD-803', specFiles: ['spec/sections/11-non-functional-requirements.md#Performance'] },
      { id: 'EZD-804', specFiles: ['spec/sections/11-non-functional-requirements.md'] },
    ];
    assert.equal(batch(specs, 'EZD-801'), 'EZD-801 EZD-804');
    assert.equal(batch(specs, 'EZD-803'), 'EZD-803 EZD-804');
  });

  test('B7 shared files, no Build steps', () => {
    const specs = [
      { id: 'EZD-801' },
      { id: 'EZD-802', paths: ['`vault/tools/EZD-801.mjs`'] },
      { id: 'EZD-803' },
      { id: 'EZD-804', paths: [] },
    ];
    assert.equal(batch(specs, 'EZD-801'), 'EZD-801 EZD-803');
    assert.equal(batch(specs, 'EZD-804'), 'EZD-804');
  });

  test('B8 related to every member', () => {
    const specs = [{ id: 'EZD-801', areas: ['tooling', 'process'] }, { id: 'EZD-802', areas: ['tooling'] }, { id: 'EZD-803', areas: ['process'] }];
    assert.equal(batch(specs, 'EZD-801'), 'EZD-801 EZD-802');
  });

  test('B9 low batch unchanged', () => {
    const specs = [
      { id: 'EZD-801', complexity: 'low', paths: ['`scripts/x/a.mjs`'] },
      { id: 'EZD-802', complexity: 'low', paths: ['`scripts/x/a.mjs`'] },
      { id: 'EZD-803', complexity: 'low', paths: ['`scripts/x/b.mjs`'] },
    ];
    assert.equal(batch(specs, 'EZD-801'), 'EZD-801 EZD-802');
  });

  test('B10 unknown ticket', () => {
    withVault(ids(801), (run) => {
      const r = run('--batch', 'EZD-999');
      assert.equal(r.status, 1);
      assert.equal(r.stderr.trim(), 'unknown ticket EZD-999');
    });
  });

  test('C1 medium batch is one unit', () => {
    const n = 'batch: EZD-801+EZD-802';
    const { first, lines } = checkLines([busy('EZD-801', { notes: n }), busy('EZD-802', { notes: n })]);
    assert.ok(first.startsWith('LEDGER'), first);
    assert.ok(!lines.some((l) => l.includes('ticket in progress')), lines.join('\n'));
  });

  test('C2 failed member does not hold the others', () => {
    const n = 'batch: EZD-801+EZD-802+EZD-803';
    const { lines } = checkLines([
      { id: 'EZD-801', status: 'done', commit: 'abc1234', notes: 'batched with: EZD-801+EZD-802+EZD-803' },
      busy('EZD-802', { notes: n }),
      { id: 'EZD-803', status: 'review', notes: n },
    ]);
    assert.ok(!lines.some((l) => l.includes('ticket in progress')), lines.join('\n'));
  });

  test('C3 high members', () => {
    const n = 'batch: EZD-801+EZD-802';
    const { lines } = checkLines([busy('EZD-801', { complexity: 'high', notes: n }), busy('EZD-802', { complexity: 'high', notes: n })]);
    assert.ok(lines.includes(C3), lines.join('\n'));
  });

  test('C4 mixed low and medium', () => {
    const n = 'batch: EZD-801+EZD-802';
    const { lines } = checkLines([busy('EZD-801', { complexity: 'low', notes: n }), busy('EZD-802', { complexity: 'medium', notes: n })]);
    assert.ok(lines.includes(C3), lines.join('\n'));
  });

  test('C5 markers differ', () => {
    const { lines } = checkLines([
      busy('EZD-801', { notes: 'batch: EZD-801+EZD-802' }),
      busy('EZD-802', { notes: 'batch: EZD-801+EZD-802+EZD-803' }),
      { id: 'EZD-803', status: 'ready' },
    ]);
    assert.ok(lines.includes(C3), lines.join('\n'));
  });

  test('S1 skill, dispatch, reviewer and process text', () => {
    const text = (rel) => readFileSync(path.join(root, rel), 'utf8');
    const has = (rel, strings) => {
      const t = text(rel);
      for (const s of strings) assert.ok(t.includes(s), `${rel} lacks: ${s}`);
    };
    const verdicts = ['Batch:', 'VERDICT <ticket>: PASS', 'VERDICT <ticket>: FAIL'];
    has('.claude/agents/code-reviewer.md', verdicts);
    has('.claude/agents/security-reviewer.md', verdicts);
    has('.claude/skills/build-ticket/dispatch.md', ['## Batch review dispatch', 'Batch: <EZD-a>', 'VERDICT <ticket>: PASS']);
    has('.claude/skills/build-ticket/SKILL.md', [
      '--batch $ARGUMENTS', '**Review batch (medium).**', 'batched with:', 'one code-reviewer dispatch', 'one security-reviewer dispatch',
      'only that ticket', 'VERDICT <ticket>:', 'unit-steps.mjs preflight <T>', 'MERGE STOP: squash failed', 'unit-steps.mjs finish <T>',
    ]);
    has('vault/PROCESS.md', ['Review batches (medium, EZD-246)', 'a review batch of 2 or 3 medium tickets']);
  });
});
