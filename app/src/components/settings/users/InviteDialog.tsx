'use client';

// EZD-105 (S15 Invite user; boards S15j, S15j states; R24 #15; Q-0029; S15 D13; Q-0695 decisions 10 row 63):
// the Invite user dialog. Email (required), name, role (presets, then custom roles), language (English
// preselected) and Project access (preselected from the role until the person picks one). Send posts
// POST /api/settings/users/invites; a refusal shows its line under Email and nothing is written; a failed
// request shows "Couldn't send the invite. Nothing was sent." with Try again. After Send the dialog shows the
// invite link with Copy link, the code and the date the link stops working; when the email did not go out it
// says so, and the link is still there to send by hand (R24 #15).
// EZD-129 (S15 Decision 13; board S15AccessPassword; Q-0695 decisions 10 row 63): under Listed projects, the
// same summary, Choose projects and picker as the inspector. After Send, the picked projects are saved with
// PUT /api/settings/users/<new membership id>/scope. If that fails the invite stands on Listed projects with
// none (allowed, least access) and the sent view says so with Try again.
import { Dialog } from 'radix-ui';
import { useRef, useState } from 'react';
import { useT } from '../../../lib/messages';
import { useOnline } from '../../../lib/network';
import { splitRoles } from '../../../lib/roles/roles';
import {
  defaultInviteScope,
  inviteRefusalKey,
  looksLikeEmail,
  type InviteScope,
} from '../../../lib/users/invite';
import { formatUserDate, type UserRole } from '../../../lib/users/users';
import type { MessageKey } from '../../../server/messages/catalog';
import touch from '../../../styles/touch.module.css';
import { Icon } from '../../icon/Icon';
import { StateButton } from '../../states/StateButton';
import { ListedProjects } from './ProjectAccess';
import { useToast } from '../../states/ToastProvider';
import roleStyles from './Roles.module.css';
import styles from './Users.module.css';

export type InviteSentResult = {
  email: string;
  membershipId: string;
  link: string;
  code: string;
  expiresAt: string;
  emailSent: boolean;
};

const EMAIL_MAX = 320;
const NAME_MAX = 100;

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function InviteDialog({
  roles,
  onClose,
  onSent,
}: {
  roles: readonly UserRole[];
  onClose: () => void;
  onSent: (sent: InviteSentResult) => void;
}) {
  const t = useT();
  const online = useOnline();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roleId, setRoleId] = useState<string | null>(null);
  const [language, setLanguage] = useState<'en' | 'es'>('en');
  // null: follow the role's default (S15 D13).
  const [chosenScope, setChosenScope] = useState<InviteScope | null>(null);
  // EZD-129: the Listed projects picked before Send, and the state of their save after it.
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [accessSave, setAccessSave] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [refusal, setRefusal] = useState<MessageKey | null>(null);
  const [roleMissing, setRoleMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<InviteSentResult | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const role = roles.find((r) => r.id === roleId) ?? null;
  const scope: InviteScope = chosenScope ?? defaultInviteScope(role?.preset ?? null);
  const { presets, custom } = splitRoles(roles);

  const send = async () => {
    setFailed(false);
    if (!looksLikeEmail(email)) {
      setRefusal('office.users.invite.refused.invalid_email');
      emailRef.current?.focus();
      return;
    }
    if (roleId === null) {
      setRoleMissing(true);
      return;
    }
    setRefusal(null);
    setBusy(true);
    try {
      const res = await fetch('/api/settings/users/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() === '' ? null : name.trim(),
          roleId,
          language,
          scope,
        }),
      });
      if (res.status === 201) {
        const body = (await res.json()) as Omit<InviteSentResult, 'email'>;
        const result = { ...body, email: email.trim().toLowerCase() };
        setSent(result);
        onSent(result);
        if (scope === 'listed' && projectIds.length > 0) {
          await saveProjects(result.membershipId);
        }
        return;
      }
      const data: unknown = await res.json().catch(() => null);
      const key = inviteRefusalKey((data as { error?: { code?: unknown } } | null)?.error?.code);
      if (key !== null) {
        setRefusal(key);
        emailRef.current?.focus();
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const saveProjects = async (membershipId: string) => {
    setAccessSave('saving');
    try {
      const res = await fetch(`/api/settings/users/${membershipId}/scope`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ scope: 'listed', projectIds }),
      });
      setAccessSave(res.status === 200 ? 'idle' : 'failed');
    } catch {
      setAccessSave('failed');
    }
  };

  const copy = async (link: string) => {
    toast.show({
      message: (await copyText(link))
        ? 'office.users.invite.link_copied'
        : 'office.users.invite.copy_failed',
    });
  };

  const tag = (key: MessageKey) => <span className={styles.inviteTag}>{t(key)}</span>;

  const segment = <V extends string>(
    id: string,
    value: V,
    options: readonly { value: V; label: MessageKey }[],
    onPick: (v: V) => void,
  ) => (
    <div role="group" aria-labelledby={`${id}-label`} data-testid={id} className={styles.segment}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-testid={`${id}-${o.value}`}
          aria-pressed={value === o.value}
          disabled={busy}
          className={`${styles.segmentButton} ${touch.target}${value === o.value ? ` ${styles.segmentOn}` : ''}`}
          onClick={() => onPick(o.value)}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  );

  const expiry =
    sent === null ? null : formatUserDate(sent.expiresAt, new Date());

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={roleStyles.overlay} />
        <Dialog.Content
          data-testid="invite-dialog"
          data-state-name={sent === null ? 'form' : 'sent'}
          lang={t.language}
          className={`${roleStyles.content} ${styles.inviteContent}`}
          aria-describedby={undefined}
        >
          <div className={styles.inviteHead}>
            <Icon name="person" size={20} />
            <Dialog.Title className={roleStyles.dialogTitle}>
              {t(sent === null ? 'office.users.invite.title' : 'office.users.invite.sent_title')}
            </Dialog.Title>
            <Dialog.Close
              data-testid="invite-close"
              className={`${styles.inviteClose} ${touch.target}`}
              aria-label={t('common.close')}
            >
              <Icon name="close" size={20} />
            </Dialog.Close>
          </div>
          {sent === null ? (
            <>
              <div className={roleStyles.dialogBody}>
                <div className={roleStyles.dialogField}>
                  <div className={roleStyles.labelRow}>
                    <label htmlFor="invite-email">{t('office.users.invite.email')}</label>
                    {tag('office.users.invite.required')}
                  </div>
                  <input
                    id="invite-email"
                    ref={emailRef}
                    data-testid="invite-email"
                    type="email"
                    autoComplete="off"
                    className={`${roleStyles.input}${refusal ? ` ${roleStyles.inputBad}` : ''}`}
                    placeholder={t('office.users.invite.email_placeholder')}
                    maxLength={EMAIL_MAX}
                    value={email}
                    readOnly={busy}
                    aria-invalid={refusal !== null}
                    aria-describedby={refusal ? 'invite-email-error' : undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setRefusal(null);
                    }}
                  />
                  {refusal ? (
                    <p
                      id="invite-email-error"
                      data-testid="invite-refusal"
                      role="alert"
                      className={`${roleStyles.fieldError} ${styles.inviteError}`}
                    >
                      <Icon name="error" size={16} />
                      {t(refusal)}
                    </p>
                  ) : null}
                </div>
                <div className={roleStyles.dialogField}>
                  <div className={roleStyles.labelRow}>
                    <label htmlFor="invite-name">{t('office.users.invite.name')}</label>
                    {tag('office.users.invite.optional')}
                  </div>
                  <input
                    id="invite-name"
                    data-testid="invite-name"
                    autoComplete="off"
                    className={roleStyles.input}
                    placeholder={t('office.users.invite.name_placeholder')}
                    maxLength={NAME_MAX}
                    value={name}
                    readOnly={busy}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className={styles.inviteRow}>
                  <div className={roleStyles.dialogField}>
                    <label className={roleStyles.labelRow} htmlFor="invite-role">
                      {t('office.users.invite.role')}
                    </label>
                    <select
                      id="invite-role"
                      data-testid="invite-role"
                      className={`${styles.select} ${touch.target}${roleMissing ? ` ${roleStyles.inputBad}` : ''}`}
                      value={roleId ?? ''}
                      disabled={busy}
                      aria-invalid={roleMissing}
                      onChange={(e) => {
                        setRoleId(e.target.value === '' ? null : e.target.value);
                        setRoleMissing(false);
                      }}
                    >
                      <option value="" disabled>
                        {t('office.users.invite.role_placeholder')}
                      </option>
                      {[
                        { label: 'office.roles.group_presets' as const, list: presets },
                        { label: 'office.roles.group_custom' as const, list: custom },
                      ]
                        .filter((g) => g.list.length > 0)
                        .map((g) => (
                          <optgroup key={g.label} label={t(g.label)}>
                            {g.list.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                    </select>
                  </div>
                  <div className={roleStyles.dialogField}>
                    <span className={roleStyles.labelRow} id="invite-language-label">
                      {t('office.users.invite.language')}
                    </span>
                    {segment(
                      'invite-language',
                      language,
                      [
                        { value: 'en', label: 'office.users.english' },
                        { value: 'es', label: 'office.users.spanish' },
                      ],
                      setLanguage,
                    )}
                  </div>
                </div>
                <div className={roleStyles.dialogField}>
                  <span className={roleStyles.labelRow} id="invite-access-label">
                    {t('office.users.invite.access')}
                  </span>
                  {segment(
                    'invite-access',
                    scope,
                    [
                      { value: 'all', label: 'office.users.invite.access_all' },
                      { value: 'listed', label: 'office.users.invite.access_listed' },
                    ],
                    setChosenScope,
                  )}
                  <p className={styles.help} data-testid="invite-access-default">
                    {t('office.users.invite.access_default')}
                  </p>
                  {scope === 'listed' ? (
                    <ListedProjects
                      idPrefix="invite-access"
                      value={{ scope: 'listed', projectIds }}
                      disabled={busy}
                      onChange={(d) => setProjectIds(d.projectIds)}
                    />
                  ) : null}
                </div>
              </div>
              <div className={`${roleStyles.dialogFoot} ${styles.inviteFoot}`}>
                {failed ? (
                  <p data-testid="invite-failed" role="alert" className={`${roleStyles.fieldError} ${styles.inviteError}`}>
                    <Icon name="error" size={16} />
                    {t('office.users.invite.failed')}
                  </p>
                ) : (
                  <p className={`${styles.help} ${styles.inviteNote}`}>
                    <Icon name="update" size={16} />
                    {t('office.users.invite.footer')}
                  </p>
                )}
                <StateButton data-testid="invite-cancel" disabled={busy} onClick={onClose}>
                  {t('office.users.invite.cancel')}
                </StateButton>
                <StateButton
                  data-testid="invite-send"
                  variant="primary"
                  disabled={busy || !online}
                  onClick={() => void send()}
                >
                  <Icon name={failed ? 'refresh' : 'arrow_forward'} size={18} />
                  {t(
                    busy
                      ? 'office.users.invite.sending'
                      : failed
                        ? 'office.users.invite.try_again'
                        : 'office.users.invite.send',
                  )}
                </StateButton>
              </div>
            </>
          ) : (
            <>
              <div className={roleStyles.dialogBody}>
                <p data-testid="invite-sent-to" className={styles.inviteSentTo}>
                  <Icon name="mail" size={16} />
                  {t('office.users.invite.sent_to', { email: sent.email })}
                </p>
                {accessSave === 'failed' ? (
                  <div data-testid="invite-access-failed" role="alert" className={styles.inviteNote}>
                    <p className={`${roleStyles.fieldError} ${styles.inviteError}`}>
                      <Icon name="error" size={16} />
                      {t('office.users.access.invite_save_failed')}
                    </p>
                    <StateButton
                      data-testid="invite-access-retry"
                      onClick={() => void saveProjects(sent.membershipId)}
                    >
                      <Icon name="refresh" size={18} />
                      {t('office.users.invite.try_again')}
                    </StateButton>
                  </div>
                ) : null}
                {sent.emailSent ? null : (
                  <p data-testid="invite-email-not-sent" role="alert" className={`${roleStyles.fieldError} ${styles.inviteError}`}>
                    <Icon name="error" size={16} />
                    {t('office.users.invite.email_not_sent')}
                  </p>
                )}
                <div className={roleStyles.dialogField}>
                  <label className={roleStyles.labelRow} htmlFor="invite-link">
                    {t('office.users.invite.link_label')}
                  </label>
                  <div className={styles.inviteLinkRow}>
                    <input
                      id="invite-link"
                      data-testid="invite-link"
                      className={`${roleStyles.input} ${styles.inviteLink}`}
                      readOnly
                      value={sent.link}
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <StateButton data-testid="invite-copy-link" onClick={() => void copy(sent.link)}>
                      <Icon name="content_copy" size={16} />
                      {t('office.users.copy_link')}
                    </StateButton>
                  </div>
                </div>
                <div className={roleStyles.dialogField}>
                  <span className={roleStyles.labelRow}>{t('office.users.invite.code_label')}</span>
                  <div className={styles.inviteCodeBox}>
                    <span data-testid="invite-code" className={styles.inviteCode}>
                      {`${sent.code.slice(0, 3)} ${sent.code.slice(3)}`}
                    </span>
                    <span className={styles.help}>{t('office.users.invite.code_help')}</span>
                  </div>
                </div>
                {expiry ? (
                  <p data-testid="invite-expiry" className={`${styles.help} ${styles.inviteNote}`}>
                    <Icon name="update" size={16} />
                    {t('office.users.invite.expiry', { date: t(expiry.key, expiry.params) })}
                  </p>
                ) : null}
              </div>
              <div className={roleStyles.dialogFoot}>
                <StateButton data-testid="invite-done" variant="primary" onClick={onClose}>
                  {t('office.users.invite.done')}
                </StateButton>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
