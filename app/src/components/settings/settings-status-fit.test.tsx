// EZD-424 (AC-EZD-424-1, AC-EZD-424-3; Q-0272 (a)). Expected values: AC-EZD-424-1 (a status value that does
// not fit is cut with an ellipsis and keeps its full text in a title); AC-EZD-424-3 (same items, order, spacing
// and font as before: the .status and .statusItem gaps, font and colours of EZD-103a stay).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/sheet-presets',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { StateHost } from '../states/StateHost';
import { SettingsShell } from './SettingsShell';

const here = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(here, 'SettingsShell.module.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\s+/g, ' ');

// Declarations of the rule whose whole selector is `selector`.
function rule(selector: string): string[] {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) return [];
  return m[1]
    .split(';')
    .map((d) => d.trim().replace(/\s*:\s*/, ': '))
    .filter(Boolean);
}

const LONG =
  'Worth Properties Residential Remodeling and General Contracting Services of Florida LLC';

describe('EZD-424 settings status bar fit', () => {
  it('a status value is cut with an ellipsis on one line inside a bounded room', () => {
    const v = rule('.statusValue');
    expect(v).toContain('overflow: hidden');
    expect(v).toContain('text-overflow: ellipsis');
    expect(v).toContain('white-space: nowrap');
    expect(v.some((d) => /^max-width: \d+ch$/.test(d))).toBe(true);
    expect(v).toContain('color: var(--ez-ink)');
  });

  it('at the desktop size the readouts give way and the disclaimer keeps its width', () => {
    const m = /@media \(width >= 1600px\) \{((?:[^{}]*\{[^}]*\})*)\s*\}/.exec(css);
    expect(m).not.toBeNull();
    const body = m?.[1] ?? '';
    expect(body).toMatch(/\.status > \[data-placement='bar'\] \{ flex-shrink: 0; \}/);
    expect(body).toMatch(/\.statusItem \{ flex: 0 1 auto; min-width: 0; \}/);
    expect(body).toMatch(/\.statusValue \{ flex: 0 1 auto; min-width: 0; \}/);
  });

  it('below the desktop size readouts keep their room and the location stays on one line', () => {
    expect(rule('.statusItem')).toContain('flex: none');
    expect(rule('.statusLabel')).toContain('flex: none');
    expect(rule('.location')).toContain('white-space: nowrap');
  });

  it('the bar keeps its spacing and font (AC-EZD-424-3)', () => {
    const s = rule('.status');
    for (const d of [
      'gap: 20px',
      'padding: 0 16px',
      'font-size: 12px',
      'font-family: var(--ez-font-mono)',
      'height: var(--ez-status-bar-height)',
    ]) {
      expect(s).toContain(d);
    }
    const i = rule('.statusItem');
    expect(i).toContain('display: flex');
    expect(i).toContain('gap: 6px');
    expect(rule('.location')).toContain('margin-left: auto');
  });

  it('the company value carries its full text in a title', () => {
    const html = renderToStaticMarkup(
      <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
        <StateHost>
          <SettingsShell
            companyName={LONG}
            initials="JB"
            activeMembers={1}
            allowed={['sheet_presets']}
            draftScope="m1"
            account={{ name: null, email: 'a@example.test', showCompanySettings: false }}
          >
            <p />
          </SettingsShell>
        </StateHost>
      </MessagesProvider>,
    );
    const tag = /<span\b[^>]*\bdata-settings-status="company"[^>]*>/.exec(html)?.[0] ?? '';
    expect(tag).toContain(`title="${LONG}"`);
    // Order kept: company item, location, then the disclaimer last.
    const footer =
      /<footer\b[^>]*data-settings-region="status-bar"[^>]*>([\s\S]*)<\/footer>/.exec(html)?.[1] ??
      '';
    const at = (s: string) => footer.indexOf(s);
    expect(at('data-settings-status="company"')).toBeGreaterThan(-1);
    expect(at('data-settings-status="company"')).toBeLessThan(
      at('data-settings-status="location"'),
    );
    expect(at('data-settings-status="location"')).toBeLessThan(at('data-testid="disclaimer"'));
  });
});
