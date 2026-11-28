// EZD-216 (S03 Dimension; Q-0682; Q-0683 (a)): the Dimension tool's Linear / Angular bar in the typed bar's place.
// EZD-1918: loaded by parts/dimension.tsx through a lazy module.
import { useT } from '../../../../lib/messages';
import touch from '../../../../styles/touch.module.css';
import styles from '../../DrawingTools.module.css';
import type { LayerPartProps } from '../types';

export function DimensionModeBar({ ui, controller }: LayerPartProps) {
  const t = useT();
  if (ui.dimensionMode == null || !ui.enabled) return null;
  return (
    <div
      role="group"
      aria-label={t('office.tools.dimension.mode')}
      className={styles.modeBar}
      data-testid="dimension-mode"
    >
      {(['linear', 'angular'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          className={`${styles.modeButton} ${touch.hitArea}`}
          aria-pressed={ui.dimensionMode === mode}
          data-mode={mode}
          onClick={() => controller.setDimensionMode(mode)}
        >
          {t(`office.tools.dimension.${mode}`)}
        </button>
      ))}
    </div>
  );
}
