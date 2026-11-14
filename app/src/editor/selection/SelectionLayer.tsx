'use client';
// EZD-208b Build step 5 (vault/plans/EZD-208b.md section 3 C1-C3; DB2, DB4, DB8-DB10; S03 Canvas interactions;
// S03dStates, S03dTablet; Q-0633 G9, G13; 11 rule 4): the selection layer over the plan (the one key listener and
// the box `rect`, written from `onBox`, never through React).
// EZD-217 Build step 7 (vault/plans/EZD-217.md section 3 B1; Decided "Keys wiring"): the edit controller takes each
// key first. EZD-233: the tablet edit bar is in EditBar.tsx, loaded lazily.
import { useEffect, useRef, type ReactElement } from 'react';
import type { EditController } from '../edit/edit-controller';
import type { SelectionBox, SelectionController } from './selection-controller';
import styles from './SelectionLayer.module.css';

type LayerProps = { selection: SelectionController; edit?: EditController | null };

export function SelectionLayer({ selection, edit = null }: LayerProps): ReactElement {
  const boxRef = useRef<SVGRectElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (edit?.keyDown(e)) {
        e.preventDefault();
        return;
      }
      if (selection.keyDown(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, edit]);

  useEffect(() => {
    const rect = boxRef.current;
    if (rect === null) return;
    const draw = (box: SelectionBox | null) => {
      if (box === null) {
        rect.setAttribute('display', 'none');
        rect.removeAttribute('data-box-mode');
        return;
      }
      rect.setAttribute('x', String(Math.min(box.from.x, box.to.x)));
      rect.setAttribute('y', String(Math.min(box.from.y, box.to.y)));
      rect.setAttribute('width', String(Math.abs(box.to.x - box.from.x)));
      rect.setAttribute('height', String(Math.abs(box.to.y - box.from.y)));
      rect.setAttribute('data-box-mode', box.mode);
      rect.removeAttribute('display');
    };
    draw(selection.getBox());
    return selection.onBox(draw);
  }, [selection]);

  return (
    <div className={styles.layer} data-testid="selection-layer">
      <svg className={styles.overlay} aria-hidden="true">
        <rect ref={boxRef} className={styles.box} data-testid="selection-box" display="none" />
      </svg>
    </div>
  );
}
