// EZD-1982 (AC-EZD-1982-1, -3; audit F7). The narrow-screen rules for Settings use the desktop reference width
// (ARCH Device layouts: CSS that repeats 1600 is kept equal to DESKTOP_REFERENCE_WIDTH), and the Sheet presets
// inspector is the S15c board width, 612 px (vault/mockups/html/project/S15cSubmittal.dc.html, the aside
// "Selected submittal profile"), only at the desktop size.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DESKTOP_REFERENCE_WIDTH } from '../../lib/device/device-layout';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) =>
  readFileSync(path.join(here, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

// The body of the first `@media (<query>) { ... }` block (brace matched).
function mediaBody(css: string, query: string): string {
  const at = css.indexOf(`@media (${query}) {`);
  if (at < 0) return '';
  let depth = 0;
  for (let i = css.indexOf('{', at); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', at) + 1, i);
  }
  return '';
}

const narrow = `width < ${DESKTOP_REFERENCE_WIDTH}px`;
const wide = `width >= ${DESKTOP_REFERENCE_WIDTH}px`;

describe('EZD-1982 settings fit CSS', () => {
  it('the Users table, the Customers head and the flush main card change only below the desktop width', () => {
    const users = mediaBody(read('users/Users.module.css'), narrow);
    expect(users).toMatch(/\.nameCol\s*\{\s*max-width:\s*0;/);
    expect(users).toMatch(/\.table\s*\{[^}]*flex:\s*none;/);
    const customers = mediaBody(read('company/Customers.module.css'), narrow);
    expect(customers).toMatch(/\.head\s*\{\s*flex-wrap:\s*wrap;/);
    expect(customers).toMatch(/\.title\s*\{\s*flex-basis:\s*100%;/);
    expect(mediaBody(read('SettingsShell.module.css'), narrow)).toMatch(
      /\.mainFlush\s*\{\s*overflow-y:\s*auto;/,
    );
  });

  it('a Users email never breaks mid-word', () => {
    const css = read('users/Users.module.css');
    const rule = css.match(/\.subEmail\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/white-space:\s*nowrap;/);
    expect(rule).toMatch(/text-overflow:\s*ellipsis;/);
    expect(rule).toMatch(/overflow-wrap:\s*normal;/);
  });

  it('the Sheet presets inspector is 612 px at the desktop size and the shared width below it', () => {
    const css = read('sheet-presets/SheetPresets.module.css');
    expect(mediaBody(css, wide)).toMatch(/\.inspector\s*\{\s*width:\s*612px;\s*\}/);
    expect(css).toMatch(/\.inspector\s*\{[^}]*width:\s*var\(--ez-inspector-width\);/);
  });
});
