'use client';
// EZD-414 (S04b Layout "Inspector: piece header; Overhang by side diagram; preset chips"; S04b Controls "Overhang
// inputs Front / Left / Right / Back | Inspector diagram | Type value per side | Active side has blue border; label
// shows "seating" when seating overhang", "Preset chip Flush 0 / Standard 1 1/2 / Bar 10 / Seating 12 / Wall +
// splash"; board S04bCountertops inspector; AC-EZD-414-1; vault/build/assumptions.md EZD-414): the selected top's
// header, its overhang by side and the preset chips. A side or chip sets the picked edge, one undo step each, with
// Edit model and the lock. The edge profile is EZD-417's card below this.
// EZD-415 (S04b Controls "Support notice ... Shown when seating overhang exceeds limit", "Seats row | Display seat
// count and spacing"; S15d "Empty = support check off, with a "Set in Defaults" notice on S04b"; AC-EZD-415-1;
// vault/build/assumptions.md EZD-415): under the chips, on a top with a seating side, the support notice and the
// Seats row. The detail and its "Open detail" link are EZD-814.
import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  COUNTERTOP_OVERHANG_PRESETS,
  countertopEdgePreset,
  countertopPieceAreaSqFt,
  countertopSeatingSides,
  countertopSides,
  parseLength,
  type CountertopEdge,
  type CountertopOverhangPreset,
  type CountertopSupportSettings,
  CM_PER_IN,
} from '@ezdraft/geometry';
import { formatInches, type CatalogItem } from '../../lib/catalog/catalog';
import { useT } from '../../lib/messages';
import { sameId } from '../../editor/shared/ids';
import { inchText } from '../../editor/shared/inch-text';
import type { ModelStore } from '../../editor/model/model-store';
import type { CountertopSelectionStore } from '../../editor/countertops/selection-store';
import { countertopMaterialName } from '../../editor/countertops/material';
import {
  countertopPresetChanges,
  countertopPresetValues,
  countertopSupportSettings,
  countertopTypedChanges,
} from '../../editor/countertops/overhang-tool';
import { SetInDefaults } from '../../components/settings/defaults/SetInDefaults';
import { Icon } from '../../components/icon/Icon';
import type { CountertopPiece } from '../../editor/countertops/trace-tool';
import styles from './CountertopPieceInspector.module.css';

export type CountertopPieceInspectorProps = {
  store: ModelStore;
  pieces: readonly CountertopPiece[];
  selection: CountertopSelectionStore;
  canEdit?: boolean;
  // The effective Defaults (the four overhangs); null while not read.
  defaults?: Readonly<Record<string, unknown>> | null;
  // The company catalog, for the material name; null while not read.
  catalog?: readonly CatalogItem[] | null;
  // EZD-415: the viewer holds Settings → Defaults ("Set in Defaults" is a link; otherwise a line to ask).
  canManageDefaults?: boolean;
};

const cmText = (inches: number) => String(Math.round(inches * CM_PER_IN * 10) / 10);
// Area to 0.1 sq ft, half up (as the left panel and the schedule).
const areaText = (sqFt: number) => (Math.floor(sqFt * 10 + 0.5 + 1e-9) / 10).toFixed(1);

type SideName = 'front' | 'back' | 'left' | 'right';
const SIDE_KEY = {
  front: 'office.countertops.inspector.front',
  back: 'office.countertops.inspector.back',
  left: 'office.countertops.inspector.left',
  right: 'office.countertops.inspector.right',
} as const;
const STATUS_KEY = {
  existing: 'office.inspector.status.existing',
  demo: 'office.inspector.status.demo',
  new: 'office.inspector.status.new',
} as const;
const PRESET_KEY = {
  flush: 'office.countertops.inspector.preset_flush',
  standard: 'office.countertops.inspector.preset_standard',
  bar: 'office.countertops.inspector.preset_bar',
  seating: 'office.countertops.inspector.preset_seating',
  wall: 'office.countertops.inspector.preset_wall',
} as const;

export function CountertopPieceInspector({
  store,
  pieces,
  selection,
  canEdit = false,
  defaults = null,
  catalog = null,
  canManageDefaults = false,
}: CountertopPieceInspectorProps): ReactElement | null {
  const t = useT();
  const picked = useSyncExternalStore(
    selection.subscribe,
    () => selection.getState().selection,
    () => selection.getState().selection,
  );
  const piece =
    picked.pieceId === null ? undefined : pieces.find((p) => sameId(p.id, picked.pieceId!));
  const values = useMemo(() => countertopPresetValues(defaults, pieces), [defaults, pieces]);
  const support = useMemo(() => countertopSupportSettings(defaults), [defaults]);
  if (piece === undefined) return null;
  const { attributes } = piece.data;
  const edges = attributes.edges;
  const edgeIndex = picked.edge !== null && picked.edge < edges.length ? picked.edge : null;
  const edge = edgeIndex === null ? null : edges[edgeIndex]!;
  const sides = countertopSides(piece.data);
  const material =
    attributes.materialItemId === null ? null : countertopMaterialName(catalog, attributes.materialItemId);
  const summaryVars = {
    label: attributes.label,
    cm: cmText(attributes.thickness),
    area: areaText(countertopPieceAreaSqFt(piece.data)),
  };
  const pressed = edge === null ? null : countertopEdgePreset(edge, values);

  const apply = (changes: ReturnType<typeof countertopTypedChanges>) => {
    if (canEdit && changes.length > 0) store.applyEdit(changes);
  };
  const pick = (i: number) => selection.getState().select(piece.id, i);
  const typed = (i: number, inches: number) =>
    apply(countertopTypedChanges(pieces, piece.id, i, inches, support));
  const preset = (p: CountertopOverhangPreset) => {
    if (edgeIndex === null) return;
    apply(countertopPresetChanges(pieces, piece.id, edgeIndex, p, values, support));
  };
  const seating = countertopSeatingSides(piece.data, support);

  const side = (name: SideName | null, i: number) => (
    <SideInput
      key={i}
      name={name}
      index={i}
      edge={edges[i]!}
      active={edgeIndex === i}
      canEdit={canEdit}
      label={name === null ? t('office.countertops.panel.side', { n: i + 1 }) : t(SIDE_KEY[name])}
      seatingLabel={t('office.countertops.panel.seating')}
      onPick={() => pick(i)}
      onTyped={(inches) => typed(i, inches)}
    />
  );

  return (
    <section className={styles.inspector} data-testid="countertop-piece-inspector" data-id={piece.id}>
      <header className={styles.head}>
        <div className={styles.titleRow}>
          <h2 className={styles.title} data-testid="countertop-inspector-title">
            {attributes.name.length > 0
              ? t('office.countertops.inspector.title', { name: attributes.name })
              : t('office.countertops.inspector.title_unnamed', { label: attributes.label })}
          </h2>
          <span className={styles.status}>{t(STATUS_KEY[piece.data.status])}</span>
        </div>
        <p className={styles.summary} data-testid="countertop-inspector-summary">
          {material === null
            ? t('office.countertops.inspector.summary', summaryVars)
            : t('office.countertops.inspector.summary_material', { ...summaryVars, material })}
        </p>
      </header>
      <h3 className={styles.lbl}>{t('office.countertops.inspector.by_side')}</h3>
      {sides !== null ? (
        <div className={styles.diagram} data-testid="countertop-sides">
          <div className={styles.front}>{side('front', sides.front)}</div>
          <div className={styles.left}>{side('left', sides.left)}</div>
          <div className={styles.cabinets} data-testid="countertop-cabinets">
            <span>{t('office.countertops.inspector.cabinets')}</span>
            <span className={styles.mono}>
              {`${formatInches(Math.max(0, sides.cabinets.width))} × ${formatInches(Math.max(0, sides.cabinets.depth))}`}
            </span>
          </div>
          <div className={styles.right}>{side('right', sides.right)}</div>
          <div className={styles.back}>{side('back', sides.back)}</div>
        </div>
      ) : (
        <div className={styles.list} data-testid="countertop-sides">
          {edges.map((_, i) => side(null, i))}
        </div>
      )}
      <div className={styles.chips} role="group" aria-label={t('office.countertops.inspector.presets')}>
        {COUNTERTOP_OVERHANG_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className={styles.chip}
            data-testid={`countertop-preset-${p}`}
            aria-pressed={pressed === p}
            disabled={!canEdit || edge === null || edge.seamId !== undefined}
            onClick={() => preset(p)}
          >
            {t(PRESET_KEY[p], {
              value: formatInches(
                p === 'flush' ? 0 : p === 'standard' ? values.standard : p === 'bar' ? values.bar : values.seating,
              ),
            })}
          </button>
        ))}
      </div>
      {seating.length > 0 ? (
        <SupportRows sides={seating} settings={support} canManageDefaults={canManageDefaults} />
      ) : null}
    </section>
  );
}

type SupportRowsProps = {
  sides: ReturnType<typeof countertopSeatingSides>;
  settings: CountertopSupportSettings;
  canManageDefaults: boolean;
};

// The support notice (board: amber box with the info icon) and the Seats row ("Seats   3 at 24" spacing").
function SupportRows({ sides, settings, canManageDefaults }: SupportRowsProps): ReactElement {
  const t = useT();
  const needing = sides.filter((s) => s.needsSupport);
  const setIn = <SetInDefaults canManage={canManageDefaults} />;
  let notice: ReactElement | null = null;
  if (settings.limit === null) {
    notice = (
      <>
        {t('office.countertops.support.limit_not_set')} {setIn}
      </>
    );
  } else if (needing.length > 0) {
    const overhang = inchText(Math.max(...needing.map((s) => s.overhang)));
    if (settings.bracketSpacing === null) {
      notice = (
        <>
          {t('office.countertops.support.needs_no_spacing', { overhang })} {setIn}
        </>
      );
    } else {
      const n = needing.reduce((sum, s) => sum + (s.brackets ?? 0), 0);
      const spacing = inchText(settings.bracketSpacing);
      notice = (
        <>
          {n === 1
            ? t('office.countertops.support.needs_one', { overhang, spacing })
            : t('office.countertops.support.needs', { overhang, n, spacing })}
        </>
      );
    }
  }
  const seatWidth = settings.seatWidth;
  const seats = sides.reduce((sum, s) => sum + (s.seats ?? 0), 0);
  return (
    <>
      {notice !== null ? (
        <div className={styles.notice} role="status" data-testid="countertop-support-notice">
          <Icon name="info" size={18} />
          <span data-testid="countertop-support-text">{notice}</span>
        </div>
      ) : null}
      <div className={styles.seats} data-testid="countertop-seats">
        <span className={styles.seatsLabel}>{t('office.countertops.seats.label')}</span>
        <span data-testid="countertop-seats-value">
          {seatWidth === null
            ? setIn
            : t('office.countertops.seats.value', { n: seats, width: inchText(seatWidth) })}
        </span>
      </div>
    </>
  );
}

type SideInputProps = {
  name: SideName | null;
  index: number;
  edge: CountertopEdge;
  active: boolean;
  canEdit: boolean;
  label: string;
  seatingLabel: string;
  onPick: () => void;
  onTyped: (inches: number) => void;
};

// One side: its label ("Back · seating" on a seating edge) and its overhang, typed. A seam takes no overhang.
function SideInput({
  name,
  index,
  edge,
  active,
  canEdit,
  label,
  seatingLabel,
  onPick,
  onTyped,
}: SideInputProps): ReactElement {
  const shown = inchText(edge.overhang);
  const [text, setText] = useState(shown);
  // A new value from the model (a chip, a preset, undo) replaces what is in the field.
  const [was, setWas] = useState(shown);
  if (was !== shown) {
    setWas(shown);
    setText(shown);
  }
  const commit = () => {
    const r = parseLength(text, 'other');
    if (r.ok && r.inches >= 0 && r.inches !== edge.overhang) onTyped(r.inches);
    else setText(shown);
  };
  const seating = edge.kind === 'seating';
  const id = `countertop-side-${index}`;
  return (
    <div
      className={styles.side}
      data-testid="countertop-side"
      data-side={name ?? undefined}
      data-edge={index}
      data-active={active ? 'true' : 'false'}
      data-kind={edge.kind}
    >
      <label htmlFor={id} className={styles.sideLabel} data-testid="countertop-side-label">
        {seating ? `${label} · ${seatingLabel}` : label}
      </label>
      <input
        id={id}
        className={active ? styles.inputOn : styles.input}
        data-testid={`countertop-side-input-${name ?? index}`}
        value={text}
        inputMode="decimal"
        autoComplete="off"
        readOnly={!canEdit || edge.seamId !== undefined}
        onFocus={onPick}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            setText(shown);
          }
        }}
      />
    </div>
  );
}
