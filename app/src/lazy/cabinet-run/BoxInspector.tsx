'use client';
// EZD-406 (S04 Layout "Inspector 336px: selected box (title, position in run, status pill, size fields, Face section,
// Catalog section, Swap box, Cabinet schedule)"; S04 Controls (inspector); S04 Permissions "Edit model: ... swap ...;
// inspector edits. Also requires the edit lock", "See company costs: Cost row in the inspector Catalog section";
// board S04Cabinets; Q-0630 (a reader sees the inspector as plain text); AC-EZD-406-1, -2;
// vault/build/assumptions.md EZD-406): the box inspector, in the shell's inspector place while the Cabinets tool is
// on. It reads the selection the drawing writes (cabinet-selection-store) and every edit is one model edit (one undo
// step). The Cost row shows only when the catalog route sent the item's cost, which it does only for a member with See
// company costs.
import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { useStore } from 'zustand';
import {
  CABINET_FINISHED_ENDS,
  parseLength,
  type CabinetFaceLayout,
  type CabinetFinishedEnds,
  type CabinetHingeSide,
  type ModelObject,
  type ObjectStatus,
} from '@ezdraft/geometry';
import { CatalogPickerView } from '../../components/catalog/CatalogPicker';
import { formatInches, sizeText, type CatalogItem } from '../../lib/catalog/catalog';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { FloorChoice } from '../../editor/floors/floors';
import type { ModelStore } from '../../editor/model/model-store';
import type { Change } from '../../editor/model/patches';
import type { CabinetSelectionStore } from '../../editor/cabinets/cabinet-selection-store';
import type { CabinetView } from '../../editor/cabinets/cabinet-view';
import {
  boxEditChanges,
  boxInspectorView,
  catalogCost,
  catalogItemText,
  compatibleBoxes,
  swapBoxChanges,
  type BoxEdit,
  type BoxInspectorView,
  type CabinetMemberKind,
} from '../../editor/cabinets/box-inspector';
import { isRunSelected } from '../../editor/cabinets/run-inspector';
import { useCabinetModel } from './CabinetRunView';
import { RunInspector } from './RunInspector';
import {
  CabinetScheduleView,
  loadPermissions as fetchMemberPermissions,
  useCanExport,
  type PermissionsLoad,
} from './CabinetSchedule';
import styles from './BoxInspector.module.css';

export type CatalogLoad = () => Promise<CatalogItem[]>;

export type CabinetInspectorProps = {
  store: ModelStore;
  selectionStore: CabinetSelectionStore;
  floors?: FloorChoice;
  // Edit model and holding the lock; without it the inspector reads as plain text.
  canEdit?: boolean;
  // GET /api/catalog by default; tests pass their own.
  loadCatalog?: CatalogLoad;
  // EZD-409: GET /api/permissions by default (Export shows the schedule's CSV button); tests pass their own.
  loadPermissions?: PermissionsLoad;
};

const inches = (n: number) => `${formatInches(n)}"`;

export const fetchCatalog: CatalogLoad = async () => {
  const res = await fetch('/api/catalog', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status !== 200) throw new Error('catalog_load_failed');
  return ((await res.json()) as { items: CatalogItem[] }).items;
};

export type CatalogState =
  { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: CatalogItem[] };

export function useCatalog(load: CatalogLoad): CatalogState {
  const [state, setState] = useState<CatalogState>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    load().then(
      (items) => live && setState({ kind: 'ready', items }),
      () => live && setState({ kind: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [load]);
  return state;
}

export function CabinetInspector({
  store,
  selectionStore,
  floors,
  canEdit = false,
  loadCatalog = fetchCatalog,
  loadPermissions = fetchMemberPermissions,
}: CabinetInspectorProps): ReactElement {
  const { parsed, view } = useCabinetModel(store, floors, selectionStore);
  const ids = useStore(selectionStore, (s) => s.selection.ids);
  const swapFor = useStore(selectionStore, (s) => s.swapFor);
  const catalog = useCatalog(loadCatalog);
  const canExport = useCanExport(loadPermissions);
  const apply = useCallback(
    (changes: Change[]) => (changes.length === 0 ? [] : store.applyEdit(changes)),
    [store],
  );
  // EZD-419: the run itself selected (a click on its name) shows the run inspector.
  if (isRunSelected(view, ids))
    return (
      <RunInspector
        view={view!}
        objects={parsed}
        catalog={catalog}
        canEdit={canEdit}
        canExport={canExport}
        onChanges={apply}
      />
    );
  const one = view !== null && ids.length === 1 ? boxInspectorView(view, parsed, ids[0]!) : null;
  return (
    <BoxInspectorScreen
      view={view}
      objects={parsed}
      ids={ids}
      box={one}
      catalog={catalog}
      canEdit={canEdit}
      canExport={canExport}
      swapOpen={one !== null && swapFor !== null && swapFor.toLowerCase() === one.id.toLowerCase()}
      onSwapOpen={(open) =>
        selectionStore.getState().openSwap(open && one !== null ? one.id : null)
      }
      onChanges={apply}
    />
  );
}

export type BoxInspectorScreenProps = {
  view: CabinetView | null;
  objects: readonly ModelObject[];
  ids: readonly string[];
  box: BoxInspectorView | null;
  catalog: CatalogState;
  canEdit: boolean;
  // EZD-409: the member holds Export (the schedule's Export CSV button).
  canExport?: boolean;
  swapOpen: boolean;
  onSwapOpen(open: boolean): void;
  onChanges(changes: Change[]): unknown;
};

const TYPE_KEYS: Record<string, MessageKey> = {
  base: 'office.cabinets.type.base',
  wall: 'office.cabinets.type.wall',
  tall: 'office.cabinets.type.tall',
  vanity: 'office.cabinets.type.vanity',
  sink_base: 'office.cabinets.type.sink_base',
  drawer_base: 'office.cabinets.type.drawer_base',
  corner_blind: 'office.cabinets.type.corner_blind',
  appliance_panel: 'office.cabinets.type.appliance_panel',
};
const KIND_KEYS: Record<CabinetMemberKind, MessageKey> = {
  box: 'office.cabinets.type.base',
  filler: 'office.cabinets.kind.filler',
  panel: 'office.cabinets.kind.panel',
  corner: 'office.cabinets.kind.corner',
  shelf: 'office.cabinets.kind.shelf',
};
const LAYOUT_KEYS: Record<CabinetFaceLayout, MessageKey> = {
  door_1: 'office.cabinets.layout.door_1',
  doors_2: 'office.cabinets.layout.doors_2',
  drawer_door_1: 'office.cabinets.layout.drawer_door_1',
  drawer_doors_2: 'office.cabinets.layout.drawer_doors_2',
  false_drawer_door_1: 'office.cabinets.layout.false_drawer_door_1',
  false_drawer_doors_2: 'office.cabinets.layout.false_drawer_doors_2',
  drawers_2: 'office.cabinets.layout.drawers_2',
  drawers_3: 'office.cabinets.layout.drawers_3',
  drawers_4: 'office.cabinets.layout.drawers_4',
  open: 'office.cabinets.layout.open',
  panel: 'office.cabinets.layout.panel',
};
const HINGES: readonly Exclude<CabinetHingeSide, 'none'>[] = ['left', 'pair', 'right'];
const HINGE_KEYS: Record<Exclude<CabinetHingeSide, 'none'>, MessageKey> = {
  left: 'office.cabinets.hinge.left',
  pair: 'office.cabinets.hinge.pair',
  right: 'office.cabinets.hinge.right',
};
const ENDS_KEYS: Record<CabinetFinishedEnds, MessageKey> = {
  none: 'office.cabinets.ends.none',
  left: 'office.cabinets.ends.left',
  right: 'office.cabinets.ends.right',
  both: 'office.cabinets.ends.both',
};
const STATUSES: readonly ObjectStatus[] = ['existing', 'demo', 'new'];
const STATUS_KEYS: Record<ObjectStatus, MessageKey> = {
  existing: 'office.inspector.status.existing',
  demo: 'office.inspector.status.demo',
  new: 'office.inspector.status.new',
};

// "Box 3 of 5 in back wall run": the run's name reads inside the sentence with a lower-case first letter (board).
const inSentence = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

export function BoxInspectorScreen(props: BoxInspectorScreenProps): ReactElement {
  const { view, ids, box } = props;
  const t = useT();
  if (view === null || box === null) {
    return (
      <div className={styles.panel} data-testid="box-inspector" data-state="empty">
        <p className={styles.hint} data-testid="box-inspector-empty">
          {ids.length > 1
            ? t('office.cabinets.inspector.selected', { count: ids.length })
            : t('office.cabinets.inspector.empty')}
        </p>
      </div>
    );
  }
  return <BoxPanel {...props} view={view} box={box} />;
}

function BoxPanel({
  view,
  objects,
  box,
  catalog,
  canEdit,
  canExport = false,
  swapOpen,
  onSwapOpen,
  onChanges,
}: BoxInspectorScreenProps & { view: CabinetView; box: BoxInspectorView }): ReactElement {
  const t = useT();
  const [picking, setPicking] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const edit = (e: BoxEdit) => onChanges(boxEditChanges(view, objects, box.id, e));
  const items = catalog.kind === 'ready' ? catalog.items : [];
  const item =
    box.catalogItemId === null
      ? null
      : (items.find((i) => i.id.toLowerCase() === box.catalogItemId!.toLowerCase()) ?? null);
  const typeName = t(box.boxType !== null ? TYPE_KEYS[box.boxType]! : KIND_KEYS[box.kind]);
  const cost = catalogCost(item);
  const finishes = [
    ...new Set(
      items
        .filter((i) => i.category === 'cabinets' && i.finish !== null && i.finish !== '')
        .map((i) => i.finish!),
    ),
  ].sort((a, b) => a.localeCompare(b));
  if (box.finish !== null && !finishes.includes(box.finish)) finishes.unshift(box.finish);

  return (
    <div className={styles.panel} data-testid="box-inspector" data-box-id={box.id}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h2 className={styles.title} data-testid="box-inspector-title">
            {box.code} · {typeName}
          </h2>
          {box.position !== null ? (
            <span className={styles.subtitle} data-testid="box-inspector-position">
              {t('office.cabinets.inspector.position', {
                n: box.position.n,
                of: box.position.of,
                run: inSentence(box.runName),
              })}
            </span>
          ) : null}
        </div>
        {canEdit ? (
          <label className={`${styles.pill} ${styles[`pill_${box.status}`]}`}>
            <span className={styles.srOnly}>{t('office.cabinets.inspector.status')}</span>
            <select
              className={styles.pillSelect}
              data-testid="box-inspector-status"
              value={box.status}
              onChange={(e) => edit({ field: 'status', value: e.target.value as ObjectStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(STATUS_KEYS[s])}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span
            className={`${styles.pill} ${styles[`pill_${box.status}`]}`}
            data-testid="box-inspector-status"
          >
            {t(STATUS_KEYS[box.status])}
          </span>
        )}
      </header>

      <div className={styles.grid3}>
        {(['width', 'depth', 'height'] as const).map((f) => (
          <SizeField
            key={`${box.id}-${f}-${box[f]}`}
            label={t(`office.cabinets.${f}` as MessageKey)}
            field={f}
            value={box[f]}
            canEdit={canEdit}
            onCommit={(v) => edit({ field: f, value: v })}
          />
        ))}
      </div>

      {box.face !== null ? (
        <section className={styles.section} data-testid="box-inspector-face">
          <h3 className={styles.head}>{t('office.cabinets.face')}</h3>
          <label className={styles.field}>
            {t('office.cabinets.layout')}
            {canEdit ? (
              <select
                className={styles.select}
                data-testid="box-inspector-layout"
                value={box.face.layout}
                onChange={(e) =>
                  edit({ field: 'faceLayout', value: e.target.value as CabinetFaceLayout })
                }
              >
                {box.face.layouts.map((l) => (
                  <option key={l} value={l}>
                    {t(LAYOUT_KEYS[l])}
                  </option>
                ))}
              </select>
            ) : (
              <span className={styles.readOnly} data-testid="box-inspector-layout">
                {t(LAYOUT_KEYS[box.face.layout])}
              </span>
            )}
          </label>
          {box.face.hasDoors ? (
            <Segmented
              label={t('office.cabinets.hinges')}
              testId="box-inspector-hinges"
              options={HINGES.map((h) => ({ value: h, label: t(HINGE_KEYS[h]) }))}
              value={box.face.hinges}
              canEdit={canEdit}
              onPick={(v) => edit({ field: 'hingeSide', value: v as CabinetHingeSide })}
            />
          ) : null}
          <Segmented
            label={t('office.cabinets.finished_ends')}
            testId="box-inspector-ends"
            options={CABINET_FINISHED_ENDS.map((e) => ({ value: e, label: t(ENDS_KEYS[e]) }))}
            value={box.face.finishedEnds}
            canEdit={canEdit}
            onPick={(v) => edit({ field: 'finishedEnds', value: v as CabinetFinishedEnds })}
          />
        </section>
      ) : null}

      <section className={styles.section} data-testid="box-inspector-catalog">
        <h3 className={styles.head}>{t('office.cabinets.catalog')}</h3>
        <Row label={t('office.cabinets.item')}>
          {canEdit && catalog.kind === 'ready' ? (
            <button
              type="button"
              className={styles.linkValue}
              data-testid="box-inspector-item"
              onClick={() => setPicking(true)}
            >
              {catalogItemText(item) ?? t('office.cabinets.none')}
            </button>
          ) : (
            <span className={styles.value} data-testid="box-inspector-item">
              {catalogItemText(item) ?? t('office.cabinets.none')}
            </span>
          )}
        </Row>
        <Row label={t('office.cabinets.finish')}>
          {canEdit ? (
            <select
              className={styles.inlineSelect}
              data-testid="box-inspector-finish"
              value={box.finish ?? ''}
              aria-label={t('office.cabinets.finish')}
              onChange={(e) => {
                const v = e.target.value === '' ? null : e.target.value;
                edit({ field: 'finish', value: v });
              }}
            >
              <option value="">{t('office.cabinets.none')}</option>
              {finishes.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          ) : (
            <span className={styles.value} data-testid="box-inspector-finish">
              {box.finish ?? t('office.cabinets.none')}
            </span>
          )}
        </Row>
        {cost.kind !== 'hidden' ? (
          <Row label={t('office.cabinets.cost')}>
            <span className={`${styles.value} ${styles.mono}`} data-testid="box-inspector-cost">
              {cost.kind === 'amount'
                ? t('office.cabinets.cost_value', { amount: cost.text })
                : t('office.cabinets.none')}
            </span>
          </Row>
        ) : null}
        {catalog.kind === 'error' ? (
          <p className={styles.hint} role="alert">
            {t('office.catalog.load_failed')}
          </p>
        ) : null}
      </section>

      {swapOpen ? (
        <SwapList
          items={compatibleBoxes(view, objects, box.id, items)}
          loading={catalog.kind === 'loading'}
          onPick={(i) => {
            onChanges(swapBoxChanges(view, objects, box.id, i));
            onSwapOpen(false);
          }}
        />
      ) : null}

      <span className={styles.grow} />
      <footer className={styles.footer}>
        <button
          type="button"
          className={styles.footerButton}
          data-testid="box-inspector-swap"
          aria-expanded={swapOpen}
          disabled={!canEdit}
          onClick={() => onSwapOpen(!swapOpen)}
        >
          {t('office.cabinets.swap')}
        </button>
        {/* EZD-409: every viewer opens the schedule (S04 Permissions "View projects"). */}
        <button
          type="button"
          className={styles.footerButton}
          data-testid="box-inspector-schedule"
          aria-expanded={scheduleOpen}
          onClick={() => setScheduleOpen(true)}
        >
          {t('office.cabinets.schedule')}
        </button>
      </footer>

      {scheduleOpen ? (
        <CabinetScheduleView
          objects={objects}
          canExport={canExport}
          onClose={() => setScheduleOpen(false)}
        />
      ) : null}

      {picking && catalog.kind === 'ready' ? (
        <div
          className={styles.pickerLayer}
          role="dialog"
          aria-label={t('office.cabinets.pick_item')}
          data-testid="box-inspector-picker"
        >
          <div className={styles.pickerHead}>
            <span>{t('office.cabinets.pick_item')}</span>
            <button
              type="button"
              className={styles.close}
              onClick={() => setPicking(false)}
              aria-label={t('office.cabinets.close')}
            >
              ×
            </button>
          </div>
          <CatalogPickerView
            items={items}
            initialCategory="cabinets"
            onPick={(i) => {
              onChanges(
                boxEditChanges(view, objects, box.id, { field: 'catalogItemId', value: i.id }),
              );
              setPicking(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      {children}
    </div>
  );
}

function SizeField({
  label,
  field,
  value,
  canEdit,
  onCommit,
}: {
  label: string;
  field: 'width' | 'depth' | 'height';
  value: number;
  canEdit: boolean;
  onCommit(v: number): void;
}): ReactElement {
  const t = useT();
  const [text, setText] = useState(inches(value));
  const [refused, setRefused] = useState(false);
  if (!canEdit) {
    return (
      <div className={styles.field}>
        {label}
        <span className={styles.readOnly} data-testid={`box-inspector-${field}`}>
          {inches(value)}
        </span>
      </div>
    );
  }
  const commit = () => {
    const r = parseLength(text, 'positive');
    if (!r.ok) {
      setRefused(true);
      return;
    }
    setRefused(false);
    onCommit(r.inches);
  };
  return (
    <label className={styles.field}>
      {label}
      <input
        className={styles.input}
        data-testid={`box-inspector-${field}`}
        value={text}
        aria-invalid={refused ? 'true' : undefined}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
      />
      {refused ? (
        <span className={styles.refused} role="alert">
          {t('office.cabinets.entry_refused')}
        </span>
      ) : null}
    </label>
  );
}

function Segmented({
  label,
  testId,
  options,
  value,
  canEdit,
  onPick,
}: {
  label: string;
  testId: string;
  options: { value: string; label: string }[];
  value: string;
  canEdit: boolean;
  onPick(v: string): void;
}): ReactElement {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      {canEdit ? (
        <div className={styles.segmented} role="group" aria-label={label} data-testid={testId}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={styles.segment}
              aria-pressed={o.value === value}
              onClick={() => onPick(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <span className={styles.readOnly} data-testid={testId}>
          {options.find((o) => o.value === value)?.label ?? ''}
        </span>
      )}
    </div>
  );
}

function SwapList({
  items,
  loading,
  onPick,
}: {
  items: CatalogItem[];
  loading: boolean;
  onPick(item: CatalogItem): void;
}): ReactElement {
  const t = useT();
  return (
    <section className={styles.section} data-testid="box-inspector-swap-list">
      <h3 className={styles.head}>{t('office.cabinets.swap_title')}</h3>
      {loading ? null : items.length === 0 ? (
        <p className={styles.hint}>{t('office.cabinets.swap_empty')}</p>
      ) : (
        <ul className={styles.swapList}>
          {items.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                className={styles.swapItem}
                data-testid="box-inspector-swap-item"
                data-item-id={i.id}
                onClick={() => onPick(i)}
              >
                <span className={styles.mono}>{i.model ?? i.name}</span>
                <span>{i.name}</span>
                <span className={styles.size}>{sizeText(i) ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
