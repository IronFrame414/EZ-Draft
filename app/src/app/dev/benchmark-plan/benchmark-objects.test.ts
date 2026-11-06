// EZD-207c V4 (vault/plans/EZD-207c.md section 4; AC-EZD-207-5): the in-memory model map equals EZD-236's
// generated model, in array order, in the working-copy value shape.
import { generateBenchmarkModel } from '@ezdraft/geometry';
import { describe, expect, it } from 'vitest';
import { benchmarkObjects } from './benchmark-objects';

describe('EZD-207c benchmark objects', () => {
  it('EZD-207c V4 model map', () => {
    const map = benchmarkObjects();
    const model = generateBenchmarkModel();
    expect(map.size).toBe(3000);
    expect([...map.keys()]).toEqual(model.map((o) => o.id));
    for (const o of model) {
      expect(map.get(o.id)).toEqual({
        type: o.type,
        schemaVersion: o.schema_version,
        data: o.data,
      });
    }
  });
});
