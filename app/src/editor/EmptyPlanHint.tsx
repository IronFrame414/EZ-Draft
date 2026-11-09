'use client';

// EZD-221b Build step 11 (vault/plans/EZD-221b.md Decided "Empty hint"; S03 States "Empty"; Q-0591 (a); Q-0568):
// over a plan with no walls, a user with Edit model sees how to start drawing. Read from the model store, so the
// hint leaves with the first wall and comes back when the last is removed.
import type { ReactElement } from 'react';
import { useStore } from 'zustand';
import { useT } from '../lib/messages';
import styles from './EmptyPlanHint.module.css';
import type { ModelStore } from './model/model-store';
import type { Objects } from './model/patches';

export function hasNoWalls(objects: Objects): boolean {
  for (const value of objects.values()) {
    if (value.type === 'wall') return false;
  }
  return true;
}

export type EmptyPlanHintProps = { store: ModelStore; canEdit: boolean };

export function EmptyPlanHint({ store, canEdit }: EmptyPlanHintProps): ReactElement | null {
  const t = useT();
  const empty = useStore(store, (s) => hasNoWalls(s.objects));
  if (!canEdit || !empty) return null;
  return (
    <p data-testid="plan-empty-hint" className={styles.hint}>
      {t('office.plan.empty_hint')}
    </p>
  );
}
