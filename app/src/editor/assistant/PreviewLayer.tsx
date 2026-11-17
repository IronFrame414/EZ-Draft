'use client';
// EZD-5604b (vault/plans/EZD-5604b.md): the Assistant preview drawn over the canvas region (section 3 V2; Decided
// "D-Layer", "D-Chip text"; Q-0474; Q-0662 (a) a stale preview is hidden; board S03c lines 117-142). SVG path data
// and chip transforms are written straight onto the elements at mount, on a geometry change and on camera
// changes, never through React state (ARCH Plan canvas; 11 rule 4). Nothing here takes a pointer.
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { formatLength, PLAN_DISPLAY_DENOMINATOR } from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import type { PlanCanvasHandle } from '../plan/controller';
import { n, type OverlayElement } from '../tools/overlay';
import type { PreviewState, PreviewStore } from './preview-store';
import {
  previewGeometry,
  previewPaths,
  type PreviewChip,
  type PreviewGeometry,
  type PreviewPaths,
} from './preview-shapes';
import styles from './PreviewLayer.module.css';

export type PreviewLayerProps = { store: PreviewStore; handle: PlanCanvasHandle };

export type PreviewElements = {
  addFill: OverlayElement;
  removeFill: OverlayElement;
  remove: OverlayElement;
  add: OverlayElement;
  addLeaf: OverlayElement;
  addArc: OverlayElement;
  chips: ReadonlyMap<string, { style: { transform: string } }>;
};

const PATHS = ['addFill', 'removeFill', 'remove', 'add', 'addLeaf', 'addArc'] as const;

export function chipTransform(x: number, y: number): string {
  return `translate(${n(x)}px, ${n(y)}px) translate(-50%, -50%)`;
}

export function writePreview(els: PreviewElements, paths: PreviewPaths): void {
  for (const k of PATHS) els[k].setAttribute('d', paths[k]);
  for (const c of paths.chips) {
    const el = els.chips.get(c.id);
    if (el !== undefined) el.style.transform = chipTransform(c.x, c.y);
  }
}

// Writes now and on every camera change; returns the unsubscribe.
export function bindPreviewWrites(
  handle: Pick<PlanCanvasHandle, 'modelToScreen' | 'onCameraChange'>,
  els: PreviewElements,
  geometry: PreviewGeometry,
): () => void {
  const write = () =>
    writePreview(
      els,
      previewPaths(geometry, (p) => handle.modelToScreen(p)),
    );
  write();
  return handle.onCameraChange(write);
}

export function previewShown(
  s: PreviewState,
): s is PreviewState & {
  preview: NonNullable<PreviewState['preview']>;
  before: NonNullable<PreviewState['before']>;
} {
  return s.preview !== null && !s.stale && s.before !== null;
}

function Chip({
  chip,
  chipRef,
}: {
  chip: PreviewChip;
  chipRef: (el: HTMLSpanElement | null) => void;
}) {
  const t = useT();
  const name = t(`office.conflicts.object.${chip.kind}`, { number: chip.number });
  return (
    <span ref={chipRef} className={styles.chip} data-testid="preview-chip" data-object-id={chip.id}>
      {t('office.assistant.preview_chip', {
        name,
        size: formatLength(chip.size, PLAN_DISPLAY_DENOMINATOR),
      })}
    </span>
  );
}

function Shown({ geometry, handle }: { geometry: PreviewGeometry; handle: PlanCanvasHandle }) {
  const t = useT();
  const addFillRef = useRef<SVGPathElement>(null);
  const removeFillRef = useRef<SVGPathElement>(null);
  const removeRef = useRef<SVGPathElement>(null);
  const addRef = useRef<SVGPathElement>(null);
  const addLeafRef = useRef<SVGPathElement>(null);
  const addArcRef = useRef<SVGPathElement>(null);
  const chipEls = useRef(new Map<string, HTMLSpanElement>());

  useEffect(() => {
    const addFill = addFillRef.current;
    const removeFill = removeFillRef.current;
    const remove = removeRef.current;
    const add = addRef.current;
    const addLeaf = addLeafRef.current;
    const addArc = addArcRef.current;
    if (
      addFill === null ||
      removeFill === null ||
      remove === null ||
      add === null ||
      addLeaf === null ||
      addArc === null
    ) {
      return;
    }
    const els: PreviewElements = {
      addFill,
      removeFill,
      remove,
      add,
      addLeaf,
      addArc,
      chips: chipEls.current,
    };
    return bindPreviewWrites(handle, els, geometry);
  }, [geometry, handle]);

  const chipRef = useCallback((id: string, el: HTMLSpanElement | null) => {
    if (el === null) chipEls.current.delete(id);
    else chipEls.current.set(id, el);
  }, []);

  return (
    <div className={styles.layer} data-testid="preview-layer">
      <svg className={styles.overlay} data-testid="preview-overlay" aria-hidden="true">
        <path ref={addFillRef} className={styles.addFill} data-testid="preview-add-fill" />
        <path ref={removeFillRef} className={styles.removeFill} data-testid="preview-remove-fill" />
        <path ref={removeRef} className={styles.remove} data-testid="preview-remove" />
        <path ref={addRef} className={styles.add} data-testid="preview-add" />
        <path ref={addLeafRef} className={styles.addLeaf} data-testid="preview-add-leaf" />
        <path ref={addArcRef} className={styles.addArc} data-testid="preview-add-arc" />
      </svg>
      <div className={styles.chips} data-testid="preview-chips">
        {geometry.chips.map((c) => (
          <Chip key={c.id} chip={c} chipRef={(el) => chipRef(c.id, el)} />
        ))}
      </div>
      <div className={styles.legend} data-testid="preview-legend">
        <span className={styles.legendTitle}>{t('office.assistant.preview_legend_title')}</span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchAdd}`} />
          {t('office.assistant.preview_legend_added')}
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchRemove}`} />
          {t('office.assistant.preview_legend_removed')}
        </span>
      </div>
    </div>
  );
}

// V2
export function PreviewLayer({ store, handle }: PreviewLayerProps) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const shown = previewShown(state);
  const geometry = useMemo(
    () => (previewShown(state) ? previewGeometry(state.before, state.preview) : null),
    [state],
  );
  if (!shown || geometry === null) return null;
  return <Shown geometry={geometry} handle={handle} />;
}
