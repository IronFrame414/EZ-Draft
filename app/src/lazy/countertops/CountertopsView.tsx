'use client';
// EZD-412 (S04b Layout "Canvas: tool bar card (Trace cabinets, Draw outline, Seam, Cutout), hint text ...; countertop
// plan over dashed cabinets"; S04b Controls "Trace cabinets", "Draw outline", "Click piece", "Drag outline vertex",
// "Undo / redo, Esc"; S04b States "No cabinets: Trace cabinets disabled with hint"; S04b Permissions "View projects:
// view pieces ... Edit model: Trace cabinets, Draw outline ... Requires the edit lock"; board S04bCountertops;
// AC-EZD-412-1; vault/build/assumptions.md EZD-412): the countertop screen over the plan while the Countertops tool is
// on. Drawn as one SVG in inches, model y up (the SVG's y is the model's y turned over). Seam and Cutout are EZD-413,
// the left panel and status bar EZD-416, the inspector EZD-414 to EZD-417. Loaded through lazyModule on first use.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { useStore } from 'zustand';
import {
  cabinetFootprints,
  parseLength,
  wallFaceLines,
  type ModelObject,
  type Point,
} from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { ModelStore } from '../../editor/model/model-store';
import type { Change } from '../../editor/model/patches';
import { isTypingTarget } from '../../editor/typed-entry/typed-entry';
import type { FloorChoice } from '../../editor/floors/floors';
import { useChosenFloor } from '../../editor/floors/use-chosen-floor';
import { openFloorId } from '../../editor/plan/batches';
import { modelObjects } from '../../editor/cabinets/cabinet-view';
import {
  canTraceCabinets,
  countertopPieceAt,
  countertopPieces,
  countertopTraceChanges,
  countertopTraceDefaults,
  type CountertopPiece,
} from '../../editor/countertops/trace-tool';
import {
  countertopOutlineChanges,
  countertopVertexChanges,
  INITIAL_OUTLINE_STATE,
  outlineInput,
  outlineSnapTargets,
  type OutlineInput,
  type OutlineToolState,
} from '../../editor/countertops/outline-tool';
import styles from './CountertopsView.module.css';

export type CountertopsViewProps = {
  store: ModelStore;
  floors?: FloorChoice;
  // Edit model and holding the lock; without it the screen only reads.
  canEdit?: boolean;
  newId?: () => string;
  // The effective Defaults (overhang_standard, overhang_against_wall, countertop_increment); null while not read.
  defaults?: Readonly<Record<string, unknown>> | null;
};

// The pick, snap and close radius on screen.
const PICK_PX = 10;
// Room around the drawing, in inches.
const MARGIN = 24;

const svgPt = (p: Point) => `${p.x},${-p.y}`;
const svgPoints = (ps: readonly Point[]) => ps.map(svgPt).join(' ');

type Drag = { id: string; index: number; from: Point; at: Point };

export function CountertopsView({
  store,
  floors,
  canEdit = false,
  newId,
  defaults = null,
}: CountertopsViewProps): ReactElement {
  const t = useT();
  const chosen = useChosenFloor(floors);
  const objects = useStore(store, (s) => s.objects);
  const floorId = useMemo(
    () => (floors === undefined ? null : openFloorId(objects, chosen)),
    [objects, chosen, floors],
  );
  const parsed = useMemo(() => modelObjects(objects), [objects]);
  // The floor the screen shows: the open floor, or (with no floor list) the floor of the first run or top.
  const level = useMemo(() => {
    if (floorId !== null) return floorId;
    const o = parsed.find((x) => x.type === 'cabinet_run' || x.type === 'countertop_piece');
    return o !== undefined && 'level' in o.data ? (o.data.level as string) : null;
  }, [floorId, parsed]);

  const pieces = useMemo(() => countertopPieces(parsed, level), [parsed, level]);
  const cabinets = useMemo(
    () => (level === null ? [] : cabinetFootprints(parsed, level)),
    [parsed, level],
  );
  const walls = useMemo(() => wallBodies(parsed, level), [parsed, level]);
  const traceable = useMemo(() => canTraceCabinets(parsed, level), [parsed, level]);
  const targets = useMemo(() => outlineSnapTargets(parsed, level), [parsed, level]);
  const increment = useMemo(() => {
    const v = defaults?.['countertop_increment'];
    return typeof v === 'number' && v > 0 ? v : 0.5;
  }, [defaults]);

  const [selected, setSelected] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [outline, setOutline] = useState<OutlineToolState>(INITIAL_OUTLINE_STATE);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [lengthText, setLengthText] = useState('');
  const [scale, setScale] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const editing = canEdit && level !== null;
  const draw = drawing && editing;

  const box = useMemo(() => viewBox(walls, cabinets, pieces), [walls, cabinets, pieces]);

  // Inches per screen pixel, read when the drawing is laid out or resized.
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const read = () => {
      const w = svg.getBoundingClientRect().width;
      const h = svg.getBoundingClientRect().height;
      if (w > 0 && h > 0) setScale(Math.max(box.w / w, box.h / h));
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [box]);

  const ctx = useMemo(
    () => ({ targets, increment, radius: PICK_PX * scale }),
    [targets, increment, scale],
  );

  const apply = useCallback(
    (changes: Change[]) => (changes.length === 0 ? [] : store.applyEdit(changes)),
    [store],
  );
  const makeId = useCallback(() => (newId ?? (() => crypto.randomUUID()))(), [newId]);

  const toModel = (e: { clientX: number; clientY: number }): Point | null => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (svg === null || svg === undefined || m === null || m === undefined) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: -p.y };
  };

  const step = (i: OutlineInput) => {
    const r = outlineInput(outline, i, ctx);
    setOutline(r.state);
    if (r.closed !== null) {
      const made = countertopOutlineChanges(parsed, level, r.closed, makeId);
      if (apply(made.changes).length > 0 && made.id !== null) setSelected(made.id);
      setDrawing(false);
    }
  };

  const stopDrawing = () => {
    setDrawing(false);
    setOutline(INITIAL_OUTLINE_STATE);
    setLengthText('');
  };

  const trace = () => {
    if (!editing) return;
    const r = countertopTraceChanges(parsed, level, countertopTraceDefaults(defaults), makeId);
    if (apply(r.changes).length > 0) setSelected(r.ids[0] ?? null);
  };

  // Esc ends the outline being drawn, then a drag, then clears the selection; with nothing left it reaches the rail
  // and ends the tool. With Edit model: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z undo and redo (the plan's keys are off here).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        if (drawing) {
          setDrawing(false);
          setOutline(INITIAL_OUTLINE_STATE);
          setLengthText('');
        } else if (drag !== null) setDrag(null);
        else if (selected !== null) setSelected(null);
        else return;
        e.preventDefault();
        return;
      }
      if (!canEdit || isTypingTarget(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drawing, drag, selected, canEdit, store]);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const at = toModel(e);
    if (at === null) return;
    if (draw) {
      step({ type: 'click', at });
      return;
    }
    setSelected(countertopPieceAt(pieces, at));
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const at = toModel(e);
    if (at === null) return;
    if (drag !== null) setDrag({ ...drag, at: snapDrag(at, targets, ctx.radius, increment) });
    else if (draw) step({ type: 'move', at });
  };

  const onPointerUp = () => {
    if (drag === null) return;
    // A press and release in place changes nothing (no undo step, no save).
    if (drag.at.x !== drag.from.x || drag.at.y !== drag.from.y)
      apply(countertopVertexChanges(parsed, drag.id, drag.index, drag.at));
    setDrag(null);
  };

  const typed = () => {
    const r = parseLength(lengthText, 'positive');
    if (!r.ok) return;
    step({ type: 'typed', length: r.inches });
    setLengthText('');
  };

  const hint = !traceable
    ? t('office.countertops.hint_no_cabinets')
    : draw
      ? t('office.countertops.hint_draw')
      : null;

  const shownOutline = (p: CountertopPiece): Point[] =>
    drag !== null && drag.id === p.id
      ? p.data.geometry.outline.map((q, i) => (i === drag.index ? drag.at : q))
      : p.data.geometry.outline;

  const draftPts = outline.draft.points;
  const rubber = draw && outline.cursor !== null ? [...draftPts, outline.cursor] : draftPts;

  return (
    <section
      className={styles.screen}
      data-testid="countertops"
      aria-label={t('office.countertops.region')}
    >
      <div className={styles.bar}>
        <div className={styles.tools} role="toolbar" aria-label={t('office.countertops.tools')}>
          <button
            type="button"
            className={styles.tool}
            data-testid="countertop-trace"
            disabled={!editing || !traceable}
            onClick={trace}
          >
            <Icon name="auto_awesome" size={18} />
            {t('office.countertops.trace')}
          </button>
          <button
            type="button"
            className={styles.tool}
            data-testid="countertop-draw"
            aria-pressed={draw}
            disabled={!editing}
            onClick={() => (draw ? stopDrawing() : setDrawing(true))}
          >
            <Icon name="draw" size={18} />
            {t('office.countertops.draw')}
          </button>
        </div>
        {hint !== null ? (
          <p className={styles.hint} data-testid="countertop-hint">
            {hint}
          </p>
        ) : null}
        {draw && draftPts.length > 0 ? (
          <form
            className={styles.length}
            onSubmit={(e) => {
              e.preventDefault();
              typed();
            }}
          >
            <label>
              {t('office.countertops.length')}
              <input
                data-testid="countertop-length"
                value={lengthText}
                inputMode="decimal"
                autoComplete="off"
                onChange={(e) => setLengthText(e.target.value)}
              />
            </label>
          </form>
        ) : null}
      </div>
      <svg
        ref={svgRef}
        className={styles.plan}
        data-testid="countertop-plan"
        data-drawing={draw ? 'true' : 'false'}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {walls.map((w, i) => (
          <polygon key={`w${i}`} className={styles.wall} points={svgPoints(w)} />
        ))}
        {cabinets.map((c) => (
          <polygon
            key={c.id}
            className={styles.cabinet}
            data-testid="countertop-cabinet"
            points={svgPoints(c.outline)}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {pieces.map((p) => {
          const pts = shownOutline(p);
          const c = centre(pts);
          const on = selected !== null && p.id.toLowerCase() === selected.toLowerCase();
          return (
            <g
              key={p.id}
              data-testid="countertop-piece"
              data-id={p.id}
              data-label={p.data.attributes.label}
              data-selected={on ? 'true' : 'false'}
            >
              <polygon
                className={on ? styles.pieceOn : styles.piece}
                points={svgPoints(pts)}
                vectorEffect="non-scaling-stroke"
              />
              <text
                className={styles.label}
                x={c.x}
                y={-c.y}
                fontSize={10 * scale}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {p.data.attributes.name.length > 0
                  ? `${p.data.attributes.label} · ${p.data.attributes.name}`
                  : p.data.attributes.label}
              </text>
              {on && editing && !draw
                ? pts.map((q, i) => (
                    <circle
                      key={i}
                      className={styles.vertex}
                      data-testid="countertop-vertex"
                      cx={q.x}
                      cy={-q.y}
                      r={5 * scale}
                      vectorEffect="non-scaling-stroke"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button !== 0) return;
                        (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(
                          e.pointerId,
                        );
                        setDrag({ id: p.id, index: i, from: q, at: q });
                      }}
                    />
                  ))
                : null}
            </g>
          );
        })}
        {draw && rubber.length > 0 ? (
          <g data-testid="countertop-draft">
            <polyline
              className={styles.draft}
              points={svgPoints(rubber)}
              vectorEffect="non-scaling-stroke"
            />
            {draftPts.map((q, i) => (
              <circle key={i} className={styles.draftPoint} cx={q.x} cy={-q.y} r={3 * scale} />
            ))}
          </g>
        ) : null}
      </svg>
    </section>
  );
}

// A dragged corner snaps to another corner within the radius, else to the increment grid.
function snapDrag(at: Point, targets: readonly Point[], radius: number, increment: number): Point {
  let best: Point | null = null;
  let d = radius;
  for (const q of targets) {
    const e = Math.hypot(q.x - at.x, q.y - at.y);
    if (e <= d) {
      best = q;
      d = e;
    }
  }
  if (best !== null) return { x: best.x, y: best.y };
  return {
    x: Math.round(at.x / increment) * increment,
    y: Math.round(at.y / increment) * increment,
  };
}

function centre(pts: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return pts.length === 0 ? { x: 0, y: 0 } : { x: x / pts.length, y: y / pts.length };
}

function wallBodies(objects: readonly ModelObject[], level: string | null): Point[][] {
  if (level === null) return [];
  const key = level.toLowerCase();
  return objects.flatMap((o) => {
    if (o.type !== 'wall' || o.data.level.toLowerCase() !== key) return [];
    const { left, right } = wallFaceLines(o.data);
    return [[left.start, left.end, right.end, right.start]];
  });
}

// The SVG view box (SVG y = −model y) around every wall, cabinet and top, with a margin; a 20' square with none.
function viewBox(
  walls: readonly Point[][],
  cabinets: readonly { outline: Point[] }[],
  pieces: readonly CountertopPiece[],
): { x: number; y: number; w: number; h: number } {
  const pts = [
    ...walls.flat(),
    ...cabinets.flatMap((c) => c.outline),
    ...pieces.flatMap((p) => p.data.geometry.outline),
  ];
  if (pts.length === 0)
    return { x: -MARGIN, y: -240 - MARGIN, w: 240 + 2 * MARGIN, h: 240 + 2 * MARGIN };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => -p.y);
  const minX = Math.min(...xs) - MARGIN;
  const minY = Math.min(...ys) - MARGIN;
  return {
    x: minX,
    y: minY,
    w: Math.max(...xs) + MARGIN - minX,
    h: Math.max(...ys) + MARGIN - minY,
  };
}
