// EZD-140 Step 5 (vault/plans/EZD-140.md section 3 "settings.ts"; Decided D1, D2, D13; Q-0393): each
// person's In app and Email switch per notification kind, shared by the browser and the server. No row for a
// kind means both on; the list is always the nine kinds in NOTIFICATION_KINDS order. No React, no Supabase.
import { z } from 'zod';
import { NOTIFICATION_KINDS, type NotificationKind } from './kinds';

export type NotificationChannel = 'inApp' | 'email';

export type NotificationSetting = { kind: NotificationKind; inApp: boolean; email: boolean };

export type NotificationSettingRow = { kind: string; in_app: boolean; email: boolean };

export function mergeNotificationSettings(
  rows: readonly NotificationSettingRow[],
): NotificationSetting[] {
  return NOTIFICATION_KINDS.map((kind) => {
    const row = rows.find((r) => r.kind === kind);
    return { kind, inApp: row ? row.in_app : true, email: row ? row.email : true };
  });
}

const inputSchema = z.strictObject({
  settings: z
    .array(
      z.strictObject({
        kind: z.enum(NOTIFICATION_KINDS),
        inApp: z.boolean(),
        email: z.boolean(),
      }),
    )
    .length(NOTIFICATION_KINDS.length),
});

export function parseNotificationSettingsInput(
  body: unknown,
): { ok: true; settings: NotificationSetting[] } | { ok: false } {
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false };
  const items = parsed.data.settings;
  if (new Set(items.map((s) => s.kind)).size !== NOTIFICATION_KINDS.length) return { ok: false };
  const settings = NOTIFICATION_KINDS.map((kind) => {
    const s = items.find((i) => i.kind === kind) as NotificationSetting;
    return { kind, inApp: s.inApp, email: s.email };
  });
  return { ok: true, settings };
}

export function settingsChanged(
  a: readonly NotificationSetting[] | null,
  b: readonly NotificationSetting[] | null,
): boolean {
  if (a === null || b === null) return false;
  return NOTIFICATION_KINDS.some((kind) => {
    const x = a.find((s) => s.kind === kind);
    const y = b.find((s) => s.kind === kind);
    return x?.inApp !== y?.inApp || x?.email !== y?.email;
  });
}

const URL_PATH = '/api/profile/notifications';

async function settingsFrom(res: Response): Promise<NotificationSetting[]> {
  if (res.status !== 200) throw new Error('notification_settings_' + res.status);
  return ((await res.json()) as { settings: NotificationSetting[] }).settings;
}

export async function fetchNotificationSettings(
  signal?: AbortSignal,
): Promise<NotificationSetting[]> {
  return settingsFrom(await fetch(URL_PATH, { cache: 'no-store', signal }));
}

export async function saveNotificationSettings(
  settings: readonly NotificationSetting[],
): Promise<NotificationSetting[]> {
  return settingsFrom(
    await fetch(URL_PATH, {
      method: 'PUT',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings }),
    }),
  );
}
