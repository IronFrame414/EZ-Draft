'use client';

// EZD-221b Build step 11 (vault/plans/EZD-221b.md Decided "Empty hint"; S03 States "Empty"; Q-0591 (a); Q-0568):
// over a plan with no walls, a user with Edit model sees how to start drawing. Read from the model store, so the
// hint leaves with the first wall and comes back when the last is removed.
// EZD-6001 (D-Hint): with the floor view, the hint is for the open floor.
import type { ReactElement } from 'react';
import { useStore } from 'zustand';
import { useT } from '../lib/messages';
import styles from './EmptyPlanHint.module.css';
import type { ModelStore } from './model/model-store';
import type { Objects } from './model/patches';
import type { FloorChoice } from './floors/floors';
import { useChosenFloor } from './floors/use-chosen-floor';
import { openFloorId } from './plan/batches';

export function hasNoWalls(objects: Objects): boolean {
  for (const value of objects.values()) {
    if (value.type === 'wall') return false;
  }
  return true;
}

// EZD-6001 (vault/plans/EZD-6001.md D-Hint; Q-0509): no wall on the floor (raw `data.level`, any case); no floor
// counts as empty.
export function hasNoWallsOn(objects: Objects, floorId: string | null): boolean {
  if (floorId === null) return true;
  const want = floorId.toLowerCase();
  for (const value of objects.values()) {
    if (value.type !== 'wall') continue;
    const level = (value.data as { level?: unknown } | null)?.level;
    if (typeof level === 'string' && level.toLowerCase() === want) return false;
  }
  return true;
}

export type EmptyPlanHintProps = { store: ModelStore; canEdit: boolean; floors?: FloorChoice };

export function EmptyPlanHint({ store, canEdit, floors }: EmptyPlanHintProps): ReactElement | null {
  const t = useT();
  const chosen = useChosenFloor(floors);
  const empty = useStore(store, (s) =>
    floors === undefined ? hasNoWalls(s.objects) : hasNoWallsOn(s.objects, openFloorId(s.objects, chosen)),
  );
  if (!canEdit || !empty) return null;
  return (
    <p data-testid="plan-empty-hint" className={styles.hint}>
      {t('office.plan.empty_hint')}
    </p>
  );
}
