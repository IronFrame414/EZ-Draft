'use client';
// EZD-134 (03b Architecture rule 12 "A device running an older version finishes draining its outbox and is then
// told to reload"; Q-0530; Q-0540): once an answer from a newer build marks this page outdated (version-fetch.ts),
// the prompt waits until none of this person's edits are queued on this device, then asks to reload. Saves keep
// EZD-299's own prompt. Without a signed-in actor nothing can be queued, so it shows at once.
import { useSyncExternalStore, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import { outdatedStore } from '../../lib/pwa/version-fetch';
import { Icon } from '../icon/Icon';
import { useOutboxActor, useQueuedCount } from '../outbox/OutboxDrain';
import { StateButton } from '../states/StateButton';
import styles from './DeviceNotices.module.css';

const serverOutdated = () => false;

export function useOutdated(): boolean {
  return useSyncExternalStore(outdatedStore.subscribe, outdatedStore.get, serverOutdated);
}

// True when the page is outdated and the outbox is known to be empty.
export function reloadDue(outdated: boolean, hasActor: boolean, queued: number | null): boolean {
  if (!outdated) return false;
  return !hasActor || queued === 0;
}

// EZD-2028 (Q-0907): the office prompt is English only (office.app.*); the field pack passes its own keys in the
// user's language (field.app.*).
export type ReloadKeys = { message: MessageKey; button: MessageKey };
export const OFFICE_RELOAD_KEYS: ReloadKeys = {
  message: 'office.app.reload_message',
  button: 'office.app.reload',
};
export const FIELD_RELOAD_KEYS: ReloadKeys = {
  message: 'field.app.reload_message',
  button: 'field.app.reload',
};

export function ReloadPromptView({
  onReload,
  keys = OFFICE_RELOAD_KEYS,
}: {
  onReload: () => void;
  keys?: ReloadKeys;
}): ReactElement {
  const t = useT();
  return (
    <div role="status" data-testid="app-reload-prompt" className={styles.reload}>
      <span className={styles.icon} aria-hidden="true">
        <Icon name="update" size={20} />
      </span>
      <span className={styles.reloadText}>{t(keys.message)}</span>
      <StateButton variant="primary" data-testid="app-reload" onClick={onReload}>
        {t(keys.button)}
      </StateButton>
    </div>
  );
}

const reloadPage = () => window.location.reload();

export function ReloadPrompt({ keys }: { keys?: ReloadKeys } = {}): ReactElement | null {
  const outdated = useOutdated();
  const actor = useOutboxActor();
  const queued = useQueuedCount(outdated && actor !== null);
  if (!reloadDue(outdated, actor !== null, queued)) return null;
  return <ReloadPromptView onReload={reloadPage} keys={keys} />;
}
