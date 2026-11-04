'use client';
// EZD-108 Step 12 (lazy module my-profile; vault/plans/EZD-108.md Decided "Dialog shell", "Loading the profile", "Language and
// iPad controls", "Save", "Password section", "Password submit", "Office language"; board 01e; Q-0392;
// Q-0412; Q-0422; Q-0465 (a) "Security check"): the signed-in user's own profile. Save sends only language and iPad drawing; the password
// has its own button and route and is never part of Save. Cancel, Esc, Close and the overlay discard
// without a prompt. Office text only (English, Q-0121 (a)).
// EZD-140 Step 12 (vault/plans/EZD-140.md Decided D8-D10, D15): a Notifications tab; one footer saves both
// tabs (the profile, then the notification settings); both tab panels stay mounted so a switch keeps edits.
import { Dialog, Tabs } from 'radix-ui';
import { useCallback, useState } from 'react';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import {
  codeProblem,
  newPasswordProblem,
  type IpadDrawing,
  type Language,
  type Profile,
  type ProfileCaptcha,
  type ProfileResponse,
} from '../../lib/profile/profile';
import type { NotificationKind } from '../../lib/notifications/kinds';
import {
  fetchNotificationSettings,
  saveNotificationSettings,
  settingsChanged,
  type NotificationChannel,
  type NotificationSetting,
} from '../../lib/notifications/settings';
import type { MessageKey } from '../../server/messages/catalog';
import { Captcha } from '../../components/auth/Captcha';
import { Icon } from '../../components/icon/Icon';
import { AsyncView } from '../../components/states/AsyncView';
import { Skeleton, SkeletonGroup } from '../../components/states/Skeleton';
import { StateButton } from '../../components/states/StateButton';
import { useToast } from '../../components/states/ToastProvider';
import touch from '../../styles/touch.module.css';
import styles from './my-profile.module.css';
import { NotificationSettingsTab } from './NotificationSettingsTab';

export type MyProfileDialogProps = { onClose: () => void };

export const PROFILE_TABS = ['profile', 'notifications'] as const;

type ProfileTab = (typeof PROFILE_TABS)[number];

const TAB_LABELS: Record<ProfileTab, MessageKey> = {
  profile: 'office.profile.tab_profile',
  notifications: 'office.profile.tab_notifications',
};

const LANGUAGES = [
  { value: 'en', label: 'office.profile.language_en' },
  { value: 'es', label: 'office.profile.language_es' },
] as const satisfies readonly { value: Language; label: MessageKey }[];

const IPAD = [
  { value: 'finger', label: 'office.profile.ipad_finger' },
  { value: 'pencil', label: 'office.profile.ipad_pencil' },
] as const satisfies readonly { value: IpadDrawing; label: MessageKey }[];

// Codes POST /api/profile/password can answer (plan section 3); anything else shows db_unavailable.
const PASSWORD_ERRORS: Record<string, MessageKey> = {
  invalid_input: 'error.invalid_input',
  captcha_failed: 'error.captcha_failed',
  password_too_short: 'error.password_too_short',
  password_too_long: 'error.password_too_long',
  password_contains_app_name: 'error.password_contains_app_name',
  password_contains_email_name: 'error.password_contains_email_name',
  password_mismatch: 'error.password_mismatch',
  current_password_wrong: 'error.current_password_wrong',
  password_same: 'error.password_same',
  password_breached: 'error.password_breached',
  code_invalid: 'error.code_invalid',
  current_password_throttled: 'error.current_password_throttled',
  code_throttled: 'error.code_throttled',
  ip_throttled: 'error.ip_throttled',
  too_many_requests: 'error.too_many_requests',
  not_signed_in: 'error.not_signed_in',
  db_unavailable: 'error.db_unavailable',
};

async function loadProfile(signal: AbortSignal): Promise<ProfileResponse> {
  const res = await fetch('/api/profile', { credentials: 'same-origin', signal });
  if (res.status !== 200) throw new Error('profile_load_failed');
  return (await res.json()) as ProfileResponse;
}

function Segmented<V extends string>(props: {
  label: MessageKey;
  options: readonly { value: V; label: MessageKey }[];
  value: V;
  testid: string;
  onChange: (v: V) => void;
}) {
  const t = useT();
  return (
    <div role="radiogroup" aria-label={t(props.label)} className={styles.seg}>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          data-testid={`${props.testid}-${o.value}`}
          className={`${styles.segItem} ${touch.target}`}
          onClick={() => props.onChange(o.value)}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  );
}

type PasswordMessage = { key: MessageKey; error: boolean };

function PasswordSection({
  email,
  initial,
  captcha,
}: {
  email: string;
  initial: boolean;
  captcha: ProfileCaptcha | null;
}) {
  const t = useT();
  const online = useOnline();
  const [hasPassword, setHasPassword] = useState(initial);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<PasswordMessage | null>(null);
  // The security check (Change only): a token is single-use, so every Change POST that ends bumps attempt,
  // which resets the widget (Captcha.tsx; SignInForm.tsx passes its attempt the same way).
  const [attempt, setAttempt] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const checked = hasPassword && captcha !== null;

  const submit = async () => {
    const problem = newPasswordProblem(next, confirm, email);
    if (problem !== null) {
      setMessage({ key: `error.${problem}`, error: true });
      return;
    }
    if (!hasPassword && codeSent && codeProblem(code) !== null) {
      setMessage({ key: 'error.code_invalid', error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    const body = hasPassword
      ? {
          mode: 'change',
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
          ...(token !== null ? { captchaToken: token } : {}),
        }
      : {
          mode: 'set',
          newPassword: next,
          confirmPassword: confirm,
          ...(codeSent ? { code } : {}),
        };
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data: unknown = await res.json().catch(() => null);
      if (res.status === 200) {
        const status = (data as { status?: unknown } | null)?.status;
        if (status === 'code_sent') {
          setCodeSent(true);
          setMessage({ key: 'office.profile.code_sent', error: false });
          return;
        }
        setCurrent('');
        setNext('');
        setConfirm('');
        setCode('');
        setCodeSent(false);
        setMessage({
          key: hasPassword ? 'office.profile.password_changed' : 'office.profile.password_set',
          error: false,
        });
        setHasPassword(true);
        return;
      }
      const errorCode = (data as { error?: { code?: unknown } } | null)?.error?.code;
      setMessage({
        key:
          (typeof errorCode === 'string' && PASSWORD_ERRORS[errorCode]) || 'error.db_unavailable',
        error: true,
      });
    } catch {
      setMessage({ key: 'error.db_unavailable', error: true });
    } finally {
      setBusy(false);
      if (body.mode === 'change') setAttempt((a) => a + 1);
    }
  };

  const heading = hasPassword ? 'office.profile.change_password' : 'office.profile.set_password';

  return (
    <div className={styles.section}>
      <h3 data-testid="profile-password-heading" className={styles.label}>
        {t(heading)}
      </h3>
      {hasPassword ? (
        <label>
          {t('office.profile.current_password')}
          <input
            data-testid="profile-current-password"
            type="password"
            autoComplete="current-password"
            className={styles.input}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
      ) : null}
      <div className={styles.fields}>
        <label>
          {t('office.profile.new_password')}
          <input
            data-testid="profile-new-password"
            type="password"
            autoComplete="new-password"
            className={styles.input}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <label>
          {t('office.profile.confirm_password')}
          <input
            data-testid="profile-confirm-password"
            type="password"
            autoComplete="new-password"
            className={styles.input}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
      </div>
      {checked && captcha !== null ? (
        <Captcha {...captcha} language={t.language} resetKey={attempt} onToken={setToken} />
      ) : null}
      {codeSent ? (
        <label>
          {t('office.profile.code_label')}
          <input
            data-testid="profile-password-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className={styles.input}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      ) : null}
      <button
        type="button"
        data-testid="profile-password-submit"
        className={`${styles.button} ${touch.target}`}
        disabled={busy || !online || (checked && token === null)}
        onClick={() => void submit()}
      >
        {t(heading)}
      </button>
      {message === null ? null : (
        <p
          data-testid="profile-password-message"
          role={message.error ? 'alert' : 'status'}
          className={message.error ? `${styles.message} ${styles.error}` : styles.message}
        >
          {t(message.key)}
        </p>
      )}
      <p className={styles.help}>{t('office.profile.password_help')}</p>
    </div>
  );
}

function ProfileForm({
  profile,
  captcha,
  language,
  ipadDrawing,
  onLanguage,
  onIpadDrawing,
}: {
  profile: Profile;
  captcha: ProfileCaptcha | null;
  language: Language;
  ipadDrawing: IpadDrawing;
  onLanguage: (v: Language) => void;
  onIpadDrawing: (v: IpadDrawing) => void;
}) {
  const t = useT();
  return (
    <div className={styles.body}>
      <div className={styles.section}>
        <h3 className={styles.label}>{t('office.profile.language')}</h3>
        <Segmented
          label="office.profile.language"
          options={LANGUAGES}
          value={language}
          testid="profile-language"
          onChange={onLanguage}
        />
        <p className={styles.help}>{t('office.profile.language_help')}</p>
      </div>
      <div className={styles.section}>
        <h3 className={styles.label}>{t('office.profile.ipad')}</h3>
        <Segmented
          label="office.profile.ipad"
          options={IPAD}
          value={ipadDrawing}
          testid="profile-ipad"
          onChange={onIpadDrawing}
        />
        <p className={styles.help}>{t('office.profile.ipad_help')}</p>
      </div>
      <span aria-hidden="true" className={styles.divider} />
      <PasswordSection email={profile.email} initial={profile.hasPassword} captcha={captcha} />
    </div>
  );
}

export function MyProfileDialog({ onClose }: MyProfileDialogProps) {
  const t = useT();
  const online = useOnline();
  const toast = useToast();
  const [tab, setTab] = useState<ProfileTab>('profile');
  const [notifShown, setNotifShown] = useState(false);
  // The Profile tab: the loaded (then saved) values and the drafts (EZD-140 D15).
  const [profile, setProfile] = useState<Profile | null>(null);
  const [language, setLanguage] = useState<Language | null>(null);
  const [ipadDrawing, setIpadDrawing] = useState<IpadDrawing | null>(null);
  // The Notifications tab: the loaded (then saved) settings and the draft (EZD-140 D8).
  const [notifLoaded, setNotifLoaded] = useState<NotificationSetting[] | null>(null);
  const [notifDraft, setNotifDraft] = useState<NotificationSetting[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const load = useCallback(async (signal: AbortSignal) => {
    const loaded = await loadProfile(signal);
    setProfile(loaded.profile);
    setLanguage((v) => v ?? loaded.profile.language);
    setIpadDrawing((v) => v ?? loaded.profile.ipadDrawing);
    return loaded;
  }, []);

  const loadNotifications = useCallback(async (signal: AbortSignal) => {
    const loaded = await fetchNotificationSettings(signal);
    setNotifLoaded(loaded);
    setNotifDraft((v) => v ?? loaded);
    return loaded;
  }, []);

  const toggle = (kind: NotificationKind, channel: NotificationChannel, on: boolean) =>
    setNotifDraft((d) => d && d.map((s) => (s.kind === kind ? { ...s, [channel]: on } : s)));

  const profileChanged =
    profile !== null &&
    language !== null &&
    ipadDrawing !== null &&
    (language !== profile.language || ipadDrawing !== profile.ipadDrawing);
  const notifChanged = settingsChanged(notifLoaded, notifDraft);

  // EZD-140 D9: the profile first, then the notification settings; a failure stops there and keeps the
  // drafts, so a retry sends only what is left.
  const save = async () => {
    setBusy(true);
    setSaveError(false);
    try {
      if (profileChanged) {
        const res = await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ language, ipadDrawing }),
        });
        if (res.status !== 200) {
          setSaveError(true);
          return;
        }
        setProfile((p) => p && { ...p, language, ipadDrawing });
      }
      if (notifChanged && notifDraft !== null) {
        setNotifLoaded(await saveNotificationSettings(notifDraft));
      }
      toast.show({ message: 'office.profile.saved' });
      onClose();
    } catch {
      setSaveError(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          data-testid="my-profile-dialog"
          lang={t.language}
          className={styles.dialog}
          aria-describedby={undefined}
        >
          <div className={styles.head}>
            <div>
              <Dialog.Title className={styles.title}>{t('office.profile.title')}</Dialog.Title>
              {profile === null ? null : (
                <p data-testid="my-profile-subtitle" className={styles.subtitle}>
                  {profile.name === null
                    ? profile.email
                    : t('office.profile.subtitle', { name: profile.name, email: profile.email })}
                </p>
              )}
            </div>
            <StateButton
              variant="icon"
              data-testid="my-profile-close"
              aria-label={t('common.close')}
              onClick={onClose}
            >
              <Icon name="close" size={20} />
            </StateButton>
          </div>
          <Tabs.Root
            value={tab}
            onValueChange={(v) => {
              setTab(v as ProfileTab);
              if (v === 'notifications') setNotifShown(true);
            }}
          >
            <Tabs.List className={styles.tabs}>
              {PROFILE_TABS.map((id) => (
                <Tabs.Trigger
                  key={id}
                  value={id}
                  data-testid={`my-profile-tab-${id}`}
                  className={styles.tab}
                >
                  {t(TAB_LABELS[id])}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="profile" forceMount hidden={tab !== 'profile'}>
              <AsyncView
                load={load}
                skeleton={
                  <div className={styles.body}>
                    <SkeletonGroup count={3}>
                      <Skeleton height="38px" />
                    </SkeletonGroup>
                  </div>
                }
                errorMessage="office.profile.load_failed"
              >
                {(loaded) => (
                  <ProfileForm
                    profile={loaded.profile}
                    captcha={loaded.captcha}
                    language={language ?? loaded.profile.language}
                    ipadDrawing={ipadDrawing ?? loaded.profile.ipadDrawing}
                    onLanguage={setLanguage}
                    onIpadDrawing={setIpadDrawing}
                  />
                )}
              </AsyncView>
            </Tabs.Content>
            <Tabs.Content
              value="notifications"
              forceMount
              hidden={tab !== 'notifications'}
              data-testid="notification-settings"
            >
              {notifShown ? (
                <AsyncView
                  load={loadNotifications}
                  skeleton={
                    <div className={styles.body}>
                      <SkeletonGroup count={9}>
                        <Skeleton height="22px" />
                      </SkeletonGroup>
                    </div>
                  }
                  errorMessage="office.profile.notifications.load_failed"
                >
                  {(loaded) => (
                    <NotificationSettingsTab settings={notifDraft ?? loaded} onToggle={toggle} />
                  )}
                </AsyncView>
              ) : null}
            </Tabs.Content>
          </Tabs.Root>
          {profile === null && notifLoaded === null ? null : (
            <div className={styles.footer}>
              {saveError ? (
                <p
                  data-testid="profile-save-error"
                  role="alert"
                  className={`${styles.message} ${styles.error}`}
                >
                  {t('office.profile.save_failed')}
                </p>
              ) : null}
              <button
                type="button"
                data-testid="profile-cancel"
                className={`${styles.button} ${touch.target}`}
                onClick={onClose}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                data-testid="profile-save"
                className={`${styles.button} ${styles.primary} ${touch.target}`}
                disabled={!(profileChanged || notifChanged) || !online || busy}
                onClick={() => void save()}
              >
                {t('office.profile.save')}
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
