// EZD-112 T8 (vault/plans/EZD-112.md section 4; AC-EZD-112-1, -6, -7).
// Renders inside MessagesProvider > StateHost > UnsavedChangesProvider as app/src/components/settings/
// guarded-link.test.tsx does. Expected values: section 3 testids and en texts; Decided "Form layout" (no EZ
// Binder text), "Identity order", "Contact order", "Logo shown" (an `img` with the signed link, meta
// `{KIND} logo`, never a `data:` URL or inline SVG), "Logo flow" (Upload / Replace, Remove only with a
// logo), "Buttons" (both disabled when not dirty); Q-0190 (no EZ Binder control).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/company',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import type { CompanyData } from '../../../lib/company/company';
import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import { CompanyForm } from './CompanyForm';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <UnsavedChangesProvider draftScope="m1">{el}</UnsavedChangesProvider>
      </StateHost>
    </MessagesProvider>,
  );

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const stripTags = (s: string) => decode(s.replace(/<[^>]*>/g, ''));
const count = (html: string, needle: string) => html.split(needle).length - 1;
const openTag = (html: string, testId: string) =>
  new RegExp(`<[a-z]+\\b[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? null;
const textOfId = (html: string, testId: string) => {
  const m = new RegExp(`<([a-z]+)\\b[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</\\1>`).exec(
    html,
  );
  return m ? stripTags(m[2]).trim() : null;
};
const isDisabled = (tag: string | null) => /\sdisabled(=""|\s|>|\/)/.test(tag ?? '');

const SVG_URL = 'https://x.test/s.svg?token=t';
const withLogo: CompanyData = {
  name: 'Acme Co',
  licenseNo: 'LIC-1',
  contact: {
    phone: '555-0100',
    email: 'office@acme.test',
    website: 'acme.test',
    address: '1 Main St',
  },
  logo: { path: 't/tenant/logo/u.svg', url: SVG_URL, kind: 'svg' },
};

describe('EZD-112 company form markup', () => {
  it('T8 with a logo: the headings, one signed img, no inline SVG or data URL, SVG logo meta, Replace and Remove, buttons disabled', () => {
    const html = render(<CompanyForm initial={withLogo} />);
    const text = stripTags(html);
    for (const word of [
      'Identity',
      'Company name',
      'Logo',
      'License number',
      'Contact',
      'Phone',
      'Email',
      'Website',
      'Address',
    ]) {
      expect(text, word).toContain(word);
    }
    expect(openTag(html, 'company-form')).not.toBeNull();
    expect(openTag(html, 'company-customers')).not.toBeNull();

    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length).toBe(1);
    expect(decode(/\bsrc="([^"]*)"/.exec(imgs[0])?.[1] ?? '')).toBe(SVG_URL);
    expect(openTag(html, 'company-logo-preview')).toContain('<img');

    const svgs = [...html.matchAll(/<svg\b[^>]*>/g)];
    expect(svgs.length).toBe(count(html, '<use'));
    for (const m of html.matchAll(/<svg\b[^>]*>(?!<use)/g)) {
      throw new Error(`inline svg that is not an icon sprite use: ${m[0]}`);
    }
    expect(html).not.toContain('data:');
    expect(html.toLowerCase()).not.toContain('ez binder');

    expect(isDisabled(openTag(html, 'company-save'))).toBe(true);
    expect(isDisabled(openTag(html, 'company-discard'))).toBe(true);
    expect(textOfId(html, 'company-logo-meta')).toBe('SVG logo');
    expect(textOfId(html, 'company-logo-pick')).toBe('Replace');
    expect(textOfId(html, 'company-logo-remove')).toBe('Remove');
  });

  it('T8 with no logo: Upload, no Remove, no img', () => {
    const html = render(<CompanyForm initial={{ ...withLogo, logo: null }} />);
    expect(textOfId(html, 'company-logo-pick')).toBe('Upload');
    expect(openTag(html, 'company-logo-remove')).toBeNull();
    expect(count(html, '<img')).toBe(0);
  });
});
