// EZD-1993 (AC-EZD-1993-1, AC-EZD-1993-2): the browser-test part a GitHub CI job runs. Unset keeps every project
// as before; the device shards together with the perf part cover every project, and no part reruns another's tests.
import { describe, expect, test } from 'vitest';
import { applyE2ePart, parseE2ePart } from './e2e-part';

const DEVICES = ['desktop', 'ipad-landscape', 'surface', 'phone'];
const projects = () => [
  ...DEVICES.map((name) => ({ name, testIgnore: '**/perf-*.spec.ts' })),
  { name: 'perf', testMatch: '**/perf-*.spec.ts', workers: 1, dependencies: [...DEVICES] },
];

describe('EZD-1993 browser-test parts', () => {
  test('unset or empty runs every project unchanged, unsharded (the build Mac gate)', () => {
    for (const v of [undefined, '', '  ']) {
      expect(parseE2ePart(v)).toEqual({ kind: 'all' });
      const input = projects();
      const r = applyE2ePart(parseE2ePart(v), input);
      expect(r.projects).toBe(input);
      expect(r.shard).toBeNull();
    }
  });

  test('devices:i/n runs shard i of n of the four device projects, without perf', () => {
    expect(parseE2ePart('devices:2/4')).toEqual({ kind: 'devices', current: 2, total: 4 });
    const r = applyE2ePart(parseE2ePart('devices:2/4'), projects());
    expect(r.projects.map((p) => p.name)).toEqual(DEVICES);
    expect(r.shard).toEqual({ current: 2, total: 4 });
  });

  test('perf runs the perf project alone with no dependencies, unsharded', () => {
    const r = applyE2ePart(parseE2ePart('perf'), projects());
    expect(r.projects).toHaveLength(1);
    expect(r.projects[0]).toEqual({ name: 'perf', testMatch: '**/perf-*.spec.ts', workers: 1, dependencies: [] });
    expect(r.shard).toBeNull();
  });

  test('a value outside the three forms is refused, never read as run-everything', () => {
    for (const v of ['devices:0/4', 'devices:5/4', 'devices:1', 'devices:a/4', 'shard:1/4', 'PERF', 'devices:1/4 x']) {
      expect(() => parseE2ePart(v), v).toThrow(/EZD_E2E_PART/);
    }
  });
});
