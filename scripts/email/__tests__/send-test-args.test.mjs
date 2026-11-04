// EZD-151 T11-T13 (vault/plans/EZD-151.md sections 3, 4 and 6 R1).
// node:test, Node 22 built-ins only. No test makes a network request: main always gets a fake fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const read = (...p) => readFileSync(path.join(repo, ...p), 'utf8');
const loadModule = () => import('../send-test.mjs');

const FROM = 'EZ Draft Test <test@example.test>';

// Section 6 R1 of the plan, verbatim.
const R1 =
  'Before you switch a preview to `resend`, create a separate key in Resend: name `ezdraft-preview`, permission Sending access, domain `ezcontractorbinder.com`, and put it in the Preview `RESEND_API_KEY`. Never put `ezdraft-production` in Preview.';

function makeFake(result) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push([url, init]);
    return new Response(JSON.stringify(result.body), { status: result.status });
  };
  fn.calls = calls;
  return fn;
}
function makeIo() {
  const lines = [];
  return { lines, log: (l) => lines.push(String(l)), error: (l) => lines.push(String(l)) };
}

function sectionOf(lines, headIndex, stopRe) {
  let end = lines.findIndex((l, i) => i > headIndex && stopRe.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(headIndex + 1, end);
}
const cells = (l) =>
  l
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

test('EZD-151 parseArgs forms', async () => {
  const { parseArgs } = await loadModule();
  assert.deepEqual(parseArgs(['--to=a@example.test']), { to: 'a@example.test', unknown: [] });
  assert.deepEqual(parseArgs(['--to', 'a@example.test']), { to: 'a@example.test', unknown: [] });
  assert.deepEqual(parseArgs(['--to']), { to: null, unknown: ['--to'] });
  assert.deepEqual(parseArgs(['--to=']), { to: '', unknown: [] });
  assert.deepEqual(parseArgs(['--to=a@example.test', '--x']), {
    to: 'a@example.test',
    unknown: ['--x'],
  });
  assert.deepEqual(parseArgs([]), { to: null, unknown: [] });
  assert.deepEqual(parseArgs(['--to', 'a@example.test', '--to=b@example.test']), {
    to: 'b@example.test',
    unknown: [],
  });
});

test('EZD-151 done when: parseArgs --to=<v> is tested', async () => {
  const { main } = await loadModule();
  const fake = makeFake({ status: 200, body: { id: 'msg_1' } });
  const io = makeIo();
  const code = await main(
    ['--to=josh@example.test'],
    { RESEND_API_KEY: 're_fake', EMAIL_FROM: FROM },
    fake,
    io,
  );
  assert.equal(code, 0);
  assert.equal(fake.calls.length, 1);
  assert.equal(JSON.parse(fake.calls[0][1].body).to, 'josh@example.test');
});

test('EZD-151 runbook and architecture name the preview key', () => {
  const runbook = read('docs', 'runbook.md').split('\n');
  const heads = runbook
    .map((l, i) => [l, i])
    .filter(([l]) => l === '## Email (EZD-008)')
    .map(([, i]) => i);
  assert.equal(heads.length, 1, 'exactly one Email heading');
  const section = sectionOf(runbook, heads[0], /^## /);
  const stepFour = section.filter((l) => l.startsWith('4. '));
  assert.equal(stepFour.length, 1, 'one step 4 line');
  assert.ok(stepFour[0].trimEnd().endsWith(` ${R1}`), 'step 4 ends with the preview-key text');

  const lines = read('docs', 'architecture.md').split('\n');
  const envHead = lines.findIndex((l) => l.trim() === '### Environment variables');
  assert.ok(envHead >= 0, '### Environment variables');
  const envSection = sectionOf(lines, envHead, /^##/);
  const rows = envSection.filter(
    (l) => l.trim().startsWith('|') && cells(l)[0] === '`RESEND_API_KEY`',
  );
  assert.equal(rows.length, 1, 'one row for RESEND_API_KEY');
  assert.equal(cells(rows[0]).length, 5, 'RESEND_API_KEY row has five cells');
  assert.equal(cells(rows[0])[1], 'never', 'RESEND_API_KEY second cell');
  assert.ok(rows[0].includes('ezdraft-preview'), 'RESEND_API_KEY row names ezdraft-preview');

  const mcHead = lines.findIndex((l) => l === '## Machine checks');
  const ciHead = lines.findIndex((l) => l.trim() === '### CI');
  assert.ok(mcHead >= 0 && ciHead > mcHead, 'Machine checks before CI');
  const row = lines
    .slice(mcHead + 1, ciHead)
    .filter((l) => l.trim().startsWith('|'))
    .map(cells)
    .find(
      (c) =>
        c.length === 4 &&
        c[2].replaceAll('`', '').includes('app/src/server/email/input-checks.test.ts'),
    );
  assert.ok(row, 'Machine checks row for input-checks.test.ts');
  assert.equal(row[3], 'EZD-151');
});
