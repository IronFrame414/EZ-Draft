// EZD-013 U5 (vault/plans/EZD-013.md section 4), rewritten by EZD-134: the worker at /sw.js is now the Workbox
// app-shell cache. public/sw.js is the build-sw.mjs output (regenerated here and compared), takes over at once
// (skipWaiting, clients.claim), names only the three app caches, answers nothing online and listens for the page's
// warm message.
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, '..', '..', '..', 'public', 'sw.js'), 'utf8');

describe('EZD-134 service worker file', () => {
  it('U5: public/sw.js is the current Workbox build (run `pnpm --filter app sw` after a rule change)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ezd-sw-test-'));
    try {
      const out = path.join(dir, 'sw.js');
      // Plain Node, as `pnpm sw` runs it: the worker functions are copied as their source text.
      const run = spawnSync(process.execPath, [path.join(here, 'build-sw.mjs'), '--out', out], {
        encoding: 'utf8',
      });
      expect(run.status, run.stderr).toBe(0);
      expect(await readFile(out, 'utf8')).toBe(src);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('U5: takes over at once and names only the three app caches', () => {
    expect(src).toContain('skipWaiting');
    expect(src).toContain('clients.claim');
    expect(src).toContain('workbox:');
    const names = [...new Set(src.match(/"ezdraft-[a-z]*"/g))].sort();
    // The three caches and the warm message type.
    expect(names).toEqual([
      '"ezdraft-"',
      '"ezdraft-projects"',
      '"ezdraft-shell"',
      '"ezdraft-static"',
      '"ezdraft-warm"',
    ]);
    // Never imports code from elsewhere at run time.
    expect(src).not.toContain('importScripts');
  });

  it('U5: one script that parses, with the warm listener and only offline routes', () => {
    expect(() => new Script(src)).not.toThrow();
    expect(src).toContain("addEventListener('message'");
    expect(src).toContain('onWarmMessage(event.data)');
    // Each of the three routes starts with the offline test (Workbox minifies it to `return!self.navigator.onLine&&`).
    expect(src.match(/\(function\(\{[^}]*\}\)\{return!self\.navigator\.onLine&&/g)).toHaveLength(3);
  });
});
