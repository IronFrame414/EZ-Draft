// Security advisories (Josh 2026-11-19): every advisory the loop has not seen becomes one top-of-line fix ticket.
// The fixture is this repo's own `pnpm audit --prod --json` output on 2026-11-19, trimmed to the fields read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixTicket, nextFixId, parseAudit, readSeen, recordFixTicket, unseen } from '../advisories.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const audit = readFileSync(path.join(here, 'fixtures/pnpm-audit-2026-11-19.json'), 'utf8');

test('the audit gives the four advisories found on 2026-11-19, with their patched versions', () => {
  const list = parseAudit(audit);
  assert.deepEqual(list.map((a) => `${a.id} ${a.module} ${a.patched} ${a.found.join(',')}`), [
    'GHSA-3g3m-2fjr-6pw4 glob >=14.0.2 13.0.6',
    'GHSA-g3hv-75wg-m249 minimatch >=11.0.1 10.2.6',
    'GHSA-mfr8-8qww-v76h next >=16.4.5 16.4.2',
    'GHSA-vc7v-qv4w-wrv8 next >=16.4.5 16.4.2',
  ]);
});

test('output that is not an audit gives null, so a registry failure never makes a ticket', () => {
  assert.equal(parseAudit(''), null);
  assert.equal(parseAudit('ERR_PNPM_AUDIT_ENDPOINT_NOT_EXISTS'), null);
  assert.equal(parseAudit('{"error":{"code":"ENOTFOUND"}}'), null);
  assert.deepEqual(parseAudit('{"advisories":{}}'), []);
});

test('advisories already ticketed are left out (the Next.js pair belongs to EZD-424)', () => {
  const seen = { 'GHSA-mfr8-8qww-v76h': { ticket: 'EZD-424' }, 'GHSA-vc7v-qv4w-wrv8': { ticket: 'EZD-424' } };
  assert.deepEqual(unseen(parseAudit(audit), seen).map((a) => a.module), ['glob', 'minimatch']);
});

test('the next fix id follows the highest EZD-4xx in use', () => {
  assert.equal(nextFixId(['EZD-423', 'EZD-424', 'EZD-1022', 'EZD-5603b']), 'EZD-425');
  assert.equal(nextFixId(['EZD-430', 'EZD-424']), 'EZD-431');
  assert.equal(nextFixId([]), 'EZD-425');
});

test('one ticket covers the batch, on the security track, with three acceptance criteria', () => {
  const { ticket, acRows } = fixTicket('EZD-425', unseen(parseAudit(audit), { 'GHSA-mfr8-8qww-v76h': 1, 'GHSA-vc7v-qv4w-wrv8': 1 }), '2026-11-19');
  assert.equal(ticket.track, 'security');
  assert.equal(ticket.title, 'Fix: security advisories in glob, minimatch; move to the patched versions');
  assert.deepEqual(ticket.acs, ['AC-EZD-425-1', 'AC-EZD-425-2', 'AC-EZD-425-3']);
  assert.deepEqual(ticket.depends_on, []);
  assert.match(ticket.spec_ref, /GHSA-3g3m-2fjr-6pw4 moderate glob >=9\.0\.0 <=14\.0\.1 -> >=14\.0\.2 \(installed 13\.0\.6\)/);
  assert.equal(acRows.length, 3);
  assert.match(acRows[0], /^\| AC-EZD-425-1 \| EZD-425 Fix: .* \| `pnpm audit --prod` no longer lists GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249\. .*pnpm override/);
});

test('recording writes the ticket, its criteria and the seen list, and the batch is never ticketed twice', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'adv-'));
  try {
    mkdirSync(path.join(root, 'vault/tickets'), { recursive: true });
    mkdirSync(path.join(root, 'vault/spec'), { recursive: true });
    mkdirSync(path.join(root, 'vault/build'), { recursive: true });
    writeFileSync(path.join(root, 'vault/tickets/tickets.json'), JSON.stringify({ count: 1, tickets: [{ id: 'EZD-424' }] }, null, 1) + '\n');
    writeFileSync(path.join(root, 'vault/spec/acceptance-criteria.md'), '| AC-EZD-424-1 | x | y |\n');
    const batch = parseAudit(audit).slice(0, 2);
    const r = recordFixTicket(root, batch, '2026-11-19');
    assert.equal(r.id, 'EZD-425');
    const t = JSON.parse(readFileSync(path.join(root, 'vault/tickets/tickets.json'), 'utf8'));
    assert.equal(t.count, 2);
    assert.equal(t.tickets[1].id, 'EZD-425');
    const ac = readFileSync(path.join(root, 'vault/spec/acceptance-criteria.md'), 'utf8').trim().split('\n');
    assert.deepEqual(ac.map((l) => l.split('|')[1].trim()), ['AC-EZD-424-1', 'AC-EZD-425-1', 'AC-EZD-425-2', 'AC-EZD-425-3']);
    assert.deepEqual(unseen(parseAudit(audit), readSeen(root)).map((a) => a.module), ['next', 'next']);
    assert.equal(readSeen(root)['GHSA-3g3m-2fjr-6pw4'].ticket, 'EZD-425');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
