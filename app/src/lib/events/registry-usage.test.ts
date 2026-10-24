import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findUnregisteredEmits } from '../../../test-utils/events/find-unregistered-emits';
import { isRegisteredEvent } from './registry';

describe('EZD-022 registry usage', () => {
  it('T7 scanner finds unregistered literals', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'ezd022-'));
    try {
      const put = (rel: string, text: string) => {
        const p = path.join(dir, rel);
        mkdirSync(path.dirname(p), { recursive: true });
        writeFileSync(p, text);
      };
      put('src/a.ts', 'emit(\'lock.acquired\', p, c);\n\nemit("nope.never", p, c);\n');
      put(
        'src/b.tsx',
        "emit(`render.failed`, p, c);\nstream.emit('error');\nevents.emit('also.bad');\n",
      );
      put('src/c.test.ts', "emit('test.only', p, c);\n");
      put('node_modules/x/d.ts', "emit('dep.bad', p, c);\n");
      // root '.' reaches src and node_modules; node_modules is skipped
      const found = findUnregisteredEmits(dir, ['.'], isRegisteredEvent);
      expect(found).toEqual([{ file: 'src/a.ts', line: 3, name: 'nope.never' }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('EZD-022 done when: no code emits a name that is not in the registry @smoke', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const scanned: string[] = [];
    const found = findUnregisteredEmits(
      root,
      ['app/src', 'packages/*/src', 'worker/src'],
      isRegisteredEvent,
      { onFile: (f) => scanned.push(f) },
    );
    expect(found).toEqual([]);
    expect(scanned).toContain('app/src/server/events/index.ts');
  });
});
