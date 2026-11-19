// EZD-712 (S15c; board S15cSubmittal). Renders the Sheet presets page inside MessagesProvider > StateHost >
// UnsavedChangesProvider as code-edition-form.test.tsx does. Expected values: board S15cSubmittal and S15c
// Controls (title "Sheet presets", the subtitle, New profile, "New profiles copy the default", one profile marked
// Default and listed first, "Not used", the inspector fields Department name, Submittal type Electronic / Paper,
// Permit sheet size "24x36 (ARCH D)", Electrical signature None / Electrical contractor / Architect, the naming
// tokens {address} {description} {rev} {date}, the output line "Vector PDF, not password-locked; markup and
// stamping allowed", Save disabled with no edits), S15c Validation (warn when {rev} is missing), S15c States
// (empty, loading, error).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/sheet-presets',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import { profileOf, type SubmittalProfile } from '../../../lib/submittal-profiles/profiles';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import { SheetPresetsLoadError, SheetPresetsPage } from './SheetPresetsPage';
import Loading from '../../../app/(office)/settings/sheet-presets/loading';

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

const row = (department: string, extra: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-${String(department.length).padStart(12, '0')}`,
  department,
  is_default: false,
  archived_at: null,
  submittal_type: 'electronic',
  naming_template: '{address} {description}',
  stamp_box_width_in: 3,
  stamp_box_height_in: 3,
  stamp_box_position: 'bottom_right',
  signer: 'none',
  revision_naming: 'version_in_name',
  ...extra,
});
const PBC: SubmittalProfile = profileOf(row('Palm Beach County', { is_default: true }), 6);
const BROWARD: SubmittalProfile = profileOf(row('Broward County'), 0);

describe('EZD-712 Sheet presets page markup', () => {
  it('lists the profiles with the default first and marked; the inspector shows the default', () => {
    const html = render(<SheetPresetsPage initial={[BROWARD, PBC]} />);
    const plain = text(html);
    expect(html).toContain('data-settings-page="sheet_presets"');
    expect(plain).toContain('Sheet presets');
    expect(plain).toContain(
      'One submittal profile per building department. A new department rule is a setting here, not code.',
    );
    expect(plain).toContain('New profile');
    expect(plain).toContain('New profiles copy the default');
    const names = [...html.matchAll(/data-testid="sheet-presets-row-name">([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(names).toEqual(['Palm Beach County', 'Broward County']);
    expect([...html.matchAll(/data-testid="sheet-presets-default-badge"/g)]).toHaveLength(1);
    expect(plain).toContain('6 projects');
    expect(plain).toContain('Not used');

    expect(openTag(html, 'sheet-presets-inspector-name')).not.toBeNull();
    expect(plain).toContain('Used by 6 projects · company default for new projects');
    expect(openTag(html, 'sheet-presets-department')).toContain('value="Palm Beach County"');
    expect(plain).toContain('Electronic');
    expect(plain).toContain('Paper');
    expect(openTag(html, 'sheet-presets-type-electronic')).toContain('aria-checked="true"');
    expect(plain).toContain('24x36 (ARCH D)');
    const signers = [...html.matchAll(/<option value="([a-z_]+)"[^>]*>([^<]*)<\/option>/g)]
      .map((m) => m[1])
      .filter((v) => ['none', 'electrical_contractor', 'architect', 'engineer'].includes(v));
    expect(signers).toEqual(['none', 'electrical_contractor', 'architect']);
    const tokens = [...html.matchAll(/data-testid="sheet-presets-token"[^>]*>([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(tokens).toEqual(['{address}', '{description}', '{rev}', '{date}']);
    expect(plain).toContain('336 Golfview Rd buildingplans.pdf');
    expect(plain).toContain('Vector PDF, not password-locked; markup and stamping allowed');
    expect(openTag(html, 'sheet-presets-stamp-width')).toContain('value="3"');
    expect(isDisabled(openTag(html, 'sheet-presets-save'))).toBe(true);
  });

  it('warns when the pattern has no {rev} while the version stays in the name', () => {
    const html = render(<SheetPresetsPage initial={[PBC]} />);
    expect(text(html)).toContain(
      'This name has no {rev}, so each version gets the same file name.',
    );
    const withRev = profileOf(
      row('Palm Beach County', { is_default: true, naming_template: '{address} {rev}' }),
    );
    expect(render(<SheetPresetsPage initial={[withRev]} />)).not.toContain(
      'sheet-presets-naming-warning',
    );
  });

  it('empty, loading and error states', () => {
    const empty = render(<SheetPresetsPage initial={[]} />);
    expect(empty).toContain('data-testid="sheet-presets-empty"');
    expect(empty).toContain('data-testid="sheet-presets-inspector-empty"');
    expect(render(<Loading />)).toContain('data-testid="sheet-presets-loading"');
    const err = render(<SheetPresetsLoadError />);
    expect(text(err)).toContain("Couldn't load sheet presets.");
  });
});
