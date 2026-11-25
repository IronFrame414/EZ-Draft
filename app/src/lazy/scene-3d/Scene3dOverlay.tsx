'use client';
// EZD-1001a (S07 States "Empty": "Draw walls in Plan to see 3D"): over a 3D scene with no geometry on the open
// floor. Read from the scene, so it leaves with the first wall or room and comes back when the last is removed.
import { useSyncExternalStore, type ReactElement } from 'react';
import { useT } from '../../lib/messages';
import type { Scene3d } from './scene';
import styles from './Scene3dOverlay.module.css';

export function Scene3dOverlay({ scene }: { scene: Scene3d }): ReactElement | null {
  const t = useT();
  const empty = useSyncExternalStore(scene.subscribe, scene.isEmpty, scene.isEmpty);
  if (!empty) return null;
  return (
    <p data-testid="scene-3d-empty" className={styles.empty}>
      {t('office.scene3d.empty')}
    </p>
  );
}
