'use client';

// EZD-307 (S02 Layout, Controls, Data shown; board S02; phase-03 EZD-307): Import review of one import. Outside the
// editor shell (S02 Decisions): a header card with the wordmark, project name and source subtitle, the Upload /
// Review / Finish steps, Cancel import and Finish import; the detected items list (320 px); the canvas; the
// selected item inspector (336 px); the status bar (source, scan accuracy, input mode, zoom).
// The import is read from GET /api/projects/[id]/imports/[jobId] and read again every POLL_MS while detection
// runs, so the review opens by itself when detection finishes (AC-EZD-307-1). EZD-308 adds the review modes (S02
// Controls Mode): One by one (every item in order, Accept / Reject this item, Previous / Next), Accept + fix (the
// To check list and Accept N), By room (items grouped by detected room, Accept room); Accept N accepts only items
// at or above the company's high-confidence cutoff (AC-EZD-308-1; S02 Decisions). Decisions and the mode live in
// this page; EZD-309 saves them per item. Fix selected and Delete (EZD-309) are not shown until they are built
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
  acceptHighConfidence,
  decide,
  DEFAULT_REVIEW_MODE,
  firstUnresolved,
  isHighConfidence,
  itemLabel,
  itemTypeWord,
  pendingHighConfidence,
  REVIEW_MODES,
  reviewSummary,
  roomGroups,
  scanReads,
  sourceLine,
  stepItem,
  toCheckItems,
  type Decision,
  type Decisions,
  type ReviewFile,
  type ReviewItem,
  type ReviewMode,
} from '../../lib/imports/review';
import type { MessageKey } from '../../server/messages/catalog';
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
  /** The company's high-confidence cutoff (%), from Defaults (server/imports/review.ts). */
  cutoff: number;
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

const MODE_LABEL: Record<ReviewMode, MessageKey> = {
  one_by_one: 'office.review.mode_one_by_one',
  accept_fix: 'office.review.mode_accept_fix',
  by_room: 'office.review.mode_by_room',
};

type RowDot = 'selected' | 'accepted' | 'rejected' | 'to_check';

function rowDot(item: ReviewItem, selectedId: string | null, decisions: Decisions): RowDot {
  if (item.id === selectedId) return 'selected';
  return decisions[item.id] ?? 'to_check';
}

function ItemRow({
  item,
  items,
  dot,
  selected,
  decision,
  onSelect,
}: {
  item: ReviewItem;
  items: readonly ReviewItem[];
  dot: RowDot;
  selected: boolean;
  decision: Decision | undefined;
  onSelect: (id: string) => void;
}): ReactElement {
  const dotClass =
    dot === 'selected'
      ? styles.dotSelected
      : dot === 'accepted'
        ? styles.dotAccepted
        : dot === 'rejected'
          ? styles.dotRejected
          : styles.dotToCheck;
  return (
    <li>
      <button
        type="button"
        className={selected ? `${styles.row} ${styles.rowSelected}` : styles.row}
        aria-pressed={selected}
        data-testid="import-review-row"
        data-id={item.id}
        data-decision={decision ?? 'none'}
        onClick={() => onSelect(item.id)}
      >
        <span className={`${styles.dot} ${dotClass}`} />
        <span className={decision === 'rejected' ? `${styles.rowLabel} ${styles.rowRejected}` : styles.rowLabel}>
          {itemLabel(item, items)}
        </span>
        <span className={styles.rowPct}>{item.confidence}%</span>
      </button>
    </li>
  );
}

export function ReadyBody({
  review,
  initialMode = DEFAULT_REVIEW_MODE,
}: {
  review: ImportReviewData;
  initialMode?: ReviewMode;
}): ReactElement {
  const t = useT();
  const { items, cutoff } = review;
  const [mode, setMode] = useState<ReviewMode>(initialMode);
  const [decisions, setDecisions] = useState<Decisions>({});
  const summary = useMemo(() => reviewSummary(items, cutoff, decisions), [items, cutoff, decisions]);
  const toCheck = useMemo(() => toCheckItems(items, cutoff, decisions), [items, cutoff, decisions]);
  const pending = useMemo(
    () => pendingHighConfidence(items, cutoff, decisions),
    [items, cutoff, decisions],
  );
  const groups = useMemo(() => roomGroups(items), [items]);
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialMode === 'one_by_one'
      ? firstUnresolved(items, {})
      : (toCheckItems(items, cutoff)[0]?.id ?? null),
  );
  const [zoom, setZoom] = useState(100);
  const onZoom = useCallback((percent: number) => setZoom(percent), []);
  const freshMeshUrl = useCallback(
    () => readMeshUrl(review.projectId, review.jobId),
    [review.projectId, review.jobId],
  );
  const selected = items.find((i) => i.id === selectedId) ?? null;

  const chooseMode = (next: ReviewMode) => {
    if (next === 'one_by_one' && next !== mode) setSelectedId(firstUnresolved(items, decisions));
    setMode(next);
  };
  const acceptAll = () => setDecisions((d) => acceptHighConfidence(items, cutoff, d));
  const acceptGroup = (group: readonly ReviewItem[]) =>
    setDecisions((d) => acceptHighConfidence(group, cutoff, d));
  const decideSelected = (decision: Decision) => {
    if (!selected) return;
    setDecisions((d) => decide(d, selected.id, decision));
    setSelectedId(stepItem(items, selected.id, 1));
  };

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
  const position = selected ? items.findIndex((i) => i.id === selected.id) + 1 : 0;
  const row = (item: ReviewItem) => (
    <ItemRow
      key={item.id}
      item={item}
      items={items}
      dot={rowDot(item, selectedId, decisions)}
      selected={item.id === selectedId}
      decision={decisions[item.id]}
      onSelect={setSelectedId}
    />
  );
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
            <div
              className={styles.modes}
              role="group"
              aria-label={t('office.review.modes')}
              data-testid="import-review-modes"
              data-mode={mode}
            >
              {REVIEW_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={m === mode ? `${styles.mode} ${styles.modeOn}` : styles.mode}
                  aria-pressed={m === mode}
                  data-testid="import-review-mode"
                  data-mode={m}
                  onClick={() => chooseMode(m)}
                >
                  {t(MODE_LABEL[m])}
                </button>
              ))}
            </div>
          </div>
          {mode === 'accept_fix' ? (
            <div className={styles.section} data-testid="import-review-to-check">
              <h2 className={styles.sectionTitle}>{t('office.review.to_check')}</h2>
              {toCheck.length === 0 ? (
                <p className={styles.muted}>{t('office.review.to_check_empty')}</p>
              ) : (
                <ul className={styles.list}>{toCheck.map(row)}</ul>
              )}
            </div>
          ) : null}
          {mode === 'one_by_one' ? (
            <div className={styles.section} data-testid="import-review-all">
              <h2 className={styles.sectionTitle}>{t('office.review.all_items')}</h2>
              <ul className={styles.list}>{items.map(row)}</ul>
            </div>
          ) : null}
          {mode === 'by_room'
            ? groups.map((g) => {
                const groupPending = g.items.filter(
                  (i) => isHighConfidence(i, cutoff) && decisions[i.id] === undefined,
                ).length;
                return (
                  <div
                    key={g.room?.id ?? 'none'}
                    className={styles.section}
                    data-testid="import-review-room"
                    data-room={g.room?.id ?? 'none'}
                  >
                    <div className={styles.groupHead}>
                      <h2 className={styles.sectionTitle}>
                        {g.room ? itemLabel(g.room, items) : t('office.review.no_room')}
                      </h2>
                      <button
                        type="button"
                        className={styles.groupAccept}
                        data-testid="import-review-accept-room"
                        disabled={groupPending === 0}
                        onClick={() => acceptGroup(g.items)}
                      >
                        {t('office.review.accept_room')}
                      </button>
                    </div>
                    <ul className={styles.list}>{g.items.map(row)}</ul>
                  </div>
                );
              })
            : null}
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
          <div className={styles.leftFoot}>
            <HeaderButton
              variant="primary"
              className={styles.acceptN}
              data-testid="import-review-accept-n"
              data-count={pending.length}
              disabled={pending.length === 0}
              onClick={acceptAll}
            >
              {t('office.review.accept_n', { count: pending.length })}
            </HeaderButton>
          </div>
        </aside>
        <main className={styles.canvasCard}>
          <ReviewCanvas
            items={items}
            selectedId={selectedId}
            cutoff={cutoff}
            decisions={decisions}
            meshUrl={review.meshUrl}
            freshMeshUrl={freshMeshUrl}
            onZoom={onZoom}
          />
        </main>
        <aside
          className={styles.inspector}
          aria-label={t('office.review.inspector')}
          data-testid="import-review-inspector"
          data-decision={selected ? (decisions[selected.id] ?? 'none') : undefined}
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
              {decisions[selected.id] ? (
                <p className={styles.decision} data-testid="import-review-decision">
                  {t(
                    decisions[selected.id] === 'accepted'
                      ? 'office.review.decision_accepted'
                      : 'office.review.decision_rejected',
                  )}
                </p>
              ) : null}
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
          {mode === 'one_by_one' ? (
            <div className={styles.inspectorFoot} data-testid="import-review-step">
              <div className={styles.stepper}>
                <HeaderButton
                  data-testid="import-review-previous"
                  disabled={position <= 1}
                  onClick={() => setSelectedId(stepItem(items, selectedId, -1))}
                >
                  {t('office.review.previous')}
                </HeaderButton>
                <span className={styles.muted} data-testid="import-review-position">
                  {t('office.review.position', { index: position, total: items.length })}
                </span>
                <HeaderButton
                  data-testid="import-review-next"
                  disabled={position >= items.length}
                  onClick={() => setSelectedId(stepItem(items, selectedId, 1))}
                >
                  {t('office.review.next')}
                </HeaderButton>
              </div>
              <div className={styles.stepper}>
                <HeaderButton
                  data-testid="import-review-reject"
                  disabled={!selected}
                  onClick={() => decideSelected('rejected')}
                >
                  {t('office.review.reject_item')}
                </HeaderButton>
                <HeaderButton
                  variant="primary"
                  data-testid="import-review-accept"
                  disabled={!selected}
                  onClick={() => decideSelected('accepted')}
                >
                  {t('office.review.accept_item')}
                </HeaderButton>
              </div>
            </div>
          ) : null}
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
