'use client';
// EZD-122 (board S20 left panel, inspector and status bar; S20 Controls, Permissions; Q-0700 05 "Versions labels and
// panel", 10 permission table; examples 09p "Working-row collapse"; AC-EZD-122-2 to -7, -9): the Versions tab, the
// inspector of an open version and the status bar text. Loaded lazily when the tab first opens (11 Budgets).
// - The list: the Working copy row, then Sent, Named snapshots and Working versions (three rows, then "+ K older ·
//   unsent versions clean up at N days", N from Defaults). A project with no checkpoint shows the Working copy only.
// - A row opens its version read-only (version-view.ts); the Working copy row goes back.
// - The inspector: label, date and time, author, cause and parent; Name snapshot (working rows, Edit model) and
//   Revert to this (Edit model and the lock). Controls the user lacks are hidden (S20 Permissions).
import { useState, type ReactElement, type ReactNode } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { VersionRow } from '../../lib/versions/versions';
import touch from '../../styles/touch.module.css';
import {
  causeText,
  groupVersions,
  versionDate,
  versionDetail,
  versionTitle,
  type Text,
} from './versions-list';
import styles from './VersionsPanel.module.css';
import type { VersionDiff } from './version-diff';

// EZD-139: the diff layer loads with this module, when the Versions tab or a version first shows.
export { DiffLayer } from './DiffLayer';

type TFn = ReturnType<typeof useT>;

export function textOf(t: TFn, x: Text): string {
  return 'text' in x ? x.text : t(x.key, x.params);
}

export type VersionsPanelProps = {
  // Null while the first list read is on its way.
  rows: VersionRow[] | null;
  failed: boolean;
  // The last row pressed could not be opened.
  openFailed: boolean;
  viewingId: string | null;
  openingId: string | null;
  cleanupAgeDays: number;
  onOpen: (row: VersionRow) => void;
  onBack: () => void;
  timeZone?: string;
  // EZD-139 (Q-0703): the open version's diff against the working copy and the Show changes switch.
  diff?: VersionDiff | null;
  showChanges?: boolean;
  onShowChanges?: (on: boolean) => void;
};

function Row({
  row,
  on,
  icon,
  onOpen,
  t,
  timeZone,
}: {
  row: VersionRow;
  on: boolean;
  icon: ReactNode;
  onOpen: (row: VersionRow) => void;
  t: TFn;
  timeZone?: string;
}) {
  const detail = versionDetail(row, timeZone)
    .map((x) => textOf(t, x))
    .join(' · ');
  return (
    <button
      type="button"
      className={`${styles.vr} ${on ? styles.vrOn : ''} ${touch.target}`}
      aria-pressed={on}
      data-testid="version-row"
      data-version-id={row.id}
      onClick={() => onOpen(row)}
    >
      {icon}
      <span className={styles.vt}>
        <span
          className={row.isSent || row.isSnapshot ? styles.title : `${styles.title} ${styles.mono}`}
        >
          {textOf(t, versionTitle(row, timeZone))}
        </span>
        {detail === '' ? null : <span className={styles.vs}>{detail}</span>}
      </span>
      {row.isSent ? (
        <span className={styles.lock}>
          <Icon name="lock" size={16} />
        </span>
      ) : null}
    </button>
  );
}

export function VersionsPanel({
  rows,
  failed,
  openFailed,
  viewingId,
  openingId,
  cleanupAgeDays,
  onOpen,
  onBack,
  timeZone,
}: VersionsPanelProps): ReactElement {
  const t = useT();
  const groups = rows === null ? null : groupVersions(rows);
  const row = (r: VersionRow, icon: ReactNode) => (
    <Row
      key={r.id}
      row={r}
      on={viewingId === r.id || openingId === r.id}
      icon={icon}
      onOpen={onOpen}
      t={t}
      timeZone={timeZone}
    />
  );
  return (
    <div className={styles.panel} data-testid="versions-panel">
      <div className={styles.top}>
        <button
          type="button"
          className={`${styles.vr} ${styles.working} ${viewingId === null ? styles.vrOn : ''} ${touch.target}`}
          aria-pressed={viewingId === null}
          data-testid="version-working-copy"
          onClick={onBack}
        >
          <span className={`${styles.ic} ${styles.icWorking}`}>
            <Icon name="edit" size={14} />
          </span>
          <span className={styles.vt}>
            <span className={styles.titleStrong}>{t('office.versions.working_copy')}</span>
          </span>
        </button>
      </div>
      {failed ? (
        <p className={styles.note} role="alert">
          {t('office.versions.load_failed')}
        </p>
      ) : null}
      {openFailed ? (
        <p className={styles.note} role="alert" data-testid="versions-open-failed">
          {t('office.versions.open_failed')}
        </p>
      ) : null}
      {groups !== null && rows !== null && rows.length > 0 ? (
        <>
          <span className={styles.lbl} data-testid="versions-group-sent">
            {t('office.versions.group.sent')}
          </span>
          <div className={styles.list}>
            {groups.sent.map((r) =>
              row(
                r,
                <span className={`${styles.ic} ${styles.icSent}`}>
                  {r.versionNo === null ? '' : `V${r.versionNo}`}
                </span>,
              ),
            )}
          </div>
          <span
            className={`${styles.lbl} ${styles.lblRule}`}
            data-testid="versions-group-snapshots"
          >
            {t('office.versions.group.snapshots')}
          </span>
          <div className={styles.list}>
            {groups.snapshots.map((r) =>
              row(
                r,
                <span className={`${styles.ic} ${styles.icSnapshot}`}>
                  <Icon name="library_add_check" size={14} />
                </span>,
              ),
            )}
          </div>
          <span className={`${styles.lbl} ${styles.lblRule}`} data-testid="versions-group-working">
            {t('office.versions.group.working')}
          </span>
          <div className={styles.list}>
            {groups.working.map((r) =>
              row(
                r,
                <span className={`${styles.ic} ${styles.icHistory}`}>
                  <Icon name="history" size={14} />
                </span>,
              ),
            )}
            {groups.older > 0 ? (
              <div className={styles.older} data-testid="versions-older">
                {t('office.versions.older', { count: groups.older, days: cleanupAgeDays })}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export type VersionInspectorProps = {
  row: VersionRow;
  rows: VersionRow[];
  // Edit model granted (Name snapshot needs no lock, Q-0700 10).
  canEditModel: boolean;
  // Edit model and holding the lock (Revert, Q-0700 10).
  canRevert: boolean;
  onName: (name: string) => Promise<string | null>;
  onRevert: () => void;
  reverting: boolean;
  error: string | null;
  timeZone?: string;
};

export function VersionInspector({
  row,
  rows,
  canEditModel,
  canRevert,
  onName,
  onRevert,
  reverting,
  error,
  timeZone,
}: VersionInspectorProps): ReactElement {
  const t = useT();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const title = textOf(t, versionTitle(row, timeZone));
  const when = versionDate(row.createdAt, timeZone);
  const cause = row.isSent ? { key: 'office.versions.cause.send' as const } : causeText(row);
  const parent = rows.find((r) => r.id === row.parentId);
  const working = !row.isSent && !row.isSnapshot;
  const kv = (k: string, v: string, id: string) => (
    <div className={styles.kv} data-testid={`version-detail-${id}`}>
      <span className={styles.k}>{k}</span>
      <span>{v}</span>
    </div>
  );
  const none = t('office.versions.detail.none');
  return (
    <div className={styles.inspector} data-testid="version-inspector">
      <h2 className={styles.h}>{title}</h2>
      {kv(t('office.versions.detail.when'), t('office.versions.when', when), 'when')}
      {kv(t('office.versions.detail.author'), row.author ?? none, 'author')}
      {kv(t('office.versions.detail.cause'), cause === null ? none : textOf(t, cause), 'cause')}
      {kv(
        t('office.versions.detail.parent'),
        parent === undefined ? none : textOf(t, versionTitle(parent, timeZone)),
        'parent',
      )}
      {canEditModel && working ? (
        <form
          className={styles.nameForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() === '' || saving) return;
            setSaving(true);
            void onName(name).then((err) => {
              setSaving(false);
              if (err === null) setName('');
            });
          }}
        >
          <label className={styles.k} htmlFor="version-snapshot-name">
            {t('office.versions.name_label')}
          </label>
          <input
            id="version-snapshot-name"
            className={styles.input}
            data-testid="version-snapshot-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className={`${styles.btn} ${touch.target}`}
            data-testid="version-name-snapshot"
            disabled={name.trim() === '' || saving}
          >
            {t('office.versions.name_snapshot')}
          </button>
        </form>
      ) : null}
      {canRevert ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${touch.target}`}
            data-testid="version-revert"
            disabled={reverting}
            onClick={onRevert}
          >
            <Icon name="history" size={18} />
            {t('office.versions.revert')}
          </button>
          <p className={styles.note}>{t('office.versions.revert_note', { label: title })}</p>
        </div>
      ) : null}
      {error === null ? null : (
        <p className={styles.error} role="alert" data-testid="version-error">
          {error}
        </p>
      )}
    </div>
  );
}

export type VersionsStatusProps = {
  rows: VersionRow[] | null;
  viewing: VersionRow | null;
  onBack: () => void;
  timeZone?: string;
  // EZD-139 (Q-0703): the open version's diff against the working copy and the Show changes switch.
  diff?: VersionDiff | null;
  showChanges?: boolean;
  onShowChanges?: (on: boolean) => void;
};

// The status bar while the Versions tab is open or a version is shown: "Viewing <label> · read-only" with Back to
// working copy, then "Sent N · Snapshots N · Working N". EZD-139 (Q-0703): while a version is open, the chip
// "N changed · N removed · N added since" and the Show changes switch, on by default.
export function VersionsStatus({
  rows,
  viewing,
  onBack,
  timeZone,
  diff = null,
  showChanges = true,
  onShowChanges,
}: VersionsStatusProps): ReactElement {
  const t = useT();
  const counts = rows === null ? null : groupVersions(rows).counts;
  return (
    <span className={styles.status} data-testid="versions-status">
      {viewing === null ? null : (
        <>
          <span data-testid="versions-viewing">
            {t('office.versions.viewing', { label: textOf(t, versionTitle(viewing, timeZone)) })}
          </span>
          <button
            type="button"
            className={`${styles.back} ${touch.target}`}
            data-testid="versions-back"
            onClick={onBack}
          >
            {t('office.versions.back')}
          </button>
          {diff === null ? null : (
            <>
              <span className={styles.diffChip} data-testid="versions-diff-counts">
                {t('office.versions.diff_counts', {
                  changed: diff.changed.length,
                  removed: diff.removed.length,
                  added: diff.added.length,
                })}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showChanges}
                className={`${styles.diffSwitch} ${touch.hitArea}`}
                data-testid="versions-show-changes"
                onClick={() => onShowChanges?.(!showChanges)}
              >
                <span className={styles.diffKnob} aria-hidden="true" />
                <span>{t('office.versions.show_changes')}</span>
              </button>
            </>
          )}
        </>
      )}
      {counts === null ? null : (
        <span data-testid="versions-counts">
          {t('office.versions.counts', {
            sent: counts.sent,
            snapshots: counts.snapshots,
            working: counts.working,
          })}
        </span>
      )}
    </span>
  );
}
