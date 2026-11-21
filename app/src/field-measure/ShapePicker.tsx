'use client';
// EZD-1415 (S17b Shape picker "Rectangle, L-shape, T-shape, U-shape, Walls (free outline)"; board S17bFieldMeasure
// tiles and their icon paths). The picked tile is cobalt. Without Send field measurement the tiles are disabled.
import { useT } from '../lib/messages';
import type { MessageKey } from '../server/messages/catalog';
import { SHAPE_KINDS, type ShapeKind } from './shapes';
import styles from './FieldMeasure.module.css';

const ICON: Record<ShapeKind, string> = {
  rectangle: 'M2 2 H32 V20 H2 Z',
  l: 'M2 2 H32 V12 H16 V20 H2 Z',
  t: 'M2 2 H32 V10 H22 V20 H12 V10 H2 Z',
  u: 'M2 2 H32 V20 H24 V9 H10 V20 H2 Z',
  walls: 'M3 18 L8 3 L20 6 L31 4 L28 19 Z',
};

const LABEL: Record<ShapeKind, MessageKey> = {
  rectangle: 'field.measure.shape.rectangle',
  l: 'field.measure.shape.l',
  t: 'field.measure.shape.t',
  u: 'field.measure.shape.u',
  walls: 'field.measure.shape.walls',
};

export function ShapePicker({
  value,
  disabled,
  onPick,
}: {
  value: ShapeKind | null;
  disabled: boolean;
  onPick: (shape: ShapeKind) => void;
}) {
  const t = useT();
  return (
    <div className={styles.shapes} role="group" aria-label={t('field.measure.shapes')}>
      {SHAPE_KINDS.map((shape) => (
        <button
          key={shape}
          type="button"
          className={shape === value ? `${styles.shape} ${styles.shapeOn}` : styles.shape}
          aria-pressed={shape === value}
          disabled={disabled}
          data-shape={shape}
          onClick={() => onPick(shape)}
        >
          <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden="true">
            <path
              d={ICON[shape]}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeDasharray={shape === 'walls' ? '3 2' : undefined}
            />
          </svg>
          {t(LABEL[shape])}
        </button>
      ))}
    </div>
  );
}
