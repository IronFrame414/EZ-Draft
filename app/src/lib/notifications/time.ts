// EZD-110b Step 8 (vault/plans/EZD-110b.md Decided D21, B6): the time text of a notification row, from the
// created time and a clock passed in. Pure; computed at render, no timer.
import type { MessageParams } from '../messages/types';
import type { MessageKey } from '../../server/messages/catalog';

function dayParts(d: Date, timeZone: string | undefined): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}

const plain = (s: string) => s.replace(new RegExp('[\\u202f\\u00a0]', 'g'), ' ');

export function formatNotificationTime(
  createdAt: string,
  now: Date,
  timeZone?: string,
): { key: MessageKey; params?: MessageParams } {
  const created = new Date(createdAt);
  const diff = now.getTime() - created.getTime();
  if (diff < 60_000) return { key: 'office.notifications.time.just_now' };
  if (diff < 3_600_000)
    return {
      key: 'office.notifications.time.minutes_ago',
      params: { count: Math.floor(diff / 60_000) },
    };
  const c = dayParts(created, timeZone);
  const n = dayParts(now, timeZone);
  if (c.y === n.y && c.m === n.m && c.d === n.d)
    return {
      key: 'office.notifications.time.hours_ago',
      params: { count: Math.floor(diff / 3_600_000) },
    };
  const prev = new Date(Date.UTC(n.y, n.m - 1, n.d - 1));
  if (c.y === prev.getUTCFullYear() && c.m === prev.getUTCMonth() + 1 && c.d === prev.getUTCDate())
    return {
      key: 'office.notifications.time.yesterday',
      params: {
        time: plain(
          new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: 'numeric',
            minute: '2-digit',
          }).format(created),
        ),
      },
    };
  const date = plain(
    new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(created),
  );
  if (c.y === n.y) return { key: 'office.notifications.time.date', params: { date } };
  return {
    key: 'office.notifications.time.date_year',
    params: { date, year: String(c.y) },
  };
}
