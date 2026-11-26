'use client';
// EZD-612 (S03 Check "opens the warning list; click a warning to zoom to the object"; S06 Check "Results list in a
// panel: each warning with rule, NEC reference, device, and Go to"; phase-06 EZD-612 row: Warnings, Needs a value and
// Checklist groups, the code and section, the link, the not-yet-verified tag and the closing line; AC-EZD-612-1, -3):
// the code check results list in the canvas column. Warnings only, never an auto-fix. No board: built in the style of
// the conflict list (Q-0769). Wording: assumptions EZD-612.
import { formatLength, type CheckResult } from '@ezdraft/geometry';
import { useState, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import { editionLabel, CODE_EDITIONS, type CodeEdition } from '../../lib/code-edition/editions';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import {
  CHECK_GROUPS,
  groupResults,
  openCount,
  type CheckGroup,
  type CheckItem,
  type CodeCheckRun,
} from './check-status';
import styles from './CheckResultsPanel.module.css';

export type CheckResultsPanelProps = {
  status: 'loading' | 'running' | 'failed' | 'ready';
  run: CodeCheckRun | null;
  changedSinceRun: boolean;
  canRun: boolean;
  canAccept: boolean;
  // The object's name as the plan shows it (a room's name, a device's kind), or null when it is not in the model.
  objectName: (id: string) => string | null;
  onGoTo: (objectId: string) => void;
  onRun: () => void;
  onAccept: (item: { ruleId: string; objectId: string; note: string }) => Promise<boolean>;
  onClose: () => void;
};

const button = `${styles.button} ${touch.target}`;

const GROUP_KEY: Record<CheckGroup, MessageKey> = {
  warnings: 'office.check.group.warnings',
  needs_value: 'office.check.group.needs_value',
  checklist: 'office.check.group.checklist',
  notes: 'office.check.group.notes',
};

const ruleKey = (ruleId: string) => `office.check.rule.${ruleId.toLowerCase().replace(/-/g, '_')}`;

const inches = (v: unknown): string | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? formatLength(v, 16) : null;

function Item({
  item,
  canAccept,
  objectName,
  onGoTo,
  onAccept,
}: {
  item: CheckItem;
  canAccept: boolean;
  objectName: (id: string) => string | null;
  onGoTo: (objectId: string) => void;
  onAccept: CheckResultsPanelProps['onAccept'];
}): ReactElement {
  const t = useT();
  const r: CheckResult = item.result;
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const key = ruleKey(r.ruleId);
  const title = t.has(key) ? t(key as MessageKey) : r.ruleId;
  const object = objectName(r.objectId) ?? r.objectType;
  const reference =
    r.code === 'company' ? t('office.check.company_rule') : `${r.code} ${r.section ?? ''}`.trim();
  let detail: string | null = null;
  if (r.status === 'cannot_check' && r.need !== undefined)
    detail =
      r.code === 'company'
        ? t('office.check.need_defaults', { need: r.need })
        : t('office.check.need_object', { need: r.need, object });
  else if (r.status === 'fail') {
    const measured = inches(r.values?.measured);
    const required = inches(r.values?.required);
    if (measured !== null && required !== null)
      detail = t('office.check.measured', { measured, required });
  }
  const save = async () => {
    const text = note.trim();
    if (text === '' || saving) return;
    setSaving(true);
    setError(false);
    const ok = await onAccept({ ruleId: r.ruleId, objectId: r.objectId, note: text });
    setSaving(false);
    if (ok) setNoting(false);
    else setError(true);
  };
  return (
    <li
      className={item.accepted ? `${styles.item} ${styles.accepted}` : styles.item}
      data-testid="check-item"
      data-rule-id={r.ruleId}
      data-object-id={r.objectId}
      data-accepted={item.accepted ? 'true' : 'false'}
    >
      <div className={styles.itemHead}>
        <span className={styles.itemTitle} data-testid="check-item-title">
          {title}
        </span>
        <span className={styles.object}>· {object}</span>
        <button
          type="button"
          className={button}
          data-testid="check-go-to"
          onClick={() => onGoTo(r.objectId)}
        >
          {t('office.check.go_to')}
        </button>
      </div>
      <div className={styles.meta}>
        {r.url ? (
          <a className={styles.link} href={r.url} target="_blank" rel="noreferrer noopener">
            {reference}
          </a>
        ) : (
          <span>{reference}</span>
        )}
        <span className={styles.ruleId}>{r.ruleId}</span>
        {r.unverified ? (
          <span className={styles.tag} data-testid="check-unverified">
            {t('office.check.unverified')}
          </span>
        ) : null}
      </div>
      {detail === null ? null : (
        <p className={styles.detail} data-testid="check-item-detail">
          {detail}
        </p>
      )}
      {item.accepted ? (
        <div className={styles.acceptedNote} data-testid="check-accepted">
          <span className={styles.acceptedBy}>
            {item.accepted.byName
              ? t('office.check.accepted_by', {
                  name: item.accepted.byName,
                  date: new Date(item.accepted.at).toLocaleDateString('en-US'),
                })
              : t('office.check.accepted_by_unknown', {
                  date: new Date(item.accepted.at).toLocaleDateString('en-US'),
                })}
          </span>
          <span data-testid="check-accepted-note">{item.accepted.note}</span>
        </div>
      ) : canAccept && r.status === 'fail' && r.severity === 'warning' ? (
        noting ? (
          <div className={styles.noteForm}>
            <label className={styles.noteLabel}>
              {t('office.check.note')}
              <textarea
                className={styles.noteInput}
                data-testid="check-note"
                value={note}
                maxLength={2000}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
                autoFocus
              />
            </label>
            {error ? (
              <p className={styles.error} role="alert">
                {t('office.check.accept_failed')}
              </p>
            ) : null}
            <div className={styles.noteActions}>
              <button
                type="button"
                className={`${button} ${styles.primary}`}
                data-testid="check-accept-save"
                disabled={note.trim() === '' || saving}
                onClick={() => void save()}
              >
                {t('office.check.accept_save')}
              </button>
              <button type="button" className={button} onClick={() => setNoting(false)}>
                {t('office.check.accept_cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={button}
            data-testid="check-accept"
            onClick={() => setNoting(true)}
          >
            {t('office.check.accept')}
          </button>
        )
      ) : null}
    </li>
  );
}

export function CheckResultsPanel(props: CheckResultsPanelProps): ReactElement {
  const t = useT();
  const { status, run } = props;
  const groups = run === null ? null : groupResults(run);
  const count = run === null ? 0 : openCount(run);
  const edition =
    run !== null && (CODE_EDITIONS as readonly string[]).includes(run.edition)
      ? t(editionLabel(run.edition as CodeEdition))
      : (run?.edition ?? null);
  return (
    <section
      className={styles.panel}
      data-testid="check-panel"
      aria-label={t('office.check.title')}
    >
      <header className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.titleRow}>
            <h2 className={styles.title}>{t('office.check.title')}</h2>
            {run !== null ? (
              <span
                className={count === 0 ? styles.countPass : styles.count}
                data-testid="check-open-count"
              >
                {count}
              </span>
            ) : null}
          </div>
          {edition !== null ? (
            <span className={styles.note}>{t('office.check.edition', { edition })}</span>
          ) : null}
        </div>
        {props.canRun ? (
          <button
            type="button"
            className={button}
            data-testid="check-run-again"
            disabled={status === 'running'}
            onClick={props.onRun}
          >
            {t('office.check.run_again')}
          </button>
        ) : null}
        <button
          type="button"
          className={`${button} ${styles.close}`}
          aria-label={t('office.check.close')}
          data-testid="check-close"
          onClick={props.onClose}
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className={styles.body}>
        {status === 'running' || status === 'loading' ? (
          <p className={styles.state} role="status">
            {t('office.check.running')}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p className={styles.error} role="alert" data-testid="check-failed">
            {t('office.check.failed')}
          </p>
        ) : null}
        {status === 'ready' && run === null ? (
          <p className={styles.state}>{t('office.check.not_run_yet')}</p>
        ) : null}
        {run !== null && props.changedSinceRun ? (
          <p className={styles.state} data-testid="check-changed">
            {t('office.check.changed')}
          </p>
        ) : null}
        {groups === null
          ? null
          : CHECK_GROUPS.filter((g) => g !== 'notes' || groups.notes.length > 0).map((g) => (
              <div key={g} className={styles.group} data-testid={`check-group-${g}`}>
                <h3 className={styles.groupHead}>
                  {t(GROUP_KEY[g])}
                  <span className={styles.groupCount}>{groups[g].length}</span>
                </h3>
                {groups[g].length === 0 ? (
                  <p className={styles.empty}>{t('office.check.group_empty')}</p>
                ) : (
                  <ul className={styles.list}>
                    {groups[g].map((item) => (
                      <Item
                        key={item.key}
                        item={item}
                        canAccept={props.canAccept}
                        objectName={props.objectName}
                        onGoTo={props.onGoTo}
                        onAccept={props.onAccept}
                      />
                    ))}
                  </ul>
                )}
              </div>
            ))}
        {run !== null ? <p className={styles.closing}>{t('office.check.not_checked')}</p> : null}
      </div>
    </section>
  );
}
