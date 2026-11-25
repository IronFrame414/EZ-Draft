// EZD-901a: the benchmark reference DXF has the 150,000 entities of 11 Budgets, in EZD-029 Step 5's unit mix
// (98 model-space + 2 paper-space entities per unit, 1,500 units; 43 entities inside 13 block definitions), and is
// the same on every call. Counted with the raw scanner (no parser).
import { describe, expect, it } from 'vitest';
import { rawScan } from '../jobs/reference-dxf/raw-scan';
import { BENCHMARK_DXF_ENTITIES, generateBenchmarkDxf } from './benchmark-dxf';

describe('EZD-901a benchmark DXF', () => {
  it('holds 150,000 entities in the EZD-029 mix and is deterministic', () => {
    const text = generateBenchmarkDxf();
    expect(BENCHMARK_DXF_ENTITIES).toBe(150_000);
    const scan = rawScan(text);
    const total = Object.values(scan.byType).reduce((a, b) => a + b, 0);
    // ENTITIES plus the 43 block entities (10 squares of 4 lines, *D1's 3 lines).
    expect(total).toBe(150_000 + 43);
    const u = 1500;
    expect(scan.byType).toEqual({
      LINE: 53 * u + u + 43,
      ARC: 10 * u,
      CIRCLE: 5 * u,
      LWPOLYLINE: 10 * u,
      ELLIPSE: 2 * u,
      SPLINE: 2 * u,
      TEXT: 4 * u + u,
      MTEXT: 3 * u,
      INSERT: 5 * u,
      HATCH: 2 * u,
      DIMENSION: 2 * u,
    });
    expect(generateBenchmarkDxf()).toBe(text);
  });
});
