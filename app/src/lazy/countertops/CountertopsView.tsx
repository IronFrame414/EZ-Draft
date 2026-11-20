'use client';
// EZD-412 (S04b Layout "Canvas: tool bar card (Trace cabinets, Draw outline, Seam, Cutout), hint text ...; countertop
// plan over dashed cabinets"; S04b Controls "Trace cabinets", "Draw outline", "Click piece", "Drag outline vertex",
// "Undo / redo, Esc"; S04b States "No cabinets: Trace cabinets disabled with hint"; S04b Permissions "View projects:
// view pieces ... Edit model: Trace cabinets, Draw outline ... Requires the edit lock"; board S04bCountertops;
// AC-EZD-412-1; vault/build/assumptions.md EZD-412): the countertop screen over the plan while the Countertops tool is
// on. Drawn as one SVG in inches, model y up (the SVG's y is the model's y turned over). The left panel and status bar
// are EZD-416, the inspector EZD-414 to EZD-417. Loaded through lazyModule on first use.
// EZD-413 (S04b Controls "Seam | Click across a piece to split it; seam drawn red dashed | Pieces relabel (A, B, C)",
// "Cutout | Place a sink or cooktop cutout"; board S04bCountertops legend "Cutout", "Seam"; AC-EZD-413-1, -2;
// vault/build/assumptions.md EZD-413): the Seam and Cutout tools, seams drawn red dashed, cutouts dashed with their
// kind, and the typed W × D of a cutout.
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
  COUNTERTOP_CUTOUT_DEFAULT_SIZE,
  countertopSeamLines,
  cutoutCorners,
  parseLength,
  wallFaceLines,
  type CountertopCutout,
  type CountertopCutoutKind,
  type ModelObject,
  type Point,
  type SeamChord,
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
import { countertopSeamChanges, seamPreviewAt } from '../../editor/countertops/seam-tool';
import {
  countertopCutoutAt,
  countertopCutoutChanges,
  countertopCutoutSizeChanges,
} from '../../editor/countertops/cutout-tool';
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
// The Seam or Cutout tool, when one is on (Draw outline keeps its own state).
type PlaceTool = 'seam' | 'cutout' | null;
type CutoutPick = { pieceId: string; cutoutId: string };

// A size as typed back into the W × D fields: decimal inches without trailing zeros.
const sizeText = (n: number) => String(Math.round(n * 10000) / 10000);

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
  const [placeTool, setPlaceTool] = useState<PlaceTool>(null);
  const [seamPreview, setSeamPreview] = useState<SeamChord | null>(null);
  const [cutKind, setCutKind] = useState<CountertopCutoutKind>('sink');
  const [cutW, setCutW] = useState(sizeText(COUNTERTOP_CUTOUT_DEFAULT_SIZE.sink.width));
  const [cutD, setCutD] = useState(sizeText(COUNTERTOP_CUTOUT_DEFAULT_SIZE.sink.depth));
  const [cutPick, setCutPick] = useState<CutoutPick | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const editing = canEdit && level !== null;
  const draw = drawing && editing;
  const seamOn = placeTool === 'seam' && editing && !draw;
  const cutoutOn = placeTool === 'cutout' && editing && !draw;

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
        } else if (placeTool !== null) {
          setPlaceTool(null);
          setSeamPreview(null);
          setCutPick(null);
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
  }, [drawing, placeTool, drag, selected, canEdit, store]);

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const at = toModel(e);
    if (at === null) return;
    if (draw) {
      step({ type: 'click', at });
      return;
    }
    if (seamOn) {
      const r = countertopSeamChanges(parsed, level, at, increment, makeId);
      if (apply(r.changes).length > 0 && r.ids !== null) setSelected(r.ids[0]);
      setSeamPreview(null);
      return;
    }
    if (cutoutOn) {
      const hit = countertopCutoutAt(pieces, at);
      if (hit !== null) {
        pickCutout(hit.pieceId, hit.cutout);
        return;
      }
      const w = parseLength(cutW, 'positive');
      const d = parseLength(cutD, 'positive');
      const size = COUNTERTOP_CUTOUT_DEFAULT_SIZE[cutKind];
      const r = countertopCutoutChanges(
        parsed,
        level,
        at,
        { kind: cutKind, width: w.ok ? w.inches : size.width, depth: d.ok ? d.inches : size.depth },
        makeId,
        increment,
      );
      if (apply(r.changes).length > 0 && r.pieceId !== null && r.cutout !== null)
        pickCutout(r.pieceId, r.cutout);
      return;
    }
    setSelected(countertopPieceAt(pieces, at));
  };

  // A cutout picked (placed or clicked): it and its top are selected and the W × D fields show its size.
  const pickCutout = (pieceId: string, c: CountertopCutout) => {
    setSelected(pieceId);
    setCutPick({ pieceId, cutoutId: c.id });
    setCutKind(c.kind);
    setCutW(sizeText(c.width));
    setCutD(sizeText(c.depth));
  };

  // Enter in the W × D fields: the picked cutout takes the typed size; with none picked, the next one placed does.
  const typedSize = () => {
    const w = parseLength(cutW, 'positive');
    const d = parseLength(cutD, 'positive');
    if (!w.ok || !d.ok || cutPick === null) return;
    apply(countertopCutoutSizeChanges(parsed, cutPick.pieceId, cutPick.cutoutId, w.inches, d.inches));
  };

  const chooseKind = (k: CountertopCutoutKind) => {
    setCutKind(k);
    setCutPick(null);
    setCutW(sizeText(COUNTERTOP_CUTOUT_DEFAULT_SIZE[k].width));
    setCutD(sizeText(COUNTERTOP_CUTOUT_DEFAULT_SIZE[k].depth));
  };

  const togglePlace = (which: 'seam' | 'cutout') => {
    if (drawing) stopDrawing();
    setSeamPreview(null);
    setCutPick(null);
    setPlaceTool(placeTool === which ? null : which);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const at = toModel(e);
    if (at === null) return;
    if (drag !== null) setDrag({ ...drag, at: snapDrag(at, targets, ctx.radius, increment) });
    else if (draw) step({ type: 'move', at });
    else if (seamOn) setSeamPreview(seamPreviewAt(parsed, level, at, increment)?.chord ?? null);
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

  const hint = draw
    ? t('office.countertops.hint_draw')
    : seamOn
      ? t('office.countertops.hint_seam')
      : cutoutOn
        ? t('office.countertops.hint_cutout')
        : !traceable
          ? t('office.countertops.hint_no_cabinets')
          : null;
  const seams = countertopSeamLines(pieces.map((p) => p.data));

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
            onClick={() => {
              if (draw) stopDrawing();
              else {
                setPlaceTool(null);
                setSeamPreview(null);
                setCutPick(null);
                setDrawing(true);
              }
            }}
          >
            <Icon name="draw" size={18} />
            {t('office.countertops.draw')}
          </button>
          <button
            type="button"
            className={styles.tool}
            data-testid="countertop-seam-tool"
            aria-pressed={seamOn}
            disabled={!editing || pieces.length === 0}
            onClick={() => togglePlace('seam')}
          >
            <Icon name="view_column_2" size={18} />
            {t('office.countertops.seam')}
          </button>
          <button
            type="button"
            className={styles.tool}
            data-testid="countertop-cutout-tool"
            aria-pressed={cutoutOn}
            disabled={!editing || pieces.length === 0}
            onClick={() => togglePlace('cutout')}
          >
            <Icon name="crop_square" size={18} />
            {t('office.countertops.cutout')}
          </button>
        </div>
        {hint !== null ? (
          <p className={styles.hint} data-testid="countertop-hint">
            {hint}
          </p>
        ) : null}
        {cutoutOn ? (
          <form
            className={styles.cutoutForm}
            data-testid="countertop-cutout-form"
            onSubmit={(e) => {
              e.preventDefault();
              typedSize();
            }}
          >
            <div className={styles.kinds} role="group" aria-label={t('office.countertops.cutout_kind')}>
              {(['sink', 'cooktop'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={styles.kind}
                  data-testid={`countertop-cutout-${k}`}
                  aria-pressed={cutKind === k}
                  onClick={() => chooseKind(k)}
                >
                  {t(k === 'sink' ? 'office.countertops.cutout_sink' : 'office.countertops.cutout_cooktop')}
                </button>
              ))}
            </div>
            <label>
              {t('office.countertops.cutout_width')}
              <input
                data-testid="countertop-cutout-width"
                value={cutW}
                inputMode="decimal"
                autoComplete="off"
                onChange={(e) => setCutW(e.target.value)}
              />
            </label>
            <label>
              {t('office.countertops.cutout_depth')}
              <input
                data-testid="countertop-cutout-depth"
                value={cutD}
                inputMode="decimal"
                autoComplete="off"
                onChange={(e) => setCutD(e.target.value)}
              />
            </label>
            <button type="submit" hidden />
          </form>
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
        data-place={seamOn ? 'seam' : cutoutOn ? 'cutout' : 'none'}
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
        {pieces.flatMap((p) =>
          (p.data.attributes.cutouts ?? []).map((c) => {
            const on =
              cutPick !== null &&
              cutPick.cutoutId.toLowerCase() === c.id.toLowerCase() &&
              cutPick.pieceId.toLowerCase() === p.id.toLowerCase();
            return (
              <g
                key={c.id}
                data-testid="countertop-cutout"
                data-id={c.id}
                data-kind={c.kind}
                data-width={c.width}
                data-depth={c.depth}
                data-selected={on ? 'true' : 'false'}
              >
                <polygon
                  className={on ? styles.cutoutOn : styles.cutout}
                  points={svgPoints(cutoutCorners(c))}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  className={styles.cutoutLabel}
                  x={c.center.x}
                  y={-c.center.y}
                  fontSize={8 * scale}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {t(
                    c.kind === 'sink'
                      ? 'office.countertops.cutout_label_sink'
                      : 'office.countertops.cutout_label_cooktop',
                  )}
                </text>
              </g>
            );
          }),
        )}
        {seams.map((s) => (
          <g key={`${s.seamId}${s.a.x},${s.a.y}`} data-testid="countertop-seam" data-id={s.seamId}>
            <line
              className={styles.seam}
              x1={s.a.x}
              y1={-s.a.y}
              x2={s.b.x}
              y2={-s.b.y}
              vectorEffect="non-scaling-stroke"
            />
            <text
              className={styles.seamLabel}
              x={(s.a.x + s.b.x) / 2}
              y={-(s.a.y + s.b.y) / 2}
              dy={-6 * scale}
              fontSize={8 * scale}
              textAnchor="middle"
            >
              {t('office.countertops.seam_label')}
            </text>
          </g>
        ))}
        {seamOn && seamPreview !== null ? (
          <line
            className={styles.seamPreview}
            data-testid="countertop-seam-preview"
            x1={seamPreview.a.x}
            y1={-seamPreview.a.y}
            x2={seamPreview.b.x}
            y2={-seamPreview.b.y}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
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
