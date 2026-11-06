// EZD-207c Build step 5 (vault/plans/EZD-207c.md section 1): EZD-236's generated benchmark model as the
// working-copy map the model store takes (same value shape as loadWorkingCopy), in array order.
import { generateBenchmarkModel } from '@ezdraft/geometry';
import type { ObjectValue } from '../../../lib/outbox/model-api';

export function benchmarkObjects(): Map<string, ObjectValue> {
  const map = new Map<string, ObjectValue>();
  for (const o of generateBenchmarkModel()) {
    map.set(o.id, {
      type: o.type,
      schemaVersion: o.schema_version,
      data: o.data as Record<string, unknown>,
    });
  }
  return map;
}
