// EZD-1995 (AC-EZD-1995-1): each lazy screen's own messages, and the app build's loader that writes them out.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogFor } from './catalog';
import { SRC } from './message-usage.test-helpers';
import { SCREEN_MESSAGES, screenSlice } from './screen-messages';
import type { MessageScreen } from './screen-messages';

const OFFICE: Readonly<Record<string, unknown>> = catalogFor('office', 'en');
const SCREENS = Object.keys(SCREEN_MESSAGES) as MessageScreen[];
const loaderPath = join(SRC, '..', 'tools', 'screen-messages-loader.cjs');
const loader = createRequire(import.meta.url)(loaderPath) as {
  (this: { resourcePath: string; addDependency?: (f: string) => void }): string;
  sliceFor(screen: string): Record<string, unknown>;
};

describe('EZD-1995 AC-1: a lazy screen loads only its own messages', () => {
  it("a screen's slice is the office messages under its prefixes, unchanged, and never the whole catalog", () => {
    const whole = Object.keys(OFFICE).length;
    for (const screen of SCREENS) {
      const prefixes: readonly string[] = SCREEN_MESSAGES[screen];
      const slice = screenSlice(screen);
      expect(Object.keys(slice).length, screen).toBeGreaterThan(0);
      // The largest screen uses well under a tenth of the 3,000-message catalog.
      expect(Object.keys(slice).length, screen).toBeLessThan(whole / 10);
      for (const [key, value] of Object.entries(OFFICE)) {
        const wanted = prefixes.some((p) => key.startsWith(p));
        expect(Object.hasOwn(slice, key), `${screen} ${key}`).toBe(wanted);
        if (wanted) expect(slice[key]).toEqual(value);
      }
    }
  });

  it('the countertops screen gets its panel text and not the Users settings text', () => {
    const slice = screenSlice('countertops');
    expect(slice['office.countertops.panel.tab_pieces']).toBe('Pieces');
    expect(Object.keys(slice).some((k) => k.startsWith('office.users.'))).toBe(false);
  });

  it('the build loader writes the same slice for every screen', () => {
    for (const screen of SCREENS) {
      expect(loader.sliceFor(screen), screen).toEqual(screenSlice(screen));
      const deps: string[] = [];
      const source = loader.call({
        resourcePath: join(SRC, 'lib/messages/screens', `${screen}.messages.ts`),
        addDependency: (f) => deps.push(f),
      });
      expect(source.startsWith('export default {')).toBe(true);
      expect(JSON.parse(source.slice('export default '.length).replace(/;\n$/, ''))).toEqual(screenSlice(screen));
      expect(deps.map((d) => d.slice(d.lastIndexOf('/') + 1)).sort()).toEqual(['en.ts', 'screen-prefixes.ts']);
    }
  });

  it('the loader refuses a screen with no list and a file that is not a messages file', () => {
    expect(() => loader.sliceFor('nope')).toThrow(/no SCREEN_MESSAGES entry "nope"/);
    expect(() => loader.call({ resourcePath: join(SRC, 'lib/messages/t.ts') })).toThrow(/not a <screen>\.messages\.ts/);
  });
});
