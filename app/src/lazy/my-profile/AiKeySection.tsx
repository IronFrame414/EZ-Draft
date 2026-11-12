'use client';
// EZD-5601 Step 19 (vault/plans/EZD-5601.md "D-View", "D-Style"; board S01g; Q-0638 "Add and Remove act at once";
// AC-EZD-5601-1, -2, -5, -8): the AI assistant section of My profile. AiKeyView is pure; AiKeySection holds the
// state and calls addAiKey / removeAiKey. Add and Remove are not part of the dialog's Save or its dirty check.
// The key is never shown again after it is saved: only its last 4 characters come back.
import { useState } from 'react';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network';
import { addAiKey, removeAiKey, type AiKeyState } from '../../lib/profile/ai-key';
import type { MessageKey } from '../../server/messages/catalog';
import { Icon } from '../../components/icon/Icon';
import touch from '../../styles/touch.module.css';
import styles from './my-profile.module.css';

export type AiKeyViewProps = {
  last4: string | null;
  value: string;
  busy: boolean;
  online: boolean;
  messageKey: MessageKey | null;
  onChange(v: string): void;
  onAdd(): void;
  onRemove(): void;
};

export function AiKeyView(props: AiKeyViewProps) {
  const t = useT();
  const { last4, value, busy, online, messageKey } = props;
  return (
    <div data-testid="profile-ai-section" className={`${styles.section} ${styles.aiSection}`}>
      <h3 data-testid="profile-ai-heading" className={styles.label}>
        {t('office.profile.ai_heading')}
      </h3>
      {last4 === null ? (
        <>
          <label htmlFor="profile-ai-key">{t('office.profile.ai_key_label')}</label>
          <div className={styles.keyRow}>
            <input
              id="profile-ai-key"
              data-testid="profile-ai-key-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className={styles.input}
              placeholder={t('office.profile.ai_key_placeholder')}
              value={value}
              onChange={(e) => props.onChange(e.target.value)}
            />
            <button
              type="button"
              data-testid="profile-ai-key-add"
              className={`${styles.button} ${touch.target}`}
              disabled={value.trim() === '' || busy || !online}
              onClick={props.onAdd}
            >
              {t('office.profile.ai_key_add')}
            </button>
          </div>
        </>
      ) : (
        <div className={styles.keyRow}>
          <div data-testid="profile-ai-key-saved" className={styles.saved}>
            <span className={styles.savedIcon}>
              <Icon name="key" size={18} />
            </span>
            {t('office.profile.ai_key_saved')}{' '}
            <span data-testid="profile-ai-key-last4" className={styles.last4}>
              {last4}
            </span>
          </div>
          <button
            type="button"
            data-testid="profile-ai-key-remove"
            className={`${styles.button} ${touch.target}`}
            disabled={busy || !online}
            onClick={props.onRemove}
          >
            {t('office.profile.ai_key_remove')}
          </button>
        </div>
      )}
      {messageKey === null ? null : (
        <p
          data-testid="profile-ai-key-message"
          role="alert"
          className={`${styles.message} ${styles.error}`}
        >
          {t(messageKey)}
        </p>
      )}
      {last4 === null ? (
        <p data-testid="profile-ai-key-help" className={styles.help}>
          {t('office.profile.ai_key_help_lead')}{' '}
          <a
            data-testid="profile-ai-key-link"
            href="https://console.anthropic.com"
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.link} ${touch.hitArea}`}
          >
            {t('office.profile.ai_key_help_link')}
          </a>
          {t('office.profile.ai_key_help_tail')}
        </p>
      ) : (
        <p data-testid="profile-ai-key-help" className={styles.help}>
          {t('office.profile.ai_key_saved_help')}
        </p>
      )}
    </div>
  );
}

export function AiKeySection({ initial }: { initial: AiKeyState }) {
  const online = useOnline();
  const [last4, setLast4] = useState<string | null>(initial?.last4 ?? null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<MessageKey | null>(null);

  const add = async () => {
    setBusy(true);
    setMessageKey(null);
    try {
      const outcome = await addAiKey(value);
      if (outcome.kind === 'saved') {
        setValue('');
        setLast4(outcome.last4);
      } else if (outcome.kind === 'error') {
        setMessageKey(outcome.messageKey);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setMessageKey(null);
    try {
      const outcome = await removeAiKey();
      if (outcome.kind === 'removed') setLast4(null);
      else if (outcome.kind === 'error') setMessageKey(outcome.messageKey);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AiKeyView
      last4={last4}
      value={value}
      busy={busy}
      online={online}
      messageKey={messageKey}
      onChange={setValue}
      onAdd={() => void add()}
      onRemove={() => void remove()}
    />
  );
}
