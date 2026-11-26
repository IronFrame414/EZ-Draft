'use client';
// EZD-123 (board S20 cleanup sheet; S20 Cleanup sheet rows; R24 #4; Q-0700 05 "Cleanup sheet", 10 permission table;
// Q-0664; examples 09p Cleanup clock rows 4, 6; AC-EZD-123-2, -5, -6, -9, -10): the version cleanup sheet, a modal
// over the editor. Shown to users with Edit model when the project has due rows (the editor decides).
// - Header: the board's title and note, Close (same as Later).
// - Select All / None and "N keep · N delete".
// - Each row: Keep checkbox (default unticked), preview (a placeholder when there is none), date and time, author and
//   cause, the change summary, its age; a ticked row shows Snapshot name (defaults to its date and time), an unticked
//   row shows Deletes.
// - Footer: the earliest delete date (first shown + grace days), Later, and "Keep N, delete N unticked" only for the
//   lock holder (someone without the lock sees Later only).
// Loaded lazily with the Versions module (11 Budgets).
import { Dialog } from 'radix-ui';
import { useMemo, useState, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { Icon } from '../../components/icon/Icon';
import { StateButton } from '../../components/states/StateButton';
import { useT } from '../../lib/messages';
import { versionCauseOf, type VersionRow } from '../../lib/versions/versions';
import {
  ageDays,
  cleanupChoices,
  cleanupDeleteOn,
  cleanupSummaryText,
  defaultSnapshotName,
  deleteOnText,
  type Choice,
  type CleanupRow,
} from './cleanup-summary';
import styles from './CleanupSheet.module.css';
import { causeText, type Text } from './versions-list';

export type CleanupSheetProps = {
  rows: CleanupRow[];
  graceDays: number;
  ageDays: number;
  // Holds the edit lock (Save choices needs it).
  canSave: boolean;
  saving: boolean;
  // A message to show over the footer after a failed save.
  error: string | null;
  onSave: (choices: { keep: { id: string; name: string }[]; remove: string[] }) => void;
  onLater: () => void;
  timeZone?: string;
  // For tests: the time the ages count from.
  now?: number;
};

type Part = ComponentType<{ className?: string; children?: ReactNode }>;
const PlainTitle: Part = ({ className, children }) => <h2 className={className}>{children}</h2>;
const PlainClose: Part = ({ children }) => <>{children}</>;

export type CleanupSheetContentProps = Omit<CleanupSheetProps, 'onSave'> & {
  choices: ReadonlyMap<string, Choice>;
  onChoices: (update: (prev: ReadonlyMap<string, Choice>) => Map<string, Choice>) => void;
  onSave: () => void;
  // The dialog's title and close parts; plain elements when rendered on their own (tests).
  Title?: Part;
  Close?: Part;
};

// The sheet as the dialog shows it, without the dialog: rendered statically in tests.
export function CleanupSheetContent({
  rows,
  graceDays,
  ageDays: dueDays,
  canSave,
  saving,
  error,
  onSave,
  onLater,
  timeZone,
  now,
  choices,
  onChoices: setChoices,
  Title = PlainTitle,
  Close = PlainClose,
}: CleanupSheetContentProps): ReactElement {
  const t = useT();
  const text = (x: Text) => ('text' in x ? x.text : t(x.key, x.params));
  const [at] = useState(() => now ?? Date.now());

  const keepCount = rows.filter((r) => choices.get(r.id)?.keep).length;
  const removeCount = rows.length - keepCount;
  const deleteOn = useMemo(() => cleanupDeleteOn(rows, graceDays), [rows, graceDays]);

  const setKeep = (row: CleanupRow, keep: boolean) =>
    setChoices((prev) => {
      const next = new Map(prev);
      const name = prev.get(row.id)?.name ?? defaultSnapshotName(row.createdAt, timeZone);
      next.set(row.id, { keep, name });
      return next;
    });
  const setName = (row: CleanupRow, name: string) =>
    setChoices((prev) => new Map(prev).set(row.id, { keep: true, name }));
  const setAll = (keep: boolean) =>
    setChoices((prev) => {
      const next = new Map(prev);
      for (const r of rows)
        next.set(r.id, {
          keep,
          name: prev.get(r.id)?.name ?? defaultSnapshotName(r.createdAt, timeZone),
        });
      return next;
    });

  const allState = keepCount === 0 ? 'none' : keepCount === rows.length ? 'all' : 'some';

  return (
    <>
      <div className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true">
          <Icon name="history" size={22} />
        </span>
        <div className={styles.headerText}>
          <Title className={styles.title}>{t('office.versions.cleanup.title')}</Title>
          <span className={styles.note} data-testid="cleanup-note">
            {t('office.versions.cleanup.note', { count: rows.length, days: dueDays })}
          </span>
        </div>
        <Close>
          <button
            type="button"
            className={styles.close}
            aria-label={t('office.versions.cleanup.close')}
            data-testid="cleanup-close"
          >
            <Icon name="close" size={20} />
          </button>
        </Close>
      </div>

      <div className={styles.selectBar}>
        <span className={styles.check} data-state={allState} aria-hidden="true">
          {allState === 'all' ? (
            <Icon name="check" size={15} />
          ) : allState === 'some' ? (
            <Icon name="remove" size={15} />
          ) : null}
        </span>
        <span className={styles.muted}>{t('office.versions.cleanup.select')}</span>
        <button
          type="button"
          className={styles.link}
          data-testid="cleanup-all"
          onClick={() => setAll(true)}
        >
          {t('office.versions.cleanup.all')}
        </button>
        <span className={styles.slash}>/</span>
        <button
          type="button"
          className={styles.link}
          data-testid="cleanup-none"
          onClick={() => setAll(false)}
        >
          {t('office.versions.cleanup.none')}
        </button>
        <span className={styles.spacer} />
        <span className={styles.counts} data-testid="cleanup-counts">
          {t('office.versions.cleanup.counts', { keep: keepCount, remove: removeCount })}
        </span>
      </div>

      <ul className={styles.list} data-testid="cleanup-rows">
        {rows.map((row) => {
          const c = choices.get(row.id);
          const keep = c?.keep ?? false;
          const when = defaultSnapshotName(row.createdAt, timeZone);
          const cause = causeText({
            cause: versionCauseOf(row.cause),
            label: row.label,
          } as VersionRow);
          const who = [row.author, cause === null ? null : text(cause)].filter(
            (x): x is string => x !== null && x !== '',
          );
          const age = ageDays(row.createdAt, at);
          return (
            <li
              key={row.id}
              className={keep ? `${styles.row} ${styles.rowKept}` : styles.row}
              data-testid="cleanup-row"
              data-id={row.id}
              data-keep={String(keep)}
            >
              <input
                type="checkbox"
                className={styles.box}
                checked={keep}
                aria-label={t('office.versions.cleanup.keep', { when })}
                data-testid="cleanup-keep"
                onChange={(e) => setKeep(row, e.target.checked)}
              />
              {row.previewUrl === null ? (
                <span className={styles.placeholder} data-testid="cleanup-no-preview">
                  {t('office.versions.cleanup.no_preview')}
                </span>
              ) : (
                <img
                  className={styles.thumb}
                  src={row.previewUrl}
                  alt={t('office.versions.cleanup.preview_alt', { when })}
                  width={132}
                  height={80}
                  loading="lazy"
                  decoding="async"
                  data-testid="cleanup-preview"
                />
              )}
              <div className={styles.facts}>
                <span className={styles.whenLine}>
                  <span className={styles.when} data-testid="cleanup-when">
                    {when}
                  </span>
                  {who.length > 0 ? (
                    <span className={styles.who} data-testid="cleanup-who">
                      {who.join(' · ')}
                    </span>
                  ) : null}
                </span>
                <span className={styles.summary} data-testid="cleanup-summary">
                  {text(cleanupSummaryText(row.summary))}
                </span>
                <span className={styles.age}>
                  {t('office.versions.cleanup.age', { count: age })}
                </span>
              </div>
              {keep ? (
                <label className={styles.nameField}>
                  <span className={styles.nameLabel}>{t('office.versions.name_label')}</span>
                  <input
                    type="text"
                    className={styles.nameInput}
                    value={c?.name ?? when}
                    data-testid="cleanup-name"
                    onChange={(e) => setName(row, e.target.value)}
                  />
                </label>
              ) : (
                <span className={styles.deletes} data-testid="cleanup-deletes">
                  <Icon name="delete" size={15} />
                  {t('office.versions.cleanup.deletes')}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className={styles.footer}>
        <span className={styles.footerIcon} aria-hidden="true">
          <Icon name="event" size={18} />
        </span>
        <span className={styles.footerText}>
          {deleteOn !== null ? (
            <span data-testid="cleanup-delete-on">
              {t('office.versions.cleanup.footer_lead')}{' '}
              <b className={styles.date} data-testid="cleanup-date">
                {deleteOnText(deleteOn, timeZone)}
              </b>
              {t('office.versions.cleanup.footer_tail', { count: graceDays })}
            </span>
          ) : null}
          <br />
          <span className={styles.footerNote}>{t('office.versions.cleanup.footer_note')}</span>
          {error !== null ? (
            <span className={styles.error} role="alert" data-testid="cleanup-error">
              {error}
            </span>
          ) : null}
        </span>
        <span className={styles.spacer} />
        <StateButton data-testid="cleanup-later" onClick={onLater}>
          {t('office.versions.cleanup.later')}
        </StateButton>
        {canSave ? (
          <StateButton
            data-testid="cleanup-save"
            variant="danger"
            className={styles.save}
            disabled={saving}
            onClick={onSave}
          >
            <Icon name="delete" size={18} />
            {t('office.versions.cleanup.save', { keep: keepCount, remove: removeCount })}
          </StateButton>
        ) : null}
      </div>
    </>
  );
}

const DialogClose: Part = ({ children }) => <Dialog.Close asChild>{children}</Dialog.Close>;

export function CleanupSheet(props: CleanupSheetProps): ReactElement {
  const t = useT();
  const [choices, setChoices] = useState<Map<string, Choice>>(() => new Map());
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) props.onLater();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          data-testid="cleanup-sheet"
          lang={t.language}
          className={styles.content}
          aria-describedby={undefined}
        >
          <CleanupSheetContent
            {...props}
            choices={choices}
            onChoices={(update) => setChoices((prev) => update(prev))}
            onSave={() => props.onSave(cleanupChoices(props.rows, choices, props.timeZone))}
            Title={Dialog.Title}
            Close={DialogClose}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
