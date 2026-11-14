'use client';

// EZD-307 (S02 Layout, Controls, Data shown; board S02; phase-03 EZD-307): Import review of one import. Outside the
// editor shell (S02 Decisions): a header card with the wordmark, project name and source subtitle, the Upload /
// Review / Finish steps, Cancel import and Finish import; the detected items list (320 px); the canvas; the
// selected item inspector (336 px); the status bar (source, scan accuracy, input mode, zoom).
// The import is read from GET /api/projects/[id]/imports/[jobId] and read again every POLL_MS while detection
// runs, so the review opens by itself when detection finishes (AC-EZD-307-1). Review actions are later tickets:
// the mode switch, Accept N, Fix selected and Delete (EZD-308, EZD-309) are not shown until they are built
// (Q-0500 rule); Cancel import and Finish import show and stay disabled until EZD-313 builds them, Finish being
// disabled anyway while any item is unresolved (S02 Controls). The fuller Loading, Error and Empty states are
// EZD-314's; this screen shows a one-line message for each.
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { HeaderCard } from '../../components/shell/HeaderCard';
import { HeaderButton } from '../../components/shell/HeaderButton';
import { Wordmark } from '../../components/shell/Wordmark';
import { StatusBar, StatusItem } from '../../components/shell/StatusBar';
import headerStyles from '../../components/shell/EditorHeader.module.css';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import {
  itemLabel,
  itemTypeWord,
  reviewSummary,
  scanReads,
  sourceLine,
  toCheckItems,
  type ReviewFile,
  type ReviewItem,
} from '../../lib/imports/review';
import { ReviewCanvas } from './ReviewCanvas';
import { readMeshUrl } from './mesh-source';
import styles from './ImportReview.module.css';

export const POLL_MS = 1500;

export type ImportReviewData = {
  jobId: string;
  projectId: string;
  projectName: string;
  status: 'detecting' | 'ready' | 'failed';
  files: ReviewFile[];
  failedFile: string | null;
  items: ReviewItem[];
  meshUrl: string | null;
};

type Load =
  { kind: 'loading' } | { kind: 'not_found' } | { kind: 'loaded'; review: ImportReviewData };

export function ImportReview({
  projectId,
  jobId,
  fetchImpl,
  pollMs = POLL_MS,
}: {
  projectId: string;
  jobId: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
}): ReactElement {
  const t = useT();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const doFetch = fetchImpl ?? fetch;
    const tick = async () => {
      let again = true;
      try {
        const res = await doFetch(`/api/projects/${projectId}/imports/${jobId}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        });
        if (stopped) return;
        if (res.status === 404 || res.status === 403) {
          // Read the body so the request finishes (an unread body keeps it open).
          await res.text().catch(() => '');
          if (stopped) return;
          setLoad({ kind: 'not_found' });
          again = false;
        } else if (!res.ok) {
          await res.text().catch(() => '');
        } else {
          const body = (await res.json()) as { review: ImportReviewData };
          if (stopped) return;
          setLoad({ kind: 'loaded', review: body.review });
          again = body.review.status === 'detecting';
        }
      } catch {
        // A failed read is tried again on the next tick.
      }
      if (!stopped && again) timer = setTimeout(() => void tick(), pollMs);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, jobId, fetchImpl, pollMs]);

  const review = load.kind === 'loaded' ? load.review : null;
  const files = review?.files ?? [];

  return (
    <div
      className={styles.frame}
      data-testid="import-review"
      data-status={review?.status ?? load.kind}
    >
      <HeaderCard>
        <Wordmark href="/" />
        <span className={headerStyles.divider} aria-hidden="true" />
        <div className={headerStyles.titleBlock}>
          <span className={headerStyles.name} title={review?.projectName}>
            <span className={headerStyles.nameText} data-testid="import-review-project">
              {review?.projectName ?? ''}
            </span>
          </span>
          {files.length > 0 ? (
            <span className={headerStyles.subtitle} data-testid="import-review-subtitle">
              {t('office.review.subtitle', { files: files.map((f) => f.name).join(' + ') })}
            </span>
          ) : null}
        </div>
        <ol className={styles.steps} aria-label={t('office.review.steps')}>
          <li className={styles.stepDone} data-step="upload" data-state="done">
            <Icon name="check_circle" size={18} />
            {t('office.review.step_upload')}
          </li>
          <li className={styles.stepLine} aria-hidden="true" />
          <li
            className={styles.stepCurrent}
            data-step="review"
            data-state="current"
            aria-current="step"
          >
            <span className={styles.stepNumber}>2</span>
            {t('office.review.step_review')}
          </li>
          <li className={styles.stepLine} aria-hidden="true" />
          <li className={styles.stepPending} data-step="finish" data-state="pending">
            <span className={styles.stepNumber}>3</span>
            {t('office.review.step_finish')}
          </li>
        </ol>
        <div className={styles.headerActions}>
          <HeaderButton data-testid="import-review-cancel" disabled>
            {t('office.review.cancel')}
          </HeaderButton>
          <HeaderButton variant="primary" data-testid="import-review-finish" disabled>
            {t('office.review.finish')}
          </HeaderButton>
        </div>
      </HeaderCard>
      {review?.status === 'ready' ? (
        <ReadyBody review={review} />
      ) : (
        <>
          <div className={styles.message} data-testid="import-review-message" role="status">
            {load.kind === 'not_found'
              ? t('office.review.not_found')
              : review?.status === 'failed'
                ? t('office.review.failed', { name: review.failedFile ?? '' })
                : t('office.review.detecting')}
          </div>
          <StatusBar />
        </>
      )}
    </div>
  );
}

export function ReadyBody({ review }: { review: ImportReviewData }): ReactElement {
  const t = useT();
  const { items } = review;
  const summary = useMemo(() => reviewSummary(items), [items]);
  const toCheck = useMemo(() => toCheckItems(items), [items]);
  const [selectedId, setSelectedId] = useState<string | null>(() => toCheck[0]?.id ?? null);
  const [zoom, setZoom] = useState(100);
  const onZoom = useCallback((percent: number) => setZoom(percent), []);
  const freshMeshUrl = useCallback(
    () => readMeshUrl(review.projectId, review.jobId),
    [review.projectId, review.jobId],
  );
  const selected = items.find((i) => i.id === selectedId) ?? null;

  if (items.length === 0) {
    return (
      <>
        <div className={styles.message} data-testid="import-review-message" role="status">
          {t('office.review.empty')}
        </div>
        <StatusBar />
      </>
    );
  }

  const a = summary.accepted;
  return (
    <>
      <div className={styles.body}>
        <aside className={styles.left} aria-label={t('office.review.left_panel')}>
          <div className={styles.leftHead}>
            <h1 className={styles.title}>{t('office.review.title')}</h1>
            <p className={styles.summary} data-testid="import-review-summary">
              {t('office.review.summary', {
                found: summary.found,
                high: summary.highConfidence,
                toCheck: summary.toCheck,
              })}
            </p>
          </div>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>{t('office.review.to_check')}</h2>
            {toCheck.length === 0 ? (
              <p className={styles.muted}>{t('office.review.to_check_empty')}</p>
            ) : (
              <ul className={styles.list}>
                {toCheck.map((item) => {
                  const on = item.id === selectedId;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={on ? `${styles.row} ${styles.rowSelected}` : styles.row}
                        aria-pressed={on}
                        data-testid="import-review-row"
                        data-id={item.id}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span
                          className={`${styles.dot} ${on ? styles.dotSelected : styles.dotToCheck}`}
                        />
                        <span className={styles.rowLabel}>{itemLabel(item, items)}</span>
                        <span className={styles.rowPct}>{item.confidence}%</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className={styles.section} data-testid="import-review-accepted">
            <h2 className={styles.sectionTitle}>{t('office.review.accepted')}</h2>
            <p className={styles.counts}>
              <b data-count="walls">{a.walls}</b> {t('office.review.walls')} ·{' '}
              <b data-count="windows">{a.windows}</b> {t('office.review.windows')} ·{' '}
              <b data-count="doors">{a.doors}</b> {t('office.review.doors')}
            </p>
            <p className={styles.counts}>
              <b data-count="rooms">{a.rooms}</b> {t('office.review.rooms')} ·{' '}
              <b data-count="fixtures">{a.fixtures}</b> {t('office.review.fixtures')}
            </p>
          </div>
        </aside>
        <main className={styles.canvasCard}>
          <ReviewCanvas
            items={items}
            selectedId={selectedId}
            meshUrl={review.meshUrl}
            freshMeshUrl={freshMeshUrl}
            onZoom={onZoom}
          />
        </main>
        <aside
          className={styles.inspector}
          aria-label={t('office.review.inspector')}
          data-testid="import-review-inspector"
        >
          {selected ? (
            <div className={styles.inspectorHead}>
              <h2 className={styles.itemName}>{itemLabel(selected, items)}</h2>
              <p className={styles.muted}>
                {t('office.review.item_meta', {
                  type: itemTypeWord(selected),
                  confidence: selected.confidence,
                })}
              </p>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('office.review.scan_reads')}</span>
                <span className={styles.scanValue} data-testid="import-review-scan">
                  {scanReads(selected)}
                </span>
              </div>
            </div>
          ) : (
            <p className={`${styles.inspectorHead} ${styles.muted}`}>
              {t('office.review.no_selection')}
            </p>
          )}
          <p className={styles.tolerance}>{t('office.review.tolerance')}</p>
        </aside>
      </div>
      <StatusBar
        start={
          <>
            <StatusItem label="office.review.status_source">{sourceLine(review.files)}</StatusItem>
            <StatusItem label="office.review.status_accuracy">
              {t('office.review.status_accuracy_value')}
            </StatusItem>
            <StatusItem label="office.review.status_input">
              {t('office.review.status_input_value')}
            </StatusItem>
          </>
        }
        end={
          <span data-testid="import-review-zoom">
            {t('office.review.status_zoom', { percent: zoom })}
          </span>
        }
      />
    </>
  );
}
