// EZD-012c B7, U5, U6 (vault/plans/EZD-012c.md section 4).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from './page';
import RailPage from './rail/page';
import { catalogFor } from '../../../server/messages/catalog';
import { es } from '../../../server/messages/catalogs/es';

function notFoundDigest(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { digest?: string }).digest;
  }
  return undefined;
}

describe('EZD-012c shell test pages', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-012c B7 not found in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(notFoundDigest(() => Page())).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(notFoundDigest(() => RailPage())).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('EZD-012c U6 pages render outside production', () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;

    const frame = renderToStaticMarkup(<Page />);
    expect(frame).toContain('data-shell-region="frame"');
    expect(frame.match(/<header/g)).toHaveLength(1);
    expect(frame.indexOf('<header')).toBeLessThan(frame.indexOf('data-shell-region="body"'));
    expect(frame.indexOf('data-shell-region="body"')).toBeGreaterThan(-1);
    expect(frame.match(/data-rail-tool/g)).toBeNull();

    const rail = renderToStaticMarkup(<RailPage />);
    expect(rail.match(/<header/g)).toHaveLength(1);
    expect(rail.match(/data-rail-tool=/g)).toHaveLength(3);
    expect(rail.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(rail).toMatch(
      /<button[^>]*(aria-pressed="true"[^>]*data-rail-tool="select"|data-rail-tool="select"[^>]*aria-pressed="true")/,
    );
  });

  it('EZD-012c U5 shell strings', () => {
    const en = catalogFor('office', 'en') as Record<string, unknown>;
    expect(en['office.shell.tools']).toBe('Tools');
    expect(en['office.tool.select']).toBe('Select');
    expect(en['office.tool.cabinets']).toBe('Cabinets');
    expect(en['office.tool.help']).toBe('Help');
    expect(en['office.shell.left_panel']).toBe('Left panel');
    expect(en['office.shell.inspector']).toBe('Inspector');
    const esKeys = Object.keys(es);
    for (const k of [
      'office.shell.tools',
      'office.tool.select',
      'office.tool.cabinets',
      'office.tool.help',
      'office.shell.left_panel',
      'office.shell.inspector',
    ]) {
      expect(esKeys).not.toContain(k);
    }
  });
});
