// EZD-1994 (performance audit 2026-11-26, Q-0814): valueOf gives a settled read's value or throws its failure.
// AC-EZD-1994-1: the audit's new files are in place and docs/architecture.md lists them with their folders.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { valueOf } from './settled';

describe('EZD-1994 AC-EZD-1994-1 valueOf (reads started together)', () => {
  it('returns the value of a read that answered and throws the reason of one that failed', async () => {
    const boom = new Error('db down');
    const [ok, failed] = await Promise.allSettled([Promise.resolve(7), Promise.reject(boom)]);
    expect(valueOf(ok)).toBe(7);
    expect(() => valueOf(failed)).toThrow(boom);
  });

  it('AC-EZD-1994-1 docs/architecture.md lists settled.ts and fields.ts in the folder layout', () => {
    const doc = readFileSync(
      fileURLToPath(new URL('../../../docs/architecture.md', import.meta.url)),
      'utf8',
    );
    const layout = doc.slice(doc.indexOf('## Folder layout'));
    expect(layout).toMatch(/^ {2}src\/server\/settled\.ts .*EZD-1994/m);
    expect(layout).toMatch(/^ {2}src\/lib\/property-record\/ .*fields\.ts.*EZD-1994/m);
  });
});
