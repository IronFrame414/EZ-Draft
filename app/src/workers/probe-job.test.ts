// EZD-235b J1-J3 (vault/plans/EZD-235b.md section 4; AC-EZD-235-3): the probe job, the 500 ms room-area sum.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  generateBenchmarkModel,
  type StoredObject,
} from '@ezdraft/geometry';
import { PROBE_JOB, PROBE_JOB_MS, PROBE_MAX_MS, probeRoomAreas } from './probe-job';

const clock = (...values: number[]) => {
  let i = 0;
  return vi.fn(() => values[i++] as number);
};

describe('EZD-235b probe job', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('EZD-235b J1 probe job sums room areas for at least minMs and counts its passes', () => {
    const now = clock(0, 100, 200, 300);
    expect(probeRoomAreas({ minMs: 250 }, now)).toEqual({
      rooms: 720,
      passes: 3,
      ranMs: 300,
      where: 'main',
    });
    expect(now).toHaveBeenCalledTimes(4);

    expect(probeRoomAreas({ minMs: 0 }, () => 0, [])).toEqual({
      rooms: 0,
      passes: 1,
      ranMs: 0,
      where: 'main',
    });

    const model = generateBenchmarkModel();
    const room = model.find((o) => o.type === 'room') as StoredObject;
    const wall = model.find((o) => o.type === 'wall') as StoredObject;
    const last = room.id.slice(-1);
    const badRoom: StoredObject = {
      id: room.id.slice(0, -1) + (last === 'f' ? 'e' : 'f'),
      type: 'room',
      schema_version: CURRENT_SCHEMA_VERSION,
      data: {},
    } as StoredObject;
    expect(probeRoomAreas({ minMs: 0 }, () => 0, [room, badRoom, wall]).rooms).toBe(1);
  });

  it('EZD-235b J2 probe job refuses bad input and accepts the bounds', () => {
    const bad: unknown[] = [
      null,
      5,
      [],
      {},
      { minMs: '5' },
      { minMs: -1 },
      { minMs: NaN },
      { minMs: Infinity },
      { minMs: 10001 },
    ];
    for (const input of bad) {
      expect(() => probeRoomAreas(input, () => 0, [])).toThrow(Error);
      expect(() => probeRoomAreas(input, () => 0, [])).toThrow('probe_input');
    }
    const out = probeRoomAreas({ minMs: 10000 }, clock(0, 10000), []);
    expect(out.passes).toBe(1);
    expect(out.ranMs).toBe(10000);
    expect(PROBE_JOB).toBe('probe-room-areas');
    expect(PROBE_JOB_MS).toBe(500);
    expect(PROBE_MAX_MS).toBe(10000);
  });

  it('EZD-235b J3 probe job reports a worker scope as worker', () => {
    vi.stubGlobal(
      'WorkerGlobalScope',
      class {
        static [Symbol.hasInstance]() {
          return true;
        }
      },
    );
    expect(probeRoomAreas({ minMs: 0 }, () => 0, []).where).toBe('worker');
    vi.unstubAllGlobals();
    expect(probeRoomAreas({ minMs: 0 }, () => 0, []).where).toBe('main');
  });
});
