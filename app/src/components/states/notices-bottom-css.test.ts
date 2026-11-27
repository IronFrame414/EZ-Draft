// EZD-2028 (Q-0907; AC-EZD-2028-2; AC-EZD-2028-3): the toasts and the reload notice keep 16 px from the bottom (their desktop
// place, unchanged), plus the page's bottom bar (--ez-bottom-bar, 0 when the page has none) and the home bar
// (env(safe-area-inset-bottom)) on every page. The field pack sets the bar to its tab bar: the 1 px top border and
// the 56 px tabs (FieldPack.module.css .tabBar and .tab); the tab bar's own safe-area padding is the inset term.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = (f: string) =>
  readFileSync(path.join(src, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ');

function decls(file: string, selector: string): string[] {
  const text = css(file);
  const at = text.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`${selector} not in ${file}`);
  const body = text.slice(text.indexOf('{', at) + 1, text.indexOf('}', at));
  return body
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
}

const BOTTOM = 'bottom: calc(16px + var(--ez-bottom-bar, 0px) + env(safe-area-inset-bottom, 0px))';

describe('EZD-2028 toasts and the reload notice clear the bottom bar and the home bar', () => {
  it('the toast area adds the bottom bar and the safe-area inset to 16 px', () => {
    const d = decls('components/states/Toast.module.css', '.viewport');
    expect(d).toContain('position: fixed');
    expect(d).toContain(BOTTOM);
    expect(d.filter((x) => x.startsWith('bottom:'))).toHaveLength(1);
  });

  it('the reload notice adds the bottom bar and the safe-area inset to 16 px', () => {
    const d = decls('components/pwa/DeviceNotices.module.css', '.reload');
    expect(d).toContain('position: fixed');
    expect(d).toContain(BOTTOM);
    expect(d.filter((x) => x.startsWith('bottom:'))).toHaveLength(1);
  });

  it('the field pack sets the bottom bar to its tab bar while the tab bar is on the page', () => {
    const f = 'field-pack/FieldPack.module.css';
    expect(decls(f, ':global(:root):has(.tabBar)')).toEqual(['--ez-bottom-bar: 57px']);
    expect(decls(f, '.tabBar')).toEqual(
      expect.arrayContaining([
        'border-top: 1px solid var(--ez-border)',
        'padding-bottom: env(safe-area-inset-bottom)',
      ]),
    );
    expect(decls(f, '.tab')).toContain('min-height: 56px');
  });

  it('no other style sheet sets the bottom bar, so other pages keep 0', () => {
    const hits = (readdirSync(src, { recursive: true }) as string[])
      .filter((f) => f.endsWith('.css'))
      .filter((f) => readFileSync(path.join(src, f), 'utf8').includes('--ez-bottom-bar:'));
    expect(hits).toEqual(['field-pack/FieldPack.module.css']);
  });
});
