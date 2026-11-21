'use client';
// EZD-416 (S04b Layout "Left panel: tabs Pieces / Edges / Material; Pieces list; Material; Default overhangs; footer
// totals"; S04b Controls "Tab: Pieces", "Tab: Edges", "Tab: Material", "Piece row", "Material swatch row",
// "Backsplash row", "Behind range row", "Default overhangs rows", ""Change in company settings" link", "Footer
// totals"; S04b Decisions (Edges and Material tabs); board S04bCountertops left panel; AC-EZD-416-1;
// vault/build/assumptions.md EZD-416): the countertop left panel, shown in the plan's left panel while the
// Countertops tool is on. Rows select the piece through the selection the screen shares. Material edits apply to
// every top on the floor, one undo step each, with Edit model and the lock.
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import {
  COUNTERTOP_BEHIND_RANGE,
  countertopEdgeRows,
  countertopFooter,
  countertopHasSeating,
  countertopMaterialSummary,
  countertopPieceSize,
  parseLength,
  withBacksplashHeight,
  type CountertopBehindRange,
  type CountertopPieceData,
  type Shared,
} from '@ezdraft/geometry';
import { DEFAULTS_HREF } from '../../components/settings/defaults/SetInDefaults';
import { CatalogPickerView } from '../../components/catalog/CatalogPicker';
import { formatInches, type CatalogItem } from '../../lib/catalog/catalog';
import { countertopMaterialChanges, countertopMaterialName } from '../../editor/countertops/material';
import { useT } from '../../lib/messages';
import type { ModelStore } from '../../editor/model/model-store';
import type { Change } from '../../editor/model/patches';
import type { FloorChoice } from '../../editor/floors/floors';
import type { CountertopSelectionStore } from '../../editor/countertops/selection-store';
import { countertopChange, type CountertopPiece } from '../../editor/countertops/trace-tool';
import { useCountertopFloor } from './use-countertop-floor';
import styles from './CountertopsPanel.module.css';

export type CountertopsPanelProps = {
  store: ModelStore;
  floors?: FloorChoice;
  // Edit model and holding the lock; without it the Material tab only reads.
  canEdit?: boolean;
  selection: CountertopSelectionStore;
  // The effective Defaults (overhang_standard, overhang_seating_counter, overhang_seating_bar,
  // overhang_against_wall); null while not read.
  defaults?: Readonly<Record<string, unknown>> | null;
  // Settings → Defaults (settings_defaults): shows "Change in company settings".
  canManageDefaults?: boolean;
  // The tab shown first; Pieces unless a test asks for another.
  initialTab?: CountertopsPanelTab;
  // GET /api/catalog by default; tests pass their own.
  loadCatalog?: CountertopCatalogLoad;
  // The catalog already read, and the picker already open (tests).
  catalog?: readonly CatalogItem[] | null;
  initialPicking?: boolean;
};

export type CountertopCatalogLoad = () => Promise<CatalogItem[]>;

// As the cabinet inspector's read (lazy/cabinet-run), kept here so the countertop module does not carry it.
const fetchCatalog: CountertopCatalogLoad = async () => {
  const res = await fetch('/api/catalog', { cache: 'no-store', credentials: 'same-origin' });
  if (res.status !== 200) throw new Error('catalog_load_failed');
  return ((await res.json()) as { items: CatalogItem[] }).items;
};

export type CountertopsPanelTab = 'pieces' | 'edges' | 'material';
const TABS: readonly CountertopsPanelTab[] = ['pieces', 'edges', 'material'];

const noSubscribe = () => () => {};

// 2 cm and 3 cm slabs (board "Quartz · 3 cm"), in inches as stored.
const CM_PER_IN = 2.54;
const SLABS_CM = [2, 3] as const;
const cmText = (inches: number) => String(Math.round(inches * CM_PER_IN * 10) / 10);
// A length as the board writes it: whole inches and a fraction to 1/16 with the inch mark ("1 1/2"", "12"").
const inchText = (inches: number) => `${formatInches(inches)}"`;

export function CountertopsPanel({
  store,
  floors,
  canEdit = false,
  selection,
  defaults = null,
  canManageDefaults = false,
  initialTab = 'pieces',
  loadCatalog = fetchCatalog,
  catalog: givenCatalog,
  initialPicking = false,
}: CountertopsPanelProps): ReactElement {
  const t = useT();
  // The company catalog (countertop names and the picker's list); null while not read or when the read failed.
  const [loaded, setLoaded] = useState<readonly CatalogItem[] | null>(null);
  useEffect(() => {
    if (givenCatalog !== undefined) return;
    let live = true;
    loadCatalog().then(
      (items) => live && setLoaded(items),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [loadCatalog, givenCatalog]);
  const catalog = givenCatalog !== undefined ? givenCatalog : loaded;
  const [picking, setPicking] = useState(initialPicking);
  const [tab, setTab] = useState<CountertopsPanelTab>(initialTab);
  const { pieces } = useCountertopFloor(store, floors);
  const picked = useSyncExternalStore(
    selection ? selection.subscribe : noSubscribe,
    () => selection.getState().selection,
    () => selection.getState().selection,
  );
  const data = pieces.map((p) => p.data);
  const footer = countertopFooter(data);
  const summary = countertopMaterialSummary(data);
  const isOn = (p: CountertopPiece) =>
    picked.pieceId !== null && p.id.toLowerCase() === picked.pieceId.toLowerCase();

  const apply = (make: (d: CountertopPieceData) => CountertopPieceData | null) => {
    if (!canEdit) return;
    const changes: Change[] = [];
    for (const p of pieces) {
      const next = make(p.data);
      if (next !== null) changes.push(countertopChange(p.id, next));
    }
    if (changes.length > 0) store.applyEdit(changes);
  };
  const setThickness = (inches: number) =>
    apply((d) =>
      d.attributes.thickness === inches ? null : { ...d, attributes: { ...d.attributes, thickness: inches } },
    );
  const setBehind = (v: CountertopBehindRange) =>
    apply((d) =>
      (d.attributes.behindRange ?? 'splash') === v
        ? null
        : { ...d, attributes: { ...d.attributes, behindRange: v } },
    );
  const setSplash = (height: number) =>
    apply((d) => {
      const next = withBacksplashHeight(d, height);
      return next.attributes.edges.every((e, i) => e === d.attributes.edges[i]) ? null : next;
    });

  const sharedText = <T,>(s: Shared<T>, text: (v: T) => string, none: string) =>
    s.kind === 'one' ? text(s.value) : s.kind === 'mixed' ? t('office.countertops.panel.mixed') : none;

  const materialText = sharedText(
    summary.materialItemId,
    (id) =>
      id === null
        ? t('office.countertops.panel.material_none')
        : (countertopMaterialName(catalog, id) ?? t('office.countertops.panel.material_chosen')),
    t('office.countertops.panel.material_none'),
  );
  const thicknessText = sharedText(
    summary.thickness,
    (v) => t('office.countertops.panel.thickness_cm', { cm: cmText(v) }),
    '',
  );
  const splashText = sharedText(
    summary.backsplashHeight,
    (v) => t('office.countertops.panel.backsplash_value', { height: inchText(v) }),
    t('office.countertops.panel.backsplash_none'),
  );
  const behindText = sharedText(
    summary.behindRange,
    (v) => t(v === 'full_height' ? 'office.countertops.panel.behind_full' : 'office.countertops.panel.behind_splash'),
    t('office.countertops.panel.behind_splash'),
  );

  // The picker opens with Edit model and the lock, once the catalog is read and there is a top to set.
  const canPick = canEdit && catalog !== null && pieces.length > 0;
  const pickMaterial = (item: CatalogItem) => {
    const changes = countertopMaterialChanges(pieces, item.id);
    if (canEdit && changes.length > 0) store.applyEdit(changes);
    setPicking(false);
  };

  const pieceRow = (p: CountertopPiece) => {
    const size = countertopPieceSize(p.data);
    const seating = countertopHasSeating(p.data);
    const on = isOn(p);
    return (
      <button
        key={p.id}
        type="button"
        className={`${styles.piece} ${on ? styles.pieceOn : ''}`}
        data-testid="countertop-panel-piece"
        data-id={p.id}
        data-label={p.data.attributes.label}
        aria-pressed={on}
        onClick={() => selection.getState().select(p.id)}
      >
        <span className={styles.letter}>{p.data.attributes.label}</span>
        <span className={styles.pieceText}>
          <span className={styles.pieceName}>{p.data.attributes.name}</span>
          <span className={styles.size} data-testid="countertop-panel-size">
            {`${formatInches(size.length)} × ${formatInches(size.depth)}`}
            {seating ? ` · ${t('office.countertops.panel.seating')}` : ''}
          </span>
        </span>
      </button>
    );
  };

  const overhang = (key: string): number | null => {
    const v = defaults?.[key];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const overhangRow = (label: Parameters<typeof t>[0], key: string, wall = false) => {
    const v = overhang(key);
    const text =
      v === null
        ? t('office.countertops.panel.not_set')
        : wall
          ? t('office.countertops.panel.against_wall_value', {
              value: v === 0 ? '0' : inchText(v),
            })
          : inchText(v);
    return (
      <div className={styles.kv} key={key} data-testid={`countertop-panel-overhang-${key}`}>
        <span>{t(label)}</span>
        <span className={styles.mono}>{text}</span>
      </div>
    );
  };

  const materialSection = (
    <>
      <span className={styles.lbl}>{t('office.countertops.panel.material')}</span>
      <div className={styles.section}>
        <button
          type="button"
          className={styles.swatchRow}
          data-testid="countertop-panel-material"
          disabled={!canPick}
          onClick={() => setPicking(true)}
        >
          <span className={styles.swatch} aria-hidden />
          <span>{thicknessText === '' ? materialText : `${materialText} · ${thicknessText}`}</span>
        </button>
        <div className={styles.kv} data-testid="countertop-panel-backsplash">
          <span>{t('office.countertops.panel.backsplash')}</span>
          <span className={styles.mono}>{splashText}</span>
        </div>
        <div className={styles.kv} data-testid="countertop-panel-behind-range">
          <span>{t('office.countertops.panel.behind_range')}</span>
          <span>{behindText}</span>
        </div>
      </div>
    </>
  );

  let body: ReactNode;
  if (tab === 'pieces') {
    body = (
      <>
        <span className={styles.lbl}>{t('office.countertops.panel.pieces')}</span>
        <div className={styles.list} data-testid="countertop-panel-pieces">
          {pieces.length === 0 ? (
            <p className={styles.empty}>{t('office.countertops.panel.no_pieces')}</p>
          ) : (
            pieces.map(pieceRow)
          )}
        </div>
        {materialSection}
        <span className={styles.lbl}>{t('office.countertops.panel.default_overhangs')}</span>
        <div className={styles.section}>
          {overhangRow('office.countertops.panel.overhang_standard', 'overhang_standard')}
          {overhangRow('office.countertops.panel.overhang_seating_counter', 'overhang_seating_counter')}
          {overhangRow('office.countertops.panel.overhang_seating_bar', 'overhang_seating_bar')}
          {overhangRow('office.countertops.panel.overhang_against_wall', 'overhang_against_wall', true)}
          {canManageDefaults ? (
            <Link
              className={styles.link}
              data-testid="countertop-panel-settings"
              href={DEFAULTS_HREF}
              prefetch={false}
            >
              {t('office.countertops.panel.change_settings')}
            </Link>
          ) : null}
        </div>
      </>
    );
  } else if (tab === 'edges') {
    body = (
      <div className={styles.list} data-testid="countertop-panel-edges">
        {pieces.length === 0 ? (
          <p className={styles.empty}>{t('office.countertops.panel.no_pieces')}</p>
        ) : null}
        {pieces.map((p) => (
          <div key={p.id} className={styles.edgeGroup}>
            <span className={styles.lbl}>
              {p.data.attributes.name.length > 0
                ? `${p.data.attributes.label} · ${p.data.attributes.name}`
                : p.data.attributes.label}
            </span>
            {countertopEdgeRows(p.data).map((e) => {
              const on = isOn(p) && picked.edge === e.index;
              return (
                <button
                  key={e.index}
                  type="button"
                  className={`${styles.edge} ${on ? styles.pieceOn : ''}`}
                  data-testid="countertop-panel-edge"
                  data-piece={p.data.attributes.label}
                  data-index={e.index}
                  data-type={e.type}
                  aria-pressed={on}
                  onClick={() => selection.getState().select(p.id, e.index)}
                >
                  <span>{t('office.countertops.panel.side', { n: e.index + 1 })}</span>
                  <span>
                    {t(`office.countertops.panel.edge_${e.type}`)}
                    {e.seating ? ` · ${t('office.countertops.panel.seating')}` : ''}
                  </span>
                  <span className={styles.mono}>{inchText(e.overhang)}</span>
                  <span className={styles.mono}>{inchText(e.length)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  } else {
    const thick = summary.thickness.kind === 'one' ? summary.thickness.value : null;
    const options = SLABS_CM.map((cm) => cm / CM_PER_IN);
    if (thick !== null && !options.includes(thick)) options.push(thick);
    const off = !canEdit || pieces.length === 0;
    body = (
      <div className={styles.section} data-testid="countertop-panel-material-tab">
        <div className={styles.kv}>
          <span>{t('office.countertops.panel.material')}</span>
          <button
            type="button"
            className={styles.pick}
            data-testid="countertop-panel-material-pick"
            disabled={!canPick}
            onClick={() => setPicking(true)}
          >
            {materialText}
          </button>
        </div>
        <label className={styles.kv}>
          <span>{t('office.countertops.panel.thickness')}</span>
          <select
            data-testid="countertop-panel-thickness"
            disabled={off}
            value={thick === null ? '' : String(thick)}
            onChange={(e) => setThickness(Number(e.target.value))}
          >
            {thick === null ? <option value="">{t('office.countertops.panel.mixed')}</option> : null}
            {options.map((v) => (
              <option key={v} value={String(v)}>
                {t('office.countertops.panel.thickness_cm', { cm: cmText(v) })}
              </option>
            ))}
          </select>
        </label>
        <SplashField
          key={splashText}
          label={t('office.countertops.panel.backsplash_height')}
          initial={summary.backsplashHeight.kind === 'one' ? formatInches(summary.backsplashHeight.value) : ''}
          disabled={off || summary.backsplashHeight.kind === 'none'}
          onCommit={setSplash}
        />
        <div className={styles.kv}>
          <span>{t('office.countertops.panel.backsplash_material')}</span>
          <span>{t('office.countertops.panel.same_as_top')}</span>
        </div>
        <label className={styles.kv}>
          <span>{t('office.countertops.panel.behind_range')}</span>
          <select
            data-testid="countertop-panel-behind"
            disabled={off}
            value={summary.behindRange.kind === 'one' ? summary.behindRange.value : ''}
            onChange={(e) => setBehind(e.target.value as CountertopBehindRange)}
          >
            {summary.behindRange.kind === 'one' ? null : (
              <option value="">{t('office.countertops.panel.mixed')}</option>
            )}
            {COUNTERTOP_BEHIND_RANGE.map((v) => (
              <option key={v} value={v}>
                {t(
                  v === 'full_height'
                    ? 'office.countertops.panel.behind_full'
                    : 'office.countertops.panel.behind_splash',
                )}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  return (
    <div className={styles.panel} data-testid="countertop-panel" data-tab={tab}>
      <div className={styles.tabs} role="tablist" aria-label={t('office.countertops.panel.tabs')}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`${styles.seg} ${tab === id ? styles.segOn : ''}`}
            data-testid={`countertop-panel-tab-${id}`}
            onClick={() => setTab(id)}
          >
            {t(`office.countertops.panel.tab_${id}`)}
          </button>
        ))}
      </div>
      <div className={styles.body} role="tabpanel">
        {body}
      </div>
      {picking && canPick ? (
        <div
          className={styles.pickerLayer}
          role="dialog"
          aria-label={t('office.countertops.panel.pick_material')}
          data-testid="countertop-panel-picker"
        >
          <div className={styles.pickerHead}>
            <span>{t('office.countertops.panel.pick_material')}</span>
            <button
              type="button"
              className={styles.close}
              data-testid="countertop-panel-picker-close"
              onClick={() => setPicking(false)}
              aria-label={t('office.countertops.panel.close')}
            >
              ×
            </button>
          </div>
          <CatalogPickerView
            items={(catalog ?? []).filter((i) => i.category === 'countertops')}
            initialCategory="countertops"
            onPick={pickMaterial}
          />
        </div>
      ) : null}
      <div className={styles.footer} data-testid="countertop-panel-footer">
        <span data-testid="countertop-panel-counts">
          {`${t('office.countertops.panel.footer_pieces', { count: footer.pieces })} · ${t(
            'office.countertops.panel.footer_seams',
            { count: footer.seams },
          )}`}
        </span>
        <span className={styles.mono} data-testid="countertop-panel-area">
          {t('office.countertops.panel.footer_area', { area: footer.areaSqFt.toFixed(1) })}
        </span>
      </div>
    </div>
  );
}

// The backsplash height, typed; Enter or leaving the field sets it on every splash edge.
function SplashField({
  label,
  initial,
  disabled,
  onCommit,
}: {
  label: string;
  initial: string;
  disabled: boolean;
  onCommit: (inches: number) => void;
}): ReactElement {
  const [text, setText] = useState(initial);
  const commit = () => {
    const r = parseLength(text, 'positive');
    if (r.ok) onCommit(r.inches);
    else setText(initial);
  };
  return (
    <form
      className={styles.kv}
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <label htmlFor="countertop-splash">{label}</label>
      <input
        id="countertop-splash"
        data-testid="countertop-panel-splash"
        className={styles.input}
        value={text}
        disabled={disabled}
        inputMode="decimal"
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== initial) commit();
        }}
      />
    </form>
  );
}
