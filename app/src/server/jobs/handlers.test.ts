// EZD-009 T14, T19 and the handler-map half of T18 (vault/plans/EZD-009.md Tests; Steps 5, 8). T19 is a
// machine check like EZD-006's no_isolation_test: every registered kind has an expectSafeToRunTwice call.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectSafeToRunTwice } from '../../../test-harness/jobs/run-twice';
import { getHandlers } from './handlers';

const appSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(full));
    else if (/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('EZD-009 job handlers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-009 T14 the test handler is safe to run twice', async () => {
    await expectSafeToRunTwice('test', { payload: { steps: 3, stepMs: 0 } });
  });

  it('EZD-009 T18 no test handler in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(Object.keys(getHandlers())).not.toContain('test');
  });

  it('EZD-009 T19 every registered handler has a run-twice test', () => {
    delete process.env.VERCEL_ENV;
    const kinds = Object.keys(getHandlers()).sort();
    expect(kinds).toEqual(['test']);
    const text = testFiles(appSrc)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const kind of kinds) {
      expect(text, kind).toMatch(new RegExp(`expectSafeToRunTwice\\(\\s*'${kind}'`));
    }
  });
});
