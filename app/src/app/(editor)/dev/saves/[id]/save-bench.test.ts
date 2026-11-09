// EZD-120d U5 (vault/plans/EZD-120d.md sections 3 and 4, Decided "Bench walls", "50 edits", "Fault"; AC-EZD-120d-4;
// P202). The pure parts of the save test page: the sample walls, the 50 edits, the written-row count and the
// fault that fails the next save. Expected values come from the plan's Decided rows, not from running the code.
import { CURRENT_SCHEMA_VERSION, parseStoredObject } from '@ezdraft/geometry';
import { createStore } from 'zustand/vanilla';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConflictListState, ConflictRow } from '../../../../../lib/conflicts/conflict-list';
import type { ObjectValue } from '../../../../../lib/outbox/model-api';
import {
  benchTargets,
  benchWalls,
  countWritten,
  createConflictFault,
  createSaveFault,
  fiftyEdits,
  waitForConflict,
} from './save-bench';

const FLOOR = '99999999-9999-4999-8999-999999999999';

type WallData = {
  geometry: { start: { x: number; y: number }; end: { x: number; y: number } };
  status: string;
  level: string;
  attributes: Record<string, unknown>;
};

const objectsOf = () => {
  const map = new Map<string, ObjectValue>();
  for (const c of benchWalls(FLOOR)) if (c.value !== null) map.set(c.id, c.value);
  return map;
};
const heightOf = (v: ObjectValue | null | undefined) =>
  (v?.data as unknown as WallData).attributes.height;

describe('EZD-120d save bench', () => {
  it('U5 benchWalls makes 10 walls that parse, as the plan lays them out', () => {
    const walls = benchWalls(FLOOR);
    expect(walls).toHaveLength(10);
    expect(new Set(walls.map((w) => w.id)).size).toBe(10);
    walls.forEach((w, i) => {
      const k = i + 1;
      expect(w.value).not.toBeNull();
      const value = w.value as ObjectValue;
      expect(value.type).toBe('wall');
      expect(value.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      const data = value.data as unknown as WallData;
      expect(data.geometry).toEqual({
        start: { x: 0, y: 48 * (k - 1) },
        end: { x: 120, y: 48 * (k - 1) },
      });
      expect(data.status).toBe('new');
      expect(data.level).toBe(FLOOR);
      expect(data.attributes).toEqual({
        thickness: 4.5,
        thicknessSide: 'center',
        height: 96,
        topCutToCeiling: false,
        bearing: false,
        layers: [
          { material: 'drywall', thickness: 0.5 },
          { material: 'stud', thickness: 3.5 },
          { material: 'drywall', thickness: 0.5 },
        ],
      });
      const parsed = parseStoredObject({
        id: w.id,
        type: value.type,
        schema_version: value.schemaVersion,
        data: value.data,
      });
      expect(parsed.ok).toBe(true);
    });
  });

  it('U5 benchTargets is the first 5 walls by id', () => {
    const objects = objectsOf();
    const sorted = [...objects.keys()].sort();
    expect(benchTargets(objects)).toEqual(sorted.slice(0, 5));
  });

  it('U5 fiftyEdits is 50 edits, edit i on target ((i-1) mod 5)+1 with height 96+i', () => {
    const objects = objectsOf();
    const targets = benchTargets(objects);
    const edits = fiftyEdits(objects, targets);
    expect(edits).toHaveLength(50);
    const state = new Map(objects);
    edits.forEach((edit, index) => {
      const i = index + 1;
      expect(edit).toHaveLength(1);
      expect(edit[0].id).toBe(targets[(i - 1) % 5]);
      expect(heightOf(edit[0].value)).toBe(96 + i);
      expect((edit[0].value?.data as unknown as WallData).geometry).toEqual(
        (objects.get(edit[0].id)?.data as unknown as WallData).geometry,
      );
      state.set(edit[0].id, edit[0].value as ObjectValue);
    });
    targets.forEach((id, index) => {
      expect(heightOf(state.get(id))).toBe(141 + (index + 1));
    });
  });

  it('U5 countWritten counts new or changed rows', () => {
    const before = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const after = new Map([
      ['a', 1],
      ['b', 3],
      ['c', 3],
      ['d', 1],
    ]);
    expect(countWritten(before, after)).toBe(2);
    expect(countWritten(before, before)).toBe(0);
  });

  it('U5 the fault fails an armed objects POST with 500 and passes everything else', async () => {
    const base = vi.fn(async () => new Response('base', { status: 200 }));
    const fault = createSaveFault(base as unknown as typeof fetch);
    expect(fault.armed()).toBe(false);

    const passed = await fault.fetchImpl('/api/projects/p1/objects', { method: 'POST' });
    expect(await passed.text()).toBe('base');
    expect(base).toHaveBeenCalledTimes(1);

    fault.arm();
    expect(fault.armed()).toBe(true);
    const failed = await fault.fetchImpl('/api/projects/p1/objects', { method: 'POST' });
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).toContain('db_unavailable');
    expect(base).toHaveBeenCalledTimes(1);

    const get = await fault.fetchImpl('/api/projects/p1/objects', { method: 'GET' });
    expect(await get.text()).toBe('base');
    expect(base).toHaveBeenCalledTimes(2);

    fault.disarm();
    expect(fault.armed()).toBe(false);
    const after = await fault.fetchImpl('/api/projects/p1/objects', { method: 'POST' });
    expect(await after.text()).toBe('base');
  });
});

// EZD-299 U8, U9 (vault/plans/EZD-299.md section 4; AC-EZD-299-1; Decided D-Fault, D-Wait; Q-0508).
const URL_OBJECTS = '/api/projects/p/objects';
const wallChange = (height: number) => ({
  id: 'w',
  baseSeq: 1,
  deleted: false,
  type: 'wall',
  schemaVersion: 1,
  data: { attributes: { height, thickness: 4.5 } },
});
const deleteChange = { id: 'd', baseSeq: 1, deleted: true };
const ORIGINAL = JSON.stringify({
  lockEpoch: 0,
  changes: [wallChange(97), deleteChange],
  resolves: ['r'],
});
const HEADERS = { 'content-type': 'application/json', 'x-ezdraft-membership': 'm1' };

describe('EZD-299 conflict fault', () => {
  it('U8 armed: sends their version first, then the original, once', async () => {
    const base = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('theirs', { status: 200 }))
      .mockResolvedValueOnce(new Response('stale', { status: 409 }));
    const fault = createConflictFault(base as unknown as typeof fetch);
    expect(fault.armed()).toBe(false);
    fault.arm();
    expect(fault.armed()).toBe(true);
    const res = await fault.fetchImpl(URL_OBJECTS, {
      method: 'POST',
      headers: HEADERS,
      body: ORIGINAL,
    });
    expect(res.status).toBe(409);
    expect(base).toHaveBeenCalledTimes(2);
    const first = base.mock.calls[0];
    const second = base.mock.calls[1];
    expect(first[0]).toBe(URL_OBJECTS);
    expect(first[1]?.method).toBe('POST');
    expect(first[1]?.headers).toEqual(HEADERS);
    expect(JSON.parse(first[1]?.body as string)).toEqual({
      lockEpoch: 0,
      changes: [wallChange(98), deleteChange],
    });
    expect(second[0]).toBe(URL_OBJECTS);
    expect(second[1]?.body).toBe(ORIGINAL);
    expect(second[1]?.headers).toEqual(HEADERS);
    expect(fault.armed()).toBe(false);
  });

  it('U8 their version not accepted: that answer is returned and the original is not sent', async () => {
    const base = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('down', { status: 500 }));
    const fault = createConflictFault(base as unknown as typeof fetch);
    fault.arm();
    const res = await fault.fetchImpl(URL_OBJECTS, { method: 'POST', body: ORIGINAL });
    expect(res.status).toBe(500);
    expect(base).toHaveBeenCalledTimes(1);
    expect(fault.armed()).toBe(false);
  });

  it('U8 disarmed, another method or a body that is not JSON passes through once', async () => {
    const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('base', { status: 200 }));
    const fault = createConflictFault(base as unknown as typeof fetch);
    await fault.fetchImpl(URL_OBJECTS, { method: 'POST', body: ORIGINAL });
    expect(base).toHaveBeenCalledTimes(1);
    expect(base.mock.calls[0][1]?.body).toBe(ORIGINAL);

    fault.arm();
    await fault.fetchImpl(URL_OBJECTS, { method: 'GET' });
    expect(base).toHaveBeenCalledTimes(2);
    expect(fault.armed()).toBe(true);

    await fault.fetchImpl(URL_OBJECTS, { method: 'POST', body: 'x' });
    expect(base).toHaveBeenCalledTimes(3);
    expect(base.mock.calls[2][1]?.body).toBe('x');
  });
});

describe('EZD-299 wait for conflict', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function fakeList() {
    const store = createStore<ConflictListState>()(() => ({ rows: [], server: 'idle' }));
    let unsubscribes = 0;
    const list = {
      getState: store.getState,
      subscribe: (listener: Parameters<typeof store.subscribe>[0]) => {
        const off = store.subscribe(listener);
        return () => {
          unsubscribes += 1;
          off();
        };
      },
    };
    return { store, list, unsubscribes: () => unsubscribes };
  }

  it('U9 true when the row arrives later (key compared in lower case), then unsubscribes', async () => {
    vi.useFakeTimers();
    const { store, list, unsubscribes } = fakeList();
    const done = waitForConflict(list, 'p1/abc', 30_000);
    await vi.advanceTimersByTimeAsync(100);
    store.setState({ rows: [{ key: 'P1/ABC' } as unknown as ConflictRow] });
    await expect(done).resolves.toBe(true);
    expect(unsubscribes()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('U9 false at the timeout, with one unsubscribe and no timer left', async () => {
    vi.useFakeTimers();
    const { list, unsubscribes } = fakeList();
    let result: boolean | null = null;
    void waitForConflict(list, 'p1/abc', 30_000).then((v) => {
      result = v;
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(result).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(false);
    expect(unsubscribes()).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
