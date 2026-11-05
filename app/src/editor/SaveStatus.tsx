'use client';
// EZD-120c Build step 5 (vault/plans/EZD-120c.md section 3; Decided "Ticking", "Failed banner"; S03 States;
// 11 rule 4): the header's save word and the save-failed banner, both read from the autosave sync. The word
// re-renders once when it next changes (one timeout), never on a steady tick.
import { useEffect, useState, type ReactElement } from 'react';
import { useStore } from 'zustand';
import { InlineError } from '../components/states/InlineError';
import { useT } from '../lib/messages';
import type { OutboxSync } from '../lib/outbox/outbox-sync';
import { nextSaveWordChangeMs, saveWord } from './save-state';

export function SaveStateText({ sync }: { sync: OutboxSync }): ReactElement {
  const t = useT();
  const status = useStore(sync, (s) => s.status);
  const lastSavedAt = useStore(sync, (s) => s.lastSavedAt);
  // The clock as of the last re-render the timeout asked for; a save newer than it reads as just now.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const wait = nextSaveWordChangeMs({ status, lastSavedAt }, Date.now());
    if (wait === null) return;
    const handle = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(handle);
  }, [status, lastSavedAt, now]);

  const word = saveWord({ status, lastSavedAt }, now);
  return (
    <span data-testid="save-state" data-save-status={status}>
      {t(`office.editor.${word.key}`, word.params)}
    </span>
  );
}

export function SaveFailedBanner({ sync }: { sync: OutboxSync }): ReactElement | null {
  const status = useStore(sync, (s) => s.status);
  if (status !== 'error') return null;
  return (
    <div data-testid="save-failed-banner">
      <InlineError message="office.editor.save_failed" onRetry={() => sync.retry()} />
    </div>
  );
}
