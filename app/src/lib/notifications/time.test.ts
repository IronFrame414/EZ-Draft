// EZD-110b T13 (vault/plans/EZD-110b.md section 4; AC-EZD-110-2): formatNotificationTime. Expected texts:
// D21 and section 6 (board 01c). now 2026-10-29T16:00:00Z is 12:00 on 29 Oct in America/New_York (UTC-4).
import { describe, expect, it } from 'vitest';
import { createT } from '../messages/t';
import type { Message } from '../messages/types';
import { catalogFor } from '../../server/messages/catalog';
import type { MessageKey } from '../../server/messages/catalog';
import { formatNotificationTime } from './time';

const t = createT('en', catalogFor('office', 'en') as Readonly<Record<MessageKey, Message>>);
const NOW = new Date('2026-10-29T16:00:00Z');
const ZONE = 'America/New_York';

const CASES: ReadonlyArray<readonly [string, string, string]> = [
  ['30 s ago', '2026-10-29T15:59:30Z', 'Just now'],
  ['4 min ago', '2026-10-29T15:56:00Z', '4 min ago'],
  ['3 h 10 min ago', '2026-10-29T12:50:00Z', '3 h ago'],
  ['previous calendar day', '2026-10-28T20:12:00Z', 'Yesterday 4:12 PM'],
  ['same year, earlier', '2026-10-26T15:00:00Z', 'Oct 26'],
  ['earlier year', '2025-10-26T15:00:00Z', 'Oct 26, 2025'],
  ['5 s in the future', '2026-10-29T16:00:05Z', 'Just now'],
];

describe('EZD-110b notification times', () => {
  it('EZD-110b T13 times read as drawn', () => {
    for (const [label, createdAt, text] of CASES) {
      const r = formatNotificationTime(createdAt, NOW, ZONE);
      expect(t(r.key as MessageKey, r.params), label).toBe(text);
    }
  });
});
