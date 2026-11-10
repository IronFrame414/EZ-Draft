// EZD-364 T3-T9 (AC-EZD-364-2): a gate clears the leftover app server on its lane's ports and never signals anything else
// (vault/plans/EZD-364.md sections 3 and 4, D-Find, D-Match, D-Kill, D-Foreign). exec and sleep are injected: no process, no wait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListenPids, isLeftoverGateServer, freeLanePorts } from '../gate-port.mjs';

const GATE_USER = 'ezdraft';
const RUN_TREE = '/Users/ezdraft/gate/lane0/tree';
const opts = { gateUser: GATE_USER, runTree: RUN_TREE };
const MATCH = { user: 'ezdraft', command: 'next-server (v16.4.2)', cwd: `${RUN_TREE}/app` };

test('T3: parseListenPids keeps distinct positive integers in order', () => {
  assert.deepEqual(parseListenPids('123\n\n456\n123\nx\n'), [123, 456]);
});

test('T4: isLeftoverGateServer is exactly user + command + cwd', () => {
  assert.equal(isLeftoverGateServer(MATCH, opts), true);
  assert.equal(isLeftoverGateServer({ ...MATCH, user: 'josh' }, opts), false);
  assert.equal(isLeftoverGateServer({ ...MATCH, cwd: '/Users/josh/Projects/ezdraft/app' }, opts), false);
  assert.equal(isLeftoverGateServer({ ...MATCH, cwd: '/Users/ezdraft/gate/lane0/tree2' }, opts), false);
  assert.equal(isLeftoverGateServer({ ...MATCH, command: 'node server.js' }, opts), false);
});

// A fake machine. holders: port -> { pid, pgid, user, command, cwd }. A holder is freed by a TERM (freeOn 'TERM'),
// only by a KILL (freeOn 'KILL'), or never (freeOn null).
function machine(holders, freeOn) {
  const calls = [];
  const signals = [];
  const sleeps = [];
  const exec = (file, args) => {
    calls.push([file, ...args]);
    if (file === '/usr/sbin/lsof' && args.includes('-t')) {
      const arg = args.find((a) => a.startsWith('-iTCP:'));
      const port = Number(arg.slice('-iTCP:'.length));
      const h = holders[port];
      return h ? { status: 0, stdout: `${h.pid}\n`, stderr: '' } : { status: 1, stdout: '', stderr: '' };
    }
    if (file === '/bin/ps') {
      const pid = Number(args[args.indexOf('-p') + 1]);
      const h = Object.values(holders).find((x) => x.pid === pid);
      return { status: 0, stdout: `${h.user} ${h.pgid} ${h.command}\n`, stderr: '' };
    }
    if (file === '/usr/sbin/lsof' && args.includes('-d') && args.includes('cwd')) {
      const pid = Number(args[args.indexOf('-p') + 1]);
      const h = Object.values(holders).find((x) => x.pid === pid);
      return { status: 0, stdout: `p${pid}\nfcwd\nn${h.cwd}\n`, stderr: '' };
    }
    if (file === '/bin/kill') {
      signals.push(args.join(' '));
      const sig = args[0].slice(1);
      for (const [port, h] of Object.entries(holders)) {
        if (args[1] === `-${h.pgid}` && freeOn === sig) delete holders[port];
      }
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`unexpected exec ${file} ${args.join(' ')}`);
  };
  const sleep = async (ms) => { sleeps.push(ms); };
  return { exec, sleep, calls, signals, sleeps };
}

const leftover = { pid: 46893, pgid: 46883, user: 'ezdraft', command: 'next-server (v16.4.2)', cwd: `${RUN_TREE}/app` };

test('T5: both ports free -> ok, two free lines, no kill', async () => {
  const m = machine({}, null);
  const r = await freeLanePorts({ ports: [3000, 3200], exec: m.exec, gateUser: GATE_USER, runTree: RUN_TREE, sleep: m.sleep });
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines, ['port 3000: free', 'port 3200: free']);
  assert.deepEqual(m.signals, []);
});

test('T6: a matching leftover is stopped with one TERM to its group', async () => {
  const m = machine({ 3000: { ...leftover } }, 'TERM');
  const r = await freeLanePorts({ ports: [3000, 3200], exec: m.exec, gateUser: GATE_USER, runTree: RUN_TREE, sleep: m.sleep });
  assert.equal(r.ok, true);
  assert.deepEqual(m.signals, ['-TERM -46883']);
  assert.ok(r.lines.some((l) => l.includes('port 3000') && l.includes('46893') && l.includes('46883')), r.lines.join('\n'));
  assert.ok(r.lines.includes('port 3200: free'));
});

test('T7: a leftover that survives TERM gets one KILL; ok follows whether the port frees', async () => {
  const freed = machine({ 3000: { ...leftover } }, 'KILL');
  const r1 = await freeLanePorts({ ports: [3000], exec: freed.exec, gateUser: GATE_USER, runTree: RUN_TREE, sleep: freed.sleep });
  assert.deepEqual(freed.signals, ['-TERM -46883', '-KILL -46883']);
  assert.equal(r1.ok, true);

  const stuck = machine({ 3000: { ...leftover } }, null);
  const r2 = await freeLanePorts({ ports: [3000], exec: stuck.exec, gateUser: GATE_USER, runTree: RUN_TREE, sleep: stuck.sleep });
  assert.deepEqual(stuck.signals, ['-TERM -46883', '-KILL -46883']);
  assert.equal(r2.ok, false);
});

test('T8: a foreign listener fails the gate and is never signalled', async () => {
  const m = machine({ 3000: { pid: 777, pgid: 770, user: 'josh', command: 'next dev', cwd: '/Users/josh/Projects/ezdraft/app' } }, null);
  const r = await freeLanePorts({ ports: [3000], exec: m.exec, gateUser: GATE_USER, runTree: RUN_TREE, sleep: m.sleep });
  assert.equal(r.ok, false);
  assert.deepEqual(m.signals, []);
  assert.ok(r.lines.includes('port 3000: held by pid 777 (josh, next dev), not a leftover gate server; stop it and run the gate again'), r.lines.join('\n'));
});

test('T9: poll waits are sleep(500); the TERM wait is bounded at 10 s and the KILL wait at 5 s', async () => {
  const m = machine({ 3000: { ...leftover } }, null);
  await freeLanePorts({ ports: [3000], exec: m.exec, gateUser: GATE_USER, runTree: RUN_TREE, sleep: m.sleep });
  assert.ok(m.sleeps.length > 0);
  assert.ok(m.sleeps.every((ms) => ms === 500), `sleeps: ${[...new Set(m.sleeps)].join(',')}`);
  assert.equal(m.sleeps.length * 500, 15000);
});

// T10-T12 use their own small stubs: lsof status and stderr per port, an optional portInUse stub, and an lsof answer that can change.
function stubs(lsofAnswers, psStdout = '') {
  const signals = [];
  const lsofAsks = [];
  const exec = (file, args) => {
    if (file === '/usr/sbin/lsof' && args.includes('-t')) {
      const port = Number(args.find((a) => a.startsWith('-iTCP:')).slice('-iTCP:'.length));
      lsofAsks.push(port);
      const list = lsofAnswers[port];
      const n = lsofAsks.filter((p) => p === port).length;
      return list[Math.min(n, list.length) - 1];
    }
    if (file === '/bin/ps') return { status: 0, stdout: psStdout, stderr: '' };
    if (file === '/bin/kill') { signals.push(args.join(' ')); return { status: 0, stdout: '', stderr: '' }; }
    throw new Error(`unexpected exec ${file} ${args.join(' ')}`);
  };
  const inUseCalls = [];
  const makeInUse = (byPort) => async (port) => { inUseCalls.push(port); return byPort[port] === true; };
  return { exec, signals, lsofAsks, inUseCalls, makeInUse, sleep: async () => {} };
}
const NONE = { status: 1, stdout: '', stderr: '' };

test('T10: lsof sees nothing but portInUse says taken -> hidden listener fails, no kill', async () => {
  const s = stubs({ 3000: [NONE], 3200: [NONE] });
  const r = await freeLanePorts({ ports: [3000, 3200], exec: s.exec, gateUser: GATE_USER, runTree: RUN_TREE, sleep: s.sleep, portInUse: s.makeInUse({ 3000: true, 3200: false }) });
  assert.equal(r.ok, false);
  assert.ok(r.lines.includes('port 3000: held by a process the gate user cannot see; stop it and run the gate again'), r.lines.join('\n'));
  assert.ok(r.lines.includes('port 3200: free'), r.lines.join('\n'));
  assert.deepEqual(s.signals, []);
});

test('T11: an lsof failure is "could not check", with no kill and no portInUse call for that port', async () => {
  const s = stubs({ 3000: [{ status: 2, stdout: '', stderr: 'sudo: a password is required\n' }] });
  const r = await freeLanePorts({ ports: [3000], exec: s.exec, gateUser: GATE_USER, runTree: RUN_TREE, sleep: s.sleep, portInUse: s.makeInUse({}) });
  assert.equal(r.ok, false);
  assert.ok(r.lines.includes('port 3000: could not check (lsof status 2: sudo: a password is required)'), r.lines.join('\n'));
  assert.deepEqual(s.signals, []);
  assert.equal(s.inUseCalls.includes(3000), false);
});

test('T12: a listener that exits before ps is not foreign; lsof is asked again and the port is free', async () => {
  const s = stubs({ 3000: [{ status: 0, stdout: '555\n', stderr: '' }, NONE] }, '');
  const r = await freeLanePorts({ ports: [3000], exec: s.exec, gateUser: GATE_USER, runTree: RUN_TREE, sleep: s.sleep, portInUse: s.makeInUse({ 3000: false }) });
  assert.equal(r.ok, true);
  assert.ok(r.lines.includes('port 3000: free'), r.lines.join('\n'));
  assert.deepEqual(s.signals, []);
});
