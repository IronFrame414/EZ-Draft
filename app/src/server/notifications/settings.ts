// EZD-140 Step 6 (vault/plans/EZD-140.md section 3 "server"; Decided D1, D2; Q-0393): read and save the
// caller's own notification settings through the session client. RLS limits the read to the caller's rows
// in the claim tenant; the save goes only through save_my_notification_settings. Errors are thrown unchanged
// (the route reads their SQLSTATE `code`).
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  mergeNotificationSettings,
  type NotificationSetting,
} from '../../lib/notifications/settings';
import type { Database } from '../db/database.types';

export async function getMyNotificationSettings(
  db: SupabaseClient<Database>,
): Promise<NotificationSetting[]> {
  const { data, error } = await db.from('notification_setting').select('kind, in_app, email');
  if (error) throw error;
  return mergeNotificationSettings(data);
}

export async function saveMyNotificationSettings(
  db: SupabaseClient<Database>,
  settings: readonly NotificationSetting[],
): Promise<void> {
  const { error } = await db.rpc('save_my_notification_settings', {
    p_settings: settings.map((s) => ({ kind: s.kind, in_app: s.inApp, email: s.email })),
  });
  if (error) throw error;
}
