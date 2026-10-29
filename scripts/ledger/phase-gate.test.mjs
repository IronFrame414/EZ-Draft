// EZD-254: the next-unit gate loop runs every finished phase up to the working phase, in phase order, so a blocked ticket
// of an earlier, already wrapped phase (EZD-003) cannot skip a later phase's gate. Each test builds its own copy of vault/
// (fixture D6) and runs its cases in order on that copy. The gh call is stubbed (D8: one pending check), so no test
// reaches GitHub.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PR = 'https://github.com/o/r/pull/5';
const WAIT = `none: waiting for the phase 1 PR to auto-merge on a green CI gate (${PR})`;
const P2 = 'none: phase 2 spec not signed off (spec-check unit needs Josh)';
// D9: gate record texts.
const PENDING = 'Audit verdict: pending\n';
const OPEN_PR = `PR: ${PR}\nDevelop at PR: 0000000\nMerged: no\n`;
const MERGED = `PR: ${PR}\nDevelop at PR: 0000000\nMerged: yes\n`;
const COST_01 = '# Phase 1 cost (test)\n';

// D8: one gh shim per test file. `gh pr checks` gets one pending check and exits 8.
const shimDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd254-gh-')));
writeFileSync(path.join(shimDir, 'gh'), `#!/bin/sh\necho '[{"name":"gate","bucket":"pending","link":"x"}]'\nexit 8\n`);
chmodSync(path.join(shimDir, 'gh'), 0o755);

const copies = [];
after(() => {
  for (const d of [...copies, shimDir]) rmSync(d, { recursive: true, force: true });
});

// D6: a copy of vault/ with a fixed ledger state. `later` is the state of every phase 2+ ticket: 'todo' (not signed off)
// or 'blocked' (signed off in SIGNOFF.md, so a finished phase is gated).
function makeCopy({ later }) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'ezd254-')));
  copies.push(dir);
  const vault = path.join(dir, 'vault');
  const file = (rel) => path.join(vault, rel);
  // (1)
  cpSync(path.join(root, 'vault'), vault, { recursive: true, filter: (s) => !/[\\/]vault[\\/](mockups|archive)([\\/]|$)/.test(s) });
  mkdirSync(path.join(dir, 'docs'), { recursive: true });
  cpSync(path.join(root, 'docs', 'architecture.md'), path.join(dir, 'docs', 'architecture.md'));
  for (const f of ['handoff/STOP', 'handoff/BUDGET_HOLD.md', 'handoff/LAUNCHER_FIX.md']) rmSync(file(f), { force: true });

  // (2) tickets.json
  const data = JSON.parse(readFileSync(file('tickets/tickets.json'), 'utf8'));
  for (const t of data.tickets) {
    delete t.priority;
    if (t.phase >= 1 && !('architecture' in t) && !existsSync(file(`plans/${t.id}.md`))) t.architecture = [];
  }
  writeFileSync(file('tickets/tickets.json'), JSON.stringify(data, null, 1) + '\n');

  // (3) open question rows
  writeFileSync(file('questions/QUESTIONS.md'), readFileSync(file('questions/QUESTIONS.md'), 'utf8')
    .replace(/^(\|\s*Q-\d{4}\s*\|[^|]*\|[^|]*\|[^|]*\|\s*)open(\s*\|)/gm, '$1answered-agent$2'));

  // (4) STATUS.md: Status is c[2], Notes is c[7] (cells after the ID)
  const phaseOf = new Map(data.tickets.map((t) => [t.id, t.phase]));
  const statusPath = file('tickets/STATUS.md');
  writeFileSync(statusPath, readFileSync(statusPath, 'utf8').split('\n').map((line) => {
    const m = line.match(/^\| (EZD-\w+) \|(.*)\|$/);
    if (!m) return line;
    const id = m[1];
    const c = m[2].split('|');
    const st = c[2].trim();
    const phase = phaseOf.get(id);
    let next = st;
    if (id === 'EZD-003' || (phase === 1 && st !== 'done')) next = 'blocked';
    else if (phase >= 2) next = later === 'todo' ? 'todo' : 'blocked';
    if (next !== st) {
      c[2] = ` ${next} `;
      if (next === 'blocked' && !c[7].trim()) c[7] = ' ezd-254 test ';
    }
    return `| ${id} |${c.join('|')}|`;
  }).join('\n'));

  // (5) SIGNOFF.md: drop the phase 2+ rows; with later 'blocked', sign off each phase 2+ that has a ticket
  const signoff = file('spec/SIGNOFF.md');
  const kept = readFileSync(signoff, 'utf8').split('\n').filter((line) => {
    const s = line.match(/^\|\s*(\d+)\s*\|/);
    return !(s && Number(s[1]) >= 2);
  });
  let signoffText = kept.join('\n');
  if (later === 'blocked') {
    const laterPhases = [...new Set(data.tickets.map((t) => t.phase))].filter((p) => p >= 2).sort((a, b) => a - b);
    signoffText += laterPhases.map((n) => `| ${n} | ezd-254 test | 2026-10-28 | ezd-254 test |\n`).join('');
  }
  writeFileSync(signoff, signoffText);

  // (6) phase 1 has no gate record and no cost file
  rmSync(file('cost/phase-01.md'), { force: true });
  rmSync(file('tickets/gates/phase-01.md'), { force: true });

  // D7: run the tool in the copy with the gh shim first on PATH.
  const nt = (...args) => spawnSync(process.execPath, [file('tools/next_ticket.mjs'), ...args], {
    encoding: 'utf8',
    cwd: dir,
    env: { ...process.env, PATH: shimDir + path.delimiter + process.env.PATH, GIT_CEILING_DIRECTORIES: path.dirname(dir) },
  });

  // (7) the copy must pass the ledger check
  const check = nt('--check');
  assert.equal(check.status, 0, `--check on the copy exits 0; stdout: ${check.stdout.trim()}; stderr: ${check.stderr.trim()}`);

  return {
    dir,
    file,
    nt,
    setStatus(id, st) {
      const p = file('tickets/STATUS.md');
      writeFileSync(p, readFileSync(p, 'utf8')
        .replace(new RegExp(`^(\\| ${id} \\|[^|]*\\|[^|]*\\| )[a-z-]+( \\|)`, 'm'), `$1${st}$2`));
    },
  };
}

// Runs --next-unit on the copy and compares its output with the plan's text.
function step(copy, expected, label) {
  const r = copy.nt('--next-unit');
  assert.equal(r.stdout.trim(), expected, `${label}; stderr: ${r.stderr.trim()}`);
}

test('EZD-254 T1 phase 1 gated, waited on, wrapped, then phase 2 (AC-EZD-254-1)', () => {
  const c = makeCopy({ later: 'todo' });
  step(c, 'gate-phase 1', '(a) no gate record');
  writeFileSync(c.file('tickets/gates/phase-01.md'), PENDING);
  step(c, 'gate-phase 1', '(a2) gate record with Audit verdict pending');
  writeFileSync(c.file('tickets/gates/phase-01.md'), OPEN_PR);
  step(c, WAIT, '(b) open PR');
  writeFileSync(c.file('tickets/gates/phase-01.md'), MERGED);
  step(c, 'wrap 1', '(c) merged PR, not wrapped');
  writeFileSync(c.file('cost/phase-01.md'), COST_01);
  step(c, P2, '(d) phase 1 wrapped');
});

test('EZD-254 T2 phase 0 stays wrapped (AC-EZD-254-2)', () => {
  const c = makeCopy({ later: 'todo' });
  rmSync(c.file('tickets/gates/phase-00.md'), { force: true });
  // (i) phase 1 wrapped
  writeFileSync(c.file('tickets/gates/phase-01.md'), MERGED);
  writeFileSync(c.file('cost/phase-01.md'), COST_01);
  step(c, P2, '(i) phase 1 wrapped, phase 0 wrapped and not gated');
  // (ii) no phase 1 record or cost file; EZD-254 todo makes phase 1 the working phase
  rmSync(c.file('tickets/gates/phase-01.md'), { force: true });
  rmSync(c.file('cost/phase-01.md'), { force: true });
  c.setStatus('EZD-254', 'todo');
  const check = c.nt('--check');
  assert.equal(check.status, 0, `--check after EZD-254 is todo exits 0; stdout: ${check.stdout.trim()}; stderr: ${check.stderr.trim()}`);
  step(c, 'plan EZD-254', '(ii) working phase 1 with no gate record, phase 0 not gated');
});

test('EZD-254 T3 no working phase: every finished phase gated in order (AC-EZD-254-1)', () => {
  const c = makeCopy({ later: 'blocked' });
  step(c, 'gate-phase 1', '(a) no phase 1 record, no working phase');
  writeFileSync(c.file('tickets/gates/phase-01.md'), MERGED);
  step(c, 'wrap 1', '(c) merged phase 1 record, not wrapped');
  writeFileSync(c.file('cost/phase-01.md'), COST_01);
  step(c, 'gate-phase 2', '(d) phase 1 wrapped, phase 2 finished and not gated');
});
