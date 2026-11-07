// EZD-354 L1 (vault/plans/EZD-354.md section 4): inside the local gate, the checks really run as ezdraft and cannot reach Josh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const live = process.env.EZD_GATE_USER === 'ezdraft';
const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

test('EZD-354 L1 live proof', { skip: live ? false : 'runs only inside the local gate as ezdraft (EZD-354)' }, () => {
  assert.equal(process.getuid(), Number(process.env.EZD_GATE_UID), 'L1 uid is the gate uid');
  assert.notEqual(process.getuid(), Number(process.env.EZD_GATE_JOSH_UID), 'L1 uid is not Josh');
  assert.equal(os.homedir(), '/Users/ezdraft', 'L1 home');
  const canary = process.env.EZD_GATE_CANARY;
  assert.ok(['EACCES', 'EPERM'].includes(code(() => readFileSync(canary))), 'L1 canary unreadable (not ENOENT)');
  assert.ok(['EACCES', 'EPERM'].includes(code(() => readdirSync(path.dirname(canary)))), 'L1 Josh home not listable');
  const r = spawnSync('/bin/launchctl', ['print', `gui/${process.env.EZD_GATE_JOSH_UID}`], { encoding: 'utf8' });
  assert.notEqual(r.status, 0, 'L1 Josh launchd session refused');
});
