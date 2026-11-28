'use client';
// EZD-610 (S06 Controls "Selected circuit block | Inspector | Circuit tag, name, location summary, breaker, wire, run
// length, voltage drop, per-circuit code check rows with NEC references. | Read only in view only. Fields editable
// with Edit model (breaker, wire, name). Voltage drop shows a warning above the threshold in settings."; S06
// Decisions 8; board S06Electrical "Selected circuit A-14", "Run 58 ft", "V-drop @16A 3.1%", "V-drop 3.1% is over the
// 3% limit (Defaults). Use 10/2 or shorten the run."; vault/build/assumptions/EZD-610.md): the chosen circuit's block.
// Until the inspector exists (EZD-608) it sits under the chosen circuit's row in the left panel, where EZD-604 put
// Breaker, Poles and Wire (their test ids stay). Shown to every viewer: read-only rows without Edit model, the
// controls disabled while paused. Per-circuit code check rows arrive with EZD-611a.
import { WIRE_MATERIALS, WIRE_SIZES, type WireMaterial, type WireSize } from '@ezdraft/geometry';
import { useMemo, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import type { Objects } from '../model/patches';
import { BREAKER_SIZES, panelLetter, type CircuitEdit } from './circuits';
import type { CircuitRow } from './electrical';
import styles from './ElectricalPanel.module.css';
import { circuitVoltageDrop } from './voltage-drop';

export type SelectedCircuitProps = {
  circuit: CircuitRow;
  panelName: string;
  objects: Objects;
  /** The company's "Voltage-drop warning" percent; null while Not set. */
  threshold: number | null;
  /** Given with Edit model; `writable` false while paused (the controls show disabled). */
  edit?: { writable: boolean; onEdit: (e: CircuitEdit) => void };
};

const MATERIAL_LABEL = {
  copper: 'office.electrical.circuit.copper',
  aluminum: 'office.electrical.circuit.aluminum',
} as const;

export function SelectedCircuit({
  circuit: c,
  panelName,
  objects,
  threshold,
  edit,
}: SelectedCircuitProps): ReactElement {
  const t = useT();
  const drop = useMemo(() => circuitVoltageDrop(objects, c, threshold), [objects, c, threshold]);
  const number = new Intl.NumberFormat(t.language, { maximumFractionDigits: 1 });
  const awg = (size: WireSize) => t('office.electrical.circuit.awg', { size });
  const wireText = (size: WireSize) =>
    c.poles === 1 ? t('office.electrical.circuit.cable', { size }) : awg(size);
  const disabled = edit === undefined || !edit.writable;
  const runText =
    c.run === null
      ? t('office.electrical.circuit.vdrop_none')
      : t('office.electrical.circuit.run_ft', { feet: number.format(c.run) });

  const commitRun = (text: string) => {
    if (edit === undefined || !edit.writable) return;
    const trimmed = text.trim();
    const feet = trimmed === '' ? null : Number(trimmed);
    if (feet === c.run) return;
    edit.onEdit({ field: 'run', feet });
  };

  return (
    <div className={styles.selected} data-testid="circuit-selected">
      <div className={styles.selectedHead}>
        <span className={styles.lbl}>{t('office.electrical.circuit.selected')}</span>
        <span className={styles.tag} data-testid="circuit-tag">
          {t('office.electrical.circuit.tag', { letter: panelLetter(panelName), number: c.number })}
        </span>
      </div>
      {edit !== undefined ? (
        <div className={styles.fields} data-testid="circuit-fields">
          <label className={styles.field}>
            <span>{t('office.electrical.circuit.breaker_label')}</span>
            <select
              className={styles.select}
              data-testid="circuit-breaker"
              disabled={disabled}
              value={c.breaker}
              onChange={(e) => edit.onEdit({ field: 'breaker', amps: Number(e.target.value) })}
            >
              {(BREAKER_SIZES as readonly number[]).includes(c.breaker) ? null : (
                <option value={c.breaker}>{c.breaker}</option>
              )}
              {BREAKER_SIZES.map((a) => (
                <option key={a} value={a}>
                  {t('office.electrical.circuit.breaker', { amps: a })}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('office.electrical.circuit.poles_label')}</span>
            <select
              className={styles.select}
              data-testid="circuit-poles"
              disabled={disabled}
              value={c.poles}
              onChange={(e) =>
                edit.onEdit({ field: 'poles', poles: e.target.value === '2' ? 2 : 1 })
              }
            >
              <option value={1}>{t('office.electrical.circuit.one_pole')}</option>
              <option value={2}>{t('office.electrical.circuit.two_pole')}</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('office.electrical.circuit.wire_label')}</span>
            <select
              className={styles.select}
              data-testid="circuit-wire"
              disabled={disabled}
              value={c.wire ?? ''}
              onChange={(e) => edit.onEdit({ field: 'wire', size: e.target.value as WireSize })}
            >
              {c.wire === null ? (
                <option value="">{t('office.electrical.circuit.not_set')}</option>
              ) : null}
              {WIRE_SIZES.map((w) => (
                <option key={w} value={w}>
                  {awg(w)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('office.electrical.circuit.material_label')}</span>
            <select
              className={styles.select}
              data-testid="circuit-material"
              disabled={disabled}
              value={c.material}
              onChange={(e) =>
                edit.onEdit({ field: 'material', material: e.target.value as WireMaterial })
              }
            >
              {WIRE_MATERIALS.map((m) => (
                <option key={m} value={m}>
                  {t(MATERIAL_LABEL[m])}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>{t('office.electrical.circuit.run_label')}</span>
            <input
              // Keyed by the stored run, so an undo or a remote change shows in the box.
              key={String(c.run)}
              className={styles.runInput}
              data-testid="circuit-run"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              disabled={disabled}
              defaultValue={c.run ?? ''}
              onBlur={(e) => commitRun(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
          </label>
        </div>
      ) : (
        <dl className={styles.rows} data-testid="circuit-rows">
          <dt>{t('office.electrical.circuit.breaker_label')}</dt>
          <dd data-testid="circuit-breaker-text">
            {[
              t('office.electrical.circuit.breaker', { amps: c.breaker }),
              t(
                c.poles === 2
                  ? 'office.electrical.circuit.two_pole'
                  : 'office.electrical.circuit.one_pole',
              ),
            ].join(' · ')}
          </dd>
          <dt>{t('office.electrical.circuit.wire_label')}</dt>
          <dd data-testid="circuit-wire-text">
            {c.wire === null
              ? t('office.electrical.circuit.not_set')
              : `${awg(c.wire)} · ${t(MATERIAL_LABEL[c.material])}`}
          </dd>
          <dt>{t('office.electrical.circuit.run')}</dt>
          <dd data-testid="circuit-run-text">{runText}</dd>
        </dl>
      )}
      <dl className={styles.rows}>
        <dt data-testid="circuit-vdrop-label">
          {t('office.electrical.circuit.vdrop_label', { amps: number.format(drop.amps) })}
        </dt>
        <dd
          className={drop.warns ? styles.warnValue : undefined}
          data-testid="circuit-vdrop"
          data-warns={drop.warns}
        >
          {drop.shown === null
            ? t('office.electrical.circuit.vdrop_none')
            : t('office.electrical.circuit.vdrop', { percent: drop.shown })}
        </dd>
      </dl>
      {drop.shown !== null && drop.threshold === null ? (
        <p className={styles.vdropNote} data-testid="circuit-vdrop-set">
          {t('office.electrical.circuit.vdrop_set')}
        </p>
      ) : null}
      {drop.warns && drop.shown !== null && drop.threshold !== null ? (
        <p className={styles.vdropWarn} role="status" data-testid="circuit-vdrop-warning">
          {drop.suggestion === null
            ? t('office.electrical.circuit.vdrop_shorten', {
                percent: drop.shown,
                limit: number.format(drop.threshold),
              })
            : t('office.electrical.circuit.vdrop_warn', {
                percent: drop.shown,
                limit: number.format(drop.threshold),
                wire: wireText(drop.suggestion),
              })}
        </p>
      ) : null}
    </div>
  );
}
