'use client';
// EZD-418 (S04b Layout "Inspector: ... Edit offered edges; Top schedule"; S04b Controls "Top schedule | Inspector
// footer | Opens schedule: material, thickness, area, edge length. Internal and client only; not on permit sheets";
// 08 Exports "Countertop schedule | On sheets, CSV"; R24 #5; board S04bCountertops inspector footer;
// AC-EZD-418-1; vault/build/assumptions.md EZD-418): the countertop inspector place with its footer's Top schedule
// button, and the schedule opened over it. Every viewer sees the table; Export CSV shows only with Export (as the
// cabinet schedule, EZD-409: the CSV is built in the browser from the model the viewer already reads). The piece
// inspector above the footer is EZD-414 (CountertopPieceInspector).
// EZD-417 (S04b Layout "Inspector: ... Edge profile; offered list; Edit offered edges; Top schedule"; S04b Permissions
// "Edit model: ... profile edits", "See sell prices: price differences in the offered list", "Send to client: "Edit
// offered edges""; vault/build/assumptions.md EZD-417): the selected top's Edge profile card under the piece
// inspector, Edit offered edges on the footer's left for members with Send to client, and profile names in the
// schedule. One permissions read serves Export, Send to client and See sell prices.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
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
import {
  edgeProfileChanges,
  fetchEdgeProfiles,
  offerFor,
  putEdgeOffer,
  type EdgeOffer,
  type EdgeOfferChoice,
  type EdgeOfferSave,
  type EdgeOffersLoad,
  type EdgeProfile,
  type EdgeProfilesLoad,
} from '../../editor/countertops/edge-profile';
import { EdgeProfileCard, replaceEdgeOffer, useEdgeOffers, useProjectId } from './EdgeProfileCard';
import { EditOfferedEdges } from './EditOfferedEdges';
import styles from './TopSchedule.module.css';
import offerStyles from './EditOfferedEdges.module.css';

export type PermissionsLoad = () => Promise<readonly PermissionKey[]>;

// The member's switches; none while loading or when the load fails (the buttons and prices stay hidden).
function usePermissionKeys(load: PermissionsLoad): ReadonlySet<PermissionKey> {
  const [keys, setKeys] = useState<ReadonlySet<PermissionKey>>(() => new Set());
  useEffect(() => {
    let live = true;
    load().then(
      (k) => live && setKeys(new Set(k)),
      () => live && setKeys(new Set()),
    );
    return () => {
      live = false;
    };
  }, [load]);
  return keys;
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
  // EZD-417: the project (else the editor route's id), the library and offer loads, and the offer save; tests pass
  // their own, and may give the library, offers and switches already read.
  projectId?: string | null;
  loadProfiles?: EdgeProfilesLoad;
  loadOffers?: EdgeOffersLoad;
  saveOffer?: EdgeOfferSave;
  profiles?: readonly EdgeProfile[];
  offers?: readonly EdgeOffer[];
  permissions?: readonly PermissionKey[];
  initialEditOpen?: boolean;
};

const noSubscribe = () => () => {};
const NO_PICK = { pieceId: null, edge: null };

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
  projectId: givenProjectId,
  loadProfiles = fetchEdgeProfiles,
  loadOffers,
  saveOffer = putEdgeOffer,
  profiles: givenProfiles,
  offers: givenOffers,
  permissions,
  initialEditOpen = false,
}: CountertopsInspectorProps): ReactElement {
  const t = useT();
  const { pieces } = useCountertopFloor(store, floors);
  const [open, setOpen] = useState(initialOpen);
  const [editOpen, setEditOpen] = useState(initialEditOpen);
  const loadedKeys = usePermissionKeys(loadPermissions);
  const keys = useMemo(
    () => (permissions === undefined ? loadedKeys : new Set(permissions)),
    [permissions, loadedKeys],
  );
  const canExport = keys.has('export');
  const canSend = keys.has('send_to_client');
  const canSeePrices = keys.has('see_sell_prices');
  const projectId = useProjectId(givenProjectId);
  const sharedOffers = useEdgeOffers(givenOffers === undefined ? projectId : null, loadOffers);
  const offers = givenOffers ?? sharedOffers;
  const picked = useSyncExternalStore(
    selection ? selection.subscribe : noSubscribe,
    () => selection?.getState().selection ?? NO_PICK,
    () => selection?.getState().selection ?? NO_PICK,
  );
  const piece =
    picked.pieceId === null ? undefined : pieces.find((p) => p.id.toLowerCase() === picked.pieceId!.toLowerCase());
  // EZD-417: the library, read once the inspector shows a top or the schedule opens.
  const [loadedProfiles, setLoadedProfiles] = useState<readonly EdgeProfile[] | null>(null);
  const profiles = givenProfiles ?? loadedProfiles;
  const needsProfiles = givenProfiles === undefined && (open || piece !== undefined || pieces.length > 0);
  useEffect(() => {
    if (!needsProfiles || loadedProfiles !== null) return;
    let live = true;
    loadProfiles().then(
      (p) => live && setLoadedProfiles(p),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [needsProfiles, loadedProfiles, loadProfiles]);
  const profileName = useCallback(
    (id: string) => profiles?.find((p) => p.id.toLowerCase() === id.toLowerCase())?.name ?? null,
    [profiles],
  );
  const offer = piece === undefined ? null : offerFor(offers, piece.id);
  const pickProfile = (profileId: string) => {
    if (!canEdit || piece === undefined) return;
    const changes = edgeProfileChanges(pieces, piece.id, profileId);
    if (changes.length > 0) store.applyEdit(changes);
  };
  const saveChoices = async (choices: EdgeOfferChoice[]) => {
    if (projectId === null || piece === undefined) return;
    const saved = await saveOffer(projectId, { pieceId: piece.id, choices });
    replaceEdgeOffer(projectId, piece.id, saved);
    setEditOpen(false);
  };
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
      {piece !== undefined ? (
        <EdgeProfileCard
          piece={piece.data}
          profiles={profiles}
          offer={offer}
          canEdit={canEdit}
          canSeePrices={canSeePrices}
          onPick={pickProfile}
        />
      ) : null}
      <span className={styles.grow} />
      <footer className={styles.footer}>
        {/* EZD-417: Send to client only (S04b "Requires Send to client; hidden otherwise"). */}
        {canSend ? (
          <button
            type="button"
            className={offerStyles.footerButton}
            data-testid="countertop-edit-offered"
            aria-expanded={editOpen}
            disabled={piece === undefined || profiles === null || projectId === null}
            onClick={() => setEditOpen(true)}
          >
            {t('office.countertops.edge.edit_offered')}
          </button>
        ) : null}
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
          profileName={profileName}
        />
      ) : null}
      {editOpen && canSend && piece !== undefined && profiles !== null ? (
        <EditOfferedEdges
          key={piece.id}
          piece={piece.data}
          profiles={profiles}
          offer={offer}
          canSeePrices={canSeePrices}
          onSave={saveChoices}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </div>
  );
}
