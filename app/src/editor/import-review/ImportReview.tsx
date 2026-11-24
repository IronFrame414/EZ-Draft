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
// (Q-0500 rule); Finish import is disabled while any item is unresolved (S02 Controls; EZD-313 builds both). The fuller Loading, Error and Empty states are
// EZD-314's; this screen shows a one-line message for each.
// EZD-309 (S02 Controls Fix selected, Delete, Click item on canvas, Hover item, Esc, Ctrl/Cmd+Z; phase-03 EZD-309
// "each review action is saved as a per-item change, batched every 2 seconds"; Q-0215; AC-EZD-309-1, -2): the
// review state (decisions and fixes) starts from what the import has saved and has a session undo / redo history.
// Fix selected turns Fix mode on for the selected item (drag its ends on the canvas; a drag accepts it with its
// fix); Delete rejects it (it does not become model data). Each action, undo and redo marks the items it changed
// and the review saver sends them every 2 seconds (and at once when the page hides), so a reload restores them.
// EZD-311 (S02 Controls Pick the wall that absorbs it, Keep the room out of square, Esc; States "Room not closed: red
// gap marker and inspector section Resolve the gap"; Validation and Decisions "Finish import blocked while ... any
// room has an unresolved gap"; Q-0630; AC-EZD-311-1): selecting a room that no longer closes, one of its walls, or
// its red gap marker shows Resolve the gap (the Plan editor's section, editor/inspector/ResolveGap.tsx). Pick enters
// pick mode: a click on a wall of that room gives it the length that closes the room (any other click is refused
// with the Plan editor's wording); Esc returns to the section. Keep saves the gap the room is kept on. Both are
// review actions (undo, redo, saved). The header's Finish import carries whether it is blocked (data-blocked).
// EZD-313 (S02 Controls Cancel import "Asks to confirm, then discards detected items", Finish import "Writes accepted
// items to the model as a new model version; opens 03 Plan ... Disabled while any item is unresolved"; Decisions
// "opens 03 Plan with a short notice of the counts imported"; Q-0215 "Cancel returns to the project with nothing
// imported"): Finish import is enabled once the review is ready and nothing blocks it. It first sends what the save
// queue still holds, then POSTs finish and opens Plan with the counts (?imported=walls.windows.doors.rooms, shown
// by editor/plan/ImportedNotice.tsx). Cancel import asks to confirm, POSTs cancel and returns to the project. A
// refusal shows its message under the header. A finished or cancelled import shows a closed message.
// EZD-312 (S02 Decisions "Ceiling slope items are fixed in the inspector with the same three inputs as Round 1";
// AC-EZD-312-1): a selected ceiling slope shows its three inputs (CeilingSlope.tsx); each fix is a review action.
// EZD-314 (S02 States Loading "progress with item count so far", Error "message with file name and Retry; Cancel
// import stays available", Locked / view-only "all edit controls disabled; lock banner shows who and since when,
// with Request edit", Permission-denied "read-only with a note"; Validation "Bearing walls detected or marked:
// flagged"; AC-EZD-314-1 to -4, -6): detecting shows the items found so far; a failed import shows the file and
// Retry, which puts the import back on the queue and reads it again until detection ends; while another user holds
// the edit lock the editor's lock banner shows with Request edit (review-lock.ts); without Edit model the note
// shows. Either way the review is read-only: every review action, Finish import and Cancel import are disabled and
// nothing is saved. A wall the import read as bearing carries a Bearing flag in its row and in the inspector.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ConfirmDialog } from '../../components/states/ConfirmDialog';
import type { ConfirmChoice, ConfirmRequest } from '../../components/states/confirm-controller';
import { HeaderCard } from '../../components/shell/HeaderCard';
import { HeaderButton } from '../../components/shell/HeaderButton';
import { Wordmark } from '../../components/shell/Wordmark';
import { StatusBar, StatusItem } from '../../components/shell/StatusBar';
import headerStyles from '../../components/shell/EditorHeader.module.css';
import buttonStyles from '../../components/shell/HeaderButton.module.css';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import {
  acceptHighConfidence,
  cabinetCheckLines,
  cabinetSizeText,
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
  type Pt,
  type ReviewCabinet,
  type ReviewFile,
  type ReviewItem,
  type ReviewMode,
} from '../../lib/imports/review';
import {
  changedIds,
  changeFor,
  commit,
  fixedItems,
  historyOf,
  redo,
  undo,
  withDecision,
  withDecisions,
  withFix,
  type Fixes,
  type History,
  type ItemFix,
  type ReviewState,
} from '../../lib/imports/review-fix';
import type { MessageKey } from '../../server/messages/catalog';
import { createReviewSaver, patchSender, type ReviewSaver } from './review-saver';
import { ReviewCanvas } from './ReviewCanvas';
import { readMeshCeiling, readMeshUrl } from './mesh-source';
import { CeilingSlopeFields } from './CeilingSlope';
import type { CeilingSlopeFix } from '../../lib/imports/ceiling-slope';
import type { CeilingReading } from '../../lib/imports/polycam-glb/ceiling';
import styles from './ImportReview.module.css';
import {
  isOverTolerance,
  itemConflicts,
  reviewTolerance,
  absorbGap,
  finishBlocked,
  gapForSelection,
  keepFix,
  openGaps,
  typedFix,
  typedOf,
  type AbsorbRefusal,
  type Conflict,
  type OpenGap,
} from '../../lib/imports/review-conflicts';
import { ResolveGap } from '../inspector/ResolveGap';
import { importedQuery, type ImportedCounts } from '../plan/imported';
import { gapSizeText, type GapBox } from '../tools/gap';
import { useCoarsePointer } from '../../lib/device/useDeviceLayout';
import { amount, ConflictList, TypedField } from './TypedConflicts';
import { LockBanner } from '../lock-ui/LockUi';
import { useOnline } from '../../lib/network';
import { useReviewLock } from './review-lock';

export const POLL_MS = 1500;

export type ImportReviewData = {
  jobId: string;
  projectId: string;
  projectName: string;
  status: 'detecting' | 'ready' | 'failed' | 'finished' | 'cancelled';
  files: ReviewFile[];
  failedFile: string | null;
  items: ReviewItem[];
  meshUrl: string | null;
  /** The company's high-confidence cutoff (%), from Defaults (server/imports/review.ts). */
  cutoff: number;
  /** EZD-310: the typed-vs-scan tolerance (in), from Defaults; 1/2" when missing. */
  tolerance?: number;
  /** What the import has saved (EZD-309); missing in data from before it. */
  decisions?: Decisions;
  fixes?: Fixes;
  mode?: ReviewMode;
  /** EZD-314: items found so far while detecting. */
  detectedCount?: number;
  /** EZD-314: the viewer has Edit model on this project (missing: true, as before EZD-314). */
  canEdit?: boolean;
  /** EZD-314: the viewer's app user id, to tell a lock another user holds. */
  viewerId?: string;
};

type Load =
  { kind: 'loading' } | { kind: 'not_found' } | { kind: 'loaded'; review: ImportReviewData };

/** EZD-313: what the header needs from the review's save queue. */
export type ReviewControl = { flush(): Promise<boolean>; dispose(): void };

const CLOSE_REFUSALS: readonly MessageKey[] = [
  'error.import_not_found',
  'error.import_not_ready',
  'error.import_unresolved',
  'error.import_closed',
  'error.import_not_failed',
  'error.lock_held',
  'error.not_authorized',
  'error.invalid_input',
];

const CANCEL_REQUEST: ConfirmRequest = {
  id: 1,
  title: 'office.review.cancel_title',
  message: 'office.review.cancel_message',
  confirmLabel: 'office.review.cancel_confirm',
  cancelLabel: 'office.review.cancel_keep',
  tone: 'danger',
};

type Imported = ImportedCounts;

/** The Plan address Finish import opens: the project, with the counts imported for the notice. */
export const planAfterFinish = (projectId: string, c: Imported): string =>
  `/projects/${projectId}?imported=${importedQuery(c)}`;

async function refusalOf(
  res: Response,
  fallback: MessageKey = 'office.review.close_failed',
): Promise<MessageKey> {
  const body = (await res.json().catch(() => null)) as {
    error?: { message_key?: unknown };
  } | null;
  const key = body?.error?.message_key;
  return (CLOSE_REFUSALS as readonly unknown[]).includes(key) ? (key as MessageKey) : fallback;
}

export function ImportReview({
  projectId,
  jobId,
  fetchImpl,
  pollMs = POLL_MS,
  navigate = (url: string) => window.location.assign(url),
}: {
  projectId: string;
  jobId: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  /** EZD-313: opens Plan or the project after Finish or Cancel. */
  navigate?: (url: string) => void;
}): ReactElement {
  const t = useT();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // EZD-311: Finish import is blocked until every item and every room gap is resolved (ReadyBody reports it).
  const [blocked, setBlocked] = useState(true);
  // EZD-313: Finish and Cancel.
  const control = useRef<ReviewControl | null>(null);
  const setControl = useCallback((c: ReviewControl | null) => {
    control.current = c;
  }, []);
  const [busy, setBusy] = useState<'finish' | 'cancel' | null>(null);
  const [closeError, setCloseError] = useState<MessageKey | null>(null);
  const [confirming, setConfirming] = useState(false);
  // The dialog answers once per opening (its Action also closes it, which reports cancel after confirm).
  const answered = useRef(false);
  // EZD-314: each Retry that put the import back on the queue starts the reads again.
  const [reads, setReads] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<MessageKey | null>(null);

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
  }, [projectId, jobId, fetchImpl, pollMs, reads]);

  const review = load.kind === 'loaded' ? load.review : null;
  const files = review?.files ?? [];
  // EZD-1418: rooms sent from the phone (S02 Entry points "source kind field_measure").
  const fromFieldMeasure = files.length > 0 && files.every((f) => f.kind === 'field_measure');
  const closed = review?.status === 'finished' || review?.status === 'cancelled';
  const canEdit = review?.canEdit ?? true;
  const lock = useReviewLock({ projectId, viewerId: review?.viewerId, canEdit, fetchImpl });
  const offline = !useOnline();
  const readOnly = !canEdit || lock.locked;
  const finishDisabled = blocked || review?.status !== 'ready' || busy !== null || readOnly;
  const cancelDisabled = review === null || closed || busy !== null || readOnly;

  const retry = async () => {
    if (retrying || readOnly) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await (fetchImpl ?? fetch)(`/api/projects/${projectId}/imports/${jobId}/retry`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        setRetryError(await refusalOf(res, 'office.review.retry_failed'));
        return;
      }
      await res.text().catch(() => '');
      setLoad((l) =>
        l.kind === 'loaded'
          ? { kind: 'loaded', review: { ...l.review, status: 'detecting', detectedCount: 0 } }
          : l,
      );
      setReads((n) => n + 1);
    } catch {
      setRetryError('office.review.retry_failed');
    } finally {
      setRetrying(false);
    }
  };

  const post = (action: 'finish' | 'cancel') =>
    (fetchImpl ?? fetch)(`/api/projects/${projectId}/imports/${jobId}/${action}`, {
      method: 'POST',
      credentials: 'same-origin',
    });

  const finish = async () => {
    if (finishDisabled) return;
    setBusy('finish');
    setCloseError(null);
    try {
      // What the save queue still holds is saved first: Finish writes what the import has saved.
      const saved = (await control.current?.flush()) ?? true;
      if (!saved) {
        setCloseError('office.review.close_failed');
        return;
      }
      const res = await post('finish');
      if (!res.ok) {
        setCloseError(await refusalOf(res));
        return;
      }
      const body = (await res.json()) as { imported: Imported };
      control.current?.dispose();
      navigate(planAfterFinish(projectId, body.imported));
    } catch {
      setCloseError('office.review.close_failed');
    } finally {
      setBusy(null);
    }
  };

  const chooseCancel = async (choice: ConfirmChoice) => {
    if (answered.current) return;
    answered.current = true;
    setConfirming(false);
    if (choice !== 'confirm') return;
    setBusy('cancel');
    setCloseError(null);
    try {
      const res = await post('cancel');
      if (!res.ok) {
        setCloseError(await refusalOf(res));
        return;
      }
      await res.text().catch(() => '');
      control.current?.dispose();
      navigate(`/projects/${projectId}`);
    } catch {
      setCloseError('office.review.close_failed');
    } finally {
      setBusy(null);
    }
  };

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
              {fromFieldMeasure
                ? t('office.review.subtitle_field_measure')
                : t('office.review.subtitle', { files: files.map((f) => f.name).join(' + ') })}
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
          <HeaderButton
            data-testid="import-review-cancel"
            disabled={cancelDisabled}
            onClick={() => {
              answered.current = false;
              setConfirming(true);
            }}
          >
            {t('office.review.cancel')}
          </HeaderButton>
          <HeaderButton
            variant="primary"
            data-testid="import-review-finish"
            data-blocked={blocked || review?.status !== 'ready' ? 'true' : 'false'}
            aria-busy={busy === 'finish'}
            disabled={finishDisabled}
            onClick={() => void finish()}
          >
            {busy === 'finish' ? t('office.review.finishing') : t('office.review.finish')}
          </HeaderButton>
        </div>
      </HeaderCard>
      {closeError ? (
        <div className={styles.closeError} data-testid="import-review-close-error" role="alert">
          {t(closeError)}
        </div>
      ) : null}
      {confirming ? (
        <ConfirmDialog request={CANCEL_REQUEST} onChoose={(c) => void chooseCancel(c)} />
      ) : null}
      {review !== null && !closed && lock.banner.banner !== null ? (
        <div className={styles.lockRow}>
          <LockBanner
            state={lock.banner}
            offline={offline}
            onRequest={lock.requestEdit}
            onCancel={lock.cancelRequest}
          />
        </div>
      ) : null}
      {review !== null && !closed && !canEdit ? (
        <div className={styles.readOnlyNote} data-testid="import-review-read-only" role="note">
          {t('office.review.read_only')}
        </div>
      ) : null}
      {review?.status === 'ready' ? (
        <ReadyBody
          review={review}
          fetchImpl={fetchImpl}
          onBlocked={setBlocked}
          onControl={setControl}
          readOnly={readOnly}
        />
      ) : (
        <>
          <div className={styles.messageBox}>
            <div className={styles.message} data-testid="import-review-message" role="status">
              {load.kind === 'not_found' ? (
                t('office.review.not_found')
              ) : closed ? (
                <>
                  {t(
                    review.status === 'finished'
                      ? 'office.review.closed_finished'
                      : 'office.review.closed_cancelled',
                  )}{' '}
                  <a href={`/projects/${projectId}`} data-testid="import-review-open-plan">
                    {t('office.review.open_plan')}
                  </a>
                </>
              ) : review?.status === 'failed' ? (
                <span data-testid="import-review-failed">
                  {t('office.review.failed', { name: review.failedFile ?? '' })}
                </span>
              ) : review !== null && (review.detectedCount ?? 0) > 0 ? (
                <span data-testid="import-review-detecting" data-count={review.detectedCount}>
                  {t('office.review.detecting_count', { count: review.detectedCount ?? 0 })}
                </span>
              ) : (
                <span data-testid="import-review-detecting" data-count={0}>
                  {t('office.review.detecting')}
                </span>
              )}
            </div>
            {review?.status === 'failed' ? (
              <div className={styles.messageActions}>
                <HeaderButton
                  data-testid="import-review-retry"
                  disabled={retrying || readOnly}
                  aria-busy={retrying}
                  onClick={() => void retry()}
                >
                  {retrying ? t('office.review.retrying') : t('office.review.retry')}
                </HeaderButton>
                {retryError ? (
                  <span
                    className={styles.retryError}
                    role="alert"
                    data-testid="import-review-retry-error"
                  >
                    {t(retryError)}
                  </span>
                ) : null}
              </div>
            ) : null}
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

// EZD-915 (S02 States "Supplier kitchen PDF: cabinet labels read (W3030, B24) and plan vs elevation cross-check
// results shown per cabinet"): a supplier cabinet's size from its label and how each view reads against it.
const CHECK_KEYS = {
  agrees: 'office.review.cabinet_check_agrees',
  differs: 'office.review.cabinet_check_differs',
  missing: 'office.review.cabinet_check_missing',
} as const;

function CabinetFields({ item }: { item: ReviewCabinet }): ReactElement {
  const t = useT();
  return (
    <>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('office.review.cabinet_size')}</span>
        <span className={styles.scanValue} data-testid="import-review-cabinet-size">
          {cabinetSizeText(item)}
        </span>
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('office.review.cabinet_check')}</span>
        {cabinetCheckLines(item).map((line) => (
          <span
            key={line.view}
            className={styles.muted}
            data-testid="import-review-cabinet-check"
            data-view={line.view}
            data-state={line.state}
          >
            {t(CHECK_KEYS[line.state], {
              view: t(line.view === 'plan' ? 'office.review.cabinet_view_plan' : 'office.review.cabinet_view_elevation'),
              code: item.code,
              size: line.size ?? '',
            })}
          </span>
        ))}
      </div>
    </>
  );
}

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
  const t = useT();
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
        <span
          className={
            decision === 'rejected' ? `${styles.rowLabel} ${styles.rowRejected}` : styles.rowLabel
          }
        >
          {itemLabel(item, items)}
        </span>
        {item.type === 'wall' && item.bearing === true ? (
          <span className={styles.bearingFlag} data-testid="import-review-row-bearing">
            {t('office.review.bearing')}
          </span>
        ) : null}
        <span className={styles.rowPct}>{item.confidence}%</span>
      </button>
    </li>
  );
}

const SAVE_REFUSED: Record<number, MessageKey> = {
  403: 'error.not_authorized',
  404: 'error.import_not_found',
  409: 'error.lock_held',
};

const ABSORB_REFUSED: Record<AbsorbRefusal, MessageKey> = {
  no_gap: 'office.tools.gap.gone',
  not_in_room: 'office.tools.gap.not_in_room',
  across: 'office.tools.gap.across',
  zero_length: 'office.tools.gap.zero_length',
  too_long: 'office.tools.gap.too_long',
};

/** The Plan editor's gap box for an open review gap: size to 1/16", Pick only when a wall runs along the gap. */
export function reviewGapBox(gap: OpenGap): GapBox {
  const displayIn = Math.round(gap.inches * 16) / 16;
  return {
    wallIds: gap.wallIds,
    at: gap.point,
    gap: gap.vector,
    sizeIn: gap.inches,
    displayIn,
    sizeText: gapSizeText(displayIn),
    actions: gap.absorbable ? ['absorb', 'keep'] : ['keep'],
    note: gap.absorbable ? null : 'office.tools.gap.use_move',
  };
}

export function ReadyBody({
  review,
  initialMode,
  fetchImpl,
  onBlocked,
  onControl,
  readCeiling,
  readOnly = false,
}: {
  review: ImportReviewData;
  /** EZD-314: another user holds the edit lock, or the viewer lacks Edit model: no review action, nothing saved. */
  readOnly?: boolean;
  initialMode?: ReviewMode;
  fetchImpl?: typeof fetch;
  /** EZD-312: reads the mesh ceiling for From mesh (tests pass a stub); the import's GLB by default. */
  readCeiling?: () => Promise<CeilingReading | null>;
  /** EZD-311: whether Finish import is blocked, each time it changes. */
  onBlocked?: (blocked: boolean) => void;
  /** EZD-313: the save queue's flush and dispose, for Finish and Cancel (null when it goes). */
  onControl?: (control: ReviewControl | null) => void;
}): ReactElement {
  const t = useT();
  const { items: detected, cutoff } = review;
  const startMode = initialMode ?? review.mode ?? DEFAULT_REVIEW_MODE;
  const [mode, setMode] = useState<ReviewMode>(startMode);
  const [history, setHistory] = useState<History>(() =>
    historyOf({ decisions: review.decisions ?? {}, fixes: review.fixes ?? {} }),
  );
  const { decisions, fixes } = history.present;
  const items = useMemo(() => fixedItems(detected, fixes), [detected, fixes]);
  const [fixing, setFixing] = useState(false);
  const [saveError, setSaveError] = useState<MessageKey | null>(null);

  // The save queue reads the latest state when it builds a batch.
  const stateRef = useRef<ReviewState>(history.present);
  useEffect(() => {
    stateRef.current = history.present;
  }, [history.present]);
  const saver = useRef<ReviewSaver | null>(null);
  useEffect(() => {
    const s = createReviewSaver({
      build: (ids, m) => ({ mode: m, changes: ids.map((id) => changeFor(stateRef.current, id)) }),
      send: patchSender(review.projectId, review.jobId, fetchImpl ?? fetch),
      onSaved: () => setSaveError(null),
      onRetry: () => setSaveError('office.review.save_failed'),
      onRefused: (status) => setSaveError(SAVE_REFUSED[status] ?? 'error.invalid_input'),
    });
    saver.current = s;
    onControl?.({ flush: () => s.flush(), dispose: () => s.dispose() });
    const hide = () => s.flushNow();
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      s.flushNow();
      s.dispose();
      saver.current = null;
      onControl?.(null);
    };
  }, [review.projectId, review.jobId, fetchImpl, onControl]);

  const readOnlyRef = useRef(readOnly);
  useEffect(() => {
    readOnlyRef.current = readOnly;
  }, [readOnly]);
  const act = useCallback((next: (s: ReviewState) => ReviewState) => {
    if (readOnlyRef.current) return;
    setHistory((h) => {
      const after = commit(h, next(h.present));
      if (after !== h) saver.current?.mark(changedIds(h.present, after.present));
      return after;
    });
  }, []);
  const travel = useCallback((step: (h: History) => History) => {
    if (readOnlyRef.current) return;
    setHistory((h) => {
      const after = step(h);
      if (after !== h) saver.current?.mark(changedIds(h.present, after.present));
      return after;
    });
  }, []);
  const setDecisions = (f: (d: Decisions) => Decisions) =>
    act((s) => withDecisions(s, f(s.decisions)));

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z redo (S02 "Undo / redo review actions; Session only").
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      e.preventDefault();
      travel(e.shiftKey ? redo : undo);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [travel]);
  const summary = useMemo(
    () => reviewSummary(items, cutoff, decisions),
    [items, cutoff, decisions],
  );
  const toCheck = useMemo(() => toCheckItems(items, cutoff, decisions), [items, cutoff, decisions]);
  const pending = useMemo(
    () => pendingHighConfidence(items, cutoff, decisions),
    [items, cutoff, decisions],
  );
  const groups = useMemo(() => roomGroups(items), [items]);
  const [selectedId, setSelectedIdRaw] = useState<string | null>(() =>
    startMode === 'one_by_one'
      ? firstUnresolved(detected, review.decisions ?? {})
      : (toCheckItems(detected, cutoff, review.decisions ?? {})[0]?.id ?? null),
  );
  // EZD-311: pick mode for the gap of this room, and the last refusal shown in Resolve the gap.
  const [picking, setPicking] = useState<string | null>(null);
  const [gapAlert, setGapAlert] = useState<MessageKey | null>(null);
  // A new selection leaves Fix mode and pick mode.
  const setSelectedId = (id: string | null) => {
    if (selectedId !== id) {
      setFixing(false);
      setPicking(null);
      setGapAlert(null);
    }
    setSelectedIdRaw(id);
  };
  const [zoom, setZoom] = useState(100);
  const onZoom = useCallback((percent: number) => setZoom(percent), []);
  const freshMeshUrl = useCallback(
    () => readMeshUrl(review.projectId, review.jobId),
    [review.projectId, review.jobId],
  );
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const readSlopeCeiling = useCallback(
    () => (readCeiling ? readCeiling() : readMeshCeiling({ meshUrl: freshMeshUrl })),
    [readCeiling, freshMeshUrl],
  );

  // EZD-310: typed or laser values and the conflicts they create (lib/imports/review-conflicts.ts).
  const tolerance = reviewTolerance(review.tolerance);
  const conflicts = useMemo(
    () => (selectedId ? itemConflicts(detected, fixes, selectedId, tolerance) : []),
    [detected, fixes, selectedId, tolerance],
  );
  const gaps = useMemo(
    () => openGaps(detected, decisions, fixes, tolerance),
    [detected, decisions, fixes, tolerance],
  );
  const blocked = finishBlocked(detected, decisions, fixes, tolerance);
  useEffect(() => {
    onBlocked?.(blocked);
  }, [blocked, onBlocked]);
  const shownGap = picking
    ? (gaps.find((g) => g.roomId === picking) ?? null)
    : gapForSelection(gaps, selectedId);
  // The gap closed another way (undo, a typed value): pick mode ends.
  if (picking && !gaps.some((g) => g.roomId === picking)) setPicking(null);
  const startPick = () => {
    if (!shownGap) return;
    setFixing(false);
    setGapAlert(null);
    setPicking(shownGap.roomId);
  };
  const keepRoom = () => {
    if (!shownGap) return;
    const roomId = shownGap.roomId;
    const fix = keepFix(detected, decisions, fixes, tolerance, roomId);
    if (!fix) {
      setGapAlert('office.tools.gap.gone');
      return;
    }
    setGapAlert(null);
    act((s) => ({ ...s, fixes: { ...s.fixes, [roomId]: fix } }));
  };
  const pickWall = (id: string) => {
    if (!picking) return;
    const item = detected.find((i) => i.id === id);
    if (!item || item.type !== 'wall') {
      setGapAlert('office.tools.gap.not_in_room');
      return;
    }
    const r = absorbGap(detected, decisions, fixes, tolerance, picking, id);
    if (!r.ok) {
      setGapAlert(ABSORB_REFUSED[r.reason]);
      return;
    }
    setGapAlert(null);
    setPicking(null);
    act((s) => withFix(s, id, r.fix));
  };
  // Esc in pick mode returns to the section (S02 Esc "Cancels Fix or pick mode"; Q-0570).
  useEffect(() => {
    if (!picking) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPicking(null);
      setGapAlert(null);
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [picking]);
  const coarse = useCoarsePointer();
  const [focus, setFocus] = useState<{ point: Pt; n: number } | null>(null);
  const zoomTo = (c: Conflict) => setFocus((f) => ({ point: c.point, n: (f?.n ?? 0) + 1 }));
  const commitTyped = (inches: number | null) => {
    if (!selected) return;
    const id = selected.id;
    if (inches === null) {
      act((s) => {
        const rest: Record<string, ItemFix> = { ...s.fixes };
        delete rest[id];
        return { ...s, fixes: rest };
      });
      return;
    }
    const fix = typedFix(selected, inches);
    if (fix) act((s) => withFix(s, id, fix));
  };

  const chooseMode = (next: ReviewMode) => {
    if (next === mode) return;
    if (next === 'one_by_one') setSelectedId(firstUnresolved(items, decisions));
    setMode(next);
    if (!readOnly) saver.current?.mark([], next);
  };
  const acceptAll = () => setDecisions((d) => acceptHighConfidence(items, cutoff, d));
  const acceptGroup = (group: readonly ReviewItem[]) =>
    setDecisions((d) => acceptHighConfidence(group, cutoff, d));
  const decideSelected = (decision: Decision) => {
    if (!selected) return;
    setDecisions((d) => decide(d, selected.id, decision));
    setSelectedId(stepItem(items, selected.id, 1));
  };
  // Delete (S02 "Removes the detected item; it does not become model data"): in One by one the next item is
  // selected, in the other modes the next item still to check.
  const deleteSelected = () => {
    if (!selected) return;
    const id = selected.id;
    act((s) => withDecision(s, id, 'rejected'));
    if (mode === 'one_by_one') setSelectedId(stepItem(items, id, 1));
    else {
      const next = toCheckItems(items, cutoff, { ...decisions, [id]: 'rejected' })[0]?.id ?? null;
      setSelectedId(next);
    }
  };
  const onFix = useCallback((id: string, fix: ItemFix) => act((s) => withFix(s, id, fix)), [act]);
  const exitFix = useCallback(() => setFixing(false), []);
  const hoverText = useCallback(
    (item: ReviewItem) =>
      t('office.review.hover', { name: itemLabel(item, items), confidence: item.confidence }),
    [t, items],
  );

  if (items.length === 0) {
    // EZD-314 (S02 States Empty "with a button to open the Plan editor with the underlay"): Plan shows the
    // project's PDF underlay (EZD-304), so the button opens the project.
    return (
      <>
        <div className={styles.messageBox}>
          <div className={styles.message} data-testid="import-review-message" role="status">
            {t('office.review.empty')}
          </div>
          <div className={styles.messageActions}>
            <a
              className={`${buttonStyles.button} ${buttonStyles.primary}`}
              href={`/projects/${review.projectId}`}
              data-testid="import-review-open-plan-editor"
            >
              {t('office.review.open_plan_editor')}
            </a>
          </div>
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
                        disabled={readOnly || groupPending === 0}
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
          {saveError ? (
            <p className={styles.saveError} role="alert" data-testid="import-review-save-error">
              {t(saveError)}
            </p>
          ) : null}
          <div className={styles.leftFoot}>
            <div className={styles.leftFootActions}>
              <HeaderButton
                data-testid="import-review-fix"
                aria-pressed={fixing}
                disabled={readOnly || !selected || decisions[selected.id] === 'rejected'}
                onClick={() => {
                  setPicking(null);
                  setFixing((f) => !f);
                }}
              >
                {t('office.review.fix')}
              </HeaderButton>
              <HeaderButton
                data-testid="import-review-delete"
                disabled={readOnly || !selected || decisions[selected.id] === 'rejected'}
                onClick={deleteSelected}
              >
                {t('office.review.delete')}
              </HeaderButton>
            </div>
            <HeaderButton
              variant="primary"
              className={styles.acceptN}
              data-testid="import-review-accept-n"
              data-count={pending.length}
              disabled={readOnly || pending.length === 0}
              onClick={acceptAll}
            >
              {t('office.review.accept_n', { count: pending.length })}
            </HeaderButton>
          </div>
        </aside>
        <main className={styles.canvasCard}>
          <ReviewCanvas
            items={items}
            detected={detected}
            selectedId={selectedId}
            onSelect={picking && !readOnly ? pickWall : setSelectedId}
            picking={picking !== null && !readOnly}
            fixing={fixing && !readOnly}
            onFix={onFix}
            onExitFix={exitFix}
            hoverText={hoverText}
            cutoff={cutoff}
            decisions={decisions}
            meshUrl={review.meshUrl}
            freshMeshUrl={freshMeshUrl}
            onZoom={onZoom}
            gaps={gaps}
            focus={focus}
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
              <div className={styles.headRow}>
                <h2 className={styles.itemName}>{itemLabel(selected, items)}</h2>
                {selected.type === 'wall' && selected.bearing === true ? (
                  <span
                    className={styles.bearingFlag}
                    data-testid="import-review-inspector-bearing"
                  >
                    {t('office.review.bearing')}
                  </span>
                ) : null}
                {isOverTolerance(
                  detected.find((i) => i.id === selected.id) ?? selected,
                  fixes,
                  tolerance,
                ) ? (
                  <span className={styles.conflictPill} data-testid="import-review-conflict-pill">
                    {t('office.review.conflict')}
                  </span>
                ) : null}
              </div>
              <p className={styles.muted}>
                {t('office.review.item_meta', {
                  type: itemTypeWord(selected),
                  confidence: selected.confidence,
                })}
              </p>
              {decisions[selected.id] ? (
                <p className={styles.decision} data-testid="import-review-decision">
                  {t(
                    decisions[selected.id] === 'rejected'
                      ? 'office.review.decision_rejected'
                      : fixes[selected.id]
                        ? 'office.review.decision_fixed'
                        : 'office.review.decision_accepted',
                  )}
                </p>
              ) : null}
              {selected.type === 'ceiling_slope' ? (
                <CeilingSlopeFields
                  key={selected.id}
                  item={selected}
                  detected={
                    detected.find(
                      (i): i is typeof selected =>
                        i.id === selected.id && i.type === 'ceiling_slope',
                    ) ?? selected
                  }
                  fix={fixes[selected.id] as CeilingSlopeFix | undefined}
                  hasMesh={review.meshUrl !== null}
                  disabled={readOnly || decisions[selected.id] === 'rejected'}
                  readMesh={readSlopeCeiling}
                  onFix={(fix) => onFix(selected.id, fix)}
                />
              ) : selected.type === 'cabinet' ? (
                <CabinetFields item={selected} />
              ) : selected.type === 'room' ? (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>{t('office.review.scan_reads')}</span>
                  <span className={styles.scanValue} data-testid="import-review-scan">
                    {scanReads(detected.find((i) => i.id === selected.id) ?? selected)}
                  </span>
                </div>
              ) : (
                <TypedField
                  key={selected.id}
                  item={selected}
                  typed={typedOf(fixes[selected.id])}
                  scan={scanReads(detected.find((i) => i.id === selected.id) ?? selected)}
                  disabled={readOnly || decisions[selected.id] === 'rejected'}
                  onCommit={commitTyped}
                />
              )}
            </div>
          ) : (
            <p className={`${styles.inspectorHead} ${styles.muted}`}>
              {t('office.review.no_selection')}
            </p>
          )}
          {selected ? <ConflictList conflicts={conflicts} items={items} onZoom={zoomTo} /> : null}
          {shownGap ? (
            <fieldset className={styles.plainFieldset} disabled={readOnly}>
              <ResolveGap
                box={reviewGapBox(shownGap)}
                picking={picking !== null}
                alert={gapAlert}
                coarse={coarse}
                onPick={startPick}
                onKeep={keepRoom}
                pickHint={coarse ? 'office.review.gap_pick_hint_touch' : undefined}
                onBack={() => {
                  setPicking(null);
                  setGapAlert(null);
                }}
              />
            </fieldset>
          ) : null}
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
                  disabled={readOnly || !selected}
                  onClick={() => decideSelected('rejected')}
                >
                  {t('office.review.reject_item')}
                </HeaderButton>
                <HeaderButton
                  variant="primary"
                  data-testid="import-review-accept"
                  disabled={readOnly || !selected}
                  onClick={() => decideSelected('accepted')}
                >
                  {t('office.review.accept_item')}
                </HeaderButton>
              </div>
            </div>
          ) : null}
          <p className={styles.tolerance} data-testid="import-review-tolerance">
            {t('office.review.tolerance_value', { tolerance: amount(tolerance) })}
          </p>
        </aside>
      </div>
      <StatusBar
        start={
          <>
            <StatusItem label="office.review.status_source">{sourceLine(review.files)}</StatusItem>
            <StatusItem label="office.review.status_accuracy">
              {review.files.length > 0 && review.files.every((f) => f.kind === 'field_measure')
                ? t('office.review.status_accuracy_field_measure')
                : t('office.review.status_accuracy_value')}
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
