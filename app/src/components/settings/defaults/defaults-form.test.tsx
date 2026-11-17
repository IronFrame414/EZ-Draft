// EZD-116 (AC-EZD-116-1, -2, -5). Renders the Defaults page inside MessagesProvider > StateHost >
// UnsavedChangesProvider as company-form.test.tsx does. Expected values: board S15dDefaults (three columns of
// groups, no Keyboard shortcuts card, Save and Discard disabled with no edits, the lengths hint), S15d States
// (a row with no stored value and no registry default reads "Not set"), Q-0697 03 (Save sends only the edited
// keys; a refused row keeps them from saving).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/defaults',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import { DefaultsLoadError, DefaultsPage, checkForm, formOf } from './DefaultsForm';
import Loading from '../../../app/(office)/settings/defaults/loading';
import { SetInDefaults, neededDefault } from './SetInDefaults';

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
const attr = (tag: string | null, name: string) =>
  new RegExp(`\\s${name}="([^"]*)"`).exec(tag ?? '')?.[1] ?? null;

describe('EZD-116 Defaults page markup', () => {
  it('AC-2: groups in board order, no Keyboard shortcuts; AC-5: Save and Discard off with no edits', () => {
    const html = render(<DefaultsPage initial={{}} />);
    const groups = [...html.matchAll(/data-testid="defaults-group" data-group="([a-z_]+)"/g)].map(
      (m) => m[1],
    );
    expect(groups).toEqual([
      'units',
      'increments',
      'walls',
      'tolerances',
      'three_d',
      'countertops',
      'ceilings',
      'electrical',
      'baths',
      'details',
      'waste',
      'catalog',
      'history',
      'client',
      'integrations',
    ]);
    expect(html).not.toContain('Keyboard shortcuts');
    expect(html).toContain('Search defaults');
    expect(isDisabled(openTag(html, 'defaults-save'))).toBe(true);
    expect(isDisabled(openTag(html, 'defaults-discard'))).toBe(true);
    expect(openTag(html, 'defaults-unsaved')).toBeNull();
  });

  it('AC-1: an empty row with no default reads Not set; a row with a default shows it; a stored value wins', () => {
    const html = render(<DefaultsPage initial={{ waste_tile: 10, cabinet_autofill_increment: 4 }} />);
    const seat = openTag(html, 'defaults-input-seating_support_limit');
    expect(attr(seat, 'value')).toBe('');
    expect(attr(seat, 'placeholder')).toBe('Not set');
    expect(attr(openTag(html, 'defaults-input-countertop_increment'), 'value')).toBe('1/2&quot;');
    expect(attr(openTag(html, 'defaults-input-cabinet_autofill_increment'), 'value')).toBe('4&quot;');
    expect(attr(openTag(html, 'defaults-input-waste_tile'), 'value')).toBe('10');
    expect(html).toContain('data-testid="defaults-not-set-light_targets"');
  });

  it('AC-5: only the edited keys go to Save; a refused row has an error and nothing to send', () => {
    const saved = { waste_tile: 10 };
    const savedForm = formOf(saved);
    const ok = checkForm(saved, savedForm, {
      ...savedForm,
      measurement_tolerance: `12.5'`,
      waste_tile: '',
    });
    expect(ok.errors).toEqual({});
    expect(ok.changes).toEqual({ measurement_tolerance: 150, waste_tile: null });

    const bad = checkForm(saved, savedForm, {
      ...savedForm,
      measurement_tolerance: '12 6',
      seating_support_limit: '1 1/2"',
    });
    expect(bad.errors).toEqual({ measurement_tolerance: 'office.length.refused' });

    const rule = checkForm(saved, savedForm, { ...savedForm, seating_support_limit: '1 1/2"' });
    expect(rule.errors).toEqual({ seating_support_limit: 'office.defaults.error.seating_limit' });
  });

  it('AC-1: Set in Defaults links holders of the switch to /settings/defaults; others are told to ask', () => {
    expect(neededDefault('seating_support_limit', {})).toBeNull();
    const yes = render(<SetInDefaults canManage />);
    expect(attr(openTag(yes, 'set-in-defaults'), 'href')).toBe('/settings/defaults');
    expect(yes).toContain('Set in Defaults');
    const no = render(<SetInDefaults canManage={false} />);
    expect(openTag(no, 'set-in-defaults')).toBeNull();
    expect(no).toContain('Not set in Defaults. Ask your supervisor.');
  });

  it('AC-9: loading shows skeleton rows; a failed load shows the message with Retry', () => {
    expect(render(<Loading />)).toContain('data-testid="defaults-loading"');
    const html = render(<DefaultsLoadError />);
    expect(html).toContain('data-testid="defaults-load-error"');
    expect(html).toContain("Couldn&#x27;t load defaults.");
    expect(html).toContain('Retry');
  });
});
