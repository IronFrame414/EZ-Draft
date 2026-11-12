// EZD-110a Step 7 (vault/plans/EZD-110a.md section 3 "kinds.ts"; Decided D1, D22; Q-0425): the notification
// kinds, in the order of the notification table's kind check, their title params and titles, and the list
// types shared by the browser and the server. No React, no Supabase.
// EZD-332: the zod param schemas live in param-schemas.ts, so the bell brings no zod into the browser.
import type { MessageParams } from '../messages/types';
import type { MessageKey } from '../../server/messages/catalog';
import type { IconName } from '../../components/icon/icon-names.generated';

export const NOTIFICATION_KINDS = [
  'client_response',
  'field_conflict',
  'field_measurements_received',
  'render_finished',
  'edit_request',
  'sync_conflict',
  'cleanup_due',
  'render_allowance_refilled',
  'field_pack_issued',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_PAGE_SIZE = 20;

export type NotificationParams = Record<string, string>;

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  params: NotificationParams;
  link: string;
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPage = { items: NotificationItem[]; unreadCount: number; hasMore: boolean };

export type NotificationCursor = { createdAt: string; id: string };

export function notificationTitle(
  kind: NotificationKind,
  params: NotificationParams,
): { key: MessageKey; params: MessageParams } {
  if (kind === 'client_response')
    return {
      key: `office.notifications.kind.client_response.${params.action}` as MessageKey,
      params,
    };
  // EZD-299a Build step 16 (vault/plans/EZD-299a.md Decided D-Title; N1, N1b; Q-0627): the plural needs a
  // numeric count; an old `{}` row renders with count 0.
  if (kind === 'sync_conflict') {
    const count = toCount(params.count);
    const more = toCount(params.more);
    const names = params.names ?? '';
    return more > 0
      ? { key: 'office.notifications.kind.sync_conflict_more', params: { count, names, more } }
      : { key: 'office.notifications.kind.sync_conflict', params: { count, names } };
  }
  return { key: `office.notifications.kind.${kind}` as MessageKey, params };
}

function toCount(value: string | undefined): number {
  return value !== undefined && /^[0-9]+$/.test(value) ? Number(value) : 0;
}

// EZD-110b Step 7 (vault/plans/EZD-110b.md section 3 "kinds.ts"; board 01c): the icon of a notification.
export function notificationIcon(kind: NotificationKind, params: NotificationParams): IconName {
  switch (kind) {
    case 'client_response':
      return params.action === 'approved' ? 'check_circle' : 'chat_bubble';
    case 'field_conflict':
      return 'compare_arrows';
    case 'field_measurements_received':
      return 'straighten';
    case 'render_finished':
      return 'photo_camera';
    case 'edit_request':
      return 'edit';
    case 'sync_conflict':
      return 'sync_problem';
    case 'cleanup_due':
      return 'event';
    case 'render_allowance_refilled':
      return 'autorenew';
    case 'field_pack_issued':
      return 'assignment';
  }
}
