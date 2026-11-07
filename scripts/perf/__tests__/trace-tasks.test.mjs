// EZD-359 U1-U6 (vault/plans/EZD-359.md section 4; AC-EZD-359-1). node:test, pure. Expected values come from the
// plan's fixture F and D-Attr, D-Read, D-Split.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { attributeTasks, readTraceEvents, splitTasks } from '../trace-tasks.mjs';

const base = { pid: 7, tid: 9 };
const A = { ...base, name: 'ezd-pan-start', cat: 'blink.user_timing', ph: 'R', ts: 1000000 };
const T = { ...base, name: 'ThreadControllerImpl::RunTask', cat: 'toplevel', ph: 'X', ts: 1202000, dur: 78000, tdur: 3000 };
const Tn = { ...base, name: 'RunTask', cat: 'toplevel', ph: 'X', ts: 1202100, dur: 77000, tdur: 2000 };
const S = { ...base, name: 'ThreadControllerImpl::RunTask', cat: 'toplevel', ph: 'X', ts: 1201500, dur: 400, tdur: 300 };
const Fa = { ...base, name: 'FireAnimationFrame', cat: 'devtools.timeline', ph: 'X', ts: 1202200, dur: 70000, tdur: 2500 };
const G = { ...base, name: 'MinorGC', cat: 'devtools.timeline,v8', ph: 'X', ts: 1203000, dur: 2000, tdur: 1400 };
const Gn = { ...base, name: 'V8.GC_SCAVENGER', cat: 'disabled-by-default-v8.gc', ph: 'X', ts: 1203100, dur: 1500, tdur: 1200 };
const O = { ...base, tid: 10, name: 'ThreadControllerImpl::RunTask', cat: 'toplevel', ph: 'X', ts: 1202000, dur: 90000, tdur: 85000 };
const F = [A, S, T, Tn, Fa, G, Gn, O];
const task = [{ at: 202, ms: 78 }];

function without(ev, key) {
  const copy = { ...ev };
  delete copy[key];
  return copy;
}

describe('EZD-359 trace attribution', () => {
  test('EZD-359 U1 matches the pan task and splits its time', () => {
    assert.deepEqual(attributeTasks(F, task), [{ at: 202, ms: 78, cpu: 3, gc: 1, top: 'FireAnimationFrame' }]);
  });

  test('EZD-359 U2 no anchor', () => {
    assert.deepEqual(
      attributeTasks(
        F.filter((e) => e !== A),
        task,
      ),
      [{ at: 202, ms: 78, cpu: null, gc: null, top: null }],
    );
  });

  test('EZD-359 U3 three-ms window', () => {
    assert.deepEqual(attributeTasks(F, [{ at: 205, ms: 78 }]), [
      { at: 205, ms: 78, cpu: 3, gc: 1, top: 'FireAnimationFrame' },
    ]);
    assert.deepEqual(attributeTasks(F, [{ at: 206, ms: 78 }]), [
      { at: 206, ms: 78, cpu: null, gc: null, top: null },
    ]);
  });

  test('EZD-359 U4 missing thread time', () => {
    const a = attributeTasks(
      F.map((e) => (e === T ? without(T, 'tdur') : e)),
      task,
    );
    assert.equal(a[0].cpu, null);
    assert.equal(a[0].gc, 1);
    assert.equal(a[0].top, 'FireAnimationFrame');
    const b = attributeTasks(
      F.map((e) => (e === G ? without(G, 'tdur') : e)),
      task,
    );
    assert.equal(b[0].cpu, 3);
    assert.equal(b[0].gc, 2);
  });

  test('EZD-359 U5 reads trace buffers', () => {
    assert.deepEqual(readTraceEvents(Buffer.from(JSON.stringify({ traceEvents: [A] }))), [A]);
    assert.deepEqual(readTraceEvents(Buffer.from(JSON.stringify([A]))), [A]);
    assert.deepEqual(readTraceEvents(Buffer.from('not json')), []);
    assert.deepEqual(readTraceEvents(Buffer.from(JSON.stringify({ x: 1 }))), []);
    assert.deepEqual(attributeTasks(F, []), []);
  });

  test('EZD-359 U6 split by CPU time and rate', () => {
    const mk = (at, ms, cpu) => ({ at, ms, cpu, gc: 0, top: 'x' });
    const a = mk(1, 60, 51);
    const b = mk(2, 60, 50);
    const c = mk(3, 80, 13);
    const d = mk(4, 80, 12);
    const e = mk(5, 70, null);
    const f = mk(6, 80, 74);
    const g = mk(7, 80, 72);
    const list = [a, b, c, d, e, f, g];
    assert.deepEqual(splitTasks(list, 1), { counted: [a, e, f, g], waits: [b, c, d] });
    assert.deepEqual(splitTasks(list, 4), { counted: [e, f], waits: [a, b, c, d, g] });
  });
});
