'use client';

import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { useT } from '../../../lib/messages';
import {
  AsyncView,
  InlineError,
  OfflineBanner,
  Skeleton,
  SkeletonGroup,
  useConfirm,
  useToast,
} from '../../../components/states';
import styles from './page.module.css';

const subscribeNothing = () => () => {};

export function StatesDemo() {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const ready = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [runKey, setRunKey] = useState(0);
  const [loadCount, setLoadCount] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [confirmResult, setConfirmResult] = useState('');
  const deferredRef = useRef<{ resolve: (v: string) => void; reject: (e: unknown) => void } | null>(
    null,
  );

  const load = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        deferredRef.current = { resolve, reject };
        setLoadCount((c) => c + 1);
      }),
    [],
  );

  async function openConfirm() {
    setConfirmResult('pending');
    setConfirmResult(
      await confirm({
        title: 'dev.states.confirm_title',
        message: 'dev.states.confirm_message',
        confirmLabel: 'dev.states.confirm_ok',
        tone: 'danger',
      }),
    );
  }

  return (
    <main className={styles.page} data-testid="states-demo" data-ready={ready ? 'true' : undefined}>
      <section
        className={styles.section}
        data-testid="async-section"
        data-load-count={String(loadCount)}
      >
        <h2 className={styles.heading}>Async view</h2>
        <div className={styles.controls}>
          <button type="button" data-testid="load-start" onClick={() => setRunKey((k) => k + 1)}>
            Start
          </button>
          <button
            type="button"
            data-testid="load-resolve"
            onClick={() => {
              deferredRef.current?.resolve('ok');
              deferredRef.current = null;
            }}
          >
            Resolve
          </button>
          <button
            type="button"
            data-testid="load-reject"
            onClick={() => {
              deferredRef.current?.reject(new Error('sample'));
              deferredRef.current = null;
            }}
          >
            Reject
          </button>
        </div>
        {runKey > 0 ? (
          <AsyncView
            key={runKey}
            load={load}
            skeleton={
              <SkeletonGroup count={6}>
                <Skeleton height="40px" />
              </SkeletonGroup>
            }
            errorMessage="dev.states.sample_error"
          >
            {() => <p data-testid="loaded">{t('dev.states.loaded')}</p>}
          </AsyncView>
        ) : null}
      </section>
      <section className={styles.section} data-testid="retry-section">
        <h2 className={styles.heading}>Inline error</h2>
        <div className={styles.controls}>
          <InlineError
            message="dev.states.sample_error"
            onRetry={() => setRetryCount((c) => c + 1)}
          />
          <output data-testid="retry-count">{retryCount}</output>
        </div>
      </section>
      <section className={styles.section} data-testid="offline-section">
        <h2 className={styles.heading}>Offline banner</h2>
        <div className={styles.controls}>
          <OfflineBanner />
        </div>
      </section>
      <section className={styles.section} data-testid="toast-section">
        <h2 className={styles.heading}>Toast</h2>
        <div className={styles.controls}>
          <button
            type="button"
            data-testid="toast-show"
            onClick={() => toast.show({ message: 'dev.states.sample_toast', duration: 1500 })}
          >
            Show toast
          </button>
          <button
            type="button"
            data-testid="toast-show-persistent"
            onClick={() => toast.show({ message: 'dev.states.sample_toast', duration: null })}
          >
            Show persistent toast
          </button>
        </div>
      </section>
      <section className={styles.section} data-testid="confirm-section">
        <h2 className={styles.heading}>Confirm dialog</h2>
        <div className={styles.controls}>
          <button type="button" data-testid="confirm-open" onClick={() => void openConfirm()}>
            Open confirm
          </button>
          <output data-testid="confirm-result">{confirmResult}</output>
        </div>
      </section>
    </main>
  );
}
