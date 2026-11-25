// EZD-403 (S04 Layout "Left panel 248px 'Cabinet library': tabs Boxes / Runs / Saved; search; line section; Fillers,
// panels, trim section"; S04 Controls (left panel); S04 Permissions "Edit model: place ... boxes. Also requires the edit
// lock", "Edit catalog: ... (the library here only reads them)"; board S04Cabinets; AC-EZD-403-1;
// vault/build/assumptions.md EZD-403): the cabinet library in the left panel while the Cabinets tool is on. Rows are
// dragged onto the plan strip or the elevation (CabinetRunView takes the drop); the Runs tab opens another run of the
// floor; the line picker chooses the vendor line whose catalog items the placed boxes take.
import { Fragment, useMemo, useState, type DragEvent, type ReactElement } from 'react';
import { useStore } from 'zustand';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import { inchText } from '../../editor/shared/inch-text';
import type { ModelStore } from '../../editor/model/model-store';
import type { FloorChoice } from '../../editor/floors/floors';
import type { CabinetSelectionStore } from '../../editor/cabinets/cabinet-selection-store';
import {
  cabinetRuns,
  cabinetTrimChanges,
  cabinetView,
  cabinetViewFit,
} from '../../editor/cabinets/cabinet-view';
import {
  LIBRARY_DRAG_TYPE,
  libraryCode,
  libraryLineItems,
  libraryLines,
  searchLibrary,
  type LibraryDrag,
  type LibraryMatch,
  type LibraryTrim,
} from '../../editor/cabinets/cabinet-library';
import { fetchCatalog, useCatalog } from './BoxInspector';
import { useCabinetModel } from './CabinetRunView';
import type { CatalogItem } from '../../lib/catalog/catalog';
import type { MessageKey } from '../../server/messages/catalog';
import styles from './CabinetLibrary.module.css';

export type CabinetLibraryProps = {
  store: ModelStore;
  floors?: FloorChoice;
  selectionStore: CabinetSelectionStore;
  // Edit model and holding the lock; without it rows do not drag and trim is not added.
  canEdit?: boolean;
  // EZD-407: the Defaults "Cabinet fit" tolerance for the Runs tab's fit status; null while not set.
  fitTolerance?: number | null;
  // GET /api/catalog by default; tests pass their own.
  loadCatalog?: () => Promise<CatalogItem[]>;
  newId?: () => string;
};

type Tab = 'boxes' | 'runs' | 'saved';
const TABS: readonly Tab[] = ['boxes', 'runs', 'saved'];
// The line picker's "Custom boxes" choice.
const CUSTOM = { kind: 'custom' } as const;
type LineChoice = { kind: 'line'; line: string } | typeof CUSTOM;

const TRIM_TITLE: Partial<Record<LibraryTrim['kind'], MessageKey>> = {
  toe_kick: 'office.cabinets.library.trim.toe_kick',
  light_rail: 'office.cabinets.library.trim.light_rail',
  crown: 'office.cabinets.library.trim.crown',
};

export function CabinetLibrary({
  store,
  floors,
  selectionStore,
  canEdit = false,
  fitTolerance = null,
  loadCatalog = fetchCatalog,
  newId,
}: CabinetLibraryProps): ReactElement {
  const t = useT();
  const [tab, setTab] = useState<Tab>('boxes');
  const tabLabel: Record<Tab, MessageKey> = {
    boxes: 'office.cabinets.library.tab_boxes',
    runs: 'office.cabinets.library.tab_runs',
    saved: 'office.cabinets.library.tab_saved',
  };
  let body: ReactElement;
  if (tab === 'boxes') {
    body = (
      <BoxesTab
        store={store}
        floors={floors}
        selectionStore={selectionStore}
        canEdit={canEdit}
        loadCatalog={loadCatalog}
        newId={newId}
      />
    );
  } else if (tab === 'runs') {
    body = (
      <CabinetLibraryRuns
        store={store}
        floors={floors}
        selectionStore={selectionStore}
        fitTolerance={fitTolerance}
      />
    );
  } else {
    // No company library of saved groups exists yet (assumptions.md EZD-403).
    body = (
      <p className={styles.empty} data-testid="cabinet-library-saved-empty">
        {t('office.cabinets.library.saved_empty')}
      </p>
    );
  }
  return (
    <div
      className={styles.panel}
      data-testid="cabinet-library"
      data-tab={tab}
      aria-label={t('office.cabinets.library.title')}
      role="region"
    >
      <div className={styles.tabs} role="tablist" aria-label={t('office.cabinets.library.tabs')}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.seg} ${tab === id ? styles.segOn : ''}`}
            data-testid={`cabinet-library-tab-${id}`}
            onClick={() => setTab(id)}
          >
            {t(tabLabel[id])}
          </button>
        ))}
      </div>
      <div className={styles.body} role="tabpanel">
        {body}
      </div>
    </div>
  );
}

function DragHandle(): ReactElement {
  return (
    <svg className={styles.handle} width="10" height="14" viewBox="0 0 10 14" aria-hidden>
      {[2, 7, 12].map((y) =>
        [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={1.2} />),
      )}
    </svg>
  );
}

function BoxesTab({
  store,
  floors,
  selectionStore,
  canEdit,
  loadCatalog,
  newId,
}: {
  store: ModelStore;
  floors?: FloorChoice;
  selectionStore: CabinetSelectionStore;
  canEdit: boolean;
  loadCatalog: () => Promise<CatalogItem[]>;
  newId?: () => string;
}): ReactElement {
  const t = useT();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<LineChoice | null>(null);
  const [picking, setPicking] = useState(false);
  const catalog = useCatalog(loadCatalog);
  const items = useMemo(() => (catalog.kind === 'ready' ? catalog.items : []), [catalog]);
  const lines = useMemo(() => libraryLines(items), [items]);
  // The first vendor line until one is picked; "Custom boxes" when the catalog has none. While the catalog loads, the
  // rows place boxes in 3" steps with no catalog item.
  const loading = catalog.kind === 'loading' && picked === null;
  const choice: LineChoice =
    picked ?? (lines[0] === undefined ? CUSTOM : { kind: 'line', line: lines[0] });
  const custom = !loading && choice.kind === 'custom';
  const line = choice.kind === 'line' ? choice.line : null;
  const lineText = loading ? '…' : (line ?? t('office.cabinets.library.custom'));
  const found = searchLibrary(query);
  const boxes = found.rows.filter((m) => m.row.section === 'boxes');
  const others = found.rows.filter((m) => m.row.section === 'trim');
  const { parsed, view } = useCabinetModel(store, floors, selectionStore);

  const dragRow = (m: LibraryMatch) => (e: DragEvent<HTMLElement>) => {
    const d: LibraryDrag = {
      kind: 'row',
      key: m.row.key,
      width: m.width ?? m.row.width,
      custom,
      items: custom ? {} : libraryLineItems(items, line, m.row),
    };
    e.dataTransfer.setData(LIBRARY_DRAG_TYPE, JSON.stringify(d));
    e.dataTransfer.effectAllowed = 'copy';
  };
  const dragTrim = (trim: LibraryTrim) => (e: DragEvent<HTMLElement>) => {
    const d: LibraryDrag = { kind: 'trim', trim: trim.kind };
    e.dataTransfer.setData(LIBRARY_DRAG_TYPE, JSON.stringify(d));
    e.dataTransfer.effectAllowed = 'copy';
  };
  // S04 "Drag or click to add trim along the run": a click adds it to the open run.
  const addTrim =
    !canEdit || view === null
      ? undefined
      : (trim: LibraryTrim) => {
          const changes = cabinetTrimChanges(
            view,
            parsed,
            trim,
            (newId ?? (() => crypto.randomUUID()))(),
          );
          if (changes.length > 0) store.applyEdit(changes);
        };

  const rowItem = (m: LibraryMatch) => {
    // A search that names a width shows the code it places ("B24").
    const code = m.width === null ? m.row.label : libraryCode(m.row, m.width);
    return (
      <li
        key={m.row.key}
        className={`${styles.row} ${canEdit ? styles.draggable : ''}`}
        data-testid="cabinet-library-row"
        data-row={m.row.key}
        data-code={code}
        draggable={canEdit}
        onDragStart={canEdit ? dragRow(m) : undefined}
        title={canEdit ? t('office.cabinets.library.drag') : undefined}
      >
        <span className={styles.code}>{code}</span>
        <span className={styles.name}>{t(m.row.name)}</span>
        {canEdit ? <DragHandle /> : null}
      </li>
    );
  };

  return (
    <>
      <div className={styles.search}>
        <Icon name="search" size={18} />
        <input
          type="search"
          className={styles.searchInput}
          data-testid="cabinet-library-search"
          placeholder={t('office.cabinets.library.search')}
          aria-label={t('office.cabinets.library.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.lineWrap}>
        <button
          type="button"
          className={styles.line}
          data-testid="cabinet-library-line"
          aria-haspopup="listbox"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
        >
          {t('office.cabinets.library.line', { line: lineText })}
        </button>
        {picking ? (
          <ul
            className={styles.lines}
            role="listbox"
            aria-label={t('office.cabinets.library.lines')}
            data-testid="cabinet-library-lines"
          >
            {[...lines.map((l): LineChoice => ({ kind: 'line', line: l })), CUSTOM].map((c) => {
              const key = c.kind === 'line' ? c.line : '';
              const on = c.kind === choice.kind && key === (line ?? '');
              return (
                <li
                  key={c.kind === 'line' ? `l-${c.line}` : 'custom'}
                  role="option"
                  aria-selected={on}
                  className={`${styles.lineOption} ${on ? styles.lineOn : ''}`}
                  data-testid="cabinet-library-line-option"
                  onClick={() => {
                    setPicked(c);
                    setPicking(false);
                  }}
                >
                  {c.kind === 'line' ? c.line : t('office.cabinets.library.custom')}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {boxes.length + others.length + found.trims.length === 0 ? (
        <p className={styles.empty} data-testid="cabinet-library-no-match">
          {t('office.cabinets.library.no_match')}
        </p>
      ) : null}
      {boxes.length > 0 ? (
        <ul className={styles.rows} data-testid="cabinet-library-boxes">
          {boxes.map(rowItem)}
        </ul>
      ) : null}
      {others.length + found.trims.length > 0 ? (
        <>
          <span className={styles.lbl}>{t('office.cabinets.library.trim_section')}</span>
          <ul className={styles.rows} data-testid="cabinet-library-trim">
            {others.map(rowItem)}
            {found.trims.length > 0 ? (
              <li className={styles.row} data-testid="cabinet-library-trim-row">
                <span className={styles.trims}>
                  {found.trims.map(({ trim }, i) => (
                    // EZD-1986 (audit F9; board S04Cabinets "TK / LR / CM"): the codes run as text in the code
                    // column, split by slashes as on the board; each code is still its own button.
                    <Fragment key={trim.kind}>
                      {i > 0 ? (
                        <span className={styles.trimSep} aria-hidden="true">
                          /
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className={styles.trim}
                        data-testid={`cabinet-library-trim-${trim.kind}`}
                        draggable={canEdit}
                        onDragStart={canEdit ? dragTrim(trim) : undefined}
                        disabled={addTrim === undefined}
                        title={t(TRIM_TITLE[trim.kind] ?? 'office.cabinets.library.row.trim')}
                        onClick={() => addTrim?.(trim)}
                      >
                        {trim.code}
                      </button>
                    </Fragment>
                  ))}
                </span>
                <span className={styles.name}>{t('office.cabinets.library.row.trim')}</span>
              </li>
            ) : null}
          </ul>
        </>
      ) : null}
    </>
  );
}

export function CabinetLibraryRuns({
  store,
  floors,
  selectionStore,
  fitTolerance,
}: {
  store: ModelStore;
  floors?: FloorChoice;
  selectionStore: CabinetSelectionStore;
  fitTolerance: number | null;
}): ReactElement {
  const t = useT();
  const { parsed, floorId, view } = useCabinetModel(store, floors, selectionStore);
  const openRun = useStore(selectionStore, (s) => s.openRun);
  const runs = cabinetRuns(parsed, floorId);
  if (runs.length === 0) {
    return (
      <p className={styles.empty} data-testid="cabinet-library-no-runs">
        {t('office.cabinets.library.no_runs')}
      </p>
    );
  }
  return (
    <ul className={styles.rows} data-testid="cabinet-library-runs">
      {runs.map((run) => {
        const v = cabinetView(parsed, floorId, run.id);
        if (v === null) return null;
        const fit = cabinetViewFit(v, fitTolerance);
        const status = v.offWall
          ? t('office.cabinets.not_on_wall')
          : fit === null
            ? null
            : fit.fits
              ? t('office.cabinets.library.fit_ok')
              : t(fit.gap < 0 ? 'office.cabinets.library.fit_long' : 'office.cabinets.library.fit_short', {
                  gap: inchText(Math.abs(fit.gap)),
                });
        const open = view !== null && view.run.id === run.id;
        return (
          <li key={run.id}>
            <button
              type="button"
              className={`${styles.run} ${open ? styles.runOn : ''}`}
              data-testid="cabinet-library-run"
              data-run-id={run.id}
              aria-current={open ? 'true' : undefined}
              onClick={() => openRun(run.id)}
            >
              <span className={styles.runName}>{v.summary.name}</span>
              <span className={styles.runMeta}>
                {t('office.cabinets.boxes', { count: v.summary.boxCount })}
                {status !== null ? (
                  <span
                    className={fit?.fits === true && !v.offWall ? styles.fitOk : styles.fitWarn}
                    data-testid="cabinet-library-run-fit"
                    data-fit={v.offWall ? 'off_wall' : fit?.fits === true ? 'fits' : 'mismatch'}
                  >
                    {' · '}
                    {status}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
