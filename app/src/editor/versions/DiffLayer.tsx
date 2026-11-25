'use client';
// EZD-139 (Q-0220; Q-0700 05 "Visual diff"; Q-0703; AC-EZD-139-1, -3, -4): the visual diff over the canvas while an
// old version is open. Changed objects get an amber outline; objects removed since get a red dashed outline; objects
// added since are not drawn (they are not in the old version on the canvas). Shapes come from the plan's own drawing
// list of the open version on the chosen floor (ARCH Drawing list, one shape source). Path data is written straight
// onto the elements at mount, on a change and on camera changes, never through React state (ARCH Plan canvas; 11
// rule 4), as the Assistant preview layer does. Nothing here takes a pointer.
import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactElement } from 'react';
import type { Point } from '@ezdraft/geometry';
import { useChosenFloor } from '../floors/use-chosen-floor';
import type { FloorChoice } from '../floors/floors';
import type { Objects } from '../model/patches';
import { arcPoints, planDrawingList } from '../plan/batches';
import type { PlanCanvasHandle } from '../plan/controller';
import { xy, type OverlayElement } from '../tools/overlay';
import type { VersionDiff } from './version-diff';
import type { VersionView } from './version-view';
import styles from './VersionsPanel.module.css';
import { idKey } from '../shared/ids';

type Polyline = { readonly points: readonly Point[]; readonly closed: boolean };

export type DiffGeometry = {
  readonly changed: readonly Polyline[];
  readonly removed: readonly Polyline[];
};

export type DiffPaths = { readonly changed: string; readonly removed: string };

export const EMPTY_DIFF_GEOMETRY: DiffGeometry = Object.freeze({ changed: [], removed: [] });

// The outline of every drawing-list item of the changed and removed ids on the chosen floor: a fill or hatch as its
// closed boundary, a line, an arc as its polyline. Text is not outlined.
export function diffGeometry(
  objects: Objects,
  diff: VersionDiff,
  chosenFloor: string | null,
): DiffGeometry {
  if (diff.changed.length === 0 && diff.removed.length === 0) return EMPTY_DIFF_GEOMETRY;
  const kindOf = new Map<string, 'changed' | 'removed'>();
  for (const id of diff.changed) kindOf.set(idKey(id), 'changed');
  for (const id of diff.removed) kindOf.set(idKey(id), 'removed');
  const out = { changed: [] as Polyline[], removed: [] as Polyline[] };
  for (const item of planDrawingList(objects, {}, null, chosenFloor)?.items ?? []) {
    const kind = kindOf.get(idKey(item.objectId));
    if (kind === undefined) continue;
    const to = out[kind];
    if (item.kind === 'fill') to.push({ points: item.points, closed: true });
    else if (item.kind === 'hatch') to.push({ points: item.boundary, closed: true });
    else if (item.kind === 'line') to.push({ points: [item.from, item.to], closed: false });
    else if (item.kind === 'arc')
      to.push({
        points: arcPoints(item.center, item.radius, item.startAngle, item.endAngle),
        closed: false,
      });
  }
  return out;
}

function path(lines: readonly Polyline[], toScreen: (p: Point) => Point): string {
  return lines
    .filter((l) => l.points.length > 1)
    .map(
      (l) =>
        l.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xy(toScreen(p))}`).join(' ') +
        (l.closed ? ' Z' : ''),
    )
    .join(' ');
}

export function diffPaths(g: DiffGeometry, toScreen: (p: Point) => Point): DiffPaths {
  return { changed: path(g.changed, toScreen), removed: path(g.removed, toScreen) };
}

// Writes now and on every camera change; returns the unsubscribe.
export function bindDiffWrites(
  handle: Pick<PlanCanvasHandle, 'modelToScreen' | 'onCameraChange'>,
  els: { changed: OverlayElement; removed: OverlayElement },
  geometry: DiffGeometry,
): () => void {
  const write = () => {
    const p = diffPaths(geometry, (pt) => handle.modelToScreen(pt));
    els.changed.setAttribute('d', p.changed);
    els.removed.setAttribute('d', p.removed);
  };
  write();
  return handle.onCameraChange(write);
}

export type DiffLayerProps = {
  view: VersionView;
  handle: PlanCanvasHandle;
  floors?: FloorChoice | null;
};

export function DiffLayer({ view, handle, floors }: DiffLayerProps): ReactElement | null {
  const state = useSyncExternalStore(view.subscribe, view.getState, view.getState);
  const chosen = useChosenFloor(floors);
  const geometry = useMemo(
    () =>
      state.objects !== null && state.diff !== null
        ? diffGeometry(state.objects, state.diff, chosen)
        : EMPTY_DIFF_GEOMETRY,
    [state.objects, state.diff, chosen],
  );
  const changedRef = useRef<SVGPathElement>(null);
  const removedRef = useRef<SVGPathElement>(null);
  const shown = state.viewing !== null && state.showChanges;
  useEffect(() => {
    const changed = changedRef.current;
    const removed = removedRef.current;
    if (!shown || changed === null || removed === null) return;
    return bindDiffWrites(handle, { changed, removed }, geometry);
  }, [shown, geometry, handle]);
  if (!shown) return null;
  return (
    <div className={styles.diffLayer} data-testid="diff-layer">
      <svg className={styles.diffOverlay} aria-hidden="true">
        <path ref={removedRef} className={styles.diffRemoved} data-testid="diff-removed" />
        <path ref={changedRef} className={styles.diffChanged} data-testid="diff-changed" />
      </svg>
    </div>
  );
}
