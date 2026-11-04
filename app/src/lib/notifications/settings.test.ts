// EZD-140 T1 (vault/plans/EZD-140.md sections 3 and 4; AC-EZD-140-1, -4). Pure functions of
// app/src/lib/notifications/settings.ts plus its two fetch helpers over a stubbed fetch (section 3
// "settings.ts" rows). Expected values: D13 (NOTIFICATION_KINDS order, unknown kinds ignored), Q-0393
// (missing kind = both on), the contract's parse and compare rules.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_KINDS } from './kinds';
import {
  fetchNotificationSettings,
  mergeNotificationSettings,
  parseNotificationSettingsInput,
  saveNotificationSettings,
  settingsChanged,
  type NotificationSetting,
} from './settings';

const allOn = (): NotificationSetting[] =>
  NOTIFICATION_KINDS.map((kind) => ({ kind, inApp: true, email: true }));

// A fixed permutation of the nine kinds that is not the kinds order.
const SHUFFLED = [4, 8, 1, 6, 0, 3, 7, 2, 5].map((i) => NOTIFICATION_KINDS[i]);

describe('EZD-140 settings lib', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('EZD-140 T1 mergeNotificationSettings: 9 entries in kinds order, missing = both on, unknown ignored', () => {
    const empty = mergeNotificationSettings([]);
    expect(empty).toEqual(allOn());
    expect(empty.map((s) => s.kind)).toEqual([...NOTIFICATION_KINDS]);

    const merged = mergeNotificationSettings([
      { kind: 'nope', in_app: false, email: false },
      { kind: 'render_finished', in_app: true, email: false },
    ]);
    expect(merged).toHaveLength(9);
    expect(merged.map((s) => s.kind)).toEqual([...NOTIFICATION_KINDS]);
    expect(merged.find((s) => s.kind === 'render_finished')).toEqual({
      kind: 'render_finished',
      inApp: true,
      email: false,
    });
    expect(merged.filter((s) => s.kind !== 'render_finished')).toEqual(
      allOn().filter((s) => s.kind !== 'render_finished'),
    );
  });

  it('EZD-140 T1 parseNotificationSettingsInput: nine valid kinds in any order are returned in kinds order', () => {
    const body = {
      settings: SHUFFLED.map((kind) => ({ kind, inApp: kind !== 'edit_request', email: true })),
    };
    const parsed = parseNotificationSettingsInput(body);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.settings.map((s) => s.kind)).toEqual([...NOTIFICATION_KINDS]);
    expect(parsed.settings.find((s) => s.kind === 'edit_request')).toEqual({
      kind: 'edit_request',
      inApp: false,
      email: true,
    });
    expect(parsed.settings.filter((s) => s.kind !== 'edit_request').every((s) => s.inApp)).toBe(
      true,
    );
  });

  it('EZD-140 T1 parseNotificationSettingsInput: 8 items, a duplicate kind, an extra key, a string boolean and {} are refused', () => {
    const nine = allOn();
    const bad: unknown[] = [
      { settings: nine.slice(0, 8) },
      { settings: [...nine.slice(0, 8), { ...nine[0] }] },
      { settings: nine.map((s, i) => (i === 0 ? { ...s, extra: 1 } : s)) },
      { settings: nine.map((s, i) => (i === 0 ? { ...s, email: 'true' } : s)) },
      { settings: nine, extra: 1 },
      {},
    ];
    for (const body of bad) expect(parseNotificationSettingsInput(body)).toEqual({ ok: false });
  });

  it('EZD-140 T1 settingsChanged: false for a null side, false for equal, true for one flip', () => {
    const x = allOn();
    expect(settingsChanged(null, x)).toBe(false);
    expect(settingsChanged(x, null)).toBe(false);
    expect(settingsChanged(null, null)).toBe(false);
    expect(settingsChanged(x, allOn())).toBe(false);
    const flipped = allOn();
    flipped[3] = { ...flipped[3], email: false };
    expect(settingsChanged(x, flipped)).toBe(true);
    const flippedInApp = allOn();
    flippedInApp[5] = { ...flippedInApp[5], inApp: false };
    expect(settingsChanged(x, flippedInApp)).toBe(true);
  });

  it('EZD-140 section 3 fetch and save: GET and PUT /api/profile/notifications with no-store; non-200 throws notification_settings_<status>', async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    let status = 200;
    const stub = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ settings: allOn() }), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', stub);

    expect(await fetchNotificationSettings()).toEqual(allOn());
    expect(calls[0].url).toBe('/api/profile/notifications');
    expect(calls[0].init?.cache).toBe('no-store');
    expect(calls[0].init?.method ?? 'GET').toBe('GET');

    const next = allOn();
    next[1] = { ...next[1], email: false };
    expect(await saveNotificationSettings(next)).toEqual(allOn());
    expect(calls[1].url).toBe('/api/profile/notifications');
    expect(calls[1].init?.method).toBe('PUT');
    expect(calls[1].init?.cache).toBe('no-store');
    expect(JSON.parse(calls[1].init?.body as string)).toEqual({ settings: next });

    status = 500;
    await expect(fetchNotificationSettings()).rejects.toThrow('notification_settings_500');
    await expect(saveNotificationSettings(next)).rejects.toThrow('notification_settings_500');
    status = 403;
    await expect(fetchNotificationSettings()).rejects.toThrow('notification_settings_403');
  });
});
