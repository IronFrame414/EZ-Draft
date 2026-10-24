// EZD-021 T19 (vault/plans/EZD-021.md section 4): static and docs checks. node:test, Node built-ins only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');
const rel = (f) => path.relative(repo, f).split(path.sep).join('/');
const KEYS = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'BFL_API_KEY'];
const BASES = ['GEMINI_BASE_URL', 'BFL_BASE_URL'];

function walk(dir, out = []) {
  const root = path.join(repo, dir);
  if (!existsSync(root)) return out;
  for (const name of readdirSync(root)) {
    const full = path.join(root, name);
    if (statSync(full).isDirectory()) walk(rel(full), out);
    else out.push(full);
  }
  return out;
}
const isTest = (f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f);
const sources = () => walk('app/src').filter((f) => /\.(ts|tsx|js|mjs)$/.test(f) && !isTest(f));

function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  assert.ok(start >= 0, `${heading} exists`);
  const level = heading.match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function specifiers(text) {
  return [...text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)].map(
    (m) => m[1],
  );
}

test('EZD-021 T19 AI code is imported only from jobs, keys are read only in config.ts, the SDK only in anthropic.ts', () => {
  const aiDir = path.join(repo, 'app/src/server/ai');
  const jobsDir = path.join(repo, 'app/src/server/jobs');
  for (const f of sources()) {
    const text = readFileSync(f, 'utf8');
    for (const spec of specifiers(text)) {
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(f), spec);
        const intoAi = target === aiDir || target.startsWith(aiDir + path.sep);
        if (!intoAi) continue;
        const insideAi = f.startsWith(aiDir + path.sep);
        const insideJobs = f.startsWith(jobsDir + path.sep);
        assert.ok(
          insideAi || insideJobs,
          `${rel(f)} imports server/ai but is outside server/ai and server/jobs`,
        );
        assert.ok(
          !/^\s*['"]use client['"]/m.test(text),
          `${rel(f)} is a client file and imports server/ai`,
        );
      }
      if (spec === '@anthropic-ai/sdk' || spec.startsWith('@anthropic-ai/sdk/')) {
        assert.equal(
          rel(f),
          'app/src/server/ai/providers/anthropic.ts',
          `SDK imported in ${rel(f)}`,
        );
      }
    }
    if (f.startsWith(aiDir + path.sep))
      assert.ok(!/setInterval/.test(text), `${rel(f)} uses setInterval`);
    if (rel(f) !== 'app/src/server/ai/config.ts') {
      for (const name of [...KEYS, ...BASES])
        assert.ok(!text.includes(name), `${name} named in ${rel(f)}`);
    }
  }
  const everything = [
    ...sources().map((f) => readFileSync(f, 'utf8')),
    read('.env.example'),
    read('docs/architecture.md'),
    read('docs/runbook.md'),
  ].join('\n');
  assert.ok(
    !/NEXT_PUBLIC_[A-Z0-9_]*(ANTHROPIC|GEMINI|OPENAI|BFL)[A-Z0-9_]*/.test(everything),
    'no NEXT_PUBLIC_ name for a provider',
  );
});

test('EZD-021 T19 docs, env names, dependency row, root test script and conventions check', () => {
  const arch = read('docs/architecture.md');
  const runtime = section(arch, '## Runtime');
  const ai = section(arch, '### AI (EZD-021)');
  for (const term of [
    'AI_MODE',
    'ai_key_not_set',
    'callClaude',
    'editImage',
    'ai_read',
    'claude-opus-5-5',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
  ]) {
    assert.ok(ai.includes(term), `### AI (EZD-021) names ${term}`);
  }
  assert.ok(runtime.includes('### AI (EZD-021)'), 'AI section is under ## Runtime');
  const headings = runtime.split('\n').filter((l) => l.startsWith('### '));
  const jobs = headings.findIndex((l) => l.startsWith('### Background jobs (EZD-009)'));
  assert.equal(headings[jobs + 1], '### AI (EZD-021)', 'AI section follows Background jobs');

  const envTable = section(arch, '### Environment variables');
  for (const name of ['AI_MODE', ...KEYS, ...BASES, 'AI_STUB_DIR', 'EZD_NET_GUARD_LOG']) {
    assert.ok(
      envTable.split('\n').some((l) => l.startsWith(`| \`${name}\``)),
      `env row ${name}`,
    );
  }
  const stack = arch.split('\n').find((l) => l.startsWith('| AI |'));
  assert.ok(stack.includes('`@anthropic-ai/sdk`'), 'Stack AI row Packages');
  const version = JSON.parse(read('app/package.json')).dependencies['@anthropic-ai/sdk'];
  assert.ok(version, 'app depends on @anthropic-ai/sdk');
  const row = arch.split('\n').find((l) => l.startsWith('| `@anthropic-ai/sdk`'));
  assert.ok(row, 'Dependencies row');
  const cells = row.split('|').map((c) => c.trim());
  assert.equal(cells[2], `\`${version}\``);
  assert.equal(cells[3], 'app');
  assert.equal(cells[cells.length - 2], 'EZD-021');
  const machine = section(arch, '## Machine checks').split('\n');
  const live = machine.find((l) => l.includes('A test reaching a live provider fails'));
  assert.ok(
    live &&
      /EZD-021 \|$/.test(live) &&
      live.includes('net-guard.test.ts') &&
      live.includes('net-guard.spec.ts'),
    'live-provider row names T12-T14',
  );
  assert.ok(
    machine.some((l) => /EZD-021 \|$/.test(l) && l.includes('ai-static.test.mjs')),
    'AI import row',
  );

  const run = read('docs/runbook.md');
  const book = section(run, '## AI providers (EZD-021)');
  for (const name of ['AI_MODE', ...KEYS]) assert.ok(book.includes(name), `runbook names ${name}`);
  assert.ok(
    run.indexOf('## AI providers (EZD-021)') <
      run.indexOf('## Environments and releases (EZD-023)'),
    'runbook order',
  );

  const lines = read('.env.example')
    .split('\n')
    .map((l) => l.trim());
  assert.ok(lines.includes('AI_MODE='), 'AI_MODE name');
  for (const name of [...KEYS, ...BASES]) {
    assert.ok(lines.includes(`# ${name}=`), `comment line ${name}`);
  }
  for (const name of BASES)
    assert.ok(!lines.includes(`${name}=`), `${name} is not a required name`);

  const test = JSON.parse(read('package.json')).scripts.test;
  for (const token of [
    '--import ./app/test-harness/net-guard/preload.mjs',
    'scripts/**/*.test.mjs',
    '--test-concurrency=4',
  ]) {
    assert.ok(test.includes(token), `root test has ${token}`);
  }
  const check = spawnSync(process.execPath, ['scripts/conventions/check.mjs', '.'], {
    cwd: repo,
    encoding: 'utf8',
  });
  assert.equal(check.status, 0, check.stdout + check.stderr);
});
