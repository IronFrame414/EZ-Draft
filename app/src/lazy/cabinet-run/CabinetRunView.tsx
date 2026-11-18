'use client';
// EZD-404 (S04 Layout "Canvas: run header bar; plan strip of the run against its wall; Elevation A of the same run
// with uppers, countertop, toe kick, chain dimensions (widths) and height dimensions"; S04 Controls "Click box",
// "Hover box", "Esc"; S04 Data shown "Plan strip: wall, boxes with codes, fillers dashed"; board S04Cabinets;
// AC-EZD-404-1, -2; vault/build/assumptions.md EZD-404): the cabinet run screen over the plan while the Cabinets tool
// is on. Drawn as one SVG in inches; the plan strip and the elevation read one selection, so the box picked in either
// is drawn blue in both. Widths and heights show to 1/16" (Q-0207). Loaded through lazyModule on first use (11 rule 7).
import { useEffect, useMemo, useReducer, type ReactElement, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { CabinetSlot } from '@ezdraft/geometry';
import { StatusItem } from '../../components/shell/StatusBar';
import { useT } from '../../lib/messages';
import { formatInches } from '../../lib/catalog/catalog';
import type { ModelStore } from '../../editor/model/model-store';
import type { FloorChoice } from '../../editor/floors/floors';
import { useChosenFloor } from '../../editor/floors/use-chosen-floor';
import { openFloorId } from '../../editor/plan/batches';
import {
  NO_CABINET_SELECTION,
  cabinetSelect,
  cabinetView,
  isCabinetSelected,
  modelObjects,
  type CabinetSelection,
  type CabinetSelectionInput,
  type CabinetView,
} from '../../editor/cabinets/cabinet-view';
import styles from './CabinetRunView.module.css';

export type CabinetRunViewProps = { store: ModelStore; floors?: FloorChoice };

const inches = (n: number) => `${formatInches(n)}"`;

function useCabinetView(store: ModelStore, floors?: FloorChoice): CabinetView | null {
  const chosen = useChosenFloor(floors);
  const objects = useStore(store, (s) => s.objects);
  return useMemo(() => {
    const floorId = floors === undefined ? null : openFloorId(objects, chosen);
    return cabinetView(modelObjects(objects), floorId);
  }, [objects, chosen, floors]);
}

export function CabinetRunView({ store, floors }: CabinetRunViewProps): ReactElement {
  const view = useCabinetView(store, floors);
  const [selection, send] = useReducer(cabinetSelect, NO_CABINET_SELECTION);
  // Esc clears the selection first; with nothing selected it reaches the rail and ends the tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || selection.ids.length === 0) return;
      e.preventDefault();
      send({ type: 'escape' });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selection.ids.length]);
  return <CabinetRunScreen view={view} selection={selection} onInput={send} />;
}

export function CabinetRunStatus({ store, floors }: CabinetRunViewProps): ReactElement | null {
  const t = useT();
  const view = useCabinetView(store, floors);
  if (view === null) return null;
  return (
    <StatusItem label="office.cabinets.status_view">
      <span data-testid="status-cabinet-view">
        {t('office.cabinets.status_view_value', { letter: view.letter })}
      </span>
    </StatusItem>
  );
}

export type CabinetRunScreenProps = {
  view: CabinetView | null;
  selection: CabinetSelection;
  onInput: (i: CabinetSelectionInput) => void;
};

export function CabinetRunScreen({ view, selection, onInput }: CabinetRunScreenProps): ReactElement {
  const t = useT();
  if (view === null) {
    return (
      <section className={styles.screen} data-testid="cabinet-run" aria-label={t('office.cabinets.region')}>
        <p className={styles.empty} data-testid="cabinet-run-empty">
          {t('office.cabinets.empty')}
        </p>
      </section>
    );
  }
  const { summary } = view;
  return (
    <section className={styles.screen} data-testid="cabinet-run" aria-label={t('office.cabinets.region')}>
      <header className={styles.header} data-testid="cabinet-run-header">
        <span className={styles.name} data-testid="cabinet-run-name">
          {summary.name}
        </span>
        <span className={styles.counts} data-testid="cabinet-run-counts">
          {t('office.cabinets.boxes', { count: summary.boxCount })}
          {' · '}
          {t('office.cabinets.fillers', { count: summary.fillerCount })}
        </span>
        <label className={styles.picker}>
          <span className={styles.pickerLabel}>{t('office.cabinets.elevation_picker')}</span>
          <select data-testid="cabinet-elevation-picker" defaultValue={view.letter}>
            {view.elevations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.grow} />
        {/* EZD-408 fills the run; until then the button is shown and off. */}
        <button type="button" className={styles.autoFill} data-testid="cabinet-auto-fill" disabled>
          {t('office.cabinets.auto_fill')}
        </button>
      </header>
      <RunDrawing view={view} selection={selection} onInput={onInput} />
    </section>
  );
}

const MARGIN = 12;
const LABEL_GAP = 10;
const SECTION_GAP = 20;
const CHAIN_DROP = 8;
const DIM_OFFSET = 10;
const TICK = 1.5;

function RunDrawing({ view, selection, onInput }: CabinetRunScreenProps & { view: CabinetView }): ReactElement {
  const t = useT();
  const { layout } = view;
  const { base, upper, wall, windows, heights } = layout;
  const all = [...base, ...upper];
  const rightEnd = Math.max(layout.total, ...upper.map((s) => s.x + s.width), 0);
  const leftEnd = Math.min(0, wall?.from ?? 0, ...windows.map((w) => w.x));
  const farRight = Math.max(rightEnd, wall?.to ?? 0, ...windows.map((w) => w.x + w.width));
  const dimX = farRight + DIM_OFFSET;
  const x0 = leftEnd - MARGIN;
  const width = dimX + 16 - x0;

  // Plan strip: the wall face at y = planTop, cabinets toward the room.
  const planTop = LABEL_GAP;
  const depth = Math.max(24, ...base.map((s) => s.depth));
  const planBottom = planTop + depth;
  // Elevation: y = elevTop + (topH - h) for a height h above the floor.
  const elevTop = planBottom + SECTION_GAP + LABEL_GAP;
  const topH = Math.max(
    0,
    ...all.map((s) => s.top),
    ...heights.map((h) => h.to),
    ...windows.map((w) => w.top),
  );
  const yAt = (h: number) => elevTop + (topH - h);
  const floorY = yAt(0);
  const chainY = floorY + CHAIN_DROP;
  const height = chainY + 10;

  const state = (id: string) => ({
    'data-selected': isCabinetSelected(selection, id) ? 'true' : undefined,
    'data-hovered':
      selection.hoveredId !== null && selection.hoveredId.toLowerCase() === id.toLowerCase()
        ? 'true'
        : undefined,
  });
  const handlers = (id: string) => ({
    onClick: (e: { stopPropagation(): void }) => {
      e.stopPropagation();
      onInput({ type: 'click', id });
    },
    onPointerEnter: () => onInput({ type: 'hover', id }),
    onPointerLeave: () => onInput({ type: 'hover', id: null }),
  });

  const planBox = (s: CabinetSlot): ReactNode => {
    const y = planTop;
    const d = s.depth;
    const dashed = s.kind === 'filler' || s.row === 'upper';
    return (
      <g key={`plan-${s.id}`} data-cabinet-id={s.id} data-view="plan" data-row={s.row} {...state(s.id)} {...handlers(s.id)} className={s.row === 'upper' ? `${styles.box} ${styles.upperPlan}` : styles.box}>
        <rect x={s.x} y={y} width={s.width} height={d} className={dashed ? `${styles.outline} ${styles.dashed}` : styles.outline} />
        {s.row === 'base' && s.kind !== 'filler' && s.width >= 6 ? (
          <text x={s.x + s.width / 2} y={y + d / 2} className={styles.code}>
            {s.code}
          </text>
        ) : null}
      </g>
    );
  };

  const elevBox = (s: CabinetSlot): ReactNode => (
    <g key={`elev-${s.id}`} data-cabinet-id={s.id} data-view="elevation" data-row={s.row} {...state(s.id)} {...handlers(s.id)} className={styles.box}>
      <rect
        x={s.x}
        y={yAt(s.top)}
        width={s.width}
        height={s.top - s.bottom}
        className={s.kind === 'filler' ? `${styles.outline} ${styles.dashed}` : styles.outline}
      />
      {s.faces.map((f, i) => {
        const inset = Math.min(0.75, f.width / 8, f.height / 8);
        return (
          <rect
            key={i}
            x={f.x + inset}
            y={yAt(f.y + f.height) + inset}
            width={Math.max(f.width - 2 * inset, 0)}
            height={Math.max(f.height - 2 * inset, 0)}
            className={styles.face}
            data-face={f.kind}
          />
        );
      })}
    </g>
  );

  return (
    <svg
      className={styles.drawing}
      viewBox={`${x0} 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMin meet"
      data-testid="cabinet-run-drawing"
      onClick={() => onInput({ type: 'click', id: null })}
    >
      <text x={leftEnd} y={planTop - 4} className={styles.sectionLabel}>
        {t('office.cabinets.plan')}
      </text>
      <g data-testid="cabinet-plan-strip">
        {wall !== null ? (
          <rect x={wall.from} y={planTop - 2} width={wall.to - wall.from} height={2} className={styles.wall} data-testid="cabinet-plan-wall" />
        ) : null}
        {base.map(planBox)}
        {upper.map(planBox)}
      </g>

      <text x={leftEnd} y={elevTop - 4} className={styles.sectionLabel}>
        {t('office.cabinets.elevation', { letter: view.letter })}
      </text>
      <g data-testid="cabinet-elevation">
        {windows.map((w) => (
          <g key={w.id} data-window-id={w.id}>
            <rect x={w.x} y={yAt(w.top)} width={w.width} height={w.top - w.bottom} className={styles.window} />
            <line x1={w.x + w.width / 2} x2={w.x + w.width / 2} y1={yAt(w.top)} y2={yAt(w.bottom)} className={styles.window} />
          </g>
        ))}
        {layout.toeKick !== null ? (
          <rect
            x={layout.toeKick.x}
            y={yAt(layout.toeKick.height)}
            width={layout.toeKick.width}
            height={layout.toeKick.height}
            className={styles.toeKick}
            data-testid="cabinet-toe-kick"
          />
        ) : null}
        {layout.countertops.map((c, i) => (
          <rect
            key={i}
            x={c.x - 0.75}
            y={yAt(c.top)}
            width={c.width + 1.5}
            height={c.top - c.bottom}
            className={styles.countertop}
            data-testid="cabinet-countertop"
          />
        ))}
        {base.map(elevBox)}
        {upper.map(elevBox)}
        <line x1={leftEnd - 2} x2={farRight + 4} y1={floorY} y2={floorY} className={styles.floor} />
      </g>

      <g data-testid="cabinet-chain">
        {layout.chain.map((c, i) => (
          <g key={c.id} data-chain-id={c.id} data-width={c.width}>
            {i === 0 ? <line x1={c.x} x2={c.x} y1={chainY - TICK} y2={chainY + TICK} className={styles.dim} /> : null}
            <line x1={c.x} x2={c.x + c.width} y1={chainY} y2={chainY} className={styles.dim} />
            <line x1={c.x + c.width} x2={c.x + c.width} y1={chainY - TICK} y2={chainY + TICK} className={styles.dim} />
            <text x={c.x + c.width / 2} y={chainY + 5} className={styles.dimText}>
              {inches(c.width)}
            </text>
          </g>
        ))}
      </g>

      <g data-testid="cabinet-heights">
        {heights.map((h) => (
          <g key={h.kind} data-height={h.kind} data-size={h.to - h.from}>
            <line x1={dimX} x2={dimX} y1={yAt(h.to)} y2={yAt(h.from)} className={styles.dim} />
            <line x1={dimX - TICK} x2={dimX + TICK} y1={yAt(h.to)} y2={yAt(h.to)} className={styles.dim} />
            <line x1={dimX - TICK} x2={dimX + TICK} y1={yAt(h.from)} y2={yAt(h.from)} className={styles.dim} />
            <text x={dimX + 3} y={yAt((h.from + h.to) / 2) + 1} className={styles.heightText}>
              {inches(h.to - h.from)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
