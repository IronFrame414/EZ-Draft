// EZD-211b Build step 9 (vault/plans/EZD-211b.md Decided "Layer"): the Door tool's tooltip over the swing arc or the
// hinge dot. It sits at the cursor + 12 px, read when the door target changes. EZD-1918: loaded by parts/door.tsx
// through a lazy module.
import { useMemo } from 'react';
import { useT } from '../../../../lib/messages';
import styles from '../../DrawingTools.module.css';
import type { LayerPartProps } from '../types';

export function DoorTooltip({ ui, handle }: LayerPartProps) {
  const t = useT();
  const tooltipAt = useMemo(
    () => (ui.doorTarget === null ? null : handle.getCursor()),
    [ui.doorTarget, handle],
  );
  if (ui.doorTarget === null) return null;
  return (
    <div
      role="tooltip"
      data-testid="door-tooltip"
      className={styles.tooltip}
      style={tooltipAt === null ? undefined : { left: tooltipAt.x + 12, top: tooltipAt.y + 12 }}
    >
      {t(
        ui.doorTarget === 'arc'
          ? 'office.tools.opening.door_tip_swing'
          : 'office.tools.opening.door_tip_hand',
      )}
    </div>
  );
}
