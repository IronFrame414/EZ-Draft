// EZD-1202 (AC-EZD-1202-1; vault/build/assumptions/EZD-1202.md Settled rows "Version label" and "Expiring banner day
// count"). Expected values: board S18Client "Version 3 · sent Sep 26"; S18 Decision 4 "Rev N" after the permit;
// S18 States "Expiring soon (7 days or less): This link expires in n days."; registry default lead 7; days rounded
// up; 7 days shows it, 8 days does not, 1 day uses the singular.
import { describe, expect, it } from 'vitest';
import { createT } from '../../lib/messages';
import { catalogFor, type MessageKey } from '../../server/messages/catalog';
import type { Message } from '../../lib/messages';
import { expiringBanner, shortDate, versionLabel } from './client-page-model';

const t = createT('en', catalogFor('client', 'en') as Readonly<Record<MessageKey, Message>>);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-10-01T12:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

describe('EZD-1202 client page label and banner', () => {
  it('AC-EZD-1202-1 the version label reads "Version 3 · sent Sep 26"', () => {
    const l = versionLabel({ kind: 'version', no: 3, sentAt: '2026-09-26T16:00:00Z' }, 'America/New_York');
    expect(t(l.key, l.params)).toBe('Version 3 · sent Sep 26');
  });

  it('after Rev 0 the label reads "Rev N · sent {Mon D}"', () => {
    const l = versionLabel({ kind: 'rev', no: 2, sentAt: '2026-10-11T15:00:00Z' }, 'America/New_York');
    expect(t(l.key, l.params)).toBe('Rev 2 · sent Oct 11');
  });

  it("the sent date is the viewer's local day", () => {
    // 02:00 UTC on Sep 27 is still Sep 26 in Florida.
    expect(shortDate('2026-09-27T02:00:00Z', 'America/New_York')).toBe('Sep 26');
    expect(shortDate('2026-09-27T02:00:00Z', 'UTC')).toBe('Sep 27');
  });

  it('the expiring banner shows at 7 days left, not at 8, with the default lead of 7', () => {
    const seven = expiringBanner(at(7 * DAY), 7, NOW);
    expect(seven && t(seven.key, seven.params)).toBe('This link expires in 7 days.');
    expect(expiringBanner(at(8 * DAY), 7, NOW)).toBeNull();
    // Whole days rounded up: 7 days and an hour is 8 days left.
    expect(expiringBanner(at(7 * DAY + HOUR), 7, NOW)).toBeNull();
    const roundsUp = expiringBanner(at(6 * DAY + HOUR), 7, NOW);
    expect(roundsUp && t(roundsUp.key, roundsUp.params)).toBe('This link expires in 7 days.');
  });

  it('one day left uses the singular', () => {
    const one = expiringBanner(at(5 * HOUR), 7, NOW);
    expect(one && t(one.key, one.params)).toBe('This link expires in 1 day.');
  });

  it("the company's own lead decides when it shows", () => {
    expect(expiringBanner(at(4 * DAY), 3, NOW)).toBeNull();
    const three = expiringBanner(at(3 * DAY), 3, NOW);
    expect(three && t(three.key, three.params)).toBe('This link expires in 3 days.');
  });

  it('a link past its expiry shows no expiring banner', () => {
    expect(expiringBanner(at(-HOUR), 7, NOW)).toBeNull();
  });
});
