// EZD-140 T8 (vault/plans/EZD-140.md section 3 props, section 6 wording, D11; AC-EZD-140-1). Static markup of
// the pure view inside the office MessagesProvider (its wrapper adds a leading <div lang="en"> and is not part of
// any position check, L-020). Attribute order is not assumed. Expected texts: section 6 (board 01f).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesProvider } from '../../lib/messages';
import { NOTIFICATION_KINDS } from '../../lib/notifications/kinds';
import { mergeNotificationSettings } from '../../lib/notifications/settings';
import { catalogFor } from '../../server/messages/catalog';
import { NotificationSettingsTab } from './NotificationSettingsTab';

const LABELS = [
  'Client approval or comment',
  'Field conflict',
  'Field measurements received',
  'Photoreal render finished',
  'Edit request',
  'Offline sync conflict',
  'Version cleanup due',
  'Render allowance refilled',
  'New field pack issued',
];

const noop = () => {};
const html = renderToStaticMarkup(
  <MessagesProvider language="en" messages={catalogFor('office', 'en')}>
    <NotificationSettingsTab settings={mergeNotificationSettings([])} onToggle={noop} />
  </MessagesProvider>,
);

const count = (s: string, sub: string): number => s.split(sub).length - 1;
const tagsWith = (testId: string): string[] =>
  (html.match(/<[a-z][^>]*>/g) ?? []).filter((t) => t.includes(`data-testid="${testId}"`));

describe('EZD-140 NotificationSettingsTab markup', () => {
  it('EZD-140 T8 help text, column heads and the nine kind labels in board order', () => {
    const help = html.match(/data-testid="notification-settings-help"[^>]*>([^<]*)</);
    expect(help?.[1]).toBe(
      'Choose what reaches you. Each email has a link that opens the same item.',
    );
    expect(html).toContain('>Notification<');
    expect(html).toContain('>In app<');
    expect(html).toContain('>Email<');

    expect(count(html, 'data-testid="notification-setting-row"')).toBe(9);
    const rowKinds = tagsWith('notification-setting-row').map(
      (t) => t.match(/data-kind="([^"]*)"/)?.[1],
    );
    expect(rowKinds).toEqual([...NOTIFICATION_KINDS]);

    const labels = [
      ...html.matchAll(/data-testid="notification-setting-label"[^>]*>([^<]*)</g),
    ].map((m) => m[1]);
    expect(labels).toEqual(LABELS);
  });

  it('EZD-140 T8 eighteen switches, all on, each with its test id and aria-label', () => {
    expect(count(html, 'role="switch"')).toBe(18);
    expect(count(html, 'aria-checked="true"')).toBe(18);
    expect(count(html, 'aria-checked="false"')).toBe(0);
    for (const kind of NOTIFICATION_KINDS) {
      for (const channel of ['in-app', 'email']) {
        const tags = tagsWith(`notification-setting-${channel}-${kind}`);
        expect(tags).toHaveLength(1);
        expect(tags[0]).toContain('role="switch"');
        expect(tags[0]).toContain('aria-checked="true"');
      }
    }
    const inApp = tagsWith('notification-setting-in-app-field_conflict')[0];
    const email = tagsWith('notification-setting-email-field_conflict')[0];
    expect(inApp).toContain('aria-label="Field conflict in app"');
    expect(email).toContain('aria-label="Field conflict by email"');
  });
});
