'use client';
// EZD-140 Step 11 (vault/plans/EZD-140.md section 3 props "NotificationSettingsTab"; Decided D10-D13; board
// 01f): the nine notification kinds, each with an In app and an Email switch. A pure view: the dialog holds
// the settings and saves them (D9). Office text only (English, Q-0121 (a)).
import { Switch } from 'radix-ui';
import { useT } from '../../lib/messages';
import type { NotificationKind } from '../../lib/notifications/kinds';
import type { NotificationChannel, NotificationSetting } from '../../lib/notifications/settings';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import styles from './NotificationSettingsTab.module.css';

export type NotificationSettingsTabProps = {
  settings: readonly NotificationSetting[];
  onToggle: (kind: NotificationKind, channel: NotificationChannel, on: boolean) => void;
};

const CHANNELS = [
  { channel: 'inApp', testid: 'in-app', aria: 'office.profile.notifications.switch_in_app' },
  { channel: 'email', testid: 'email', aria: 'office.profile.notifications.switch_email' },
] as const satisfies readonly { channel: NotificationChannel; testid: string; aria: MessageKey }[];

export function NotificationSettingsTab({ settings, onToggle }: NotificationSettingsTabProps) {
  const t = useT();
  return (
    <div className={styles.panel}>
      <p data-testid="notification-settings-help" className={styles.help}>
        {t('office.profile.notifications.help')}
      </p>
      <div className={`${styles.row} ${styles.head}`}>
        <span>{t('office.profile.notifications.col_kind')}</span>
        <span className={styles.center}>{t('office.profile.notifications.col_in_app')}</span>
        <span className={styles.center}>{t('office.profile.notifications.col_email')}</span>
      </div>
      {settings.map((s) => {
        const label = t(`office.profile.notifications.kind.${s.kind}` as MessageKey);
        return (
          <div
            key={s.kind}
            data-testid="notification-setting-row"
            data-kind={s.kind}
            className={styles.row}
          >
            <span data-testid="notification-setting-label">{label}</span>
            {CHANNELS.map((c) => (
              <Switch.Root
                key={c.channel}
                data-testid={`notification-setting-${c.testid}-${s.kind}`}
                aria-label={t(c.aria, { label })}
                className={`${styles.switch} ${touch.hitArea}`}
                checked={s[c.channel]}
                onCheckedChange={(on) => onToggle(s.kind, c.channel, on)}
              >
                <Switch.Thumb className={styles.thumb} />
              </Switch.Root>
            ))}
          </div>
        );
      })}
    </div>
  );
}
