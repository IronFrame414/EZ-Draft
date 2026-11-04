'use client';
// EZD-108 Step 13 (vault/plans/EZD-108.md Decided "Settings header markup", "Menu", "Menu primitive",
// "Item actions"; board 01d; S15 Avatar; Q-0210; Q-0403): the initials in the header open a menu with the
// user's name and email, My profile, Company settings (only with at least one Settings switch) and Sign out.
// Sign out asks `beforeSignOut` first (the Settings unsaved-edits check) and signs out only on true. The My
// profile dialog is a lazy module (app/src/lazy/my-profile/), fetched when the menu opens.
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { useT } from '../../lib/messages';
import { signOut } from '../../server/auth/actions';
import touch from '../../styles/touch.module.css';
import { confirmSignOut } from '../auth/SignOutButton';
import { Icon } from '../icon/Icon';
import { Menu, MenuItem, MenuSeparator } from '../menu/Menu';
import { useToast } from '../states/ToastProvider';
import styles from './account.module.css';

const profileModule = lazyModule(() => import('../../lazy/my-profile'));

export type AvatarMenuProps = {
  initials: string;
  name: string | null;
  email: string;
  showCompanySettings: boolean;
  onNavigate?: (href: string) => void;
  beforeSignOut?: () => boolean | Promise<boolean>;
};

// Loads the dialog module; a failed download shows a toast and closes (the next press tries again).
function ProfileLoader({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [mod, setMod] = useState(() => profileModule.peek());
  useEffect(() => {
    if (mod) return;
    let live = true;
    profileModule.load().then(
      (m) => {
        if (live) setMod(m);
      },
      () => {
        if (!live) return;
        toast.show({ message: 'office.profile.load_failed' });
        onClose();
      },
    );
    return () => {
      live = false;
    };
  }, [mod, toast, onClose]);
  if (!mod) return null;
  const { MyProfileDialog } = mod;
  return <MyProfileDialog onClose={onClose} />;
}

export function AvatarMenu({
  initials,
  name,
  email,
  showCompanySettings,
  onNavigate,
  beforeSignOut,
}: AvatarMenuProps) {
  const t = useT();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [, startTransition] = useTransition();

  const onCompanySettings = () => {
    if (onNavigate) onNavigate('/settings');
    else router.push('/settings');
  };

  const onSignOut = () => {
    void confirmSignOut(beforeSignOut).then((ok) => {
      if (ok) {
        startTransition(async () => {
          await signOut();
        });
      }
    });
  };

  const itemClass = `${styles.menuItem} ${touch.target}`;

  return (
    <>
      <Menu
        label={t('office.account.menu_aria')}
        trigger={
          <span data-settings-avatar="" aria-hidden="true">
            {initials}
          </span>
        }
        triggerClassName={`${styles.trigger} ${touch.hitArea}`}
        triggerTestId="avatar-menu-trigger"
        contentClassName={styles.menu}
        contentTestId="avatar-menu"
        sideOffset={8}
        anchorSelector="header"
        onOpenChange={(open) => {
          if (open) profileModule.preload();
        }}
      >
        <div className={styles.menuHead}>
          {name === null ? null : (
            <span data-testid="avatar-menu-name" className={styles.menuName}>
              {name}
            </span>
          )}
          <span data-testid="avatar-menu-email" className={styles.menuEmail}>
            {email}
          </span>
        </div>
        <MenuSeparator className={styles.menuDivider} />
        <MenuItem
          testId="avatar-menu-profile"
          className={itemClass}
          onSelect={() => setProfileOpen(true)}
        >
          <span className={styles.menuIcon}>
            <Icon name="person" size={20} />
          </span>
          {t('office.account.my_profile')}
        </MenuItem>
        {showCompanySettings ? (
          <MenuItem
            testId="avatar-menu-company-settings"
            className={itemClass}
            onSelect={onCompanySettings}
          >
            <span className={styles.menuIcon}>
              <Icon name="settings" size={20} />
            </span>
            {t('office.account.company_settings')}
          </MenuItem>
        ) : null}
        <MenuSeparator className={styles.menuDivider} />
        <MenuItem testId="avatar-menu-sign-out" className={itemClass} onSelect={onSignOut}>
          <span className={styles.menuIcon}>
            <Icon name="logout" size={20} />
          </span>
          {t('common.sign_in.sign_out')}
        </MenuItem>
      </Menu>
      {profileOpen ? <ProfileLoader onClose={() => setProfileOpen(false)} /> : null}
    </>
  );
}
