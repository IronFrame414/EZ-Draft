// EZD-1991 (Q-0813; AC-EZD-1991-1, -2, -3). Renders the Title block page as title-block-form.test.tsx does.
// Expected values: board S15bTitleBlock head ("Used on 10 sheets in Kitchen remodel · Open Sheets": the project name
// is the board's sample, AC-EZD-1991-1 counts every project) and preview head ("Zoom to title block"); "Used on
// 1 sheet" is the singular listed in vault/build/assumptions.md EZD-1991; the link is the project's Sheets screen
// (`/projects/<id>?view=sheets`). The zoom scales the sheet by 1 / 0.22 at 24x36 and shifts it left by
// 0.78 / 0.22 of its width (title-block-usage.test.ts).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/title-block',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import { titleBlockPreview, type TitleBlockSettings } from '../../../lib/title-block/title-block';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import { TitleBlockPage, TitleBlockPreviewView } from './TitleBlockForm';

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
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const between = (html: string, testId: string) => {
  const m = new RegExp(`data-testid="${testId}"[^>]*>([\\s\\S]*?)</span>`).exec(html);
  return m === null ? null : text(m[1]);
};

const SETTINGS: TitleBlockSettings = {
  config: { showCompany: true },
  company: { name: 'Acme Remodeling', licenseNo: 'CGC000001', contact: {}, logoUrl: null },
  codeEdition: 'fbc9_nec2023',
};
const P = '22222222-2222-4222-8222-222222222222';

describe('EZD-1991 "Used on N sheets · Open Sheets"', () => {
  it('several sheets: the count and the Open Sheets link to the project Sheets screen, in the page head', () => {
    const html = render(<TitleBlockPage initial={SETTINGS} usage={{ sheets: 19, projectId: P }} />);
    expect(between(html, 'title-block-usage-count')).toBe('Used on 19 sheets');
    const link = openTag(html, 'title-block-open-sheets');
    expect(link).toContain(`href="/projects/${P}?view=sheets"`);
    expect(html).toMatch(/data-testid="title-block-open-sheets"[^>]*>Open Sheets</);
    // In the head, after the title and subtitle.
    const head = html.indexOf('data-testid="title-block-usage"');
    expect(head).toBeGreaterThan(html.indexOf('One company title block on every sheet.'));
    expect(head).toBeLessThan(html.indexOf('data-testid="title-block-form"'));
  });

  it('one sheet: "Used on 1 sheet"', () => {
    const html = render(<TitleBlockPage initial={SETTINGS} usage={{ sheets: 1, projectId: P }} />);
    expect(between(html, 'title-block-usage-count')).toBe('Used on 1 sheet');
  });

  it('no sheets: "Used on 0 sheets" and no link (no project to open)', () => {
    const html = render(<TitleBlockPage initial={SETTINGS} usage={{ sheets: 0, projectId: null }} />);
    expect(between(html, 'title-block-usage-count')).toBe('Used on 0 sheets');
    expect(openTag(html, 'title-block-open-sheets')).toBeNull();
  });

  it('a count that could not be read leaves the line out and the rest of the page as it was', () => {
    const without = render(<TitleBlockPage initial={SETTINGS} />);
    expect(openTag(without, 'title-block-usage')).toBeNull();
    expect(openTag(without, 'title-block-form')).not.toBeNull();
  });
});

describe('EZD-1991 "Zoom to title block"', () => {
  it('the button sits in the preview head, not pressed, with the board wording', () => {
    const html = render(<TitleBlockPage initial={SETTINGS} />);
    const tag = openTag(html, 'title-block-zoom');
    expect(tag).toContain('aria-pressed="false"');
    expect(html).toMatch(/data-testid="title-block-zoom"[^>]*>[\s\S]*?Zoom to title block<\/button>/);
    expect(openTag(html, 'title-block-preview')).toContain('data-zoom="sheet"');
    expect(openTag(html, 'title-block-viewport')).toContain('data-zoom="sheet"');
  });

  it('zoomed, the sheet is scaled and shifted so the title block column fills the view', () => {
    const preview = titleBlockPreview(SETTINGS, SETTINGS.config, '24x36');
    const html = render(<TitleBlockPreviewView preview={preview} companyName="Acme Remodeling" zoomed />);
    const tag = openTag(html, 'title-block-preview') ?? '';
    expect(tag).toContain('data-zoom="title_block"');
    const m = /translateX\((-?[\d.]+)%\) scale\(([\d.]+)\)/.exec(tag);
    expect(m).not.toBeNull();
    expect(Number(m?.[2])).toBeCloseTo(1 / 0.22, 6);
    expect(Number(m?.[1])).toBeCloseTo((-0.78 / 0.22) * 100, 4);
    expect(openTag(html, 'title-block-preview-column')).toContain('width:22%');
  });

  it('not zoomed, the sheet is drawn whole with no transform', () => {
    const preview = titleBlockPreview(SETTINGS, SETTINGS.config, '11x17');
    const html = render(<TitleBlockPreviewView preview={preview} companyName="Acme Remodeling" />);
    const tag = openTag(html, 'title-block-preview') ?? '';
    expect(tag).toContain('data-zoom="sheet"');
    expect(tag).not.toContain('transform');
    expect(openTag(html, 'title-block-preview-column')).toContain('width:30%');
  });
});
