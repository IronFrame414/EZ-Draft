'use client';

// EZD-103a Step 6 (vault/plans/EZD-103a.md section 3 markup; S15 Layout; B15): the Settings frame, header,
// left nav of the allowed sections, status bar, the page body wrapper and the load-error view. Nothing is
// imported from components/shell/ (editor code; the office entry forbids it).
// EZD-103b Step 8 (vault/plans/EZD-103b.md): the unsaved-edits provider wraps the frame's header, body and
// status bar; the Projects link and the nav items are GuardedLinks.
// EZD-112 Step 14 (vault/plans/EZD-112.md Decided "Shell additions"): `SettingsMain` takes `subtitle` and
// `flush`; a page adds status bar items after the Company item with `useSettingsStatus`.
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Disclaimer } from '../disclaimer/Disclaimer';
import { Icon } from '../icon/Icon';
import { InlineError } from '../states/InlineError';
import { useT } from '../../lib/messages';
import { SETTINGS_SECTIONS, sectionForPath, settingsHref } from '../../lib/settings/sections';
import type { SettingsSectionId } from '../../lib/settings/sections';
import type { MessageKey } from '../../server/messages/catalog';
import styles from './SettingsShell.module.css';
import { GuardedLink, UnsavedChangesProvider } from './unsaved-changes';

export type SettingsStatusEntry = { id: string; label: MessageKey; value: string };

type SetStatus = (items: readonly SettingsStatusEntry[]) => void;

// Outside the shell (no provider) a page's status items have nowhere to show, so the setter does nothing.
const SettingsStatusContext = createContext<SetStatus>(() => {});

export function useSettingsStatus(items: readonly SettingsStatusEntry[]): void {
  const setStatus = useContext(SettingsStatusContext);
  useEffect(() => {
    setStatus(items);
    return () => setStatus([]);
  }, [setStatus, items]);
}

export type SettingsShellProps = {
  companyName: string;
  initials: string;
  allowed: readonly SettingsSectionId[];
  activeMembers: number | null;
  draftScope: string;
  children: ReactNode;
};

export function SettingsShell({
  companyName,
  initials,
  allowed,
  activeMembers,
  draftScope,
  children,
}: SettingsShellProps) {
  const t = useT();
  const active = sectionForPath(usePathname());
  const sections = SETTINGS_SECTIONS.filter((s) => allowed.includes(s.id));
  const [statusItems, setStatusItems] = useState<readonly SettingsStatusEntry[]>([]);
  return (
    <div data-settings-region="frame" className={styles.frame}>
      <SettingsStatusContext.Provider value={setStatusItems}>
        <UnsavedChangesProvider draftScope={draftScope}>
          <header data-settings-region="header" className={`${styles.card} ${styles.header}`}>
            <span data-settings-wordmark="" className={styles.wordmark}>
              <span>{t('office.header.wordmark_ez')}</span>
              <span className={styles.accent}>{t('office.header.wordmark_draft')}</span>
            </span>
            <span aria-hidden="true" className={styles.divider} />
            <span data-settings-title="" className={styles.title}>
              {t('office.settings.title')}
            </span>
            <GuardedLink href="/" data-settings-back="" className={styles.back}>
              <Icon name="arrow_back" size={16} />
              {t('office.settings.back')}
            </GuardedLink>
            <span className={styles.spacer} />
            <span data-settings-company="" className={styles.company}>
              {companyName}
            </span>
            <span data-settings-avatar="" aria-hidden="true" className={styles.avatar}>
              {initials}
            </span>
          </header>
          <div data-settings-region="body" className={styles.body}>
            <nav
              data-settings-region="nav"
              aria-label={t('office.settings.nav_aria')}
              className={`${styles.card} ${styles.nav}`}
            >
              <span data-settings-nav-label="" className={styles.navLabel}>
                {t('office.settings.nav_label')}
              </span>
              <div className={styles.navList}>
                {sections.map((s) => {
                  const badge =
                    s.badge === 'users'
                      ? activeMembers === null
                        ? null
                        : String(activeMembers)
                      : s.badge === 'units'
                        ? t('office.settings.badge_units')
                        : null;
                  return (
                    <GuardedLink
                      key={s.id}
                      href={settingsHref(s)}
                      data-settings-nav={s.id}
                      aria-current={active?.id === s.id ? 'page' : undefined}
                      className={styles.item}
                    >
                      <Icon name={s.icon} size={19} />
                      <span>{t(s.label)}</span>
                      {badge === null ? null : (
                        <span data-settings-badge={s.id} className={styles.badge}>
                          {badge}
                        </span>
                      )}
                    </GuardedLink>
                  );
                })}
              </div>
            </nav>
            <div data-settings-region="content" className={styles.content}>
              {children}
            </div>
          </div>
          <footer data-settings-region="status-bar" className={styles.status}>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>{t('office.settings.status_company')}</span>
              <span data-settings-status="company" className={styles.statusValue}>
                {companyName}
              </span>
            </div>
            {statusItems.map((item) => (
              <div key={item.id} className={styles.statusItem}>
                <span className={styles.statusLabel}>{t(item.label)}</span>
                <span data-settings-status={item.id} className={styles.statusValue}>
                  {item.value}
                </span>
              </div>
            ))}
            <span data-settings-status="location" className={styles.location}>
              {active ? t(active.location) : ''}
            </span>
            <Disclaimer placement="bar" />
          </footer>
        </UnsavedChangesProvider>
      </SettingsStatusContext.Provider>
    </div>
  );
}

export function SettingsMain({
  section,
  title,
  subtitle,
  flush,
  children,
}: {
  section?: SettingsSectionId;
  title?: MessageKey;
  subtitle?: MessageKey;
  flush?: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <main data-settings-page={section} className={`${styles.card} ${styles.main}`}>
      {title === undefined ? null : (
        <div className={styles.mainHead}>
          <h1 className={styles.mainTitle}>{t(title)}</h1>
          {subtitle === undefined ? null : <p className={styles.mainSubtitle}>{t(subtitle)}</p>}
        </div>
      )}
      {flush ? (
        <div className={styles.mainFlush}>{children}</div>
      ) : (
        <div className={styles.mainBody}>{children}</div>
      )}
    </main>
  );
}

export function SettingsLoadError() {
  const router = useRouter();
  return (
    <div data-settings-region="frame" className={styles.frame}>
      <main data-settings-load-error="">
        <div className={styles.mainBody}>
          <InlineError message="error.db_unavailable" onRetry={() => router.refresh()} />
        </div>
      </main>
    </div>
  );
}
