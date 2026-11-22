'use client';
// EZD-418 (S04b Layout "Inspector: ... Edit offered edges; Top schedule"; S04b Controls "Top schedule | Inspector
// footer | Opens schedule: material, thickness, area, edge length. Internal and client only; not on permit sheets";
// 08 Exports "Countertop schedule | On sheets, CSV"; R24 #5; board S04bCountertops inspector footer;
// AC-EZD-418-1; vault/build/assumptions.md EZD-418): the countertop inspector place with its footer's Top schedule
// button, and the schedule opened over it. Every viewer sees the table; Export CSV shows only with Export (as the
// cabinet schedule, EZD-409: the CSV is built in the browser from the model the viewer already reads). The piece
// inspector above the footer is EZD-414 (CountertopPieceInspector); Edit offered edges is EZD-417.
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { CountertopPieceData } from '@ezdraft/geometry';
import { fetchPermissions } from '../../lib/permissions/PermissionsProvider';
import type { PermissionKey } from '../../lib/permissions/catalog';
import type { CatalogItem } from '../../lib/catalog/catalog';
import { useT } from '../../lib/messages';
import type { ModelStore } from '../../editor/model/model-store';
import type { FloorChoice } from '../../editor/floors/floors';
import { countertopMaterialName } from '../../editor/countertops/material';
import { topScheduleCsv, topScheduleLines } from '../../editor/countertops/top-schedule';
import { fetchCatalog, type CountertopCatalogLoad } from './CountertopsPanel';
import { useCountertopFloor } from './use-countertop-floor';
import type { CountertopSelectionStore } from '../../editor/countertops/selection-store';
import { CountertopPieceInspector } from './CountertopPieceInspector';
import styles from './TopSchedule.module.css';

export type PermissionsLoad = () => Promise<readonly PermissionKey[]>;

// Whether the member holds Export; false while loading or when the load fails (the button stays hidden).
function useCanExport(load: PermissionsLoad): boolean {
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

export type TopScheduleViewProps = {
  pieces: readonly CountertopPieceData[];
  // The company catalog (material names); null while not read or when the read failed.
  catalog: readonly CatalogItem[] | null;
  canExport: boolean;
  onClose(): void;
  save?: CsvSave;
  // An edge profile's name; the profile library comes with EZD-417, so none is known until then.
  profileName?: (profileId: string) => string | null;
};

const noProfile = () => null;

export function TopScheduleView({
  pieces,
  catalog,
  canExport,
  onClose,
  save = saveCsv,
  profileName = noProfile,
}: TopScheduleViewProps): ReactElement {
  const t = useT();
  const headers = useMemo(
    () =>
      [
        t('office.countertops.schedule.piece'),
        t('office.countertops.schedule.material'),
        t('office.countertops.schedule.thickness'),
        t('office.countertops.schedule.area'),
        t('office.countertops.schedule.profile'),
        t('office.countertops.schedule.edge'),
      ] as const,
    [t],
  );
  const none = t('office.countertops.schedule.none');
  const materialUnknown = t('office.countertops.panel.material_chosen');
  const lines = useMemo(
    () =>
      topScheduleLines(pieces, {
        headers,
        none,
        materialName: (id) => countertopMaterialName(catalog, id),
        materialUnknown,
        profileName,
        thicknessCm: (cm) => t('office.countertops.panel.thickness_cm', { cm }),
      }),
    [pieces, catalog, profileName, headers, none, materialUnknown, t],
  );
  const exportCsv = () => save(t('office.countertops.schedule.file'), topScheduleCsv(lines, headers));
  return (
    <div
      className={styles.layer}
      role="dialog"
      aria-label={t('office.countertops.schedule.title')}
      data-testid="top-schedule"
    >
      <div className={styles.head}>
        <span>{t('office.countertops.schedule.title')}</span>
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={t('office.countertops.panel.close')}
          data-testid="top-schedule-close"
        >
          ×
        </button>
      </div>
      <div className={styles.body}>
        {lines.length === 0 ? (
          <p className={styles.empty} data-testid="top-schedule-empty">
            {t('office.countertops.schedule.empty')}
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
              {lines.map((l) => (
                <tr key={l.label} data-testid="top-schedule-row" data-label={l.label}>
                  {l.cells.map((c, i) => (
                    <td key={i} className={i >= 2 && i !== 4 ? styles.num : undefined}>
                      {c}
                    </td>
                  ))}
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
            data-testid="top-schedule-export"
            disabled={lines.length === 0}
            onClick={exportCsv}
          >
            {t('office.countertops.schedule.export')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type CountertopsInspectorProps = {
  store: ModelStore;
  floors?: FloorChoice;
  // GET /api/catalog and GET /api/me/permissions by default; tests pass their own.
  loadCatalog?: CountertopCatalogLoad;
  loadPermissions?: PermissionsLoad;
  // The schedule already open (tests).
  initialOpen?: boolean;
  save?: CsvSave;
  // EZD-414: the shared countertop selection; with it the selected top's piece inspector shows above the footer.
  selection?: CountertopSelectionStore;
  // Edit model and holding the lock; without it the piece inspector only reads.
  canEdit?: boolean;
  // The effective Defaults (the four overhangs the preset chips set); null while not read.
  defaults?: Readonly<Record<string, unknown>> | null;
};

// The countertop inspector place while the Countertops tool is on: the selected top's piece inspector (EZD-414) and
// the footer (vault/build/assumptions.md EZD-418).
export function CountertopsInspector({
  store,
  floors,
  loadCatalog = fetchCatalog,
  loadPermissions = fetchPermissions,
  initialOpen = false,
  save,
  selection,
  canEdit = false,
  defaults = null,
}: CountertopsInspectorProps): ReactElement {
  const t = useT();
  const { pieces } = useCountertopFloor(store, floors);
  const [open, setOpen] = useState(initialOpen);
  const canExport = useCanExport(loadPermissions);
  const [catalog, setCatalog] = useState<readonly CatalogItem[] | null>(null);
  // EZD-414: the piece header names the top's material, so a floor with a material on a top reads the catalog too.
  const needsCatalog = open || (selection !== undefined && pieces.some((p) => p.data.attributes.materialItemId !== null));
  useEffect(() => {
    if (!needsCatalog || catalog !== null) return;
    let live = true;
    loadCatalog().then(
      (items) => live && setCatalog(items),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [needsCatalog, catalog, loadCatalog]);
  const data = useMemo(() => pieces.map((p) => p.data), [pieces]);
  return (
    <div className={styles.panel} data-testid="countertop-inspector">
      {selection !== undefined ? (
        <CountertopPieceInspector
          store={store}
          pieces={pieces}
          selection={selection}
          canEdit={canEdit}
          defaults={defaults}
          catalog={catalog}
        />
      ) : null}
      <span className={styles.grow} />
      <footer className={styles.footer}>
        {/* Every viewer opens the schedule (S04b Permissions "View projects: view pieces"). */}
        <button
          type="button"
          className={styles.footerButton}
          data-testid="countertop-top-schedule"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          {t('office.countertops.schedule.title')}
        </button>
      </footer>
      {open ? (
        <TopScheduleView
          pieces={data}
          catalog={catalog}
          canExport={canExport}
          onClose={() => setOpen(false)}
          save={save}
        />
      ) : null}
    </div>
  );
}
