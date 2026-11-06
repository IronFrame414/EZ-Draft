// EZD-207b Build step 9 (vault/plans/EZD-207b.md section 1 Decided "Stack markup", "Stack place", "Touch size";
// C10, C11; board S03Plan lines 137-141; 11 Accessibility): Zoom in, Zoom out and Fit to screen at the canvas's
// top right. Icon buttons carry the label and tooltip; no React state, the handle moves the view.
import type { ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import type { PlanCanvasHandle } from './controller';
import styles from './ZoomStack.module.css';

export function ZoomStack({
  handle,
}: {
  handle: Pick<PlanCanvasHandle, 'zoomIn' | 'zoomOut' | 'fit'>;
}): ReactElement {
  const t = useT();
  const className = `${styles.button} ${touch.target}`;
  const zoomIn = t('office.plan.zoom_in');
  const zoomOut = t('office.plan.zoom_out');
  const fit = t('office.plan.fit');
  return (
    <div className={styles.stack} data-testid="zoom-stack">
      <button
        type="button"
        aria-label={zoomIn}
        title={zoomIn}
        className={className}
        onClick={() => handle.zoomIn()}
      >
        <Icon name="add" size={20} />
      </button>
      <button
        type="button"
        aria-label={zoomOut}
        title={zoomOut}
        className={className}
        onClick={() => handle.zoomOut()}
      >
        <Icon name="remove" size={20} />
      </button>
      <button
        type="button"
        aria-label={fit}
        title={fit}
        className={className}
        onClick={() => handle.fit()}
      >
        <Icon name="fit_screen" size={20} />
      </button>
    </div>
  );
}
