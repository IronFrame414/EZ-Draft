'use client';
// EZD-609 (S06 Controls "Panel tab | Left panel segment | Compact panel schedule: two columns of spaces (odd/even)
// with circuit number, name, breaker; open spaces shown empty. Click a space selects its circuit. | Allowed in view
// only"; "Panel schedule | ... | Opens the generated panel schedule: space, circuit, breaker size, poles, wire size,
// AFCI/GFCI type, load; flags spaces left. | Read only in schedule; edits happen on circuits."; Q-0769 "full panel
// schedule" with no board, built in the style of the nearest approved board; vault/build/assumptions.md EZD-609): the
// compact schedule of the Panel tab and the full schedule dialog. Both read only.
import type { CircuitProtection } from '@ezdraft/geometry';
import { Dialog } from 'radix-ui';
import type { ReactElement } from 'react';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import touch from '../../styles/touch.module.css';
import { scheduleRows, type PanelSchedule, type ScheduleSpace } from './panel-schedule';
import styles from './PanelSchedule.module.css';
import { sameId } from '../shared/ids';

const PROTECTION_LABEL: Readonly<Record<CircuitProtection, MessageKey>> = {
  gfci: 'office.electrical.protection.gfci',
  afci: 'office.electrical.protection.afci',
  dual: 'office.electrical.protection.dual',
};

function SpacesLeft({ schedule }: { schedule: PanelSchedule }): ReactElement | null {
  const t = useT();
  if (schedule.spacesLeft === null) return null;
  const none = schedule.spacesLeft === 0;
  return (
    <p
      className={`${styles.left} ${none ? styles.leftNone : ''}`}
      role="status"
      data-testid="panel-schedule-left"
      data-spaces-left={schedule.spacesLeft}
    >
      {none
        ? t('office.electrical.schedule.no_spaces_left')
        : t('office.electrical.schedule.spaces_left', { count: schedule.spacesLeft })}
    </p>
  );
}

export type CompactScheduleProps = {
  schedule: PanelSchedule;
  /** The chosen circuit, shown in the accent. */
  chosen: string | null;
  onChoose: (circuitId: string) => void;
};

/** The Panel tab: odd spaces down the left, even down the right; a taken space selects its circuit. */
export function CompactSchedule({
  schedule,
  chosen,
  onChoose,
}: CompactScheduleProps): ReactElement {
  const t = useT();
  const cell = (s: ScheduleSpace) => {
    const c = s.circuit;
    if (c === null)
      return (
        <div
          key={s.space}
          className={`${styles.space} ${styles.open}`}
          data-testid="schedule-space"
          data-space={s.space}
        >
          <span className={styles.num}>{s.space}</span>
        </div>
      );
    const on = chosen !== null && sameId(chosen, c.id);
    return (
      <button
        key={s.space}
        type="button"
        className={`${styles.space} ${on ? styles.on : ''} ${s.first ? '' : styles.second} ${touch.target}`}
        data-testid="schedule-space"
        data-space={s.space}
        data-circuit-id={c.id}
        aria-pressed={on}
        onClick={() => onChoose(c.id)}
      >
        <span className={styles.num}>{s.space}</span>
        <span className={styles.text}>
          <span className={styles.name} data-testid="schedule-space-name">
            {c.name}
          </span>
          {s.first ? (
            <span className={styles.meta} data-testid="schedule-space-meta">
              {`${c.number} · ${t('office.electrical.circuit.breaker', { amps: c.breaker })}`}
            </span>
          ) : null}
        </span>
      </button>
    );
  };
  return (
    <div className={styles.compact} data-testid="panel-schedule-compact">
      <div className={styles.grid}>
        {scheduleRows(schedule).flatMap((r) => [cell(r.left), cell(r.right)])}
      </div>
      <SpacesLeft schedule={schedule} />
    </div>
  );
}

export type ScheduleDialogProps = {
  schedule: PanelSchedule;
  /** The panel header ("Panel A · 200A main"). */
  title: string;
  onClose: () => void;
};

/** The full schedule's table: one row per space, read only (no inputs). */
export function ScheduleTable({ schedule }: { schedule: PanelSchedule }): ReactElement {
  const t = useT();
  const number = new Intl.NumberFormat(t.language);
  const cols: MessageKey[] = [
    'office.electrical.schedule.col.space',
    'office.electrical.schedule.col.circuit',
    'office.electrical.schedule.col.breaker',
    'office.electrical.schedule.col.poles',
    'office.electrical.schedule.col.wire',
    'office.electrical.schedule.col.protection',
    'office.electrical.schedule.col.load',
  ];
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {cols.map((k) => (
            <th key={k} scope="col">
              {t(k)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {schedule.spaces.map((s) => {
          const c = s.circuit;
          const full = c !== null && s.first;
          return (
            <tr
              key={s.space}
              data-testid="panel-schedule-row"
              data-space={s.space}
              className={c === null ? styles.openRow : undefined}
            >
              <td className={styles.mono}>{s.space}</td>
              <td>{c === null ? '' : `${c.number} ${c.name}`}</td>
              <td className={styles.mono}>
                {full ? t('office.electrical.circuit.breaker', { amps: c.breaker }) : ''}
              </td>
              <td className={styles.mono}>{full ? c.poles : ''}</td>
              <td className={styles.mono}>
                {!full
                  ? ''
                  : c.wire === null
                    ? t('office.electrical.circuit.not_set')
                    : t('office.electrical.circuit.awg', { size: c.wire })}
              </td>
              <td>{full && c.protection !== null ? t(PROTECTION_LABEL[c.protection]) : ''}</td>
              <td className={styles.load}>
                {full ? t('office.electrical.va', { va: number.format(c.load) }) : ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The full schedule: one row per space, read only. */
export function ScheduleDialog({ schedule, title, onClose }: ScheduleDialogProps): ReactElement {
  const t = useT();
  return (
    <Dialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          data-testid="panel-schedule-dialog"
          lang={t.language}
          className={styles.content}
          aria-describedby={undefined}
        >
          <div className={styles.body}>
            <Dialog.Title className={styles.dialogTitle}>
              {t('office.electrical.schedule.open')}
            </Dialog.Title>
            <p className={styles.sub}>{title}</p>
            <ScheduleTable schedule={schedule} />
            <SpacesLeft schedule={schedule} />
          </div>
          <div className={styles.footer}>
            <Dialog.Close asChild>
              <button
                type="button"
                className={`${styles.close} ${touch.target}`}
                data-testid="panel-schedule-close"
              >
                {t('office.electrical.schedule.close')}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
