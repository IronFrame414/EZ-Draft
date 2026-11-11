// EZD-382 P1 to P4: planner and plan-checker limits, the plan-checker dispatch route, and no character target in the planning texts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedRecordViews } from '../launcher/test-utils/record-views.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

// Frontmatter runs from line 1 '---' to the next '---' line (retrievers.test.mjs parse()).
function parse(rel) {
  const lines = read(rel).split('\n');
  assert.equal(lines[0], '---', `${rel}: line 1 must be ---`);
  const end = lines.indexOf('---', 1);
  assert.ok(end > 0, `${rel}: closing --- missing`);
  const entries = lines.slice(1, end).map((line) => {
    const i = line.indexOf(': ');
    return [line.slice(0, i), line.slice(i + 2).trim()];
  });
  return { fm: Object.fromEntries(entries) };
}

test('EZD-382 P1 the planner has maxTurns 100', () => {
  const { fm } = parse('.claude/agents/planner.md');
  assert.equal(fm.maxTurns, '100');
  assert.equal(fm.model, 'claude-opus-5-5');
  assert.equal(fm.effort, 'high');
});

test('EZD-382 P2 the plan-checker runs on Opus 5.5 at high effort', () => {
  const { fm } = parse('.claude/agents/plan-checker.md');
  assert.equal(fm.model, 'claude-opus-5-5');
  assert.equal(fm.effort, 'high');
  assert.equal(fm.maxTurns, '60');
});

test('EZD-382 P3 the plan-checker dispatch route is Opus 5.5 at high effort', () => {
  // Fresh copy of vault/ (findings.test.mjs beforeEach) so the real records are never touched.
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd-planlimits-')));
  try {
    const vault = path.join(dir, 'vault');
    cpSync(path.join(ROOT, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
    seedRecordViews(vault);
    mkdirSync(path.join(dir, '.claude/skills/build-ticket'), { recursive: true });
    cpSync(path.join(ROOT, '.claude/skills/build-ticket/SKILL.md'), path.join(dir, '.claude/skills/build-ticket/SKILL.md'));
    mkdirSync(path.join(dir, 'docs'), { recursive: true });
    cpSync(path.join(ROOT, 'docs/architecture.md'), path.join(dir, 'docs/architecture.md'));
    mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    cpSync(path.join(ROOT, 'scripts/records.mjs'), path.join(dir, 'scripts/records.mjs'));
    writeFileSync(path.join(dir, 'scripts/launcher.config.json'), JSON.stringify({ log_dir: path.join(dir, 'logs') }));
    const imp = spawnSync(process.execPath, [path.join(dir, 'scripts/records.mjs'), 'import', '--replace', '--vault', vault, '--db', path.join(dir, 'records.db')], { encoding: 'utf8' });
    assert.equal(imp.status, 0, imp.stdout + imp.stderr);
    const r = spawnSync(process.execPath, [path.join(vault, 'tools/next_ticket.mjs'), '--dispatch', 'EZD-245', 'plan-checker'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(r.stdout.trim(), '{"agent":"plan-checker","model":"claude-opus-5-5","effort":"high","orchestratorAdvice":false}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// L-041 exception: the AC removes a rule, so the four texts are read for the removed character targets.
test('EZD-382 P4 no character target in the planner, the plan-ticket skill, PROCESS.md or the template', () => {
  for (const rel of ['.claude/agents/planner.md', '.claude/skills/plan-ticket/SKILL.md', 'vault/PROCESS.md', 'vault/plans/TEMPLATE.md']) {
    const text = read(rel);
    assert.doesNotMatch(text, /25,000 characters/, `${rel}: 25,000 characters`);
    assert.doesNotMatch(text, /45,000 characters/, `${rel}: 45,000 characters`);
  }
  assert.match(read('vault/PROCESS.md'), /25,000-character file/);
});
