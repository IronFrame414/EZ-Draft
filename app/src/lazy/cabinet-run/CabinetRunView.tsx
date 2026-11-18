'use client';
// EZD-404 (S04 Layout "Canvas: run header bar; plan strip of the run against its wall; Elevation A of the same run
// with uppers, countertop, toe kick, chain dimensions (widths) and height dimensions"; S04 Controls "Click box",
// "Hover box", "Esc"; S04 Data shown "Plan strip: wall, boxes with codes, fillers dashed"; board S04Cabinets;
// AC-EZD-404-1, -2; vault/build/assumptions.md EZD-404): the cabinet run screen over the plan while the Cabinets tool
// is on. Drawn as one SVG in inches; the plan strip and the elevation read one selection, so the box picked in either
// is drawn blue in both. Widths and heights show to 1/16" (Q-0207). Loaded through lazyModule on first use (11 rule 7).
// EZD-405 (S04 Controls "Shift+click box", "Drag box", "Drag box side edge", "Double-click box", "Right-click box",
// "Chain dimension text", "Height dimension text", "Delete / Backspace", "Esc | Clears selection / cancels drag",
// "Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z"; S04 Permissions "Edit model: place, drag, resize, swap, delete boxes ... Also
// requires the edit lock"; AC-EZD-405-1; vault/build/assumptions.md EZD-405): with Edit model and the lock, boxes are
// edited on the drawing. A drag shows its result live and is one edit (one undo step) when the pointer is let go.
// EZD-406 (S04 Controls "Click box | ... inspector shows it", "Right-click box | Context menu: Swap box, ..."): the
// selection lives in a small store shared with the box inspector (`selectionStore`; a screen without one keeps its
// own), and the context menu's Swap box opens the inspector's compatible list.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import { Icon } from '../../components/icon/Icon';
import {
  cabinetEdgeSteps,
  cabinetSteppedWidth,
  parseLength,
  type CabinetSlot,
  type ModelObject,
} from '@ezdraft/geometry';
import { StatusItem } from '../../components/shell/StatusBar';
import { useT } from '../../lib/messages';
import { formatInches } from '../../lib/catalog/catalog';
import type { ModelStore } from '../../editor/model/model-store';
import type { Change, Objects } from '../../editor/model/patches';
import { isTypingTarget } from '../../editor/typed-entry/typed-entry';
import type { FloorChoice } from '../../editor/floors/floors';
import { useChosenFloor } from '../../editor/floors/use-chosen-floor';
import { openFloorId } from '../../editor/plan/batches';
import {
  createCabinetSelectionStore,
  type CabinetSelectionStore,
} from '../../editor/cabinets/cabinet-selection-store';
import {
  cabinetDeleteChanges,
  cabinetDropIndex,
  cabinetDuplicateChanges,
  cabinetHeightChanges,
  cabinetReorderChanges,
  cabinetResizeChanges,
  cabinetView,
  isCabinetSelected,
  modelObjects,
  type CabinetSelection,
  type CabinetSelectionInput,
  type CabinetView,
} from '../../editor/cabinets/cabinet-view';
import styles from './CabinetRunView.module.css';

export type CabinetRunViewProps = {
  store: ModelStore;
  floors?: FloorChoice;
  // EZD-405: Edit model and holding the lock; without it the screen only reads.
  canEdit?: boolean;
  newId?: () => string;
  // EZD-406: the selection shared with the box inspector.
  selectionStore?: CabinetSelectionStore;
};

const inches = (n: number) => `${formatInches(n)}"`;

// The shared selection store, or one of the screen's own when none is given.
export function useCabinetSelectionStore(given?: CabinetSelectionStore): CabinetSelectionStore {
  const [own] = useState(createCabinetSelectionStore);
  return given ?? own;
}

export function useCabinetModel(store: ModelStore, floors?: FloorChoice) {
  const chosen = useChosenFloor(floors);
  const objects = useStore(store, (s) => s.objects);
  const floorId = useMemo(
    () => (floors === undefined ? null : openFloorId(objects, chosen)),
    [objects, chosen, floors],
  );
  const parsed = useMemo(() => modelObjects(objects), [objects]);
  const view = useMemo(() => cabinetView(parsed, floorId), [parsed, floorId]);
  return { objects, parsed, floorId, view };
}

function useCabinetView(store: ModelStore, floors?: FloorChoice): CabinetView | null {
  return useCabinetModel(store, floors).view;
}

// A drag in progress, in inches along the run. A move becomes a reorder once the pointer travels past MOVE_SLOP.
type Drag =
  | { kind: 'resize'; id: string; edge: 'left' | 'right'; width: number; startX: number; x: number }
  | { kind: 'move'; id: string; startX: number; x: number; moving: boolean };
const MOVE_SLOP = 1.5;

// The typed entry open in the header: a box's width (chain dimension, double-click) or a row's height.
export type CabinetEntry =
  { kind: 'width'; id: string } | { kind: 'height'; which: 'base' | 'upper' };
type Menu = { id: string; x: number; y: number };

const preview = (objects: Objects, changes: Change[]): ModelObject[] => {
  const next = new Map(objects);
  for (const c of changes) {
    if (c.value === null) next.delete(c.id);
    else next.set(c.id, c.value);
  }
  return modelObjects(next);
};

export function CabinetRunView({
  store,
  floors,
  canEdit = false,
  newId,
  selectionStore,
}: CabinetRunViewProps): ReactElement {
  const { objects, parsed, floorId, view } = useCabinetModel(store, floors);
  const selStore = useCabinetSelectionStore(selectionStore);
  const selection = useStore(selStore, (s) => s.selection);
  const send = selStore.getState().send;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [entry, setEntry] = useState<CabinetEntry | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);

  const dragChanges = useCallback(
    (d: Drag, v: CabinetView): Change[] => {
      if (d.kind === 'resize') {
        const width = cabinetSteppedWidth(d.width, cabinetEdgeSteps(d.edge, d.x - d.startX));
        return cabinetResizeChanges(v, parsed, d.id, width);
      }
      if (!d.moving) return [];
      const at = cabinetDropIndex(v, d.id, d.x);
      return at === null ? [] : cabinetReorderChanges(v, d.id, at);
    },
    [parsed],
  );

  // While dragging, the drawing shows the run as it will be.
  const shown = useMemo(() => {
    if (drag === null || view === null) return view;
    const changes = dragChanges(drag, view);
    return changes.length === 0 ? view : cabinetView(preview(objects, changes), floorId);
  }, [drag, view, objects, floorId, dragChanges]);

  const apply = useCallback(
    (changes: Change[]) => (changes.length === 0 ? [] : store.applyEdit(changes)),
    [store],
  );

  const deleteSelected = useCallback(() => {
    if (view === null || selection.ids.length === 0) return;
    if (apply(cabinetDeleteChanges(view, selection.ids)).length > 0) send({ type: 'set', ids: [] });
  }, [view, selection.ids, apply, send]);

  const duplicate = useCallback(
    (ids: readonly string[]) => {
      if (view === null) return;
      const r = cabinetDuplicateChanges(view, parsed, ids, newId ?? (() => crypto.randomUUID()));
      if (apply(r.changes).length > 0) send({ type: 'set', ids: r.ids });
    },
    [view, parsed, newId, apply, send],
  );

  // Esc cancels a drag, then closes the menu or the typed entry, then clears the selection; with nothing left it
  // reaches the rail and ends the tool. With Edit model: Delete / Backspace remove the selected boxes and
  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z undo and redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        if (drag !== null) setDrag(null);
        else if (menu !== null) setMenu(null);
        else if (entry !== null) setEntry(null);
        else if (selection.ids.length > 0) send({ type: 'escape' });
        else return;
        e.preventDefault();
        return;
      }
      if (!canEdit || isTypingTarget(e.target)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.ids.length > 0) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drag, menu, entry, selection.ids.length, canEdit, deleteSelected, store, send]);

  const edit: CabinetEditHandlers | undefined =
    !canEdit || view === null
      ? undefined
      : {
          beginResize: (id, edge, x) => {
            const slot = [...view.layout.base, ...view.layout.upper].find((s) => s.id === id);
            if (slot === undefined) return;
            setMenu(null);
            setDrag({ kind: 'resize', id, edge, width: slot.width, startX: x, x });
          },
          beginMove: (id, x) => {
            setMenu(null);
            setDrag({ kind: 'move', id, startX: x, x, moving: false });
          },
          // True once the pointer should be held by the drawing: a resize, or a move past MOVE_SLOP.
          move: (x) => {
            if (drag === null) return false;
            const next: Drag =
              drag.kind === 'move'
                ? { ...drag, x, moving: drag.moving || Math.abs(x - drag.startX) > MOVE_SLOP }
                : { ...drag, x };
            setDrag(next);
            return next.kind === 'resize' || next.moving;
          },
          // True when the drag was a real edit or reorder, so the click that ends it does nothing more.
          end: (x) => {
            if (drag === null) return false;
            const d = { ...drag, x } as Drag;
            const done = d.kind === 'move' ? d.moving || Math.abs(x - d.startX) > MOVE_SLOP : true;
            setDrag(null);
            const final = d.kind === 'move' ? { ...d, moving: done } : d;
            apply(dragChanges(final, view));
            if (d.kind === 'resize') send({ type: 'click', id: d.id });
            return done;
          },
          cancel: () => setDrag(null),
          openWidth: (id) => {
            setMenu(null);
            send({ type: 'click', id });
            setEntry({ kind: 'width', id });
          },
          openHeight: (which) => {
            setMenu(null);
            setEntry({ kind: 'height', which });
          },
          openMenu: (id, x, y) => {
            if (!isCabinetSelected(selection, id)) send({ type: 'click', id });
            setMenu({ id, x, y });
          },
          isDragging: drag !== null,
        };

  const typed = (text: string): boolean => {
    if (view === null || entry === null) return false;
    const r = parseLength(text, 'positive');
    if (!r.ok) return false;
    const changes =
      entry.kind === 'width'
        ? cabinetResizeChanges(view, parsed, entry.id, r.inches)
        : cabinetHeightChanges(view, parsed, entry.which, r.inches);
    apply(changes);
    setEntry(null);
    return true;
  };

  const menuIds =
    menu === null ? [] : isCabinetSelected(selection, menu.id) ? selection.ids : [menu.id];
  return (
    <CabinetRunScreen
      view={shown}
      selection={selection}
      onInput={(i) => {
        if (i.type === 'click') setMenu(null);
        send(i);
      }}
      edit={edit}
      entry={canEdit ? entry : null}
      onEntry={typed}
      onEntryClose={() => setEntry(null)}
      menu={
        canEdit && menu !== null
          ? {
              x: menu.x,
              y: menu.y,
              onSwap: () => {
                setMenu(null);
                send({ type: 'click', id: menu.id });
                selStore.getState().openSwap(menu.id);
              },
              onDuplicate: () => {
                setMenu(null);
                duplicate(menuIds);
              },
              onDelete: () => {
                setMenu(null);
                if (view !== null && apply(cabinetDeleteChanges(view, menuIds)).length > 0) {
                  send({ type: 'set', ids: [] });
                }
              },
            }
          : null
      }
    />
  );
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

// EZD-405: what the drawing calls while editing; absent without Edit model and the lock.
export type CabinetEditHandlers = {
  beginResize(id: string, edge: 'left' | 'right', x: number): void;
  beginMove(id: string, x: number): void;
  move(x: number): boolean;
  end(x: number): boolean;
  cancel(): void;
  openWidth(id: string): void;
  openHeight(which: 'base' | 'upper'): void;
  openMenu(id: string, x: number, y: number): void;
  isDragging: boolean;
};

export type CabinetMenuProps = {
  x: number;
  y: number;
  // EZD-406: opens the box inspector's Swap box list for the box under the pointer.
  onSwap?: () => void;
  onDuplicate(): void;
  onDelete(): void;
};

export type CabinetRunScreenProps = {
  view: CabinetView | null;
  selection: CabinetSelection;
  onInput: (i: CabinetSelectionInput) => void;
  edit?: CabinetEditHandlers;
  entry?: CabinetEntry | null;
  // Returns false when the text is refused (the entry stays open with its message).
  onEntry?: (text: string) => boolean;
  onEntryClose?: () => void;
  menu?: CabinetMenuProps | null;
};

export function CabinetRunScreen(props: CabinetRunScreenProps): ReactElement {
  const {
    view,
    selection,
    onInput,
    edit,
    entry = null,
    onEntry,
    onEntryClose,
    menu = null,
  } = props;
  const t = useT();
  const sectionRef = useRef<HTMLElement>(null);
  if (view === null) {
    return (
      <section
        className={styles.screen}
        data-testid="cabinet-run"
        aria-label={t('office.cabinets.region')}
      >
        <p className={styles.empty} data-testid="cabinet-run-empty">
          {t('office.cabinets.empty')}
        </p>
      </section>
    );
  }
  const { summary } = view;
  const openMenu =
    edit === undefined
      ? undefined
      : (id: string, clientX: number, clientY: number) => {
          const r = sectionRef.current?.getBoundingClientRect();
          edit.openMenu(id, clientX - (r?.left ?? 0), clientY - (r?.top ?? 0));
        };
  return (
    <section
      ref={sectionRef}
      className={styles.screen}
      data-testid="cabinet-run"
      aria-label={t('office.cabinets.region')}
    >
      <header className={styles.header} data-testid="cabinet-run-header">
        <span className={styles.name} data-testid="cabinet-run-name">
          {summary.name}
        </span>
        <span className={styles.counts} data-testid="cabinet-run-counts">
          {t('office.cabinets.boxes', { count: summary.boxCount })}
          {' · '}
          {t('office.cabinets.fillers', { count: summary.fillerCount })}
        </span>
        {view.offWall ? (
          <span className={styles.notOnWall} data-testid="cabinet-run-not-on-wall" role="status">
            <Icon name="error" size={16} />
            {t('office.cabinets.not_on_wall')}
          </span>
        ) : null}
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
      {entry !== null && onEntry !== undefined ? (
        <DimEntry
          key={entryKey(entry)}
          view={view}
          entry={entry}
          onEntry={onEntry}
          onClose={onEntryClose}
        />
      ) : null}
      <RunDrawing
        view={view}
        selection={selection}
        onInput={onInput}
        edit={edit}
        onMenu={openMenu}
      />
      {menu !== null ? (
        <div
          className={styles.menu}
          role="menu"
          aria-label={t('office.cabinets.menu')}
          data-testid="cabinet-menu"
          style={{ left: menu.x, top: menu.y }}
        >
          {menu.onSwap !== undefined ? (
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={menu.onSwap}
            >
              {t('office.cabinets.swap')}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className={styles.menuItem}
            onClick={menu.onDuplicate}
          >
            {t('office.cabinets.duplicate')}
          </button>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={menu.onDelete}>
            {t('office.cabinets.delete')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

const entryKey = (e: CabinetEntry) => (e.kind === 'width' ? `w-${e.id}` : `h-${e.which}`);

// The typed size: Enter takes it, Esc (the screen's key handler) or leaving the field closes it.
function DimEntry({
  view,
  entry,
  onEntry,
  onClose,
}: {
  view: CabinetView;
  entry: CabinetEntry;
  onEntry: (text: string) => boolean;
  onClose?: () => void;
}): ReactElement {
  const t = useT();
  const [refused, setRefused] = useState(false);
  let label: string;
  let value: number;
  if (entry.kind === 'width') {
    const slot = [...view.layout.base, ...view.layout.upper].find((s) => s.id === entry.id);
    label = `${slot?.code ?? ''} ${t('office.cabinets.width')}`.trim();
    value = slot?.width ?? 0;
  } else {
    const h = view.layout.heights.find((x) => x.kind === entry.which);
    label = t(
      entry.which === 'base' ? 'office.cabinets.height_base' : 'office.cabinets.height_upper',
    );
    value = h === undefined ? 0 : h.to - h.from;
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = String(new FormData(e.currentTarget).get('size') ?? '');
    setRefused(!onEntry(text));
  };
  return (
    <form
      className={styles.entry}
      data-testid="cabinet-dim-entry"
      data-entry={entry.kind}
      onSubmit={submit}
    >
      <label className={styles.entryLabel}>
        {label}
        <input
          name="size"
          className={styles.entryInput}
          data-testid="cabinet-dim-input"
          defaultValue={inches(value)}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => onClose?.()}
          aria-invalid={refused ? 'true' : undefined}
        />
      </label>
      {refused ? (
        <span className={styles.entryRefused} role="alert">
          {t('office.cabinets.entry_refused')}
        </span>
      ) : null}
    </form>
  );
}

const MARGIN = 12;
const LABEL_GAP = 10;
const SECTION_GAP = 20;
const CHAIN_DROP = 8;
const DIM_OFFSET = 10;
const TICK = 1.5;

const EDGE = 1.5;

function RunDrawing({
  view,
  selection,
  onInput,
  edit,
  onMenu,
}: Pick<CabinetRunScreenProps, 'selection' | 'onInput' | 'edit'> & {
  view: CabinetView;
  onMenu?: (id: string, clientX: number, clientY: number) => void;
}): ReactElement {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  // Set when a drag ends as an edit, so the click the browser sends after it changes nothing.
  const swallow = useRef(false);
  const toX = (e: { clientX: number; clientY: number }): number => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (svg === null || m === null || m === undefined) return 0;
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()).x;
  };
  const capture = (pointerId: number) => {
    try {
      svgRef.current?.setPointerCapture(pointerId);
    } catch {
      // A pointer that already ended cannot be captured; the drag ends on its own.
    }
  };
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

  // EZD-410: every box of a run left off its wall is drawn red in both views (S04 Validation).
  const state = (id: string) => ({
    'data-flagged': view.offWall ? 'true' : undefined,
    'data-selected': isCabinetSelected(selection, id) ? 'true' : undefined,
    'data-hovered':
      selection.hoveredId !== null && selection.hoveredId.toLowerCase() === id.toLowerCase()
        ? 'true'
        : undefined,
  });
  const handlers = (id: string) => ({
    onClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      if (swallow.current) {
        swallow.current = false;
        return;
      }
      onInput({ type: 'click', id, shift: e.shiftKey });
    },
    onPointerEnter: () => onInput({ type: 'hover', id }),
    onPointerLeave: () => onInput({ type: 'hover', id: null }),
    ...(edit === undefined
      ? {}
      : {
          onPointerDown: (e: ReactPointerEvent) => {
            if (e.button !== 0 || e.shiftKey) return;
            swallow.current = false;
            edit.beginMove(id, toX(e));
          },
          onDoubleClick: (e: ReactMouseEvent) => {
            e.stopPropagation();
            edit.openWidth(id);
          },
          onContextMenu: (e: ReactMouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onMenu?.(id, e.clientX, e.clientY);
          },
        }),
  });
  // The side-edge handles: a thin strip inside each side of the box, so two boxes side by side keep their own.
  const onEdgeDown = (e: ReactPointerEvent<SVGRectElement>) => {
    const id = e.currentTarget.dataset.edgeOf;
    const edge = e.currentTarget.dataset.edge;
    if (
      edit === undefined ||
      e.button !== 0 ||
      id === undefined ||
      (edge !== 'left' && edge !== 'right')
    )
      return;
    e.stopPropagation();
    swallow.current = false;
    capture(e.pointerId);
    edit.beginResize(id, edge, toX(e));
  };
  const edges = (s: CabinetSlot, y: number, h: number): ReactNode => {
    if (edit === undefined) return null;
    const w = Math.min(EDGE, s.width / 4);
    return (['left', 'right'] as const).map((edge) => (
      <rect
        key={edge}
        x={edge === 'left' ? s.x : s.x + s.width - w}
        y={y}
        width={w}
        height={h}
        className={styles.edge}
        data-edge={edge}
        data-edge-of={s.id}
        onPointerDown={onEdgeDown}
      >
        <title>{t('office.cabinets.resize_edge')}</title>
      </rect>
    ));
  };

  const planBox = (s: CabinetSlot): ReactNode => {
    const y = planTop;
    const d = s.depth;
    const dashed = s.kind === 'filler' || s.row === 'upper';
    return (
      <g
        key={`plan-${s.id}`}
        data-cabinet-id={s.id}
        data-view="plan"
        data-row={s.row}
        {...state(s.id)}
        {...handlers(s.id)}
        className={s.row === 'upper' ? `${styles.box} ${styles.upperPlan}` : styles.box}
      >
        <rect
          x={s.x}
          y={y}
          width={s.width}
          height={d}
          className={dashed ? `${styles.outline} ${styles.dashed}` : styles.outline}
        />
        {s.row === 'base' && s.kind !== 'filler' && s.width >= 6 ? (
          <text x={s.x + s.width / 2} y={y + d / 2} className={styles.code}>
            {s.code}
          </text>
        ) : null}
      </g>
    );
  };

  const elevBox = (s: CabinetSlot): ReactNode => (
    <g
      key={`elev-${s.id}`}
      data-cabinet-id={s.id}
      data-view="elevation"
      data-row={s.row}
      {...state(s.id)}
      {...handlers(s.id)}
      className={styles.box}
    >
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
      {edges(s, yAt(s.top), s.top - s.bottom)}
    </g>
  );

  return (
    <svg
      className={styles.drawing}
      viewBox={`${x0} 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMin meet"
      data-testid="cabinet-run-drawing"
      data-dragging={edit?.isDragging === true ? 'true' : undefined}
      ref={svgRef}
      onClick={(e) => {
        if (swallow.current) {
          swallow.current = false;
          return;
        }
        onInput({ type: 'click', id: null, shift: e.shiftKey });
      }}
      onPointerMove={(e) => {
        if (edit?.isDragging !== true) return;
        if (edit.move(toX(e))) capture(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (edit?.isDragging !== true) return;
        swallow.current = edit.end(toX(e));
      }}
      onPointerCancel={() => edit?.cancel()}
    >
      <text x={leftEnd} y={planTop - 4} className={styles.sectionLabel}>
        {t('office.cabinets.plan')}
      </text>
      <g data-testid="cabinet-plan-strip">
        {wall !== null ? (
          <rect
            x={wall.from}
            y={planTop - 2}
            width={wall.to - wall.from}
            height={2}
            className={styles.wall}
            data-testid="cabinet-plan-wall"
          />
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
            <rect
              x={w.x}
              y={yAt(w.top)}
              width={w.width}
              height={w.top - w.bottom}
              className={styles.window}
            />
            <line
              x1={w.x + w.width / 2}
              x2={w.x + w.width / 2}
              y1={yAt(w.top)}
              y2={yAt(w.bottom)}
              className={styles.window}
            />
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
            {i === 0 ? (
              <line
                x1={c.x}
                x2={c.x}
                y1={chainY - TICK}
                y2={chainY + TICK}
                className={styles.dim}
              />
            ) : null}
            <line x1={c.x} x2={c.x + c.width} y1={chainY} y2={chainY} className={styles.dim} />
            <line
              x1={c.x + c.width}
              x2={c.x + c.width}
              y1={chainY - TICK}
              y2={chainY + TICK}
              className={styles.dim}
            />
            <text
              x={c.x + c.width / 2}
              y={chainY + 5}
              className={
                edit === undefined ? styles.dimText : `${styles.dimText} ${styles.typable}`
              }
              data-testid="cabinet-chain-text"
              onClick={
                edit === undefined
                  ? undefined
                  : (e) => {
                      e.stopPropagation();
                      edit.openWidth(c.id);
                    }
              }
            >
              {inches(c.width)}
            </text>
          </g>
        ))}
      </g>

      <g data-testid="cabinet-heights">
        {heights.map((h) => (
          <g key={h.kind} data-height={h.kind} data-size={h.to - h.from}>
            <line x1={dimX} x2={dimX} y1={yAt(h.to)} y2={yAt(h.from)} className={styles.dim} />
            <line
              x1={dimX - TICK}
              x2={dimX + TICK}
              y1={yAt(h.to)}
              y2={yAt(h.to)}
              className={styles.dim}
            />
            <line
              x1={dimX - TICK}
              x2={dimX + TICK}
              y1={yAt(h.from)}
              y2={yAt(h.from)}
              className={styles.dim}
            />
            <text
              x={dimX + 3}
              y={yAt((h.from + h.to) / 2) + 1}
              className={
                edit === undefined || h.kind === 'gap'
                  ? styles.heightText
                  : `${styles.heightText} ${styles.typable}`
              }
              onClick={
                edit === undefined || h.kind === 'gap'
                  ? undefined
                  : (e) => {
                      e.stopPropagation();
                      if (h.kind !== 'gap') edit.openHeight(h.kind);
                    }
              }
            >
              {inches(h.to - h.from)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
