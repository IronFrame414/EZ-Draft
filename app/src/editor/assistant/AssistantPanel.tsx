'use client';
// EZD-5603a Build step 10 (vault/plans/EZD-5603a.md section 3 V1, V2; Decided "Panel states", "Entries", "Cost
// line", "Open My profile", "Touch", "Focus", "CSS"; S03c boards S03cAIAssistant, NoKey, KeyError; Q-0637 (plain
// text); Q-0638 gaps 12, 13; AC-EZD-5603-9): the Assistant panel in the inspector place. A reply is plain text: a
// React text child, no markdown, no links, no injected HTML. My profile opens over the editor as AvatarMenu does.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../../components/icon/Icon';
import { InlineError } from '../../components/states/InlineError';
import { Skeleton, SkeletonGroup } from '../../components/states/Skeleton';
import { StateButton } from '../../components/states/StateButton';
import { useToast } from '../../components/states/ToastProvider';
import { formatUsd, type AssistantModel } from '../../lib/assistant/cost';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import type { AssistantSession } from './assistant-session';
import {
  ASSISTANT_PROMPT_MAX_CHARS,
  canSendPrompt,
  type AssistantEntry,
  type AssistantUi,
} from './assistant-ui';
import { ModelPicker } from './ModelPicker';
import styles from './AssistantPanel.module.css';

const profileModule = lazyModule(() => import('../../lazy/my-profile'));

// Copied from components/account/AvatarMenu.tsx: loads the dialog module; a failed download shows a toast and
// closes (the next press tries again).
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

// V1
export function AssistantPanel({ session }: { session: AssistantSession }) {
  const ui = useSyncExternalStore(session.subscribe, session.getUi, session.getUi);
  return (
    <>
      <AssistantPanelView
        ui={ui}
        onClose={() => session.setOpen(false)}
        onDraft={session.setDraft}
        onModel={session.setModel}
        onSend={() => void session.send()}
        onOpenProfile={session.openProfile}
        onRetryKey={() => void session.refreshKey()}
      />
      {ui.profileOpen ? <ProfileLoader onClose={session.closeProfile} /> : null}
    </>
  );
}

export type AssistantPanelViewProps = {
  ui: AssistantUi;
  onClose(): void;
  onDraft(text: string): void;
  onModel(model: AssistantModel): void;
  onSend(): void;
  onOpenProfile(): void;
  onRetryKey(): void;
};

function Entry({ entry, onOpenProfile }: { entry: AssistantEntry; onOpenProfile(): void }) {
  const t = useT();
  const costLine = (cost: number, session: number) => (
    <div className={styles.cost} data-testid="assistant-cost">
      {t('office.assistant.cost_line', { prompt: formatUsd(cost), session: formatUsd(session) })}
    </div>
  );
  return (
    <div className={styles.entry}>
      <div className={styles.bubble} data-testid="assistant-user-bubble">
        {entry.prompt}
      </div>
      {entry.kind === 'waiting' ? (
        <p role="status" className={styles.waiting} data-testid="assistant-waiting">
          {t('office.assistant.waiting')}
        </p>
      ) : null}
      {entry.kind === 'reply' ? (
        <div className={styles.reply} data-testid="assistant-reply">
          <p className={styles.replyText} data-testid="assistant-reply-text">
            {entry.message}
          </p>
          {costLine(entry.costMicroUsd, entry.sessionMicroUsd)}
        </div>
      ) : null}
      {entry.kind === 'failed' ? (
        <div role="alert" className={styles.alert} data-testid="assistant-error">
          <span className={styles.alertIcon}>
            <Icon name="error" size={20} />
          </span>
          <span className={styles.alertBody}>
            <span>{t(entry.messageKey)}</span>
            {entry.profileLink ? (
              <button
                type="button"
                className={`${styles.link} ${touch.hitArea}`}
                data-testid="assistant-open-profile"
                onClick={onOpenProfile}
              >
                {t('office.assistant.open_profile')}
              </button>
            ) : null}
            {entry.costMicroUsd !== null && entry.sessionMicroUsd !== null
              ? costLine(entry.costMicroUsd, entry.sessionMicroUsd)
              : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// V2
export function AssistantPanelView({
  ui,
  onClose,
  onDraft,
  onModel,
  onSend,
  onOpenProfile,
  onRetryKey,
}: AssistantPanelViewProps) {
  const t = useT();
  const conversationRef = useRef<HTMLDivElement>(null);
  const noKey = ui.keyState === 'none';

  // New entries scroll the conversation to the end.
  useLayoutEffect(() => {
    const el = conversationRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ui.entries.length]);

  let conversation;
  if (noKey) {
    conversation = (
      <div className={styles.noKey} data-testid="assistant-no-key">
        <span className={styles.keyTile}>
          <Icon name="key" size={22} />
        </span>
        <p className={styles.noKeyHeading}>{t('error.assistant_no_key')}</p>
        <p className={styles.noKeyBody}>{t('office.assistant.no_key_body')}</p>
        <StateButton data-testid="assistant-open-profile" onClick={onOpenProfile}>
          {t('office.assistant.open_profile')}
          <Icon name="arrow_forward" size={16} />
        </StateButton>
      </div>
    );
  } else if (ui.keyState === 'failed') {
    conversation = (
      <div data-testid="assistant-key-failed">
        <InlineError message="office.assistant.key_load_failed" onRetry={onRetryKey} />
      </div>
    );
  } else if (ui.keyState === 'loading' && ui.entries.length === 0) {
    conversation = (
      <div data-testid="assistant-key-loading">
        <SkeletonGroup count={1}>
          <Skeleton />
        </SkeletonGroup>
      </div>
    );
  } else {
    conversation = ui.entries.map((e) => (
      <Entry key={e.id} entry={e} onOpenProfile={onOpenProfile} />
    ));
  }

  return (
    <div className={styles.panel} data-testid="assistant-panel">
      <div className={styles.head}>
        <div className={styles.headText}>
          <h2 className={styles.title}>
            <span className={styles.titleIcon}>
              <Icon name="auto_awesome" size={20} />
            </span>
            {t('office.assistant.title')}
          </h2>
          <span className={styles.subtitle}>{t('office.assistant.subtitle')}</span>
        </div>
        <button
          type="button"
          className={`${styles.close} ${touch.hitArea}`}
          aria-label={t('office.assistant.close')}
          data-testid="assistant-close"
          onClick={onClose}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div
        className={noKey ? styles.conversationNoKey : styles.conversation}
        data-testid="assistant-conversation"
        ref={conversationRef}
      >
        {conversation}
      </div>
      <div className={noKey ? `${styles.promptArea} ${styles.promptOff}` : styles.promptArea}>
        <label className={styles.promptLabel}>
          <span className={styles.srOnly}>{t('office.assistant.prompt_label')}</span>
          <textarea
            className={styles.textarea}
            rows={3}
            maxLength={ASSISTANT_PROMPT_MAX_CHARS}
            placeholder={t('office.assistant.placeholder')}
            value={ui.draft}
            disabled={noKey}
            data-testid="assistant-prompt"
            onChange={(e) => onDraft(e.target.value)}
          />
        </label>
        <div className={styles.promptRow}>
          <ModelPicker model={ui.model} disabled={noKey} onChange={onModel} />
          <span className={styles.spacer} />
          <button
            type="button"
            className={`${styles.send} ${touch.target}`}
            aria-label={t('office.assistant.send')}
            data-testid="assistant-send"
            disabled={noKey || !canSendPrompt(ui)}
            onClick={onSend}
          >
            <Icon name="arrow_upward" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
