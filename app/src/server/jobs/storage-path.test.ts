// EZD-009 T8, pure part (vault/plans/EZD-009.md Tests; Step 5 storage-path.ts): the Storage path shape and
// the tenant-prefix check. Buckets: docs/architecture.md Storage buckets and paths. Ids are test inputs.
import { describe, expect, it } from 'vitest';
import { assertPathsInJob, storagePathSchema } from './storage-path';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const P = '33333333-3333-4333-8333-333333333333';
const P2 = '44444444-4444-4444-8444-444444444444';
const job = { tenant_id: A, project_id: P };

describe('EZD-009 storage paths', () => {
  it('EZD-009 T8 storagePathSchema accepts one well-formed path and refuses four bad ones', () => {
    expect(
      storagePathSchema.safeParse({ bucket: 'jobs', path: `${A}/${P}/j/out/a.pdf` }).success,
    ).toBe(true);
    for (const bad of [
      { bucket: 'jobs', path: '../x' },
      { bucket: 'jobs', path: '/a' },
      { bucket: 'jobs', path: 'a\\b' },
      { bucket: 'tmp', path: `${A}/${P}/j/out/a.pdf` },
    ]) {
      expect(storagePathSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('EZD-009 T8 assertPathsInJob passes the job tenant and project or tenant folder, throws otherwise', () => {
    const wrap = (p: string) => ({ file: { bucket: 'jobs', path: p } });
    expect(() => assertPathsInJob(wrap(`${A}/${P}/j/in/a.json`), job)).not.toThrow();
    expect(() => assertPathsInJob(wrap(`${A}/tenant/j/in/a.json`), job)).not.toThrow();
    expect(() => assertPathsInJob(wrap(`${A}/${P2}/j/in/a.json`), job)).toThrow();
    expect(() => assertPathsInJob(wrap(`${B}/${P}/j/in/a.json`), job)).toThrow();
  });
});
