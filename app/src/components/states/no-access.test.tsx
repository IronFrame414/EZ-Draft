// EZD-102 U6, U7 (vault/plans/EZD-102.md section 4; AC-EZD-102-3). Expected values: Q-0214 (the English
// no-access text), plan section 6 (error.project_not_found English), R24 #40 (Spanish present and not
// English), Decided `NoAccess` (role status, data-testid and data-state no-access). Catalogs from
// app/src/server/messages/catalogs (what catalogFor serves). Position checks anchor on the NoAccess element's
// own tag (L-020).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { en } from '../../server/messages/catalogs/en';
import { es } from '../../server/messages/catalogs/es';
import { NoAccess } from './index';

const E = en as unknown as Record<string, unknown>;
const S = es as unknown as Record<string, unknown>;

const NO_ACCESS_EN = "You don't have access to this. Ask your supervisor.";
const PROJECT_NOT_FOUND_EN = "That project isn't available.";

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

describe('EZD-102 no access state', () => {
  it('U6 messages: English text fixed, Spanish present and not English', () => {
    expect(E['common.no_access']).toBe(NO_ACCESS_EN);
    expect(E['error.project_not_found']).toBe(PROJECT_NOT_FOUND_EN);
    for (const k of ['common.no_access', 'error.project_not_found']) {
      const v = S[k];
      expect(typeof v, k).toBe('string');
      expect((v as string).trim().length, k).toBeGreaterThan(0);
      expect(v, k).not.toBe(E[k]);
    }
  });

  it('U7 NoAccess renders one status element with the English text', () => {
    const office = catalogFor('office', 'en');
    const html = renderToStaticMarkup(
      <MessagesProvider language="en" messages={office}>
        <NoAccess />
      </MessagesProvider>,
    );
    expect(html.split('role="status"').length - 1).toBe(1);
    expect(html.split('data-testid="no-access"').length - 1).toBe(1);
    const m = /<([a-z]+)\b([^>]*\bdata-testid="no-access"[^>]*)>([\s\S]*?)<\/\1>/.exec(html);
    expect(m, 'the no-access element').not.toBeNull();
    const attrs = m?.[2] ?? '';
    expect(attrs).toMatch(/(^|\s)role="status"(\s|$)/);
    expect(attrs).toMatch(/(^|\s)data-state="no-access"(\s|$)/);
    expect(decode((m?.[3] ?? '').replace(/<[^>]*>/g, ''))).toBe(NO_ACCESS_EN);
  });
});
