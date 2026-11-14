'use client';

// EZD-307 (S02 Layout "Canvas: scan underlay with detected geometry, legend, zoom stack"; Controls Scroll / pinch,
// Right-drag or space-drag pan, Zoom in / Zoom out, Show 3D mesh; Data shown "scan underlay (grey), accepted
// (green), to check (amber dashed), selected (blue)"): the review canvas, drawn as SVG over the detected items so
// the page needs no WebGL until the mesh is shown. 100% zoom is the whole import fitted to the canvas. The mesh
// view (lazy/mesh-view, the GLB read by EZD-303's reader) is a lazy module drawn on its own canvas over the plan
// while Show 3D mesh is on; data-mesh reports the view's own `visible` (AC-EZD-307-2).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import { lazyModule } from '../../lib/lazy/lazy-module';
import { isHighConfidence, itemExtents, type ReviewItem } from '../../lib/imports/review';
import touch from '../../styles/touch.module.css';
import zoomStyles from '../plan/ZoomStack.module.css';
import { loadMesh } from './mesh-source';
import styles from './ImportReview.module.css';

export const meshModule = lazyModule(() => import('../../lazy/mesh-view'));

const PAD_PX = 48;
const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 20;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export type ItemState = 'accepted' | 'to_check' | 'selected';

export function itemState(item: ReviewItem, selectedId: string | null): ItemState {
  if (item.id === selectedId) return 'selected';
  return isHighConfidence(item) ? 'accepted' : 'to_check';
}

type View = { zoom: number; panX: number; panY: number };

export type ReviewCanvasProps = {
  items: readonly ReviewItem[];
  selectedId: string | null;
  meshUrl: string | null;
  /** Reads a fresh mesh link (the one in `meshUrl` expires after 900 s). */
  freshMeshUrl: () => Promise<string | null>;
  onZoom: (percent: number) => void;
};

export function ReviewCanvas({
  items,
  selectedId,
  meshUrl,
  freshMeshUrl,
  onZoom,
}: ReviewCanvasProps): ReactElement {
  const t = useT();
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

  const ext = useMemo(() => itemExtents(items), [items]);
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
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, panX: d.panX + e.clientX - d.x, panY: d.panY + e.clientY - d.y }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const walls = new Map(items.filter((i) => i.type === 'wall').map((w) => [w.id, w] as const));

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
        <svg width={size.w} height={size.h} className={styles.svg} aria-hidden="true">
          <g transform={transform}>
            {items.map((item) => {
              if (item.type !== 'room') return null;
              const state = itemState(item, selectedId);
              return (
                <polygon
                  key={item.id}
                  data-testid="review-item"
                  data-id={item.id}
                  data-state={state}
                  points={item.boundary.map((p) => `${p.x},${p.y}`).join(' ')}
                  className={`${styles.underlay} ${state === 'accepted' ? '' : styles[state]}`}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {items.map((item) => {
              if (item.type === 'room') return null;
              const state = itemState(item, selectedId);
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
                <line
                  key={item.id}
                  data-testid="review-item"
                  data-id={item.id}
                  data-state={state}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={`${item.type === 'wall' ? styles.wall : styles.opening} ${styles[state]}`}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
        </svg>
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
