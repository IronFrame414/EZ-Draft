// EZD-1955 (audit 2026-11-23 O2): the reviewer prompt fails a ticket whose ACs are not each named in a test; tickets
// merged before are reported, not failed. Fixture AC ids are assembled at run time so this file names none itself.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acReviewLines, traceTicket } from '../ac-review.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ac = (t, n) => ['AC', 'EZD', t, n].join('-');
const roots = [];
after(() => { for (const d of roots) rmSync(d, { recursive: true, force: true }); });

test('AC-EZD-1955-2: an AC not named in a test is a blocking finding that fails the ticket', () => {
  const t = { id: 'EZD-9201', acs: [ac('9201', 1), ac('9201', 2)] };
  const text = acReviewLines(t, [ac('9201', 2)]).join('\n');
  assert.match(text, new RegExp(`not named in any test: ${ac('9201', 2)}\\.`));
  assert.match(text, /blocking finding \(verdict "fail"\)/);
  assert.doesNotMatch(text, new RegExp(`${ac('9201', 1)}(?![0-9])`));
  // ACs of tickets merged before this one never fail it.
  assert.match(text, /merged before this one .* never as a finding/);
});

test('AC-EZD-1955-2: a ticket merged before the rule is reported in notes, not failed', () => {
  const t = { id: 'EZD-9202', acs: [ac('9202', 1)] };
  const text = acReviewLines(t, [ac('9202', 1)], { alreadyDone: true }).join('\n');
  assert.match(text, /Report them in "notes" only; they are not a finding and do not fail the ticket/);
  assert.doesNotMatch(text, /blocking finding/);
});

test('AC-EZD-1955-2: no fail rule when every AC is named, and no lines for a ticket without ACs', () => {
  const text = acReviewLines({ id: 'EZD-9203', acs: [ac('9203', 1)] }, []).join('\n');
  assert.match(text, /found every one named in a test/);
  assert.doesNotMatch(text, /blocking finding/);
  assert.deepEqual(acReviewLines({ id: 'EZD-9204' }, []), []);
  assert.deepEqual(acReviewLines({ id: 'EZD-9204', acs: [] }, []), []);
});

test('AC-EZD-1955-3: traceTicket reads the worktree and finds the unnamed AC of the ticket under review', () => {
  const wt = mkdtempSync(path.join(os.tmpdir(), 'ac-review-'));
  roots.push(wt);
  mkdirSync(path.join(wt, 'vault/tickets'), { recursive: true });
  mkdirSync(path.join(wt, 'scripts/loop/__tests__'), { recursive: true });
  writeFileSync(path.join(wt, 'vault/tickets/tickets.json'), JSON.stringify({ tickets: [{ id: 'EZD-9205', acs: [ac('9205', 1), ac('9205', 2)] }] }));
  writeFileSync(path.join(wt, 'scripts/loop/__tests__/x.test.mjs'), `test('${ac('9205', 1)}: proven', () => {});\n`);
  assert.deepEqual(traceTicket(wt, 'EZD-9205'), { missing: [ac('9205', 2)], error: '' });
  // A broken tickets.json is an error line in the prompt, not a crash of the loop.
  writeFileSync(path.join(wt, 'vault/tickets/tickets.json'), '{ not json');
  const broken = traceTicket(wt, 'EZD-9205');
  assert.deepEqual(broken.missing, []);
  assert.ok(broken.error);
  assert.match(acReviewLines({ id: 'EZD-9205', acs: [ac('9205', 1)] }, [], broken).join('\n'), /could not run/);
});

test('AC-EZD-1955-3: scripts/loop.mjs puts the AC trace into the reviewer prompt and reports done tickets at start', () => {
  const src = readFileSync(path.join(REPO, 'scripts/loop.mjs'), 'utf8');
  assert.match(src, /import \{ acReviewLines, traceTicket \} from '\.\/loop\/ac-review\.mjs';/);
  assert.match(src, /\.\.\.acReviewLines\(t, trace\.missing, trace\)/);
  assert.match(src, /traceTicket\(wt, t\.id\), alreadyDone: \(s\.done \|\| \[\]\)\.includes\(t\.id\)/);
  assert.equal((src.match(/reviewerPrompt\(t, sec, plan, trace\)/g) || []).length, 2);
  assert.match(src, /traceDone\(ROOT\)/);
});

// EZD-2023 (audit 2026-11-27 X2): marked ACs are listed as skipped in the reviewer prompt, never as blocking findings.
// AC-EZD-2023-4: the new tests for the AC review change. They run on a temporary fixture folder; they start no docker,
// launchctl or child process.
test('AC-EZD-2023-2: the reviewer prompt lists skipped ACs as skipped and fails only the traced ones', () => {
  const t = { id: 'EZD-9206', acs: [ac('9206', 1), ac('9206', 2), ac('9206', 3)] };
  const skipped = [{ id: ac('9206', 1), reason: 'field check' }, { id: ac('9206', 2), reason: 'met by EZD-1011' }];
  const text = acReviewLines(t, [ac('9206', 3)], { skipped }).join('\n');
  assert.match(text, new RegExp(`Skipped by the AC trace.*${ac('9206', 1)} \\(field check\\), ${ac('9206', 2)} \\(met by EZD-1011\\)`));
  assert.match(text, /do not fail the ticket over them/);
  assert.match(text, new RegExp(`not named in any test: ${ac('9206', 3)}\\.`));
  assert.doesNotMatch(text, new RegExp(`not named in any test: [^\\n]*${ac('9206', 1)}(?![0-9])`));
  // All ACs either named or skipped: no blocking rule, the skipped ones still listed.
  const clean = acReviewLines(t, [], { skipped }).join('\n');
  assert.doesNotMatch(clean, /blocking finding/);
  assert.match(clean, /found every other one named in a test/);
  assert.match(clean, /Skipped by the AC trace/);
  // No skipped ACs: no skipped line.
  assert.doesNotMatch(acReviewLines(t, []).join('\n'), /Skipped by the AC trace/);
});

test('AC-EZD-2023-2: traceTicket reads the markers of the worktree AC file and the loop logs the skipped ones', () => {
  const wt = mkdtempSync(path.join(os.tmpdir(), 'ac-review-'));
  roots.push(wt);
  mkdirSync(path.join(wt, 'vault/tickets'), { recursive: true });
  mkdirSync(path.join(wt, 'vault/spec'), { recursive: true });
  writeFileSync(path.join(wt, 'vault/tickets/tickets.json'), JSON.stringify({ tickets: [{ id: 'EZD-9207', acs: [ac('9207', 1), ac('9207', 2)] }] }));
  writeFileSync(path.join(wt, 'vault/spec/acceptance-criteria.md'), `| ${ac('9207', 1)} | EZD-9207 x | Done by the planner. *(not a builder task)* |\n| ${ac('9207', 2)} | EZD-9207 x | A thing works. |\n`);
  assert.deepEqual(traceTicket(wt, 'EZD-9207'), { missing: [ac('9207', 2)], error: '', skipped: [{ id: ac('9207', 1), reason: 'not a builder task' }] });
  const src = readFileSync(path.join(REPO, 'scripts/loop.mjs'), 'utf8');
  assert.match(src, /AC trace: skipped \(not a test\)/);
});
