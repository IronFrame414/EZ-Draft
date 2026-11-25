'use client';
// EZD-5603a Build step 10 (vault/plans/EZD-5603a.md section 3 V1, V2; Decided "Panel states", "Entries", "Cost
// line", "Open My profile", "Touch", "Focus", "CSS"; S03c boards S03cAIAssistant, NoKey, KeyError; Q-0637 (plain
// text); Q-0638 gaps 12, 13; AC-EZD-5603-9): the Assistant panel in the inspector place.
// EZD-5604b (vault/plans/EZD-5604b.md section 3 V3, V4; Decided "D-Panel"; AC-EZD-5604-1, -4, -5, -7): under a
// reply, the refused line, the stale line with its one button, or the preview's buttons; while a preview is open
// the prompt area is disabled. A reply is plain text: a
// React text child, no markdown, no links, no injected HTML. My profile opens over the editor as AvatarMenu does.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
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
  photoControlDisabled,
  photoRemoveDisabled,
  type AssistantEntry,
  type AssistantUi,
} from './assistant-ui';
import { PhotoButton, PhotoNote, PhotoProblemBox, PhotoThumb } from './AssistantPhoto';
import { ModelPicker } from './ModelPicker';
import { PreviewActions, PreviewHint } from './PreviewActions';
import { EMPTY_PREVIEW_STATE, type PreviewState, type PreviewStore } from './preview-store';
import actionStyles from './PreviewActions.module.css';
import styles from './AssistantPanel.module.css';
import { useStoreValue } from '../shared/use-store-value';

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

// D-Panel: the stale line's action clears the preview and puts its prompt back in the box; nothing is sent.
export function putPromptBack(
  session: Pick<AssistantSession, 'setDraft'>,
  preview: Pick<PreviewStore, 'getState' | 'reject'>,
): void {
  const prompt = preview.getState().prompt;
  preview.reject();
  session.setDraft(prompt);
}

// V1; EZD-5604b V4
export function AssistantPanel({
  session,
  preview = null,
}: {
  session: AssistantSession;
  preview?: PreviewStore | null;
}) {
  const ui = useSyncExternalStore(session.subscribe, session.getUi, session.getUi);
  // EZD-5605: Adjust and Accept for the preview, made by the session with it.
  const controls = session.getControls();
  const adjusting = useStoreValue(controls?.adjust, (a) => a.getUi().adjusting, false);
  const busy = useStoreValue(controls?.accept, (a) => a.getUi().busy, false);
  const previewState = useStoreValue(preview, (p) => p.getState(), EMPTY_PREVIEW_STATE);
  return (
    <>
      <AssistantPanelView
        ui={ui}
        preview={
          preview === null
            ? undefined
            : {
                state: previewState,
                onReject: () => preview.reject(),
                onStaleAction: () => putPromptBack(session, preview),
                actions:
                  controls === null
                    ? undefined
                    : {
                        onAccept: () => void controls.accept.accept(),
                        onAdjust: () => void controls.adjust.start(),
                        adjusting,
                        busy,
                      },
              }
        }
        onClose={() => session.setOpen(false)}
        onDraft={session.setDraft}
        onModel={session.setModel}
        onSend={() => void session.send()}
        onOpenProfile={session.openProfile}
        onRetryKey={() => void session.refreshKey()}
        onAttachPhoto={(file) => void session.attachPhoto(file)}
        onRemovePhoto={session.removePhoto}
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
  // EZD-5603b V4
  onAttachPhoto(file: File): void;
  onRemovePhoto(): void;
  // EZD-5604b V3
  preview?: PanelPreview;
};

export type PanelPreview = {
  state: PreviewState;
  onReject(): void;
  onStaleAction(): void;
  actions?: { onAccept?: () => void; onAdjust?: () => void; adjusting?: boolean; busy?: boolean };
};

function ErrorBox({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div role="alert" className={styles.alert} data-testid={testId}>
      <span className={styles.alertIcon}>
        <Icon name="error" size={20} />
      </span>
      <span className={styles.alertBody}>{children}</span>
    </div>
  );
}

function ReplyPreview({
  entryId,
  refused,
  preview,
}: {
  entryId: number;
  refused: boolean;
  preview?: PanelPreview;
}) {
  const t = useT();
  if (refused) {
    return (
      <ErrorBox testId="assistant-refused">
        <span>{t('office.assistant.reply_refused')}</span>
      </ErrorBox>
    );
  }
  if (
    preview === undefined ||
    preview.state.preview === null ||
    preview.state.entryId !== entryId
  ) {
    return null;
  }
  if (preview.state.stale) {
    return (
      <ErrorBox testId="assistant-preview-stale">
        <span>{t('office.assistant.preview_stale')}</span>
        <button
          type="button"
          className={`${actionStyles.button} ${touch.target}`}
          data-testid="assistant-stale-action"
          onClick={preview.onStaleAction}
        >
          {t('office.assistant.preview_stale_action')}
        </button>
      </ErrorBox>
    );
  }
  return (
    <>
      <PreviewActions onReject={preview.onReject} {...preview.actions} />
      <PreviewHint />
    </>
  );
}

function Entry({
  entry,
  onOpenProfile,
  preview,
}: {
  entry: AssistantEntry;
  onOpenProfile(): void;
  preview?: PanelPreview;
}) {
  const t = useT();
  const costLine = (cost: number, session: number) => (
    <div className={styles.cost} data-testid="assistant-cost">
      {t('office.assistant.cost_line', { prompt: formatUsd(cost), session: formatUsd(session) })}
    </div>
  );
  return (
    <div className={styles.entry}>
      {entry.photoUrl !== undefined ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob: URL of the sent photo, made in the browser
        <img
          className={styles.bubblePhoto}
          src={entry.photoUrl}
          alt={t('office.assistant.photo_alt')}
          data-testid="assistant-bubble-photo"
        />
      ) : null}
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
          <ReplyPreview entryId={entry.id} refused={entry.refused === true} preview={preview} />
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
  onAttachPhoto,
  onRemovePhoto,
  preview,
}: AssistantPanelViewProps) {
  const t = useT();
  const conversationRef = useRef<HTMLDivElement>(null);
  const noKey = ui.keyState === 'none';
  // D-Panel: while a preview is open (stale or not) no prompt can be written or sent (AC-EZD-5604-5).
  const locked = preview !== undefined && preview.state.preview !== null;

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
      <Entry key={e.id} entry={e} onOpenProfile={onOpenProfile} preview={preview} />
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
        {ui.photoProblem !== null ? <PhotoProblemBox problem={ui.photoProblem} /> : null}
        <div className={styles.composer}>
          <PhotoThumb
            photo={ui.photo}
            preparing={ui.photoPreparing}
            removeDisabled={photoRemoveDisabled(ui)}
            onRemove={onRemovePhoto}
          />
          <label className={styles.promptLabel}>
            <span className={styles.srOnly}>{t('office.assistant.prompt_label')}</span>
            <textarea
              className={styles.textarea}
              rows={3}
              maxLength={ASSISTANT_PROMPT_MAX_CHARS}
              placeholder={t('office.assistant.placeholder')}
              value={ui.draft}
              disabled={noKey || locked}
              data-testid="assistant-prompt"
              onChange={(e) => onDraft(e.target.value)}
            />
          </label>
        </div>
        <div className={styles.promptRow}>
          <PhotoButton disabled={photoControlDisabled(ui) || locked} onPick={onAttachPhoto} />
          <ModelPicker model={ui.model} disabled={noKey || locked} onChange={onModel} />
          <span className={styles.spacer} />
          <button
            type="button"
            className={`${styles.send} ${touch.target}`}
            aria-label={t('office.assistant.send')}
            data-testid="assistant-send"
            disabled={noKey || locked || !canSendPrompt(ui)}
            onClick={onSend}
          >
            <Icon name="arrow_upward" size={18} />
          </button>
        </div>
        {ui.keyState === 'present' ? <PhotoNote /> : null}
      </div>
    </div>
  );
}
