'use client';
// EZD-409 (S04 Controls "Cabinet schedule | Inspector footer | Opens the schedule: code, qty, finish, notes"; S04
// Permissions "View projects: view ... schedule", "Export: export the cabinet schedule (CSV/PDF) from the schedule
// view"; 08 Exports "Cabinet schedule / order | CSV"; AC-EZD-409-1, -2; vault/build/assumptions.md EZD-409): the
// schedule view, opened over the inspector. Every viewer sees the table; Export CSV shows only with Export. The CSV
// is built in the browser from the model the viewer already reads, so the button only hides (Q-0214); the PDF comes
// with the sheets (EZD-707).
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { ModelObject } from '@ezdraft/geometry';
import { fetchPermissions } from '../../lib/permissions/PermissionsProvider';
import type { PermissionKey } from '../../lib/permissions/catalog';
import { useT } from '../../lib/messages';
import {
  cabinetSchedule,
  cabinetScheduleCsv,
  scheduleFinishText,
  scheduleNotesText,
  type CabinetScheduleRow,
} from '../../editor/cabinets/cabinet-schedule';
import styles from './CabinetSchedule.module.css';

export type PermissionsLoad = () => Promise<readonly PermissionKey[]>;

// Whether the member holds Export; false while loading or when the load fails (the button stays hidden).
export function useCanExport(load: PermissionsLoad): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    let live = true;
    load().then(
      (keys) => live && setCan(keys.includes('export')),
      () => live && setCan(false),
    );
    return () => {
      live = false;
    };
  }, [load]);
  return can;
}

export const loadPermissions: PermissionsLoad = fetchPermissions;

// Hands the CSV to the browser as a file download.
export type CsvSave = (fileName: string, csv: string) => void;

export const saveCsv: CsvSave = (fileName, csv) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export type CabinetScheduleViewProps = {
  objects: readonly ModelObject[];
  canExport: boolean;
  onClose(): void;
  save?: CsvSave;
};

export function CabinetScheduleView({
  objects,
  canExport,
  onClose,
  save = saveCsv,
}: CabinetScheduleViewProps): ReactElement {
  const t = useT();
  const rows: CabinetScheduleRow[] = useMemo(() => cabinetSchedule(objects), [objects]);
  const existing = (count: number) => t('office.cabinets.schedule_existing', { count });
  const headers = [
    t('office.cabinets.schedule_code'),
    t('office.cabinets.schedule_qty'),
    t('office.cabinets.schedule_finish'),
    t('office.cabinets.schedule_notes'),
  ] as const;
  const exportCsv = () =>
    save(t('office.cabinets.schedule_file'), cabinetScheduleCsv(rows, { headers, existing }));
  return (
    <div
      className={styles.layer}
      role="dialog"
      aria-label={t('office.cabinets.schedule')}
      data-testid="cabinet-schedule"
    >
      <div className={styles.head}>
        <span>{t('office.cabinets.schedule')}</span>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t('office.cabinets.close')}
          data-testid="cabinet-schedule-close"
        >
          ×
        </button>
      </div>
      <div className={styles.body}>
        {rows.length === 0 ? (
          <p className={styles.empty} data-testid="cabinet-schedule-empty">
            {t('office.cabinets.schedule_empty')}
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} data-testid="cabinet-schedule-row" data-code={r.code}>
                  <td className={styles.code}>{r.code}</td>
                  <td className={styles.qty} data-testid="cabinet-schedule-qty">
                    {r.qty}
                  </td>
                  <td>{scheduleFinishText(r)}</td>
                  <td className={styles.notes}>{scheduleNotesText(r, existing)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canExport ? (
        <div className={styles.foot}>
          <button
            type="button"
            className={styles.export}
            data-testid="cabinet-schedule-export"
            disabled={rows.length === 0}
            onClick={exportCsv}
          >
            {t('office.cabinets.schedule_export')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
