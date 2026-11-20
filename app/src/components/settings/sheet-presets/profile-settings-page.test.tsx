// EZD-713 (S15c; board S15cSubmittal profile panel). Rendered as sheet-presets-page.test.tsx does. Expected values:
// the board's panel (File split "Combined set (one PDF)" / "Per discipline or consultant" / "One PDF per sheet";
// "Max file size (MB)" "Split further if over; empty = no limit"; naming Max with As typed / ALL CAPS and the count
// "33 / 80"; Revision naming "Version in file name" / "Same name as original"; "Flatten on export", "Export
// unsigned", "Bookmark per sheet", "Table of contents sheet"; "Min. plan scale (checklist warns)" 3/16" 1/4" 1/8";
// "Review + resubmittal", Resubmittal mode "Changed sheets only" / "Full discipline set + narrative (errata) PDF",
// "Transmittal letter"; row chips "10 MB", "Max 80 chars", "Same name on resubmit", "Flatten", "TOC sheet"),
// S15c Validation (no {rev} warning once the profile is set to same name).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  usePathname: () => '/settings/sheet-presets',
  useRouter: () => ({ push() {}, replace() {}, refresh: vi.fn() }),
}));

import { MessagesProvider } from '../../../lib/messages';
import { profileOf } from '../../../lib/submittal-profiles/profiles';
import { catalogFor } from '../../../server/messages/catalog';
import { StateHost } from '../../states/StateHost';
import { UnsavedChangesProvider } from '../unsaved-changes';
import { SheetPresetsPage } from './SheetPresetsPage';

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
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');
const options = (html: string, testId: string) => {
  const start = html.indexOf(`data-testid="${testId}"`);
  const select = html.slice(start, html.indexOf('</select>', start));
  return [...select.matchAll(/<option value="([a-z_]+)"[^>]*>([^<]*)<\/option>/g)].map((m) => [
    m[1],
    m[2],
  ]);
};

// The minimum scale chips as [data-value, aria-checked].
const scalesOf = (html: string) =>
  [...html.matchAll(/<button\b[^>]*data-testid="sheet-presets-min-scale"[^>]*>/g)].map((m) => [
    /data-value="([^"]+)"/.exec(m[0])?.[1],
    /aria-checked="(\w+)"/.exec(m[0])?.[1],
  ]);

const PBC = profileOf(
  {
    id: '00000000-0000-4000-8000-000000000001',
    department: 'Palm Beach County',
    is_default: true,
    archived_at: null,
    naming_template: '{address} {description}',
    max_file_mb: 10,
    naming_max_length: 80,
  },
  6,
);
const FTL = profileOf({
  id: '00000000-0000-4000-8000-000000000002',
  department: 'City of Fort Lauderdale',
  is_default: false,
  archived_at: null,
  naming_template: '{address} {description}',
  file_split: 'per_sheet',
  revision_naming: 'same_name',
  flatten: true,
  toc_sheet: true,
  bookmarks: false,
  export_unsigned: true,
  resubmittal_mode: 'full_set_narrative',
  transmittal: true,
  min_scale_in_per_ft: 0.1875,
  stamp_box_width_in: 6,
  stamp_box_height_in: 2,
  stamp_box_position: 'top_left',
});

describe('EZD-713 profile settings in the inspector', () => {
  it('the default profile shows every setting with its S15c default', () => {
    const html = render(<SheetPresetsPage initial={[PBC]} />);
    const plain = text(html);
    expect(options(html, 'sheet-presets-file-split')).toEqual([
      ['combined', 'Combined set (one PDF)'],
      ['per_discipline', 'Per discipline or consultant'],
      ['per_sheet', 'One PDF per sheet'],
    ]);
    expect(html).toMatch(/<option value="combined" selected="">/);
    expect(plain).toContain('Max file size (MB)');
    expect(plain).toContain('Split further if over; empty = no limit');
    expect(openTag(html, 'sheet-presets-max-file')).toContain('value="10"');
    expect(openTag(html, 'sheet-presets-naming-max')).toContain('value="80"');
    expect(openTag(html, 'sheet-presets-case-typed')).toContain('aria-checked="true"');
    expect(openTag(html, 'sheet-presets-case-upper')).toContain('aria-checked="false"');
    expect(plain).toContain('As typed');
    expect(plain).toContain('ALL CAPS');
    expect(plain).toContain('336 Golfview Rd buildingplans.pdf 33 / 80');
    expect(plain).toContain('Revision naming');
    expect(openTag(html, 'sheet-presets-revision-version_in_name')).toContain(
      'aria-checked="true"',
    );
    expect(plain).toContain('Same name as original');
    expect(openTag(html, 'sheet-presets-flatten')).toContain('aria-checked="false"');
    expect(openTag(html, 'sheet-presets-export-unsigned')).toContain('aria-checked="false"');
    expect(openTag(html, 'sheet-presets-bookmarks')).toContain('aria-checked="true"');
    expect(openTag(html, 'sheet-presets-toc-sheet')).toContain('aria-checked="false"');
    for (const s of [
      'Flatten on export',
      'Single layer, no annotations; runs before signing.',
      'Export unsigned',
      'Seal box left empty to sign last. On when a signer is set.',
      'Bookmark per sheet',
      'In combined files.',
      'Table of contents sheet',
      'Required by Fort Lauderdale.',
      'Min. plan scale (checklist warns)',
      `3/16" = 1'-0"`,
      `1/4" = 1'-0"`,
      `1/8" = 1'-0"`,
      'Review + resubmittal',
      'Resubmittal mode',
      'Transmittal letter',
      'Included with each resubmittal',
    ])
      expect(plain).toContain(s);
    expect(scalesOf(html)).toEqual([
      ['none', 'true'],
      ['0.1875', 'false'],
      ['0.25', 'false'],
      ['0.125', 'false'],
    ]);
    expect(options(html, 'sheet-presets-resubmittal-mode')).toEqual([
      ['changed_sheets', 'Changed sheets only'],
      ['full_set_narrative', 'Full discipline set + narrative (errata) PDF'],
    ]);
    expect(openTag(html, 'sheet-presets-transmittal')).toContain('aria-checked="false"');
  });

  it('a department profile shows its stored settings; same name drops the {rev} warning', () => {
    const html = render(<SheetPresetsPage initial={[FTL]} />);
    expect(html).toMatch(/<option value="per_sheet" selected="">/);
    expect(openTag(html, 'sheet-presets-max-file')).toContain('value=""');
    expect(openTag(html, 'sheet-presets-revision-same_name')).toContain('aria-checked="true"');
    expect(openTag(html, 'sheet-presets-flatten')).toContain('aria-checked="true"');
    expect(openTag(html, 'sheet-presets-export-unsigned')).toContain('aria-checked="true"');
    expect(openTag(html, 'sheet-presets-bookmarks')).toContain('aria-checked="false"');
    expect(openTag(html, 'sheet-presets-toc-sheet')).toContain('aria-checked="true"');
    expect(openTag(html, 'sheet-presets-transmittal')).toContain('aria-checked="true"');
    expect(html).toMatch(/<option value="full_set_narrative" selected="">/);
    expect(scalesOf(html).find(([, on]) => on === 'true')?.[0]).toBe('0.1875');
    expect(html).not.toContain('sheet-presets-naming-warning');
    expect(html).not.toContain('sheet-presets-naming-count');
  });

  it('the list rows carry the settings that set a profile apart', () => {
    const html = render(<SheetPresetsPage initial={[PBC, FTL]} />);
    const chipsOf = (id: string) => {
      const start = html.indexOf(`data-profile-id="${id}"`);
      const row = html.slice(start, html.indexOf('</li>', start));
      return [...row.matchAll(/<span class="[^"]*chip[^"]*">([^<]*)<\/span>/g)].map((m) =>
        m[1]!.replace(/&quot;/g, '"'),
      );
    };
    expect(chipsOf(PBC.id)).toEqual([
      'Electronic',
      '24x36',
      'Combined',
      '10 MB',
      '{address} {description}',
      'Max 80 chars',
      '3"x3" BR',
    ]);
    expect(chipsOf(FTL.id)).toEqual([
      'Electronic',
      '24x36',
      'One PDF per sheet',
      '{address} {description}',
      'Same name on resubmit',
      'Flatten',
      'TOC sheet',
      '6"x2" TL',
    ]);
  });
});
