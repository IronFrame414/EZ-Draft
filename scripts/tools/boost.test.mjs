import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boostState, bumpModel, turnOn, turnOff, boostFile, MAX_LANES, MAX_BUILD_LANES } from '../../vault/tools/boost.mjs';

const NOW = new Date('2026-10-24T18:00:00Z');
function repo(resetsAt) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ezd-boost-'));
  mkdirSync(path.join(root, 'vault/handoff'), { recursive: true });
  mkdirSync(path.join(root, 'vault/cost'), { recursive: true });
  if (resetsAt !== undefined) writeFileSync(path.join(root, 'vault/cost/usage.json'), JSON.stringify({ seven_day: { pct: 38, resets_at: resetsAt } }));
  return root;
}

test('boost: off when there is no switch file', () => {
  assert.deepEqual(boostState({ root: repo(), now: NOW }), { active: false, until: null, lanes: 1, buildLanes: 1, expired: false });
});

test('boost: on until the weekly reset from the usage meter, with 6 lanes and 3 build lanes by default', () => {
  const root = repo('2026-10-26T06:00:00.143Z');
  const r = turnOn({ root, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.until, '2026-10-26T06:00:00.143Z');
  assert.deepEqual(boostState({ root, now: NOW }), { active: true, until: '2026-10-26T06:00:00.143Z', lanes: 6, buildLanes: 3, expired: false });
});

test('boost: expires at the reset time and reports expired so the launcher removes it', () => {
  const root = repo('2026-10-26T06:00:00.000Z');
  turnOn({ root, now: NOW });
  const at = boostState({ root, now: new Date('2026-10-26T06:00:00.000Z') });
  assert.equal(at.active, false);
  assert.equal(at.expired, true);
  assert.equal(at.lanes, 1);
  assert.equal(turnOff({ root }), true);
  assert.equal(existsSync(boostFile(root)), false);
  assert.equal(turnOff({ root }), false);
});

test('boost: refuses to turn on without a reset time, with a past reset time, or with bad lane counts', () => {
  assert.equal(turnOn({ root: repo(), now: NOW }).ok, false);
  assert.equal(turnOn({ root: repo('2026-10-24T17:00:00Z'), now: NOW }).ok, false);
  const root = repo('2026-10-26T06:00:00Z');
  assert.equal(turnOn({ root, now: NOW, lanes: MAX_LANES + 1 }).ok, false);
  assert.equal(turnOn({ root, now: NOW, lanes: 0 }).ok, false);
  assert.equal(turnOn({ root, now: NOW, lanes: 2, buildLanes: 3 }).ok, false);
  assert.equal(turnOn({ root, now: NOW, lanes: 6, buildLanes: MAX_BUILD_LANES + 1 }).ok, false);
  assert.equal(existsSync(boostFile(root)), false);
});

test('boost: an unreadable switch file is treated as expired, never as on', () => {
  const root = repo();
  writeFileSync(boostFile(root), '{not json');
  assert.deepEqual(boostState({ root, now: NOW }), { active: false, until: null, lanes: 1, buildLanes: 1, expired: true });
});

test('boost: every model moves up one, Fable stays Fable, and Opus stays Opus when Fable is not allowed', () => {
  assert.equal(bumpModel('claude-haiku-5-5', { fableAllowed: true }), 'claude-sonnet-5-5');
  assert.equal(bumpModel('claude-sonnet-5-5', { fableAllowed: true }), 'claude-opus-5-5');
  assert.equal(bumpModel('claude-opus-5-5', { fableAllowed: true }), 'claude-fable-5-1');
  assert.equal(bumpModel('claude-fable-5-1', { fableAllowed: true }), 'claude-fable-5-1');
  assert.equal(bumpModel('claude-opus-5-5', { fableAllowed: false }), 'claude-opus-5-5');
  assert.equal(bumpModel('claude-fable-5-1', { fableAllowed: false }), 'claude-opus-5-5');
});
