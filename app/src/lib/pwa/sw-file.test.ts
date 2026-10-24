// EZD-013 U5 (vault/plans/EZD-013.md section 4).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('EZD-013 service worker file', () => {
  it('U5: skipWaiting and clients.claim, no fetch handler, no cache or workbox', () => {
    const src = readFileSync(path.join(here, '..', '..', '..', 'public', 'sw.js'), 'utf8');
    expect(src).toContain('skipWaiting');
    expect(src).toContain('clients.claim');
    expect(src).not.toMatch(/addEventListener\(\s*['"]fetch/);
    for (const word of ['caches', 'importScripts', 'workbox']) {
      expect(src).not.toContain(word);
    }
  });
});
