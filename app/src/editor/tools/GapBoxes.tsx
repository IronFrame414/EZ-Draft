'use client';
// Gap boxes (EZD-210b; vault/plans/EZD-210b.md section 3 C13; Q-0569; Q-0570).
// EZD-213c D-Marker (vault/plans/EZD-213c.md): only the red size marker stays on the plan, a button that selects the
// chain's last wall; the Resolve the gap section is the inspector's (ResolveGap.tsx). Placed by DrawingLayer through
// `boxRef`.
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import type { GapBox } from './gap';
import styles from './DrawingTools.module.css';

export type GapBoxesProps = {
  boxes: readonly GapBox[];
  onShow: (box: GapBox) => void;
  boxRef: (key: string, el: HTMLDivElement | null) => void;
};

export function GapBoxes({ boxes, onShow, boxRef }: GapBoxesProps) {
  const t = useT();
  return (
    <>
      {boxes.map((box) => {
        const key = box.wallIds.join(',');
        return (
          <div
            key={key}
            ref={(el) => boxRef(key, el)}
            className={styles.box}
            data-testid="gap-box"
            data-gap-walls={key}
          >
            <button
              type="button"
              className={`${styles.pill} ${touch.hitArea}`}
              data-testid="gap-pill"
              onClick={() => onShow(box)}
            >
              {t('office.tools.gap.size', { size: box.sizeText })}
            </button>
          </div>
        );
      })}
    </>
  );
}
