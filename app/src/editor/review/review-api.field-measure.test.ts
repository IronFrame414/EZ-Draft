// EZD-1418 (S02 Entry points "rooms sent from the phone"): the browser keeps a review line's page when it is an
// Import review of this app, and drops any other link the answer carries.
import { describe, expect, it } from 'vitest';
import { readSummary } from './review-api';

describe('EZD-1418 review summary links', () => {
  it('keeps an Import review link on a line', () => {
    expect(
      readSummary({
        count: 1,
        groups: [{ source: 'field_measure', count: 1, href: '/projects/p1/import/j1' }],
      }),
    ).toEqual({
      count: 1,
      groups: [{ source: 'field_measure', count: 1, href: '/projects/p1/import/j1' }],
    });
  });

  it('drops a link that is not an Import review of this app', () => {
    for (const href of ['https://example.com/x', '//evil.example/import/j', '/projects/p1', 7]) {
      expect(
        readSummary({ count: 1, groups: [{ source: 'field_measure', count: 1, href }] }),
      ).toEqual({ count: 1, groups: [{ source: 'field_measure', count: 1 }] });
    }
  });
});
