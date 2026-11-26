// EZD-1993 (AC-EZD-1993-1, -2, -3): the gate's step list and the GitHub CI jobs that split it.
// Expected values come from the ticket and scripts/check.mjs before this change (nine steps, in order): one required check named gate that fails when any part fails, timeout-minutes 45 unchanged, every stage
// still run. No process is started: the step list is a pure function and ci.yml is read as YAML.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { PARTS, partArg, selectPart } from '../check-steps.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// The full check's nine steps in order (scripts/check.mjs before EZD-1993, 8082de22).
const FULL_NAMES = ['install', 'database', 'typecheck', 'lint', 'test', 'scripts tests', 'build', 'database again', 'e2e'];
const FULL = FULL_NAMES.map((n, i) => [n, 'cmd', [String(i)]]);
const names = (steps) => steps.map(([n]) => n);

describe('EZD-1993 gate steps', () => {
  test('scripts/check.mjs still lists the nine steps in order and applies a part only through selectPart', () => {
    const src = readFileSync(path.join(repo, 'scripts', 'check.mjs'), 'utf8');
    const list = src.slice(src.indexOf('const allSteps = ['), src.indexOf('const part = partArg(args);'));
    const listed = [...list.matchAll(/^\s*\['([a-z0-9 ]+)', /gm)].map((m) => m[1]);
    assert.deepEqual(listed, FULL_NAMES);
    assert.ok(src.includes('steps = selectPart(allSteps, { part, fast });'));
  });

  test('no part flag: the steps are returned as given (local gate and --fast unchanged)', () => {
    assert.equal(selectPart(FULL, { part: null }), FULL);
    const fastSteps = FULL.slice(0, 5);
    assert.equal(selectPart(fastSteps, { part: null, fast: true }), fastSteps);
    assert.equal(partArg(['.']), null);
    assert.equal(partArg(['.', '--fast']), null);
  });

  test('the two parts keep the full order and together run every step', () => {
    const checks = selectPart(FULL, { part: 'checks' });
    const e2e = selectPart(FULL, { part: 'e2e' });
    assert.deepEqual(names(checks), ['install', 'database', 'typecheck', 'lint', 'test', 'scripts tests']);
    assert.deepEqual(names(e2e), ['install', 'database', 'build', 'database again', 'e2e']);
    for (const s of [...checks, ...e2e]) assert.equal(s, FULL.find(([n]) => n === s[0]), 'the same step, unchanged');
    const covered = new Set([...names(checks), ...names(e2e)]);
    for (const n of FULL_NAMES) assert.ok(covered.has(n), `step ${n} runs in some part`);
    assert.deepEqual(Object.keys(PARTS).sort(), ['checks', 'e2e']);
  });

  test('part flag parsing: only --part=<name>; an unknown part, --part with --fast or a missing step is refused', () => {
    assert.equal(partArg(['.', '--part=e2e']), 'e2e');
    assert.equal(partArg(['--part=checks', '.']), 'checks');
    assert.equal(partArg(['.', '--part']), '');
    assert.throws(() => selectPart(FULL, { part: '' }), /unknown --part/);
    assert.throws(() => selectPart(FULL, { part: 'lint' }), /unknown --part/);
    assert.throws(() => selectPart(FULL, { part: 'e2e', fast: true }), /--fast/);
    assert.throws(() => selectPart(FULL.slice(0, 5), { part: 'e2e' }), /does not have: build, database again, e2e/);
  });
});

describe('EZD-1993 CI workflow', () => {
  const text = readFileSync(path.join(repo, '.github', 'workflows', 'ci.yml'), 'utf8');
  const doc = yaml.load(text);
  const jobs = doc.jobs;
  const runs = (job) => job.steps.filter((s) => typeof s.run === 'string').map((s) => s.run);
  const checkRuns = (job) => runs(job).filter((r) => r.includes('scripts/check.mjs'));

  test('one job named gate needs every other job, always runs and fails unless each one succeeded', () => {
    const others = Object.keys(jobs).filter((k) => k !== 'gate');
    assert.ok(others.length >= 2, 'the gate is split into parallel jobs');
    const gate = jobs.gate;
    assert.ok(gate, 'a job named gate (the required status check)');
    assert.deepEqual([...gate.needs].sort(), others.sort(), 'gate needs every other job');
    // A skipped required check counts as passed on GitHub, so gate must run even when a part failed or was cancelled.
    assert.equal(gate.if, 'always()');
    const body = runs(gate).join('\n');
    for (const k of others) {
      assert.ok(body.includes(`needs.${k}.result`) || gate.steps.some((s) => JSON.stringify(s.env ?? {}).includes(`needs.${k}.result`)),
        `gate reads the result of ${k}`);
    }
    assert.match(body, /exit 1/);
  });

  test('every job keeps timeout-minutes 45 and the scripts/check.mjs parts cover the full check', () => {
    for (const [k, job] of Object.entries(jobs)) assert.equal(job['timeout-minutes'], 45, `${k} timeout-minutes`);
    const used = Object.entries(jobs).filter(([k]) => k !== 'gate').flatMap(([, job]) => checkRuns(job));
    const parts = new Set(used.map((r) => (/--part=([a-z0-9]+)/.exec(r) ?? [])[1]));
    assert.deepEqual([...parts].sort(), Object.keys(PARTS).sort(), `ci.yml runs each part: ${used.join(' | ')}`);
    for (const r of used) assert.ok(r.startsWith('node scripts/check.mjs . --part='), r);
  });

  test('the e2e part runs as device shards 1..n of n plus the perf project alone', () => {
    const e2eJobs = Object.values(jobs).filter((j) => checkRuns(j).some((r) => r.includes('--part=e2e')));
    const values = [];
    for (const job of e2eJobs) {
      const v = job.steps.find((s) => s.run?.includes('--part=e2e')).env?.EZD_E2E_PART;
      const matrix = job.strategy?.matrix?.part;
      if (Array.isArray(matrix)) {
        assert.equal(v, '${{ matrix.part }}');
        assert.equal(job.strategy['fail-fast'], false, 'one failing shard does not cancel the others');
        values.push(...matrix);
      } else values.push(v);
    }
    const shards = values.filter((v) => v.startsWith('devices:'));
    const n = shards.length;
    assert.ok(n >= 2, 'at least two device shards');
    assert.deepEqual(shards.sort(), Array.from({ length: n }, (_, i) => `devices:${i + 1}/${n}`).sort());
    assert.deepEqual(values.filter((v) => !v.startsWith('devices:')), ['perf']);
  });
});
