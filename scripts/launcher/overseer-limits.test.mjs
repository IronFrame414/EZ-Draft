// EZD-333 L1 (vault/plans/EZD-333.md sections 3 and 4): the overseer helpers in scripts/launcher-idle.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as idle from '../launcher-idle.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Security review finding 1 (close the class, CLAUDE.md rule 18): every file a hook or the gate loads, followed through relative
// imports, is a hard limit, so a repair cannot switch a guard or the gate off by breaking a file it loads.
test('EZD-333 L1e: every file the hooks and the gate load is a hard limit (AC-EZD-333-2)', () => {
  const start = [...readdirSync(path.join(repo, '.claude/hooks')).filter((n) => n.endsWith('.mjs')).map((n) => `.claude/hooks/${n}`), 'scripts/gate.mjs'];
  const seen = new Set();
  const todo = [...start];
  while (todo.length) {
    const rel = todo.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const src = readFileSync(path.join(repo, rel), 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\(\s*|new URL\(\s*)'(\.{1,2}\/[^']+)'/g)) {
      const next = path.relative(repo, path.resolve(path.dirname(path.join(repo, rel)), m[1]));
      if (existsSync(path.join(repo, next))) todo.push(next);
    }
  }
  for (const must of ['vault/tools/outline.mjs', 'scripts/gate-lock.mjs', 'scripts/launcher-idle.mjs', '.claude/hooks/secret-paths.mjs']) assert.ok(seen.has(must), must);
  for (const rel of [...seen].sort()) assert.equal(typeof idle.repairForbidden(rel), 'string', rel);
});

test('EZD-333 L1a: repair unit ids (AC-EZD-333-1)', () => {
  for (const id of ['repair-check', 'repair-waiting', 'repair-ci', 'repair-probe']) assert.ok(idle.REPAIR_UNIT_RE.test(id), id);
  for (const id of ['build-EZD-1', 'repair-', 'repair-checks', 'xrepair-ci', 'repair_ci', '']) assert.ok(!idle.REPAIR_UNIT_RE.test(id), id);
});

test('EZD-333 L1b: repairForbidden names every hard-limit path, worktree prefix stripped (AC-EZD-333-2)', () => {
  const forbidden = [
    '.claude/hooks/guard-bash.mjs', '.claude/hooks/guard-reads.mjs', '.claude/hooks/secret-paths.mjs', '.claude/hooks/guard-paths.mjs',
    '.claude/hooks/lib.mjs', '.claude/hooks/new-hook.mjs', '.claude/settings.json', '.claude/settings.local.json',
    '.claude/skills/repair/SKILL.md', '.claude/agents/code-reviewer.md', '.claude/agents/security-reviewer.md',
    'scripts/unit-sandbox.json', 'scripts/gate.mjs', 'scripts/gate-summary.mjs', 'scripts/launcher-idle.mjs',
    '.github/workflows/ci.yml', '.github/CODEOWNERS', 'package.json', 'app/package.json',
    'scripts/launcher/repair.test.mjs', 'app/src/a.spec.ts', 'app/e2e/x.ts', 'scripts/launcher/test-utils/harness.mjs',
    'app/vitest.config.ts', 'app/.env', 'app/.env.local', 'scripts/gate-lock.mjs', 'scripts/db/lane.mjs', 'vault/tools/outline.mjs',
    '.claude/worktrees/EZD-1/.claude/hooks/guard-bash.mjs', '.claude/worktrees/EZD-1/scripts/gate.mjs',
  ];
  for (const p of forbidden) assert.equal(typeof idle.repairForbidden(p), 'string', p);
  const allowed = [
    'scripts/run.mjs', 'scripts/perf/budgets.mjs', 'scripts/ledger.mjs', 'vault/tools/next_ticket.mjs', '.claude/skills/build-ticket/SKILL.md',
    '.claude/agents/builder.md', 'vault/handoff/LAUNCHER_FIX.md', 'vault/tickets/STATUS.md', 'app/.env.example', '.claude/worktrees/EZD-1/scripts/run.mjs',
  ];
  for (const p of allowed) assert.equal(idle.repairForbidden(p), null, p);
});

test('EZD-333 L1c: fixModePaths reads only the Paths list, and fixListed matches files and folders (AC-EZD-333-1)', () => {
  const text = '# Fix\n\nscripts/a.mjs\n\n## Paths\n- scripts/perf/budgets.mjs\n- `scripts/x/`\n* scripts/star.mjs\n\n## Notes\n- scripts/run.mjs\n';
  const paths = idle.fixModePaths(text);
  assert.deepEqual(paths, ['scripts/perf/budgets.mjs', 'scripts/x/']);
  assert.ok(idle.fixListed(paths, 'scripts/perf/budgets.mjs'));
  assert.ok(idle.fixListed(paths, 'scripts/x/y/z.mjs'));
  assert.ok(!idle.fixListed(paths, 'scripts/x'));
  assert.ok(!idle.fixListed(paths, 'scripts/perf/budgets.mjs.bak'));
  assert.ok(!idle.fixListed(paths, 'scripts/run.mjs'));
  assert.deepEqual(idle.fixModePaths('# no list\n'), []);
});

test('EZD-333 L1d: joshQuestion accepts only design and user-interface questions (AC-EZD-333-4, AC-EZD-333-5)', () => {
  for (const l of ['design: pick the header colour', 'UI: which icon for archive', 'Design: x', 'ui:y']) assert.ok(idle.joshQuestion(l), l);
  for (const l of ['set the key', 'apply vault/handoff/x.patch', 'designer: x', 'money: price', 'question about design: x', '']) assert.ok(!idle.joshQuestion(l), l);
});
