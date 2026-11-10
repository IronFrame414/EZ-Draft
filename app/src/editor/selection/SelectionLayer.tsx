'use client';
// EZD-208b Build step 5 (vault/plans/EZD-208b.md section 3 C1-C3; DB2, DB4, DB8-DB10; S03 Canvas interactions;
// S03dStates, S03dTablet; Q-0633 G9, G13; 11 rule 4): the selection layer over the plan (the one key listener and
// the box `rect`, written from `onBox`, never through React) and the tablet edit bar (Select more, Select all).
import { useEffect, useRef, useSyncExternalStore, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
import type { SelectionBox, SelectionController } from './selection-controller';
import styles from './SelectionLayer.module.css';

export function SelectionLayer({ selection }: { selection: SelectionController }): ReactElement {
  const boxRef = useRef<SVGRectElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selection.keyDown(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

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

export function EditBar({ selection }: { selection: SelectionController }): ReactElement {
  const t = useT();
  const selectMore = useSyncExternalStore(
    selection.subscribe,
    () => selection.getUi().selectMore,
    () => false,
  );
  return (
    <>
      <div
        role="toolbar"
        aria-label={t('office.selection.bar')}
        data-testid="edit-bar"
        className={styles.bar}
      >
        <button
          type="button"
          data-testid="select-more"
          aria-pressed={selectMore}
          className={styles.button}
          onClick={() => selection.setSelectMore(!selectMore)}
        >
          <Icon name="library_add_check" size={22} />
          <span>{t('office.selection.select_more')}</span>
        </button>
        <button
          type="button"
          data-testid="select-all"
          className={styles.button}
          onClick={() => selection.selectAll()}
        >
          <Icon name="select_all" size={22} />
          <span>{t('office.selection.select_all')}</span>
        </button>
      </div>
      {selectMore ? (
        <div className={styles.banner} data-testid="select-more-banner">
          <span>{t('office.selection.more_banner')}</span>
          <button
            type="button"
            className={styles.done}
            data-testid="select-more-done"
            onClick={() => selection.setSelectMore(false)}
          >
            {t('office.selection.done')}
          </button>
        </div>
      ) : null}
    </>
  );
}
