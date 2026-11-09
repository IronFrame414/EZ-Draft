'use client';
// EZD-299 Build step 8 (vault/plans/EZD-299.md section 3 C7, C8, C12; Decided D-Status, D-Groups, D-Row text,
// D-Show, D-Actions, D-Labels, D-CSS; Q-0502; Q-0511; Q-0540; Q-0628 (b); Q-0632 (a); board S03b): "Changes not
// saved", the conflict list over the canvas. `ConflictPanelView` is pure; `ConflictPanel` owns the busy rows, the
// page size and Show, and runs Keep mine, Keep theirs, Remove and Reload.
import { useState, type ReactElement } from 'react';
import { useStore } from 'zustand';
import { Icon } from '../../components/icon/Icon';
import type { IconName } from '../../components/icon/icon-names.generated';
import { InlineError } from '../../components/states/InlineError';
import { Skeleton, SkeletonGroup } from '../../components/states/Skeleton';
import { useToast } from '../../components/states/ToastProvider';
import type { ConflictListState, ResolveResult } from '../../lib/conflicts/conflict-list';
import {
  CONFLICT_PAGE_SIZE,
  groupConflicts,
  type ChipValue,
  type ConflictGroupView,
  type ConflictRowView,
  type ConflictViewInput,
  type ConflictViewReason,
  type RowAction,
} from '../../lib/conflicts/conflict-view';
import { useT } from '../../lib/messages';
import { formatNotificationTime } from '../../lib/notifications/time';
import touch from '../../styles/touch.module.css';
import type { EditorSession } from '../editor-session';
import type { PlanController } from '../plan/controller';
import styles from './ConflictPanel.module.css';

export type ConflictPanelViewProps = {
  groups: ConflictGroupView[];
  total: number;
  more: boolean;
  status: 'loading' | 'failed' | 'ready';
  openProjectName: string;
  busy: ReadonlySet<string>;
  showable: ReadonlySet<string>;
  now: Date;
  onClose(): void;
  onAction(key: string, action: RowAction): void;
  onShow(key: string): void;
  onShowMore(): void;
  onRetry(): void;
};

const button = `${styles.button} ${touch.target}`;

const ACTION_TESTID: Record<RowAction, string> = {
  keep_mine: 'conflict-keep-mine',
  keep_theirs: 'conflict-keep-theirs',
  remove: 'conflict-remove',
  reload: 'conflict-reload',
};

// D-Why: the row's reason, read back from its why (a conflict row's why is null or a delete case).
const reasonOf = (row: ConflictRowView): ConflictViewReason =>
  row.why === null || row.why === 'they_deleted' || row.why === 'you_deleted'
    ? 'conflict'
    : row.why;

const WHY_ICON: Partial<Record<ConflictViewReason, { name: IconName; className: string }>> = {
  invalid: { name: 'report', className: styles.whyIconWarn },
  outdated: { name: 'update', className: styles.whyIcon },
  not_open: { name: 'block', className: styles.whyIcon },
  not_editable: { name: 'block', className: styles.whyIcon },
};

function Chip({
  testid,
  label,
  value,
  className,
}: {
  testid: string;
  label: string;
  value: ChipValue;
  className: string;
}): ReactElement {
  const t = useT();
  return (
    <span className={className} data-testid={testid}>
      <span>{label}</span>
      <span className={styles.value} data-testid={`${testid}-value`}>
        {value.kind === 'deleted' ? t('office.conflicts.deleted') : value.text}
      </span>
    </span>
  );
}

function Row({
  row,
  group,
  busy,
  showable,
  now,
  onAction,
  onShow,
}: {
  row: ConflictRowView;
  group: ConflictGroupView['kind'];
  busy: boolean;
  showable: boolean;
  now: Date;
  onAction(key: string, action: RowAction): void;
  onShow(key: string): void;
}): ReactElement {
  const t = useT();
  const reason = reasonOf(row);
  const title = 'text' in row.label ? row.label.text : t(row.label.key, row.label.params);
  let detail = '';
  if (row.fields.length > 0)
    detail = `· ${row.fields.map((f) => t(`office.conflicts.field.${f}`)).join(', ')}`;
  if (group === 'other' && row.projectName !== null) detail += ` · ${row.projectName}`;
  if (group === 'other' && row.clientName !== null) detail += ` · ${row.clientName}`;
  const noun = t(`office.conflicts.noun.${row.noun}`);
  const whyText =
    row.why === null
      ? null
      : row.why === 'they_deleted' || row.why === 'you_deleted'
        ? t(`office.conflicts.why.${row.why}`, { noun })
        : t(`office.conflicts.why.${row.why}`);
  const whyIcon = WHY_ICON[reason];
  let savedBy: string | null = null;
  if (reason === 'conflict' && row.savedAt !== null) {
    const time = formatNotificationTime(row.savedAt, now);
    const timeText = t(time.key, time.params);
    savedBy =
      row.savedBy === null
        ? timeText
        : t('office.conflicts.saved_by', { name: row.savedBy, time: timeText });
  }
  const chips = row.yours !== null || row.saved !== null || savedBy !== null;
  return (
    <div
      className={styles.row}
      data-testid="conflict-row"
      data-conflict-key={row.key}
      data-reason={reason}
    >
      <span className={styles.rowIcon}>
        <Icon name={row.icon} size={18} />
      </span>
      <div className={styles.rowBody}>
        <div className={styles.rowTitle}>
          <span className={styles.rowName} data-testid="conflict-row-title">
            {title}
          </span>
          {detail === '' ? null : (
            <span className={styles.rowDetail} data-testid="conflict-row-detail">
              {detail}
            </span>
          )}
        </div>
        {whyText === null ? null : (
          <span className={styles.why}>
            {whyIcon === undefined ? null : (
              <span className={whyIcon.className}>
                <Icon name={whyIcon.name} size={16} />
              </span>
            )}
            <span data-testid="conflict-why">{whyText}</span>
          </span>
        )}
        {chips ? (
          <div className={styles.chips}>
            {row.yours === null ? null : (
              <Chip
                testid="conflict-yours"
                label={t('office.conflicts.yours')}
                value={row.yours}
                className={styles.yours}
              />
            )}
            {row.saved === null ? null : (
              <Chip
                testid="conflict-saved"
                label={t('office.conflicts.saved')}
                value={row.saved}
                className={styles.saved}
              />
            )}
            {savedBy === null ? null : (
              <span className={styles.meta} data-testid="conflict-saved-by">
                {savedBy}
              </span>
            )}
          </div>
        ) : null}
        {row.hint === null ? null : (
          <span className={styles.hint} data-testid="conflict-hint">
            {t(`office.conflicts.hint.${row.hint}`)}
          </span>
        )}
      </div>
      <div className={styles.actions}>
        {showable ? (
          <button
            type="button"
            className={button}
            data-testid="conflict-show"
            disabled={busy}
            onClick={() => onShow(row.key)}
          >
            <Icon name="my_location" size={16} />
            {t('office.conflicts.action.show')}
          </button>
        ) : null}
        {row.actions.map((action) => (
          <button
            key={action}
            type="button"
            className={button}
            data-testid={ACTION_TESTID[action]}
            disabled={busy}
            onClick={() => onAction(row.key, action)}
          >
            {action === 'reload' ? <Icon name="refresh" size={16} /> : null}
            {t(`office.conflicts.action.${action}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

function groupLabel(
  t: ReturnType<typeof useT>,
  kind: ConflictGroupView['kind'],
  openProjectName: string,
): string {
  if (kind === 'this') return `${t('office.conflicts.group.this')} · ${openProjectName}`;
  if (kind === 'other') return t('office.conflicts.group.other');
  return t('office.conflicts.group.not_open');
}

export function ConflictPanelView({
  groups,
  total,
  more,
  status,
  openProjectName,
  busy,
  showable,
  now,
  onClose,
  onAction,
  onShow,
  onShowMore,
  onRetry,
}: ConflictPanelViewProps): ReactElement {
  const t = useT();
  const close = t('common.close');
  return (
    <section
      id="changes-not-saved"
      role="dialog"
      aria-labelledby="changes-not-saved-title"
      className={styles.panel}
      data-testid="conflict-panel"
    >
      <div className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.titleRow}>
            <h2 id="changes-not-saved-title" className={styles.title}>
              {t('office.conflicts.title')}
            </h2>
            <span className={styles.count} data-testid="conflict-count">
              {total}
            </span>
          </div>
          <span className={styles.note}>{t('office.conflicts.account_note')}</span>
        </div>
        <button
          type="button"
          className={`${button} ${styles.close}`}
          aria-label={close}
          title={close}
          data-testid="conflict-close"
          onClick={() => onClose()}
        >
          <Icon name="close" size={20} />
        </button>
      </div>
      <div className={styles.body}>
        {status === 'failed' ? (
          <div className={styles.state} data-testid="conflict-error">
            <InlineError message="office.conflicts.load_failed" onRetry={onRetry} />
          </div>
        ) : null}
        {status === 'loading' ? (
          <div className={styles.state} data-testid="conflict-loading">
            <SkeletonGroup count={3}>
              <Skeleton height="56px" />
            </SkeletonGroup>
          </div>
        ) : null}
        {status === 'ready' && total === 0 ? (
          <p className={`${styles.state} ${styles.empty}`} data-testid="conflict-empty">
            {t('office.conflicts.empty')}
          </p>
        ) : null}
        {status === 'loading'
          ? null
          : groups.map((group) => (
              <div key={group.kind} data-testid="conflict-group" data-group={group.kind}>
                <div className={styles.groupHead}>
                  <span>{groupLabel(t, group.kind, openProjectName)}</span>
                  <span className={styles.groupCount} data-testid="conflict-group-count">
                    {group.count}
                  </span>
                </div>
                {group.rows.map((row) => (
                  <Row
                    key={row.key}
                    row={row}
                    group={group.kind}
                    busy={busy.has(row.key)}
                    showable={showable.has(row.key)}
                    now={now}
                    onAction={onAction}
                    onShow={onShow}
                  />
                ))}
              </div>
            ))}
        {more && status !== 'loading' ? (
          <div className={styles.state}>
            <button
              type="button"
              className={button}
              data-testid="conflict-show-more"
              onClick={() => onShowMore()}
            >
              {t('office.conflicts.show_more')}
            </button>
          </div>
        ) : null}
      </div>
      <div className={styles.footer} data-testid="conflict-footer">
        <Icon name="info" size={16} />
        <span>{t('office.conflicts.footer')}</span>
      </div>
    </section>
  );
}

// D-Status.
function statusOf(
  server: ConflictListState['server'],
  inputs: readonly ConflictViewInput[],
): ConflictPanelViewProps['status'] {
  if (server === 'failed') return 'failed';
  if ((server === 'idle' || server === 'loading') && inputs.length === 0) return 'loading';
  return 'ready';
}

export type ConflictPanelProps = {
  session: EditorSession;
  projectId: string;
  inputs: readonly ConflictViewInput[];
  server: ConflictListState['server'];
  plan: PlanController | null;
  onClose(): void;
};

export function ConflictPanel({
  session,
  projectId,
  inputs,
  server,
  plan,
  onClose,
}: ConflictPanelProps): ReactElement {
  const toast = useToast();
  const [limit, setLimit] = useState(CONFLICT_PAGE_SIZE);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const objects = useStore(session.store, (s) => s.objects);
  const { groups, total, more } = groupConflicts(inputs, projectId, limit);

  // D-Show: rows of this project whose object is in the open model, while the plan is up.
  const showable = new Set<string>();
  if (plan !== null) {
    for (const group of groups) {
      if (group.kind !== 'this') continue;
      for (const row of group.rows) if (objects.has(row.objectId)) showable.add(row.key);
    }
  }

  const setRowBusy = (key: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  // D-Actions.
  const onAction = (key: string, action: RowAction) => {
    if (action === 'reload') {
      window.location.reload();
      return;
    }
    const list = session.conflicts;
    const run = (): Promise<ResolveResult> =>
      action === 'keep_mine'
        ? list.keepMine(key)
        : action === 'keep_theirs'
          ? list.keepTheirs(key)
          : list.remove(key);
    setRowBusy(key, true);
    void run()
      .then((result) => {
        if (result.ok) return;
        if (result.reason === 'not_allowed') toast.show({ message: 'error.not_authorized' });
        else if (result.reason === 'failed') toast.show({ message: 'error.db_unavailable' });
        else void session.conflicts.refresh();
      })
      .finally(() => setRowBusy(key, false));
  };

  const onShow = (key: string) => {
    const input = inputs.find((x) => x.key === key);
    onClose();
    if (input !== undefined) plan?.handle.showObject(input.objectId);
  };

  return (
    <ConflictPanelView
      groups={groups}
      total={total}
      more={more}
      status={statusOf(server, inputs)}
      openProjectName={session.model.project.name}
      busy={busy}
      showable={showable}
      now={new Date()}
      onClose={onClose}
      onAction={onAction}
      onShow={onShow}
      onShowMore={() => setLimit((n) => n + CONFLICT_PAGE_SIZE)}
      onRetry={() => void session.conflicts.refresh()}
    />
  );
}
