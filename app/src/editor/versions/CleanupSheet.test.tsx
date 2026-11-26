// EZD-123 K1-K6 (AC-EZD-123-5, -6, -9, -10). Expected values from the board and the spec, never the code: board S20
// cleanup sheet ("Clean up working versions"; "7 unsent working versions reached 30 days. Tick the ones to keep; kept
// versions become named snapshots. Sent versions and snapshots are never deleted."; "Select All / None"; "3 keep · 4
// delete"; row "Sep 11 · 5:02 PM", "Josh Bishop · Stop editing", "30 days old · unsent", "Snapshot name", "Deletes";
// footer "If you do nothing, unticked versions delete on Oct 18, 2026, 7 days after this sheet first appeared." and
// "A deleted working version cannot be restored. Needs Edit model and the edit lock."; "Later"; "Keep 3, delete 4
// unticked"); Q-0700 05 (someone without the lock sees Later only; "First version"); Q-0664 (a null preview shows a
// placeholder). Rendered in the real office catalog, English, in UTC.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { attr, elements, textOf } from '../../../test-harness/projects-markup';
import type { Choice, CleanupRow } from './cleanup-summary';
import { CleanupSheetContent } from './CleanupSheet';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-11T17:02:00Z');

let n = 0;
const row = (o: Partial<CleanupRow>): CleanupRow => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  createdAt: new Date(NOW - 30 * DAY).toISOString(),
  author: 'Josh Bishop',
  cause: 'stop_editing',
  label: null,
  summary: { added: 1, changed: 2, removed: 0 },
  shownAt: '2026-10-11T08:00:00Z',
  previewUrl: null,
  ...o,
});

const render = (
  rows: CleanupRow[],
  o: { keep?: string[]; canSave?: boolean; error?: string | null; graceDays?: number } = {},
) => {
  const choices = new Map<string, Choice>(
    (o.keep ?? []).map((id) => [id, { keep: true, name: 'Island 3-box layout' }]),
  );
  return renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en') as never}>
      <CleanupSheetContent
        rows={rows}
        graceDays={o.graceDays ?? 7}
        ageDays={30}
        canSave={o.canSave ?? true}
        saving={false}
        error={o.error ?? null}
        onSave={() => {}}
        onLater={() => {}}
        choices={choices}
        onChoices={() => {}}
        timeZone="UTC"
        now={NOW}
      />
    </MessagesProvider>,
  );
};

const seven = () => Array.from({ length: 7 }, () => row({}));

describe('EZD-123 cleanup sheet', () => {
  it('K1 @smoke the board header, note, Select All / None and counts (AC-EZD-123-5)', () => {
    const rows = seven();
    const html = render(rows, { keep: [rows[0].id, rows[2].id, rows[5].id] });
    expect(html).toContain('Clean up working versions');
    expect(textOf(elements(html, 'cleanup-note')[0].inner)).toBe(
      '7 unsent working versions reached 30 days. Tick the ones to keep; kept versions become named snapshots. Sent versions and snapshots are never deleted.',
    );
    expect(textOf(elements(html, 'cleanup-all')[0].inner)).toBe('All');
    expect(textOf(elements(html, 'cleanup-none')[0].inner)).toBe('None');
    expect(textOf(elements(html, 'cleanup-counts')[0].inner)).toBe('3 keep · 4 delete');
    expect(textOf(elements(html, 'cleanup-save')[0].inner)).toBe('Keep 3, delete 4 unticked');
    expect(textOf(elements(html, 'cleanup-later')[0].inner)).toBe('Later');
  });

  it('K2 each row: date and time, author and cause, change summary, age; ticked shows Snapshot name, unticked Deletes (AC-EZD-123-5, AC-EZD-123-9)', () => {
    const kept = row({ createdAt: '2026-09-11T17:02:00Z' });
    const first = row({ summary: null, author: null, cause: 'lock_release' });
    const html = render([kept, first], { keep: [kept.id] });
    const rows = elements(html, 'cleanup-row');
    expect(rows).toHaveLength(2);
    expect(textOf(elements(rows[0].inner, 'cleanup-when')[0].inner)).toBe('Sep 11 · 5:02 PM');
    expect(textOf(elements(rows[0].inner, 'cleanup-who')[0].inner)).toBe(
      'Josh Bishop · Stop editing',
    );
    expect(textOf(elements(rows[0].inner, 'cleanup-summary')[0].inner)).toBe(
      '1 added · 2 changed · 0 removed',
    );
    expect(rows[0].inner).toContain('30 days old · unsent');
    expect(rows[0].inner).toContain('Snapshot name');
    expect(attr(elements(rows[0].inner, 'cleanup-name')[0].attrs, 'value')).toBe(
      'Island 3-box layout',
    );
    expect(elements(rows[0].inner, 'cleanup-deletes')).toHaveLength(0);
    expect(textOf(elements(rows[1].inner, 'cleanup-summary')[0].inner)).toBe('First version');
    expect(textOf(elements(rows[1].inner, 'cleanup-who')[0].inner)).toBe('Lock released');
    expect(textOf(elements(rows[1].inner, 'cleanup-deletes')[0].inner)).toBe('Deletes');
    expect(elements(rows[1].inner, 'cleanup-name')).toHaveLength(0);
  });

  it('K3 the preview is the signed preview URL; a null path shows a placeholder (AC-EZD-123-10; Q-0664)', () => {
    const withPreview = row({ previewUrl: 'https://example.test/thumb.webp' });
    const without = row({ previewUrl: null });
    const html = render([withPreview, without]);
    const img = elements(html, 'cleanup-preview');
    expect(img).toHaveLength(1);
    expect(attr(img[0].attrs, 'src')).toBe('https://example.test/thumb.webp');
    expect(elements(html, 'cleanup-no-preview')).toHaveLength(1);
  });

  it('K4 the footer shows the earliest delete date, grace days after the sheet first appeared (09p row 6)', () => {
    const html = render([
      row({ shownAt: '2026-10-11T08:00:00Z' }),
      row({ shownAt: '2026-10-13T08:00:00Z' }),
    ]);
    expect(textOf(elements(html, 'cleanup-delete-on')[0].inner)).toBe(
      'If you do nothing, unticked versions delete on Oct 18, 2026, 7 days after this sheet first appeared.',
    );
    expect(html).toContain(
      'A deleted working version cannot be restored. Needs Edit model and the edit lock.',
    );
  });

  it('K5 someone without the lock sees Later only (AC-EZD-123-6)', () => {
    const html = render(seven(), { canSave: false });
    expect(elements(html, 'cleanup-save')).toHaveLength(0);
    expect(elements(html, 'cleanup-later')).toHaveLength(1);
  });

  it('K6 a failed save shows its message', () => {
    const html = render(seven(), { error: 'Someone else is editing now.' });
    expect(textOf(elements(html, 'cleanup-error')[0].inner)).toBe('Someone else is editing now.');
  });
});
