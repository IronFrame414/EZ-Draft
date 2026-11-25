// EZD-1940 (audit 2026-11-23 W1): retried tickets go first, not last. Order: security, priority list, retried first,
// phase, build position, id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOrder, phaseRank } from '../order.mjs';
import { TRACK as SECURITY_TRACK } from '../advisories.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ids = (list) => list.map((t) => t.id);

test('AC-EZD-1940-2: a retried ticket of a later phase is picked before 3 fresh tickets', () => {
  const queue = [
    { id: 'EZD-101', phase: 7, build_position: 1 },
    { id: 'EZD-102', phase: 7, build_position: 2 },
    { id: 'EZD-103', phase: 8, build_position: 3 },
    { id: 'EZD-900', phase: 10, build_position: 9 },
  ];
  const order = buildOrder(queue, { retries: { 'EZD-900': 1 }, priority: [] });
  assert.equal(order[0].id, 'EZD-900');
  assert.deepEqual(ids(order), ['EZD-900', 'EZD-101', 'EZD-102', 'EZD-103']);
});

test('AC-EZD-1940-2: the priority list still wins over retried', () => {
  const queue = [
    { id: 'EZD-101', phase: 7 },
    { id: 'EZD-102', phase: 7 },
    { id: 'EZD-103', phase: 8 },
    { id: 'EZD-900', phase: 10 },
  ];
  const order = buildOrder(queue, { retries: { 'EZD-900': 1 }, priority: ['EZD-103'] });
  assert.deepEqual(ids(order), ['EZD-103', 'EZD-900', 'EZD-101', 'EZD-102']);
});

test('AC-EZD-1940-1: security comes before priority and retried', () => {
  const queue = [
    { id: 'EZD-200', phase: 3 },
    { id: 'EZD-300', phase: 9, track: SECURITY_TRACK },
    { id: 'EZD-201', phase: 3 },
  ];
  const order = buildOrder(queue, { retries: { 'EZD-201': 1 }, priority: ['EZD-200'] });
  assert.deepEqual(ids(order), ['EZD-300', 'EZD-200', 'EZD-201']);
});

test('AC-EZD-1940-1: among retried (or fresh) tickets: phase, then build position, then id', () => {
  const queue = [
    { id: 'EZD-B', phase: 6, build_position: 2 },
    { id: 'EZD-A', phase: 6, build_position: 2 },
    { id: 'EZD-C', phase: 6, build_position: 1 },
    { id: 'EZD-D', phase: 56, build_position: 5 },
    { id: 'EZD-E', phase: 9 },
    { id: 'EZD-F', phase: 4 },
  ];
  const retries = { 'EZD-E': 1, 'EZD-F': 1 };
  assert.deepEqual(ids(buildOrder(queue, { retries })), ['EZD-F', 'EZD-E', 'EZD-D', 'EZD-C', 'EZD-A', 'EZD-B']);
  assert.equal(phaseRank(56), 5.5);
});

test('buildOrder leaves the input list unchanged and takes missing options', () => {
  const queue = [{ id: 'EZD-2', phase: 2 }, { id: 'EZD-1', phase: 1 }];
  assert.deepEqual(ids(buildOrder(queue)), ['EZD-1', 'EZD-2']);
  assert.deepEqual(ids(queue), ['EZD-2', 'EZD-1']);
});

test('AC-EZD-1940-1/3: loop.mjs sorts candidates with buildOrder and says priority is not needed for retries', () => {
  const src = readFileSync(path.join(REPO, 'scripts/loop.mjs'), 'utf8');
  assert.match(src, /import \{ buildOrder, phaseRank \} from '\.\/loop\/order\.mjs'/);
  assert.match(src, /return buildOrder\(list, \{ retries: s\.retries, priority: c\.priority \}\)/);
  assert.doesNotMatch(src, /retried\(a\) - retried\(b\)/);
  assert.match(src, /priority list is no longer\s*\n?\/?\/? ?needed to bring a retry forward/);
  const runbook = readFileSync(path.join(REPO, 'docs/runbook.md'), 'utf8');
  assert.match(runbook, /## Loop build order \(EZD-1940\)/);
  assert.match(runbook, /no longer needed for retries/);
});
