// EZD-1202 (S18 Layout, States; vault/build/assumptions/EZD-1202.md Settled rows "Where the page and its data come
// from", "Version label", "Expiring banner day count"): the client page's data, as the server sends it to the page
// and GET /api/c/[token] answers it, and the pure helpers that turn it into the header label and the banner. No
// cost data: the field list is fixed here and nothing else is sent. Imports nothing heavy (client entry, 200 KB).
import type { MessageParams } from '../../lib/messages/types';

export type ClientPageView = {
  company: string;
  contact: { phone: string; email: string };
  project: { name: string; type: string };
  // R24 #26, S18 Decision 4: "Version N" before Rev 0; a client send numbered after Rev 0 is "Rev N" (EZD-719).
  version: { kind: 'version' | 'rev'; no: number; sentAt: string };
  expiresAt: string;
  // The company's Share link reminder lead (Defaults, registry default 7 days).
  reminderLeadDays: number;
  // The send went out with a sheet set (Plans tab, EZD-1205).
  sharesSheets: boolean;
};

export type ClientPageResult =
  | { status: 'active'; page: ClientPageView }
  | { status: 'expired'; company: string }
  | { status: 'not_found' }
  | { status: 'unavailable' };

/** "Sep 26": en-US short month and day, in the viewer's time zone (undefined: the device's). */
export function shortDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(new Date(iso));
}

/** The header's version label: "Version N · sent {Mon D}" or "Rev N · sent {Mon D}" (board S18Client). */
export function versionLabel(
  version: ClientPageView['version'],
  timeZone?: string,
): { key: 'client.version_sent' | 'client.rev_sent'; params: MessageParams } {
  return {
    key: version.kind === 'rev' ? 'client.rev_sent' : 'client.version_sent',
    params: { n: version.no, date: shortDate(version.sentAt, timeZone) },
  };
}

const DAY_MS = 86_400_000;

/** S18 States "Expiring soon": whole days left, rounded up; shown when that is at most the reminder lead. */
export function expiringBanner(
  expiresAt: string,
  reminderLeadDays: number,
  now: Date,
): { key: 'client.expiring'; params: MessageParams } | null {
  const left = Date.parse(expiresAt) - now.getTime();
  if (!(left > 0)) return null;
  const n = Math.ceil(left / DAY_MS);
  if (n > reminderLeadDays) return null;
  return { key: 'client.expiring', params: { count: n } };
}
