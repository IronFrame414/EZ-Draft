// EZD-372 V1-V5, M1-M4 (vault/plans/EZD-372.md section 4): the 50 ms line and miss evidence.
// EZD-359 U1-U6 (vault/plans/EZD-359.md section 4; AC-EZD-359-1). node:test, pure. Expected values come from the
// plan's fixture F and D-Attr, D-Read, D-Split.
// EZD-388 U7-U11 (vault/plans/EZD-388.md section 4): the iPad pan row counted by CPU time × scale.
// EZD-392 M1-M5 (vault/plans/EZD-392.md section 4): the CPU time of the trace task around each named mark.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { attributeTasks, countByCpu, describeMisses, markTaskCpu, readTraceEvents, splitTasks } from '../trace-tasks.mjs';

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

const B50 = { ...base, ph: 'X', name: 'ThreadControllerImpl::RunTask', cat: 'toplevel', ts: 1202000, dur: 49900, tdur: 1200 };
const B47 = { ...B50, dur: 47000 };
const B46 = { ...B50, dur: 46999 };
const Fb = { ...base, ph: 'X', name: 'FireAnimationFrame', cat: 'devtools.timeline', ts: 1202100, dur: 49000, tdur: 1000 };
function top(ts, dur, tdur) {
  const e = { ...base, ph: 'X', name: 'ThreadControllerImpl::RunTask', cat: 'toplevel', ts, dur };
  if (tdur !== undefined) e.tdur = tdur;
  return e;
}

describe('EZD-372 trace match at the 50 ms line', () => {
  test('EZD-372 V1 a 50 ms task whose slice is under 50 ms matches', () => {
    assert.deepEqual(attributeTasks([A, B50, Fb], [{ at: 202, ms: 50 }]), [
      { at: 202, ms: 50, cpu: 1, gc: 0, top: 'FireAnimationFrame' },
    ]);
  });

  test('EZD-372 V2 the length floor is ms minus 3', () => {
    assert.deepEqual(attributeTasks([A, B47, Fb], [{ at: 202, ms: 50 }]), [
      { at: 202, ms: 50, cpu: 1, gc: 0, top: null },
    ]);
    assert.deepEqual(attributeTasks([A, B46, Fb], [{ at: 202, ms: 50 }]), [
      { at: 202, ms: 50, cpu: null, gc: null, top: null },
    ]);
  });

  test('EZD-372 V3 the start window still applies', () => {
    assert.deepEqual(attributeTasks([A, B50, Fb], [{ at: 206, ms: 50 }]), [
      { at: 206, ms: 50, cpu: null, gc: null, top: null },
    ]);
  });

  test('EZD-372 V4 a long task matches as before', () => {
    assert.deepEqual(attributeTasks(F, [{ at: 202, ms: 82 }]), [
      { at: 202, ms: 82, cpu: 3, gc: 1, top: 'FireAnimationFrame' },
    ]);
  });

  test('EZD-372 V5 a short slice is not a match on start alone', () => {
    assert.deepEqual(attributeTasks([A, S], [{ at: 202, ms: 50 }]), [
      { at: 202, ms: 50, cpu: null, gc: null, top: null },
    ]);
  });
});

describe('EZD-372 miss evidence', () => {
  test('EZD-372 M1 lists near top-level slices of the main thread for a null-cpu task', () => {
    const events = [
      A,
      top(1285000, 10000, 9040),
      top(1305300, 40240, undefined),
      top(1400000, 5000, 4000),
      top(1380000, 1000, 500),
      top(1279000, 1000, 500),
      { ...base, tid: 10, name: 'ThreadControllerImpl::RunTask', cat: 'toplevel', ph: 'X', ts: 1300000, dur: 60000, tdur: 50000 },
      { ...base, name: 'FireAnimationFrame', cat: 'devtools.timeline', ph: 'X', ts: 1306000, dur: 30000, tdur: 1000 },
    ];
    const tasks = [
      { at: 300, ms: 60, cpu: null, gc: null, top: null },
      { at: 500, ms: 70, cpu: 4, gc: 0, top: 'x' },
    ];
    assert.deepEqual(describeMisses(events, tasks), [
      {
        at: 300,
        ms: 60,
        anchor: true,
        events: 8,
        near: [
          { dt: -15, dur: 10, tdur: 9 },
          { dt: 5.3, dur: 40.2, tdur: null },
        ],
      },
    ]);
  });

  test('EZD-372 M2 keeps the 10 nearest slices, sorted by start', () => {
    const events = [A];
    for (let k = 0; k < 12; k++) events.push(top(1000000 + (280 + 2 * k) * 1000, 1000, 500));
    const out = describeMisses(events, [{ at: 300, ms: 50, cpu: null, gc: null, top: null }]);
    assert.deepEqual(out, [
      {
        at: 300,
        ms: 50,
        anchor: true,
        events: 13,
        near: [-16, -14, -12, -10, -8, -6, -4, -2, 0, 2].map((dt) => ({ dt, dur: 1, tdur: 0.5 })),
      },
    ]);
  });

  test('EZD-372 M3 without the anchor the entry says so', () => {
    const t = { at: 300, ms: 60, cpu: null, gc: null, top: null };
    assert.deepEqual(describeMisses([top(1285000, 10000, 9040)], [t]), [
      { at: 300, ms: 60, anchor: false, events: 1, near: [] },
    ]);
    assert.deepEqual(describeMisses([], [t]), [{ at: 300, ms: 60, anchor: false, events: 0, near: [] }]);
  });

  test('EZD-372 M4 tasks with cpu give nothing', () => {
    assert.deepEqual(describeMisses(F, []), []);
    assert.deepEqual(describeMisses(F, [{ at: 202, ms: 78, cpu: 3, gc: 1, top: 'FireAnimationFrame' }]), []);
  });
});

const task13 = (name, ts, dur, tdur, extra = {}) => ({ ...base, name, cat: 'toplevel', ph: 'X', ts, dur, ...(tdur === undefined ? {} : { tdur }), ...extra });
const K0 = task13('RunTask', 1000000, 13000, 13000);
const K1 = task13('ThreadControllerImpl::RunTask', 1100000, 200000, 150000);
const K1n = task13('RunTask', 1100050, 199000, 149000);
const K1e = { ...base, name: 'EventDispatch', cat: 'devtools.timeline', ph: 'X', ts: 1100100, dur: 198000, tdur: 148000 };
const K1g = { ...base, name: 'MinorGC', cat: 'devtools.timeline,v8', ph: 'X', ts: 1150000, dur: 2000, tdur: 1400 };
const K2 = task13('RunTask', 1400000, 20000, 12501);
const K3 = { ...K2, ts: 1500000, tdur: 12500 };
const K4 = task13('RunTask', 1600000, 100000, 2000);
const K5 = task13('RunTask', 1700000, 15000);
const K6 = task13('RunTask', 900000, 90000, 90000);
const K7 = { ...K6, ts: 2040000 };
const K8 = { ...K6, tid: 10, ts: 1800000 };
const K9 = task13('RunTask', 2000000, 30000, 30000);
const K = [A, K0, K1, K1n, K1e, K1g, K2, K3, K4, K5, K6, K7, K8, K9];
const OBS = [
  { at: 100, ms: 200 },
  { at: 600, ms: 100 },
  { at: 900, ms: 80 },
];

describe('EZD-388 count by CPU time', () => {
  test('EZD-388 U7 counts trace tasks by CPU time', () => {
    assert.deepEqual(countByCpu(K, OBS, 4, 1000), {
      counted: [
        { at: 0, ms: 13, cpu: 13, gc: 0, top: 'ezd-pan-start' },
        { at: 100, ms: 200, cpu: 150, gc: 1, top: 'EventDispatch' },
        { at: 400, ms: 20, cpu: 13, gc: 0, top: null },
        { at: 700, ms: 15, cpu: null, gc: 0, top: null },
        { at: 900, ms: 80, cpu: null, gc: null, top: null },
        { at: 1000, ms: 30, cpu: 30, gc: 0, top: null },
      ],
      waits: [{ at: 600, ms: 100, cpu: 2, gc: 0, top: null }],
    });
  });

  test('EZD-388 U8 no anchor', () => {
    assert.equal(
      countByCpu(
        K.filter((e) => e !== A),
        OBS,
        4,
        1000,
      ),
      null,
    );
  });

  test('EZD-388 U9 empty input', () => {
    assert.equal(countByCpu([], [], 4, 1000), null);
    assert.deepEqual(countByCpu([A], [], 4, 1000), { counted: [], waits: [] });
  });

  test('EZD-388 U10 the scale sets the line', () => {
    assert.deepEqual(countByCpu(K, OBS, 1, 1000), {
      counted: [
        { at: 100, ms: 200, cpu: 150, gc: 1, top: 'EventDispatch' },
        { at: 900, ms: 80, cpu: null, gc: null, top: null },
      ],
      waits: [{ at: 600, ms: 100, cpu: 2, gc: 0, top: null }],
    });
  });

  test('EZD-388 U11 an observed task matched just outside the window', () => {
    const X = { ...base, name: 'RunTask', cat: 'toplevel', ph: 'X', ts: 2002000, dur: 60000, tdur: 60000 };
    assert.deepEqual(countByCpu([A, X], [{ at: 1000, ms: 60 }], 4, 1000), {
      counted: [{ at: 1000, ms: 60, cpu: 60, gc: 0, top: null }],
      waits: [],
    });
  });
});

describe('EZD-392 CPU time of marked tasks', () => {
  const MkP = { ...base, name: 'RunTask', cat: 'toplevel', ph: 'X', ts: 1500000, dur: 12000, tdur: 11500 };
  const MkA1 = { ...base, name: 'ezd-n5-a', cat: 'blink.user_timing', ph: 'R', ts: 1202500 };
  const MkA2 = { ...base, name: 'ezd-n5-a', cat: 'blink.user_timing', ph: 'R', ts: 1500100 };
  const MkB = { ...base, tid: 10, name: 'ezd-n5-b', cat: 'blink.user_timing', ph: 'R', ts: 1202500 };
  const MkC = { ...base, name: 'ezd-n5-c', cat: 'blink.user_timing', ph: 'R', ts: 1285000 };

  test('EZD-392 M1 the outermost top-level task around each mark, in ts order', () => {
    assert.deepEqual(markTaskCpu([MkP, MkA2, T, Tn, Fa, MkA1, O], 'ezd-n5-a'), [3, 11.5]);
  });

  test("EZD-392 M2 only the mark's own thread and name", () => {
    assert.deepEqual(markTaskCpu([T, Tn, O, MkA1, MkB], 'ezd-n5-b'), [85]);
    assert.deepEqual(markTaskCpu([T, Tn, O, MkC], 'ezd-n5-c'), [null]);
  });

  test('EZD-392 M3 no CPU time is null', () => {
    assert.deepEqual(markTaskCpu([without(MkP, 'tdur'), MkA2], 'ezd-n5-a'), [null]);
    assert.deepEqual(markTaskCpu([Fa, MkA1], 'ezd-n5-a'), [null]);
  });

  test('EZD-392 M4 no mark', () => {
    assert.deepEqual(markTaskCpu([], 'ezd-n5-a'), []);
    assert.deepEqual(markTaskCpu([T, MkA1], 'ezd-n5-b'), []);
  });

  test("EZD-392 M5 a mark on a task's edge is inside", () => {
    assert.deepEqual(
      markTaskCpu([MkP, { ...MkA2, ts: 1512001 }, { ...MkA2, ts: 1512000 }, { ...MkA2, ts: 1500000 }], 'ezd-n5-a'),
      [11.5, 11.5, null],
    );
  });
});
