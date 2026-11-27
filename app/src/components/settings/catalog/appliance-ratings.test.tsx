// EZD-614 (S15e; board S15eCatalog). Renders the Catalog settings page inside MessagesProvider > StateHost >
// UnsavedChangesProvider as code-edition-form.test.tsx does. Expected values: board S15eCatalog ("Appliance rating
// defaults", "Owner enters", "Used by the load calc when a catalog item has no specs.", TYPE / VOLTS / AMPS,
// "Range, electric" 240, "Dishwasher" 120, "+ Add appliance type", footer Discard and Save), S15e Controls (Save
// "Disabled with no edits"), S15e States (loading, error with Retry), and the migration header (volts 120 or 240,
// amps above 0 in hundredths).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/catalog',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import {
  ApplianceRatingsLoadError,
  ApplianceRatingsPage,
  draftsOf,
  ratingsOf,
} from './ApplianceRatingsPage';
import Loading from '../../../app/(office)/settings/catalog/loading';

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
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const ROWS = [
  { applianceType: 'range', name: 'Range, electric', volts: 240, amps: 40 },
  { applianceType: 'dishwasher', name: 'Dishwasher', volts: 120, amps: 12 },
];

describe('EZD-614 Catalog settings: Appliance rating defaults card', () => {
  it('shows the board card with each row; Save and Discard are off with no edits', () => {
    const html = render(<ApplianceRatingsPage initial={ROWS} />);
    const plain = text(html);
    expect(html).toContain('data-settings-page="catalog"');
    expect(plain).toContain('Catalog');
    expect(plain).toContain('Appliance rating defaults');
    expect(plain).toContain('Owner enters');
    expect(plain).toContain('Used by the load calc when a catalog item has no specs.');
    expect(plain).toMatch(/Type\s+Volts\s+Amps/);
    const rows = [
      ...html.matchAll(/data-testid="appliance-rating-row" data-type="([a-z_]+)"/g),
    ].map((m) => m[1]);
    expect(rows).toEqual(['range', 'dishwasher']);
    const names = [
      ...html.matchAll(/data-testid="appliance-rating-name"[^>]*value="([^"]*)"/g),
    ].map((m) => m[1]);
    expect(names).toEqual(['Range, electric', 'Dishwasher']);
    const amps = [...html.matchAll(/data-testid="appliance-rating-amps"[^>]*value="([^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(amps).toEqual(['40', '12']);
    const volts = [...html.matchAll(/<option value="(\d+)" selected="">/g)].map((m) => m[1]);
    expect(volts).toEqual(['240', '120']);
    expect(isDisabled(openTag(html, 'appliance-ratings-save'))).toBe(true);
    expect(isDisabled(openTag(html, 'appliance-ratings-discard'))).toBe(true);
    expect(html).not.toContain('data-testid="appliance-ratings-unsaved"');
  });

  it('Add appliance type offers the types not in the list, in order', () => {
    const html = render(<ApplianceRatingsPage initial={ROWS} />);
    const add = /<select[^>]*data-testid="appliance-ratings-add"[^>]*>([\s\S]*?)<\/select>/.exec(
      html,
    )![1]!;
    const options = [...add.matchAll(/<option value="([a-z_]*)"[^>]*>([^<]*)<\/option>/g)].map(
      (m) => [m[1], m[2]],
    );
    expect(options).toEqual([
      ['', '+ Add appliance type'],
      ['cooktop', 'Cooktop'],
      ['wall_oven', 'Wall oven'],
      ['microwave', 'Microwave hood'],
      ['hood', 'Range hood'],
      ['disposal', 'Disposal'],
      ['refrigerator', 'Refrigerator'],
      ['washer', 'Clothes washer'],
      ['dryer', 'Dryer, electric'],
      ['water_heater', 'Water heater'],
      ['ac', 'A/C or heat pump'],
    ]);
  });

  it('a company with no rows sees the empty line and the Add choice (Owner enters)', () => {
    const html = render(<ApplianceRatingsPage initial={[]} />);
    expect(text(html)).toContain(
      'No defaults yet. Add an appliance type and enter its volts and amps.',
    );
    expect(html).toContain('data-testid="appliance-ratings-add"');
    expect(html).not.toContain('data-testid="appliance-rating-row"');
  });

  it('rows save only when every name is filled and amps are above 0 with up to 2 decimals', () => {
    const drafts = draftsOf(ROWS);
    expect(ratingsOf(drafts)).toEqual(ROWS);
    expect(ratingsOf([{ ...drafts[0]!, amps: '48.75' }])).toEqual([{ ...ROWS[0]!, amps: 48.75 }]);
    for (const amps of ['', '0', '-1', '10.125', 'ten', '1001']) {
      expect(ratingsOf([{ ...drafts[0]!, amps }]), amps).toBeNull();
    }
    expect(ratingsOf([{ ...drafts[0]!, name: '  ' }])).toBeNull();
    expect(ratingsOf([{ ...drafts[0]!, name: ' Range ' }])).toEqual([
      { ...ROWS[0]!, name: 'Range' },
    ]);
  });

  it('loading shows the skeleton; a failed load shows the error with Retry', () => {
    expect(render(<Loading />)).toContain('data-testid="appliance-ratings-loading"');
    const html = render(<ApplianceRatingsLoadError />);
    expect(html).toContain('data-testid="appliance-ratings-load-error"');
    expect(text(html)).toContain("Couldn't load catalog settings.");
  });
});
