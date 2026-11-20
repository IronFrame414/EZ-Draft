// EZD-122 (board S20 left panel; S20 Layout "three groups (Sent, Named snapshots, Working versions)"; Q-0700 05
// "Versions labels and panel"; examples 09p "Working-row collapse"; AC-EZD-122-2, -7, -9): the Versions panel's rows,
// pure. Rows arrive newest first. Sent rows read "Version N" with their date and recipient; snapshot rows read their
// name with date and author; working rows read their date and time with their cause and author (a revert row's
// cause line is its stored "Revert from …" label). Three working rows show, then "+ K older".
import type { MessageParams } from '../../lib/messages/types';
import type { VersionCause, VersionRow } from '../../lib/versions/versions';
import type { MessageKey } from '../../server/messages/catalog';

export const WORKING_SHOWN = 3;

export type VersionGroups = {
  sent: VersionRow[];
  snapshots: VersionRow[];
  working: VersionRow[];
  // Working rows past the first three.
  older: number;
  counts: { sent: number; snapshots: number; working: number };
};

export function groupVersions(rows: readonly VersionRow[]): VersionGroups {
  const sent = rows.filter((r) => r.isSent);
  const snapshots = rows.filter((r) => !r.isSent && r.isSnapshot);
  const allWorking = rows.filter((r) => !r.isSent && !r.isSnapshot);
  return {
    sent,
    snapshots,
    working: allWorking.slice(0, WORKING_SHOWN),
    older: Math.max(0, allWorking.length - WORKING_SHOWN),
    counts: { sent: sent.length, snapshots: snapshots.length, working: allWorking.length },
  };
}

const plain = (s: string) => s.replace(new RegExp('[\\u202f\\u00a0]', 'g'), ' ');

// "Oct 10" and "4:12 PM" in the viewer's time zone (or the one given, for tests).
export function versionDate(iso: string, timeZone?: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: plain(
      new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(d),
    ),
    time: plain(
      new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(d),
    ),
  };
}

export type Text = { key: MessageKey; params?: MessageParams } | { text: string };

// The row's title: "Version N", the snapshot name, or "Oct 10 · 4:12 PM".
export function versionTitle(row: VersionRow, timeZone?: string): Text {
  if (row.isSent && row.versionNo !== null)
    return { key: 'office.versions.version', params: { n: row.versionNo } };
  if (row.isSnapshot && row.label !== null) return { text: row.label };
  const { date, time } = versionDate(row.createdAt, timeZone);
  return { key: 'office.versions.when', params: { date, time } };
}

const CAUSE_KEY: Record<Exclude<VersionCause, 'revert'>, MessageKey> = {
  stop_editing: 'office.versions.cause.stop_editing',
  lock_release: 'office.versions.cause.lock_release',
  finish_import: 'office.versions.cause.finish_import',
  revert_from: 'office.versions.cause.revert_from',
  snapshot: 'office.versions.cause.snapshot',
  send: 'office.versions.cause.send',
};

// The cause text of a working row; null when none was recorded.
export function causeText(row: VersionRow): Text | null {
  if (row.cause === null) return null;
  if (row.cause === 'revert') return row.label === null ? null : { text: row.label };
  return { key: CAUSE_KEY[row.cause] };
}

// The second line's parts, joined with " · " by the panel.
export function versionDetail(row: VersionRow, timeZone?: string): Text[] {
  const out: Text[] = [];
  if (row.isSent || row.isSnapshot) {
    out.push({ text: versionDate(row.sentAt ?? row.createdAt, timeZone).date });
    if (row.isSent && row.sentTo !== null) out.push({ text: row.sentTo });
    if (!row.isSent && row.author !== null) out.push({ text: row.author });
    return out;
  }
  const cause = causeText(row);
  if (cause !== null) out.push(cause);
  if (row.author !== null) out.push({ text: row.author });
  return out;
}
