// EZD-015c U11a, U11b, U10c (vault/plans/EZD-015c.md section 4).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Page from './page';
import { en } from '../../../server/messages/catalogs/en';
import { es } from '../../../server/messages/catalogs/es';

const E = en as unknown as Record<string, string>;
const S = es as unknown as Record<string, string>;
const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

describe('EZD-015c states test page', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('EZD-015c done when: /dev/states is not found in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    let digest: string | undefined;
    try {
      await Page({ searchParams: Promise.resolve({}) });
    } catch (e) {
      digest = (e as { digest?: string }).digest;
    }
    expect(digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('EZD-015c U11b render outside production', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    delete process.env.VERCEL_ENV;
    const html = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ lang: 'es' }) }),
    );
    expect(html).toContain('lang="es"');
    for (const testId of [
      'states-demo',
      'async-section',
      'load-start',
      'load-resolve',
      'load-reject',
      'retry-section',
      'retry-count',
      'offline-section',
      'toast-section',
      'toast-show',
      'toast-show-persistent',
      'confirm-section',
      'confirm-open',
      'confirm-result',
    ]) {
      expect(html.split(`data-testid="${testId}"`).length - 1, testId).toBe(1);
    }
    expect(html).not.toContain('data-testid="loaded"');
    expect(html).toContain('data-load-count="0"');
    expect(html).not.toContain('data-ready');
    expect(html).not.toContain('data-skeleton');
    expect(html).toContain(esc(S['dev.states.sample_error']));
    expect(html).toContain(esc(S['common.retry']));

    const arr = renderToStaticMarkup(
      await Page({ searchParams: Promise.resolve({ lang: ['es'] }) }),
    );
    expect(arr).toContain('lang="en"');
    expect(arr).toContain(esc(E['common.retry']));
  });

  it('EZD-015c U10c dev.states keys', () => {
    const want: Record<string, [string, string]> = {
      'dev.states.loaded': ['Loaded', 'Cargado'],
      'dev.states.sample_error': ['Sample error', 'Error de ejemplo'],
      'dev.states.sample_toast': ['Sample toast', 'Aviso de ejemplo'],
      'dev.states.confirm_title': ['Sample confirm', 'Confirmación de ejemplo'],
      'dev.states.confirm_message': ['Sample question', 'Pregunta de ejemplo'],
      'dev.states.confirm_ok': ['Sample action', 'Acción de ejemplo'],
    };
    for (const [k, [e, s]] of Object.entries(want)) {
      expect(E[k], k).toBe(e);
      expect(S[k], k).toBe(s);
    }
  });
});
