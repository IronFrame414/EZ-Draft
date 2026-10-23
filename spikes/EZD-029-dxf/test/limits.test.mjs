// EZD-029 T7 inside the job runtime, T9 limits judge (vault/plans/EZD-029.md Tests table; Approach
// Steps 4, 5). Q-0027 (a): Vercel Pro defaults 300 s and 2048 MB; EZD-009 Step 4: 30 s slice margin;
// 11 Budgets: a 150,000-entity reference DXF; Step 5 totals = unit counts x 1,500.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMIT_SECONDS,
  LIMIT_MEMORY_MB,
  runInLimits,
  withTmp,
  readResults,
  fileUrl,
} from './helpers/common.mjs';

const recordSpawn = path.join(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'record-spawn.mjs');

const STANDIN_1500_BY_TYPE = {
  LINE: 81000,
  ARC: 15000,
  CIRCLE: 7500,
  LWPOLYLINE: 15000,
  ELLIPSE: 3000,
  SPLINE: 3000,
  TEXT: 7500,
  MTEXT: 4500,
  INSERT: 7500,
  HATCH: 3000,
  DIMENSION: 3000,
};

describe('EZD-029 limits', () => {
  test('EZD-029 T9 limits constants and judge', async () => {
    const { judge, SECONDS, MEMORY_MB, SLICE_MARGIN_SECONDS } = await import('../src/limits.mjs');
    assert.equal(SECONDS, 300);
    assert.equal(MEMORY_MB, 2048);
    assert.equal(SLICE_MARGIN_SECONDS, 30);

    const limits = { seconds: 300, memoryMb: 2048 };
    const verdict = (run) => {
      const { pass, reason } = judge(run, limits);
      return { pass, reason };
    };
    assert.deepEqual(verdict({ exitCode: 0, timedOut: false, maxRssMb: 100 }), { pass: true, reason: null });
    assert.deepEqual(verdict({ exitCode: null, timedOut: true, maxRssMb: 100 }), { pass: false, reason: 'timeout' });
    assert.deepEqual(verdict({ exitCode: 1, timedOut: false, maxRssMb: 100 }), { pass: false, reason: 'crashed' });
    assert.deepEqual(verdict({ exitCode: 0, timedOut: false, maxRssMb: 2048 }), { pass: false, reason: 'memory' });
    assert.deepEqual(verdict({ exitCode: 0, timedOut: false, maxRssMb: 2047.9 }), { pass: true, reason: null });
  });

  test(
    'EZD-029 T7 inside the job runtime: the 150,000-entity stand-in parses within 300 s and 2048 MB',
    { timeout: LIMIT_SECONDS * 1000 + 120_000 },
    async () => {
      await withTmp(async (tmp) => {
        const spawnLog = path.join(tmp, 'spawns.jsonl');
        const run = await runInLimits(['--standin', '1500', '--label', 'standin-1500', '--out', tmp], {
          // Test-side probe: records the argv of every child the CLI starts (helpers/record-spawn.mjs).
          env: { NODE_OPTIONS: `--import=${fileUrl(recordSpawn)}`, EZD029_SPAWN_LOG: spawnLog },
        });
        assert.equal(run.code, 0, run.stderr);

        const spawns = (await readFile(spawnLog, 'utf8'))
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l));
        const child = spawns.find((s) => (s.args ?? []).some((a) => /child\.mjs$/.test(a)));
        assert.ok(child, `no child.mjs spawn recorded: ${JSON.stringify(spawns)}`);
        assert.ok(
          child.args.includes(`--max-old-space-size=${LIMIT_MEMORY_MB}`),
          `child args ${JSON.stringify(child.args)}`,
        );

        const r = (await readResults(tmp)).runs['standin-1500'];
        assert.ok(r, 'runs.standin-1500');
        assert.equal(r.raw.total, 150000);
        assert.deepEqual(r.raw.byType, STANDIN_1500_BY_TYPE);
        assert.equal(r.raw.paperSpace, 3000);
        const layers = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`EZD-L${i}`, 15000]));
        assert.deepEqual(r.raw.byLayer, layers);
        assert.equal(r.parsed.total, 150000);
        assert.deepEqual(r.notRead, {});

        assert.ok(r.timing.ms < LIMIT_SECONDS * 1000, `timing.ms ${r.timing.ms}`);
        assert.ok(r.memory.maxRssMb < LIMIT_MEMORY_MB, `maxRssMb ${r.memory.maxRssMb}`);
        assert.equal(r.pass, true);
      });
    },
  );
});
