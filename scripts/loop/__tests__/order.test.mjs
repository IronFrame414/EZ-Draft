// EZD-1940 (audit 2026-11-23 W1): retried tickets go first, not last. Order: security, priority list, retried first,
// phase, build position, id.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOrder, phaseRank, withinMaxPhase } from '../order.mjs';
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

// EZD-2023 (audit 2026-11-27 X1): the final sweeps, phases 54 and 55, build after every phase 57 and 58 ticket.
// AC-EZD-2023-4: the new tests for the order change. They sort in-memory lists and read tickets.json; they start no
// docker, launchctl or child process.
test('AC-EZD-2023-1: phases 54 and 55 rank after phase 58, 54 before 55, and phase 56 keeps its exception', () => {
  assert.ok(phaseRank(54) > phaseRank(58));
  assert.ok(phaseRank(55) > phaseRank(58));
  assert.ok(phaseRank(54) < phaseRank(55));
  assert.equal(phaseRank(56), 5.5);
  assert.equal(phaseRank('54'), phaseRank(54));
  // Every other phase keeps its own number, so its order is unchanged.
  for (const p of [0, 1, 5, 6, 10, 53, 57, 58]) assert.equal(phaseRank(p), p);
  const queue = [
    { id: 'EZD-1701', phase: 54, build_position: 1 },
    { id: 'EZD-1709a', phase: 55, build_position: 2 },
    { id: 'EZD-9300', phase: 57, build_position: 3 },
    { id: 'EZD-9301', phase: 58, build_position: 4 },
    { id: 'EZD-9302', phase: 53, build_position: 5 },
    { id: 'EZD-9303', phase: 56, build_position: 6 },
    { id: 'EZD-9304', phase: 6, build_position: 7 },
  ];
  assert.deepEqual(ids(buildOrder(queue)), ['EZD-9303', 'EZD-9304', 'EZD-9302', 'EZD-9300', 'EZD-9301', 'EZD-1701', 'EZD-1709a']);
});

test('AC-EZD-2023-1: in the real ticket list every sweep ticket sorts after every phase 57 and 58 ticket', () => {
  const j = JSON.parse(readFileSync(path.join(REPO, 'vault/tickets/tickets.json'), 'utf8'));
  const all = (Array.isArray(j) ? j : j.tickets).filter((t) => [54, 55, 57, 58].includes(Number(t.phase)) && t.track !== SECURITY_TRACK);
  const order = buildOrder(all);
  const lastFeature = Math.max(...order.map((t, i) => ([57, 58].includes(Number(t.phase)) ? i : -1)));
  const firstSweep = order.findIndex((t) => [54, 55].includes(Number(t.phase)));
  assert.ok(firstSweep > lastFeature, `sweep at ${firstSweep} before feature at ${lastFeature}`);
  // The audit's sweep tickets are among them.
  for (const id of ['EZD-1701', 'EZD-1705', 'EZD-1710']) assert.ok(order.findIndex((t) => t.id === id) > lastFeature, id);
});

test('AC-EZD-2023-1: max_phase 58 still lets the sweeps start; a lower max_phase still holds later phases', () => {
  assert.equal(withinMaxPhase(54, 58), true);
  assert.equal(withinMaxPhase(55, 58), true);
  assert.equal(withinMaxPhase(58, 58), true);
  assert.equal(withinMaxPhase(56, 10), true); // rank 5.5, as before
  assert.equal(withinMaxPhase(56, 5), false);
  assert.equal(withinMaxPhase(54, 53), false);
  assert.equal(withinMaxPhase(57, 56), false);
  assert.equal(withinMaxPhase(12), true);
  const src = readFileSync(path.join(REPO, 'scripts/loop.mjs'), 'utf8');
  assert.match(src, /&& withinMaxPhase\(t\.phase, c\.max_phase \?\? 999\)/);
});
