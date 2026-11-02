// EZD-110a Step 10 (vault/plans/EZD-110a.md section 3 "server"; Decided "Server result parsing", D9-D12):
// server-only helpers over the notification functions, called with the caller's session client (RLS and the
// definer functions limit every row to the caller's own, in scope). RPC errors are thrown unchanged; a
// result of the wrong shape throws a fixed code.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  NOTIFICATION_KINDS,
  type NotificationCursor,
  type NotificationKind,
  type NotificationPage,
  type NotificationParams,
} from '../../lib/notifications/kinds';
import type { Database, Json } from '../db/database.types';

const itemSchema = z.object({
  id: z.string(),
  kind: z.enum(NOTIFICATION_KINDS),
  params: z.record(z.string(), z.string()),
  link: z.string(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  clientName: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
const pageSchema = z.object({
  items: z.array(itemSchema),
  unreadCount: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

const openSchema = z.object({
  link: z.string(),
  project_id: z.string().nullable(),
  project_state: z.enum(['none', 'visible', 'gone']),
});

export async function listNotifications(
  db: SupabaseClient<Database>,
  cursor: NotificationCursor | null,
): Promise<NotificationPage> {
  // Both cursor arguments take null for the first page; the generated argument types do not say so.
  const { data, error } = await db.rpc('list_notifications', {
    p_before_created_at: (cursor?.createdAt ?? null) as string,
    p_before_id: (cursor?.id ?? null) as string,
  });
  if (error) throw error;
  const parsed = pageSchema.safeParse(data);
  if (!parsed.success) throw new Error('list_notifications_bad_result');
  return parsed.data;
}

export async function openNotification(
  db: SupabaseClient<Database>,
  id: string,
): Promise<{
  link: string;
  projectId: string | null;
  projectState: 'none' | 'visible' | 'gone';
} | null> {
  const { data, error } = await db.rpc('open_notification', { p_id: id });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('open_notification_bad_result');
  if (data.length === 0) return null;
  const parsed = openSchema.safeParse(data[0]);
  if (!parsed.success) throw new Error('open_notification_bad_result');
  const { link, project_id, project_state } = parsed.data;
  return { link, projectId: project_id, projectState: project_state };
}

export async function markAllNotificationsRead(db: SupabaseClient<Database>): Promise<number> {
  const { data, error } = await db.rpc('mark_all_notifications_read');
  if (error) throw error;
  if (typeof data !== 'number' || !Number.isInteger(data) || data < 0)
    throw new Error('mark_all_notifications_read_bad_result');
  return data;
}

export async function sendTestNotification(
  db: SupabaseClient<Database>,
  input: { kind: NotificationKind; projectId: string | null; params: NotificationParams },
): Promise<string> {
  // p_project_id takes null for a notification with no project; the generated types do not say so.
  const { data, error } = await db.rpc('send_test_notification', {
    p_kind: input.kind,
    p_project_id: input.projectId as string,
    p_payload: input.params as Json,
  });
  if (error) throw error;
  if (!z.uuid().safeParse(data).success) throw new Error('send_test_notification_bad_result');
  return data as string;
}
