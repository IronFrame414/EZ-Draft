// EZD-709 (S15b; board S15bTitleBlock; AC-EZD-709-1, AC-EZD-709-2). Renders the Title block page inside
// MessagesProvider > StateHost > UnsavedChangesProvider as code-edition-form.test.tsx does. Expected values: S15b
// Controls (the company switch; Project fields, Revision block, Seal box, Department approval stamp area; the
// preview size toggle 24x36 / 11x17; Save disabled with no edits), S15b Validation (missing company name and
// license listed as warnings), R24 #7 (seal box and department stamp) and #26 (Version N / Rev N), board text
// ("Company fields complete.", "No unsaved changes").
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/title-block',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import type { TitleBlockSettings } from '../../../lib/title-block/title-block';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import { TitleBlockLoadError, TitleBlockPage, changesOf } from './TitleBlockForm';
import Loading from '../../../app/(office)/settings/title-block/loading';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <StateHost>
        <UnsavedChangesProvider draftScope="m1">{el}</UnsavedChangesProvider>
      </StateHost>
    </MessagesProvider>,
  );
const openTag = (html: string, testId: string) =>
  new RegExp(`<[a-z]+\\b[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? null;
const isDisabled = (tag: string | null) => /\sdisabled(=""|\s|>|\/)/.test(tag ?? '');
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

const SETTINGS: TitleBlockSettings = {
  config: { showCompany: true },
  company: {
    name: 'Acme Remodeling',
    licenseNo: 'CGC000001',
    contact: { phone: '555-0100', website: 'acme.test' },
    logoUrl: null,
  },
  codeEdition: 'fbc9_nec2023',
};

describe('EZD-709 Title block page markup', () => {
  it('shows the six parts, the switch on, the preview at 24x36 and Save off with no edits', () => {
    const html = render(<TitleBlockPage initial={SETTINGS} />);
    const plain = text(html);
    expect(html).toContain('data-settings-page="title_block"');
    for (const s of [
      'Title block',
      'One company title block on every sheet. The layout is fixed; fields fill from Company and project data.',
      'Show company logo, license and contact',
      'Project fields',
      'Revision block',
      'Seal box',
      'Department approval stamp area',
      'Sheet title, number and drawn by',
      'Live preview',
      'No unsaved changes',
      'Company fields complete.',
      'Acme Remodeling · CGC000001 · 555-0100 · acme.test',
    ]) {
      expect(plain, s).toContain(s);
    }
    expect([...html.matchAll(/data-title-block-item="(\d)"/g)].map((m) => m[1])).toEqual([
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(openTag(html, 'title-block-show-company')).toContain('aria-checked="true"');
    expect(isDisabled(openTag(html, 'title-block-save'))).toBe(true);
    expect(openTag(html, 'title-block-preview')).toContain('data-size="24x36"');
    expect(openTag(html, 'title-block-size-24x36')).toContain('aria-checked="true"');
    expect(html).toContain('data-testid="title-block-preview-seal"');
    expect(html).toContain('data-testid="title-block-preview-stamp"');
    expect(html).not.toContain('data-testid="title-block-missing"');
  });

  it('AC-EZD-709-1: the preview follows the switch (company block shown on, gone off)', () => {
    const on = render(<TitleBlockPage initial={SETTINGS} />);
    expect(on).toContain('data-testid="title-block-preview-company-block"');
    const offHtml = render(<TitleBlockPage initial={{ ...SETTINGS, config: { showCompany: false } }} />);
    expect(openTag(offHtml, 'title-block-show-company')).toContain('aria-checked="false"');
    expect(offHtml).not.toContain('data-testid="title-block-preview-company-block"');
    // The fixed parts stay.
    expect(offHtml).toContain('data-testid="title-block-preview-seal"');
    expect(text(offHtml)).toContain('Version 1');
    expect(text(offHtml)).toContain('Rev 1');
  });

  it('AC-EZD-709-2: a missing license is listed', () => {
    const html = render(<TitleBlockPage initial={{ ...SETTINGS, company: { ...SETTINGS.company, licenseNo: null } }} />);
    expect(html).toContain('data-testid="title-block-missing"');
    expect(html).not.toContain('data-testid="title-block-complete"');
    expect(text(html)).toContain('Company fields missing: License number.');
    expect([...html.matchAll(/data-missing-field="([a-z_]+)"/g)].map((m) => m[1])).toEqual(['license_number']);
  });

  it('Save sends only what changed', () => {
    expect(changesOf({ showCompany: true }, { showCompany: true })).toBeNull();
    expect(changesOf({ showCompany: true }, { showCompany: false })).toEqual({ showCompany: false });
  });

  it('loading shows skeletons; a failed load shows the error with Retry', () => {
    expect(render(<Loading />)).toContain('data-testid="title-block-loading"');
    const err = render(<TitleBlockLoadError />);
    expect(err).toContain('data-testid="title-block-load-error"');
    expect(text(err)).toContain("Couldn't load title block settings.");
  });
});
