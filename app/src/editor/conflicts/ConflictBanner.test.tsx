// EZD-299 U5 (vault/plans/EZD-299.md section 4; AC-EZD-299-7; Decided D-Banner; wording P1-P3 of section 6).
// Static markup in the office MessagesProvider; attribute order is not assumed.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { catalogFor } from '../../server/messages/catalog';
import { ConflictBanner } from './ConflictBanner';

const render = (p: {
  count: number;
  projectName: string;
  othersSaved: boolean;
  expanded: boolean;
}) =>
  renderToStaticMarkup(
    <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
      <ConflictBanner {...p} onReview={() => {}} />
    </MessagesProvider>,
  );

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const tags = (html: string, testid: string) =>
  [...html.matchAll(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>`, 'g'))].map((m) => m[0]);
const textOf = (html: string, testid: string) =>
  [...html.matchAll(new RegExp(`<[^>]*data-testid="${testid}"[^>]*>([^<]*)<`, 'g'))].map((m) =>
    decode(m[1]),
  );

describe('EZD-299 conflict banner', () => {
  it('U5 five changes, other edits saved, collapsed', () => {
    const html = render({
      count: 5,
      projectName: 'Kitchen remodel',
      othersSaved: true,
      expanded: false,
    });
    expect(tags(html, 'conflict-banner')[0]).toContain('role="status"');
    expect(textOf(html, 'conflict-banner-title')).toEqual([
      "Couldn't save 5 changes to Kitchen remodel.",
    ]);
    expect(textOf(html, 'conflict-banner-saved')).toEqual(['Your other edits are saved.']);
    expect(textOf(html, 'conflict-review').join('')).toContain('Review changes');
    const review = tags(html, 'conflict-review')[0];
    expect(review).toContain('aria-expanded="false"');
    expect(review).toContain('aria-controls="changes-not-saved"');
  });

  it('U5 one change, no saved line, expanded', () => {
    const html = render({ count: 1, projectName: 'bravo', othersSaved: false, expanded: true });
    expect(textOf(html, 'conflict-banner-title')).toEqual(["Couldn't save 1 change to bravo."]);
    expect(tags(html, 'conflict-banner-saved')).toEqual([]);
    expect(tags(html, 'conflict-review')[0]).toContain('aria-expanded="true"');
  });
});
