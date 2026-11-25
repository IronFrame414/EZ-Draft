'use client';
// EZD-1401 (S17 Offline status icon; 11 Offline; vault/build/assumptions.md EZD-1401): the header's offline icon
// for the open project: green offline_pin once the project is on this device, a spinner while it is being stored,
// amber with the count while offline with changes queued. It reads the project cache's state, the page copy the
// worker stores (checked again when the worker says its warm work is done, and when the network comes or goes),
// and this project's queued count (read again when the autosave changes or the network comes or goes). No timer.
// EZD-1404: moved here from app/src/editor/ (which re-exports it) so the phone field pack may use it, with its labels in the field namespace (English and Spanish) and its
// queued field actions.
import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Icon } from '../icon/Icon';
import { useT } from '../../lib/messages';
import { useOnline } from '../../lib/network/online';
import { offlineIcon } from '../../lib/pwa/offline-icon';
import { pageStored, type ProjectCache } from '../../lib/pwa/project-cache';
import { WARM_MESSAGE } from '../../lib/pwa/sw-constants.mjs';
import styles from './OfflineStatusIcon.module.css';

export function OfflineStatusIcon({
  cache,
  projectId,
  queued,
  sync,
  labels = 'office',
}: {
  cache: ProjectCache;
  projectId: string;
  queued: () => Promise<ReadonlyArray<{ projectId: string }>>;
  // Told when the queue changes.
  sync: { subscribe(listener: () => void): () => void } | null;
  labels?: 'office' | 'field';
}): ReactElement | null {
  const t = useT();
  const online = useOnline();
  const model = useSyncExternalStore(cache.subscribe, cache.get, cache.get);
  const [page, setPage] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (model !== 'stored') return;
    let live = true;
    const check = () =>
      void pageStored(window.location.href).then((has) => {
        if (live) setPage(has);
      });
    check();
    const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: unknown; done?: unknown } | null;
      if (data && data.type === WARM_MESSAGE && data.done === true) check();
    };
    sw?.addEventListener('message', onMessage);
    return () => {
      live = false;
      sw?.removeEventListener('message', onMessage);
    };
  }, [model, online]);

  useEffect(() => {
    let live = true;
    const read = () =>
      void queued().then(
        (entries) => {
          if (live) setCount(entries.filter((e) => e.projectId === projectId).length);
        },
        () => undefined,
      );
    read();
    const off = sync?.subscribe(read);
    return () => {
      live = false;
      off?.();
    };
  }, [queued, projectId, sync, online]);

  const icon = offlineIcon({ online, model, page, queued: count });
  if (icon === null) return null;
  const label =
    icon.kind === 'queued'
      ? t(`${labels}.offline_icon.queued`, { n: icon.count })
      : t(`${labels}.offline_icon.${icon.kind}`);
  return (
    <span
      className={`${styles.icon} ${styles[icon.kind] ?? ''}`}
      role="img"
      aria-label={label}
      title={label}
      data-testid="offline-icon"
      data-state={icon.kind}
    >
      {icon.kind === 'caching' ? (
        <span className={styles.spinner} />
      ) : (
        <Icon
          name={icon.kind === 'cached' ? 'offline_pin' : 'cloud_off'}
          size={icon.kind === 'cached' ? 18 : 16}
        />
      )}
      {icon.kind === 'queued' ? <span className={styles.count}>{icon.count}</span> : null}
    </span>
  );
}
