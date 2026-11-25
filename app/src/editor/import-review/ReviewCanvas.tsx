'use client';

// EZD-307 (S02 Layout "Canvas: scan underlay with detected geometry, legend, zoom stack"; Controls Scroll / pinch,
// Right-drag or space-drag pan, Zoom in / Zoom out, Show 3D mesh; Data shown "scan underlay (grey), accepted
// (green), to check (amber dashed), selected (blue)"): the review canvas, drawn as SVG over the detected items so
// the page needs no WebGL until the mesh is shown. 100% zoom is the whole import fitted to the canvas. The mesh
// view (lazy/mesh-view, the GLB read by EZD-303's reader) is a lazy module drawn on its own canvas over the plan
// while Show 3D mesh is on; data-mesh reports the view's own `visible` (AC-EZD-307-2).
// EZD-309 (S02 Controls Click item on canvas "Selects it; list and inspector sync; Smallest item under cursor
// first", Hover item "Shows item name and confidence", Drag endpoint / edge (in Fix mode) "Moves wall ends or
// opening edges with live dimensions; Snaps as in Plan editor", Esc "Cancels Fix"; "To check list row ... canvas
// highlights it in blue and zooms to it"): items are drawn with their fixes; openings sit over walls and walls over
// rooms, so a click takes the smallest item under the cursor. In Fix mode the selected item shows its handles; a
// drag snaps with the Plan editor's rules and shows the length live, and is handed to onFix when released. Esc
// cancels a drag in progress and leaves Fix mode. A selected item outside the view is brought to the centre.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  DETAIL_DISPLAY_DENOMINATOR,
  formatLength,
  PLAN_DISPLAY_DENOMINATOR,
} from '@ezdraft/geometry';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import { lazyModule } from '../../lib/lazy/lazy-module';
import {
  isHighConfidence,
  itemExtents,
  type Decisions,
  type Pt,
  type ReviewCabinet,
  type ReviewItem,
} from '../../lib/imports/review';
import {
  applyFix,
  dragHandle,
  itemHandles,
  liveLength,
  snapHandle,
  type ItemFix,
} from '../../lib/imports/review-fix';
import type { RoomGap } from '../../lib/imports/review-conflicts';
import touch from '../../styles/touch.module.css';
import zoomStyles from '../plan/ZoomStack.module.css';
import { loadMesh } from './mesh-source';
import styles from './ImportReview.module.css';

export const meshModule = lazyModule(() => import('../../lazy/mesh-view'));

const PAD_PX = 48;
const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;
const FOCUS_ZOOM = 4;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export type ItemState = 'accepted' | 'to_check' | 'selected';

/**
 * How an item is drawn (S02 Data shown; EZD-308 decisions): selected blue; accepted green; a high-confidence item
 * not yet accepted green too, as on board S02, where the high-confidence items are green before Accept N; an
 * unresolved item below the cutoff amber dashed. A rejected item is not drawn (it does not become model data).
 */
export function itemState(
  item: ReviewItem,
  selectedId: string | null,
  cutoff: number,
  decisions: Decisions,
): ItemState {
  if (item.id === selectedId) return 'selected';
  if (decisions[item.id] === 'accepted') return 'accepted';
  return isHighConfidence(item, cutoff) ? 'accepted' : 'to_check';
}

/** EZD-915: the plan box a cabinet is drawn as: its outline, else its label width by depth about its centre. */
export function cabinetBox(c: ReviewCabinet): { min: Pt; max: Pt } {
  if (c.outline) return c.outline;
  return {
    min: { x: c.center.x - c.width / 2, y: c.center.y - c.depth / 2 },
    max: { x: c.center.x + c.width / 2, y: c.center.y + c.depth / 2 },
  };
}

type View = { zoom: number; panX: number; panY: number };

export type ReviewCanvasProps = {
  /** The items as they stand (fixes applied). */
  items: readonly ReviewItem[];
  /** The detected items, for the fitted 100% view (a fix does not move the view). */
  detected?: readonly ReviewItem[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  /** Fix mode on the selected item (EZD-309). */
  fixing?: boolean;
  onFix?: (id: string, fix: ItemFix) => void;
  onExitFix?: () => void;
  /** Hover text of an item: its name and confidence. */
  hoverText?: (item: ReviewItem) => string;
  /** The high-confidence cutoff (%) of this review (company Defaults). */
  cutoff: number;
  /** Accept and reject decisions made in this review. */
  decisions: Decisions;
  meshUrl: string | null;
  /** Reads a fresh mesh link (the one in `meshUrl` expires after 900 s). */
  freshMeshUrl: () => Promise<string | null>;
  onZoom: (percent: number) => void;
  /** EZD-310: rooms that no longer close, drawn as red gap markers with their size. */
  gaps?: readonly RoomGap[];
  /** EZD-310: a point to zoom to (a conflict line was clicked); a new `n` zooms again. */
  focus?: { point: Pt; n: number } | null;
  /** EZD-311: pick mode for Resolve the gap (a click on an item goes to onSelect, which picks the wall). */
  picking?: boolean;
};

type Drag = { id: string; key: string; fix: ItemFix | null };

export function ReviewCanvas({
  items: allItems,
  detected,
  selectedId,
  onSelect,
  fixing = false,
  onFix,
  onExitFix,
  hoverText,
  cutoff,
  decisions,
  meshUrl,
  freshMeshUrl,
  onZoom,
  gaps = [],
  focus = null,
  picking = false,
}: ReviewCanvasProps): ReactElement {
  const t = useT();
  const [dragState, setHandleDrag] = useState<Drag | null>(null);
  const handleDrag = fixing && dragState?.id === selectedId ? dragState : null;
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  // The items drawn: rejected ones left out, a handle drag in progress drawn where it is.
  const items = useMemo(
    () =>
      allItems
        .filter((i) => decisions[i.id] !== 'rejected')
        .map((i) => (handleDrag?.fix && i.id === handleDrag.id ? applyFix(i, handleDrag.fix) : i)),
    [allItems, decisions, handleDrag],
  );
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ zoom: 1, panX: 0, panY: 0 });
  const space = useRef(false);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const {
    canvas: meshCanvas,
    status: meshStatus,
    toggle: meshToggle,
  } = useMeshView(meshUrl, freshMeshUrl);
  const meshOn = meshStatus === 'shown' || meshStatus === 'loading';

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    onZoom(Math.round(view.zoom * 100));
  }, [view.zoom, onZoom]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const fitSource = detected ?? allItems;
  const ext = useMemo(() => itemExtents(fitSource), [fitSource]);
  const fitScale = useMemo(() => {
    if (!ext || size.w === 0 || size.h === 0) return 1;
    const dx = Math.max(ext.maxX - ext.minX, 1);
    const dy = Math.max(ext.maxY - ext.minY, 1);
    return Math.max(0.0001, Math.min((size.w - 2 * PAD_PX) / dx, (size.h - 2 * PAD_PX) / dy));
  }, [ext, size]);
  const cx = ext ? (ext.minX + ext.maxX) / 2 : 0;
  const cy = ext ? (ext.minY + ext.maxY) / 2 : 0;
  const k = fitScale * view.zoom;
  const transform = `translate(${size.w / 2 + view.panX} ${size.h / 2 + view.panY}) scale(${k} ${-k}) translate(${-cx} ${-cy})`;
  const toScreen = (p: Pt) => ({
    x: size.w / 2 + view.panX + (p.x - cx) * k,
    y: size.h / 2 + view.panY - (p.y - cy) * k,
  });
  const toModel = (sx: number, sy: number): Pt => ({
    x: (sx - size.w / 2 - view.panX) / k + cx,
    y: -(sy - size.h / 2 - view.panY) / k + cy,
  });

  // Esc cancels a drag in progress and leaves Fix mode (S02 Esc "Cancels Fix").
  useEffect(() => {
    if (!fixing) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setHandleDrag(null);
      onExitFix?.();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [fixing, onExitFix]);

  // A selected item outside the view is brought to the centre (S02 "canvas highlights it in blue and zooms to it").
  const [seenSelected, setSeenSelected] = useState(selectedId);
  if (seenSelected !== selectedId) {
    setSeenSelected(selectedId);
    const item = selectedId ? allItems.find((i) => i.id === selectedId) : undefined;
    const e = item && size.w > 0 ? itemExtents([item]) : null;
    if (e) {
      const mx = (e.minX + e.maxX) / 2;
      const my = (e.minY + e.maxY) / 2;
      const sx = size.w / 2 + view.panX + (mx - cx) * k;
      const sy = size.h / 2 + view.panY - (my - cy) * k;
      if (sx < PAD_PX || sx > size.w - PAD_PX || sy < PAD_PX || sy > size.h - PAD_PX) {
        setView({ ...view, panX: -(mx - cx) * k, panY: (my - cy) * k });
      }
    }
  }

  // A clicked conflict line zooms to its point (S02 Conflict list "Click a line to zoom to it"): the point is centred
  // and the view zoomed to at least 4x the fitted view.
  const [seenFocus, setSeenFocus] = useState(focus?.n ?? 0);
  if (focus && focus.n !== seenFocus) {
    setSeenFocus(focus.n);
    const zoom = Math.max(view.zoom, FOCUS_ZOOM);
    const kz = fitScale * zoom;
    setView({ zoom, panX: -(focus.point.x - cx) * kz, panY: (focus.point.y - cy) * kz });
  }

  // Zoom by `ratio` keeping the screen point (sx, sy) still; the centre when no point is given.
  const zoomBy = useCallback(
    (ratio: number, sx?: number, sy?: number) => {
      setView((v) => {
        const zoom = clampZoom(v.zoom * ratio);
        const r = zoom / v.zoom;
        const ox = sx === undefined ? 0 : sx - size.w / 2;
        const oy = sy === undefined ? 0 : sy - size.h / 2;
        return { zoom, panX: ox - (ox - v.panX) * r, panY: oy - (oy - v.panY) * r };
      });
    },
    [size],
  );

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomBy]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2 || e.button === 1 || (e.button === 0 && space.current)) {
      drag.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY };
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
  };
  const local = (e: React.PointerEvent) => {
    const rect = box.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const hd = handleDrag;
    if (hd) {
      const item = allItems.find((i) => i.id === hd.id);
      if (!item) return;
      const p = local(e);
      const snapped = snapHandle(allItems, item, hd.key, toModel(p.x, p.y), k);
      setHandleDrag({ ...hd, fix: dragHandle(item, allItems, hd.key, snapped.point) });
      return;
    }
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, panX: d.panX + e.clientX - d.x, panY: d.panY + e.clientY - d.y }));
  };
  const onPointerUp = () => {
    drag.current = null;
    const hd = handleDrag;
    if (hd) {
      setHandleDrag(null);
      if (hd.fix) onFix?.(hd.id, hd.fix);
    }
  };
  const startHandle = (e: React.PointerEvent, id: string, key: string) => {
    if (e.button !== 0 || space.current) return;
    e.stopPropagation();
    setHandleDrag({ id, key, fix: null });
    box.current?.setPointerCapture?.(e.pointerId);
  };
  const pick = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0 || space.current || handleDrag) return;
    onSelect?.(id);
  };
  const hoverOn = (e: React.PointerEvent, id: string) => {
    const p = local(e);
    setHover({ id, x: p.x, y: p.y });
  };
  const hoverOff = () => setHover(null);
  const hovered = hover ? items.find((i) => i.id === hover.id) : undefined;
  const fixItem = fixing && selectedId ? items.find((i) => i.id === selectedId) : undefined;
  const handles = fixItem ? itemHandles(fixItem, items) : [];
  const live = handleDrag?.fix && fixItem ? liveLength(fixItem) : null;
  const liveAt = (() => {
    if (!fixItem || live === null) return null;
    const hs = itemHandles(fixItem, items);
    const a = toScreen(hs[0].point);
    const b = toScreen(hs[hs.length - 1].point);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  })();

  const walls = new Map(allItems.filter((i) => i.type === 'wall').map((w) => [w.id, w] as const));

  return (
    <div className={styles.canvasArea}>
      <div
        ref={box}
        className={styles.plan}
        data-testid="review-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg
          width={size.w}
          height={size.h}
          className={styles.svg}
          aria-hidden="true"
          data-fixing={fixing ? 'true' : 'false'}
          data-picking={picking ? 'true' : 'false'}
        >
          <g transform={transform}>
            {items.map((item) => {
              if (item.type !== 'room') return null;
              const state = itemState(item, selectedId, cutoff, decisions);
              return (
                <polygon
                  key={item.id}
                  data-testid="review-item"
                  data-id={item.id}
                  data-state={state}
                  data-decision={decisions[item.id] ?? 'none'}
                  points={item.boundary.map((p) => `${p.x},${p.y}`).join(' ')}
                  className={`${styles.underlay} ${state === 'accepted' ? '' : styles[state]}`}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => pick(e, item.id)}
                  onPointerMove={(e) => hoverOn(e, item.id)}
                  onPointerLeave={hoverOff}
                />
              );
            })}
            {items.map((item) => {
              // EZD-915: a supplier cabinet is drawn as its plan box (its outline, else its label size at its centre).
              if (item.type !== 'cabinet') return null;
              const state = itemState(item, selectedId, cutoff, decisions);
              const box = cabinetBox(item);
              return (
                <rect
                  key={item.id}
                  data-testid="review-item"
                  data-id={item.id}
                  data-state={state}
                  data-decision={decisions[item.id] ?? 'none'}
                  x={box.min.x}
                  y={box.min.y}
                  width={box.max.x - box.min.x}
                  height={box.max.y - box.min.y}
                  className={`${styles.underlay} ${styles[state]}`}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => pick(e, item.id)}
                  onPointerMove={(e) => hoverOn(e, item.id)}
                  onPointerLeave={hoverOff}
                />
              );
            })}
            {items.map((item) => {
              // EZD-312: a ceiling slope has no plan line; it is chosen from the list and fixed in the inspector.
              if (item.type === 'room' || item.type === 'ceiling_slope' || item.type === 'cabinet') return null;
              const state = itemState(item, selectedId, cutoff, decisions);
              let a = { x: 0, y: 0 };
              let b = { x: 0, y: 0 };
              if (item.type === 'wall') {
                a = item.geometry.start;
                b = item.geometry.end;
              } else {
                const host = item.hostWallId ? walls.get(item.hostWallId) : undefined;
                let ux = 1;
                let uy = 0;
                if (host && host.type === 'wall') {
                  const dx = host.geometry.end.x - host.geometry.start.x;
                  const dy = host.geometry.end.y - host.geometry.start.y;
                  const len = Math.hypot(dx, dy) || 1;
                  ux = dx / len;
                  uy = dy / len;
                }
                const h = item.width / 2;
                a = { x: item.center.x - ux * h, y: item.center.y - uy * h };
                b = { x: item.center.x + ux * h, y: item.center.y + uy * h };
              }
              return (
                <g key={item.id}>
                  <line
                    data-testid="review-item"
                    data-id={item.id}
                    data-state={state}
                    data-decision={decisions[item.id] ?? 'none'}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={`${item.type === 'wall' ? styles.wall : styles.opening} ${styles[state]}`}
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    data-testid="review-hit"
                    data-id={item.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={styles.hit}
                    vectorEffect="non-scaling-stroke"
                    onPointerDown={(e) => pick(e, item.id)}
                    onPointerMove={(e) => hoverOn(e, item.id)}
                    onPointerLeave={hoverOff}
                  />
                </g>
              );
            })}
          </g>
          {gaps.map((g) => {
            const p = toScreen(g.point);
            return (
              // EZD-311 (Q-0630): clicking the marker selects its room, which shows Resolve the gap.
              <g
                key={g.roomId}
                data-testid="review-gap"
                data-room={g.roomId}
                className={styles.gapHit}
                onPointerDown={(e) => pick(e, g.roomId)}
              >
                <rect x={p.x - 7} y={p.y - 7} width={14} height={14} rx={3} className={styles.gapMarker} />
                <text x={p.x + 12} y={p.y - 12} className={styles.gapLabel}>
                  {t('office.review.gap_marker', {
                    gap: formatLength(g.inches, DETAIL_DISPLAY_DENOMINATOR),
                  })}
                </text>
              </g>
            );
          })}
          {handles.map((h) => {
            const p = toScreen(h.point);
            return (
              <circle
                key={h.key}
                data-testid="review-handle"
                data-key={h.key}
                cx={p.x}
                cy={p.y}
                r={7}
                className={styles.handle}
                onPointerDown={(e) => startHandle(e, fixItem?.id ?? '', h.key)}
              />
            );
          })}
        </svg>
        {live !== null && liveAt ? (
          <span
            className={styles.liveDimension}
            data-testid="review-live-dimension"
            style={{ left: liveAt.x, top: liveAt.y }}
          >
            {formatLength(live, PLAN_DISPLAY_DENOMINATOR)}
          </span>
        ) : null}
        {hovered && hover && hoverText && !handleDrag ? (
          <span
            className={styles.hover}
            data-testid="review-hover"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            {hoverText(hovered)}
          </span>
        ) : null}
        {fixing && fixItem ? (
          <p className={styles.fixHint} data-testid="review-fix-hint">
            {t('office.review.fix_hint')}
          </p>
        ) : null}
        {meshUrl ? (
          <canvas
            ref={meshCanvas}
            className={styles.meshCanvas}
            data-testid="review-mesh"
            data-mesh={meshStatus}
            hidden={meshStatus !== 'shown' && meshStatus !== 'loading'}
          />
        ) : null}
        {meshStatus === 'failed' ? (
          <p className={styles.meshError} role="alert">
            {t('office.review.mesh_failed')}
          </p>
        ) : null}
      </div>
      <div className={zoomStyles.stack} data-testid="review-zoom-stack">
        <button
          type="button"
          aria-label={t('office.plan.zoom_in')}
          title={t('office.plan.zoom_in')}
          className={`${zoomStyles.button} ${touch.target}`}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          <Icon name="add" size={20} />
        </button>
        <button
          type="button"
          aria-label={t('office.plan.zoom_out')}
          title={t('office.plan.zoom_out')}
          className={`${zoomStyles.button} ${touch.target}`}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          <Icon name="remove" size={20} />
        </button>
        {meshUrl ? (
          <button
            type="button"
            aria-label={t('office.review.mesh')}
            title={t('office.review.mesh')}
            aria-pressed={meshOn}
            data-testid="review-mesh-toggle"
            className={`${zoomStyles.button} ${touch.target} ${meshOn ? styles.meshOn : ''}`}
            onClick={meshToggle}
          >
            <Icon name="visibility" size={20} />
          </button>
        ) : null}
      </div>
      <div className={styles.legend} data-testid="review-legend">
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotAccepted}`} />
          {t('office.review.legend_accepted')}
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotToCheck}`} />
          {t('office.review.legend_to_check')}
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.dotSelected}`} />
          {t('office.review.legend_selected')}
        </span>
        <span className={styles.legendItem}>
          <span className={styles.scanSwatch} />
          {t('office.review.legend_scan')}
        </span>
      </div>
    </div>
  );
}

export type MeshStatus = 'off' | 'loading' | 'shown' | 'hidden' | 'failed';

type LoadedMesh = { readonly visible: boolean; setVisible(v: boolean): void; dispose(): void };

/**
 * Show 3D mesh: the first toggle loads the lazy module, reads the GLB and builds the view, shown; later toggles
 * flip the view's `visible`. The status comes from the view itself.
 */
export function useMeshView(url: string | null, meshUrl: () => Promise<string | null>) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<LoadedMesh | null>(null);
  const loading = useRef(false);
  const [status, setStatus] = useState<MeshStatus>('off');

  useEffect(
    () => () => {
      view.current?.dispose();
      view.current = null;
    },
    [],
  );

  const toggle = useCallback(() => {
    const v = view.current;
    if (v) {
      v.setVisible(!v.visible);
      setStatus(v.visible ? 'shown' : 'hidden');
      return;
    }
    if (!url || loading.current) return;
    loading.current = true;
    setStatus('loading');
    void (async () => {
      try {
        const mod = await meshModule.load();
        const mesh = await loadMesh({ meshUrl, fetchGlb: (u) => mod.fetchGlb(u) });
        const el = canvas.current;
        if (!el) throw new Error('mesh canvas missing');
        const made = mod.createMeshView(el, mesh);
        view.current = made;
        made.setVisible(true);
        setStatus(made.visible ? 'shown' : 'hidden');
      } catch {
        setStatus('failed');
      } finally {
        loading.current = false;
      }
    })();
  }, [url, meshUrl]);

  return { canvas, status, toggle };
}
