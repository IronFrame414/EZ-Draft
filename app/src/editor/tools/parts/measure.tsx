// EZD-231 (04 Tool rail Measure): the measure distance chip; overlay.ts places it 16 px above the band's middle. The
// Measure tool has no typed bar (it has no typed tool, tool-defs.ts DRAWING_TOOLS).
import styles from '../DrawingTools.module.css';
import type { LayerPart, LayerPartProps } from './types';

function MeasureChip({ targets }: LayerPartProps) {
  const { measureSlot, measureChip } = targets;
  return (
    <div ref={measureSlot} className={styles.chipSlot} style={{ display: 'none' }}>
      <span
        ref={measureChip}
        data-testid="measure-readout"
        className={`${styles.chip} ${styles.chipText}`}
      />
    </div>
  );
}

export const part: LayerPart = { id: 'measure', order: 10, Chips: MeasureChip };
