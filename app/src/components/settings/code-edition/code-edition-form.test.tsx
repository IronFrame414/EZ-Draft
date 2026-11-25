// EZD-613 (S15g; board S15gCode). Renders the Code edition page inside MessagesProvider > StateHost >
// UnsavedChangesProvider as defaults-form.test.tsx does. Expected values: board S15gCode and S15g Controls (Default
// for new projects with the one v1 edition, FBC 9th ed. with NEC 2023 (Q-0220); Available rule sets; the
// Optional load-calc method switch; Save with no edits is off; the note "Changing the default does not change
// existing projects."), S15g States (loading, error with Retry).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/code-edition',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import { CodeEditionLoadError, CodeEditionPage, changesOf, statusDefaultLabel } from './CodeEditionForm';
import Loading from '../../../app/(office)/settings/code-edition/loading';

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
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const SETTINGS = {
  edition: 'fbc9_nec2023' as const,
  optionalLoadCalc: false,
  available: ['fbc9_nec2023' as const],
};

describe('EZD-613 Code edition page markup', () => {
  it('shows the board cards, the one v1 edition and the note; Save is off with no edits', () => {
    const html = render(<CodeEditionPage initial={SETTINGS} />);
    const plain = text(html);
    expect(html).toContain('data-settings-page="code_edition"');
    expect(plain).toContain('Code edition');
    expect(plain).toContain('Changing the default does not change existing projects.');
    expect(plain).toContain('Default for new projects');
    expect(plain).toContain('Available rule sets');
    expect(plain).toContain('Electrical defaults');
    expect(plain).toContain('Optional load-calc method');
    const options = [...html.matchAll(/<option value="([a-z0-9_]+)"[^>]*>([^<]*)<\/option>/g)].map(
      (m) => [m[1], m[2]],
    );
    // EZD-643 adds By permit date (automatic) ahead of the editions (board S15gCode).
    expect(options).toEqual([
      ['by_permit_date', 'By permit date (automatic)'],
      ['fbc9_nec2023', 'FBC 9th ed. · NEC 2023'],
    ]);
    const sets = [...html.matchAll(/data-edition="([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(sets).toEqual(['fbc9_nec2023']);
    expect(isDisabled(openTag(html, 'code-edition-save'))).toBe(true);
    expect(openTag(html, 'code-edition-optional-load-calc')).toContain('aria-checked="false"');
  });

  it('the switch shows the stored default', () => {
    const html = render(<CodeEditionPage initial={{ ...SETTINGS, optionalLoadCalc: true }} />);
    expect(openTag(html, 'code-edition-optional-load-calc')).toContain('aria-checked="true"');
  });

  it('Save sends only what changed', () => {
    expect(changesOf(SETTINGS, { edition: 'fbc9_nec2023', optionalLoadCalc: false })).toBeNull();
    expect(changesOf(SETTINGS, { edition: 'fbc9_nec2023', optionalLoadCalc: true })).toEqual({
      optionalLoadCalc: true,
    });
  });

  it('EZD-643 (Q-0765; board S15gCode): By permit date shows its two lines; both rule sets are listed', () => {
    const both = {
      edition: 'by_permit_date' as const,
      optionalLoadCalc: false,
      available: ['fbc9_nec2023' as const, 'fbc8_nec2020' as const],
    };
    const html = render(<CodeEditionPage initial={both} />);
    const options = [
      ...html.matchAll(/<option value="([a-z0-9_]+)"([^>]*)>([^<]*)<\/option>/g),
    ].map((m) => [m[1], m[3], m[2].includes('selected')]);
    expect(options).toEqual([
      ['by_permit_date', 'By permit date (automatic)', true],
      ['fbc9_nec2023', 'FBC 9th ed. · NEC 2023', false],
      ['fbc8_nec2020', 'FBC 8th ed. · NEC 2020', false],
    ]);
    const lines = /data-testid="code-edition-by-date"[^>]*>(.*?)<\/dl>/.exec(html)?.[1] ?? '';
    expect(text(lines).trim()).toBe(
      'From 12/31/26 FBC 9th ed. · NEC 2023 Before FBC 8th ed. · NEC 2020',
    );
    const sets = [...html.matchAll(/data-edition="([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(sets).toEqual(['fbc9_nec2023', 'fbc8_nec2020']);
    // A fixed edition hides the two lines.
    expect(
      render(<CodeEditionPage initial={{ ...both, edition: 'fbc8_nec2020' }} />),
    ).not.toContain('code-edition-by-date');
    expect(changesOf(both, { edition: 'fbc9_nec2023', optionalLoadCalc: false })).toEqual({
      edition: 'fbc9_nec2023',
    });
  });

  it('EZD-643 (board S15gCode footer): the status bar Default reads "By permit date", an edition its label', () => {
    const en = catalogFor('office', 'en');
    expect(en[statusDefaultLabel('by_permit_date')]).toBe('By permit date');
    expect(en[statusDefaultLabel('fbc9_nec2023')]).toBe('FBC 9th ed. · NEC 2023');
    expect(en[statusDefaultLabel('fbc8_nec2020')]).toBe('FBC 8th ed. · NEC 2020');
  });

  it('loading shows skeletons; a failed load shows the error with Retry', () => {
    expect(render(<Loading />)).toContain('data-testid="code-edition-loading"');
    const err = render(<CodeEditionLoadError />);
    expect(err).toContain('data-testid="code-edition-load-error"');
    expect(text(err)).toContain("Couldn't load code edition settings.");
  });
});
