'use client';
// EZD-208b Build step 5 (vault/plans/EZD-208b.md section 3 C1-C3; DB2, DB4, DB8-DB10; S03 Canvas interactions;
// S03dStates, S03dTablet; Q-0633 G9, G13; 11 rule 4): the selection layer over the plan (the one key listener and
// the box `rect`, written from `onBox`, never through React) and the tablet edit bar (Select more, Select all).
import { useEffect, useRef, useSyncExternalStore, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import { useT } from '../../lib/messages';
// EZD-217 Build step 7 (vault/plans/EZD-217.md section 3 B1, B2; Decided "Keys wiring", "Bar", "Bar actions"; Q-0633
// G13): the edit controller takes each key first; editors get Undo, Redo, Delete, Duplicate, Copy and Paste on the bar.
import type { IconName } from '../../components/icon/icon-names.generated';
import type { MessageKey } from '../../server/messages/catalog';
import type { EditController, EditUi } from '../edit/edit-controller';
import type { SelectionBox, SelectionController } from './selection-controller';
import styles from './SelectionLayer.module.css';

type LayerProps = { selection: SelectionController; edit?: EditController | null };

const NO_UI: EditUi = Object.freeze({
  canEdit: false,
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  hasClip: false,
});
const noUi = () => NO_UI;
const noSub = () => () => {};

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

export function EditBar({ selection, edit = null }: LayerProps): ReactElement {
  const t = useT();
  const selectMore = useSyncExternalStore(
    selection.subscribe,
    () => selection.getUi().selectMore,
    () => false,
  );
  const ui = useSyncExternalStore(
    edit ? edit.subscribe : noSub,
    edit ? edit.getUi : noUi,
    edit ? edit.getUi : noUi,
  );
  const command = (
    name: 'undo' | 'redo' | 'delete' | 'duplicate' | 'copy' | 'paste',
    icon: IconName,
    label: MessageKey,
    enabled: boolean,
    run: () => void,
  ) => (
    <button
      type="button"
      data-testid={`edit-${name}`}
      className={styles.button}
      disabled={!enabled}
      onClick={run}
    >
      <Icon name={icon} size={22} />
      <span>{t(label)}</span>
    </button>
  );
  const separator = <span aria-hidden="true" className={styles.separator} />;
  return (
    <>
      <div
        role="toolbar"
        aria-label={t('office.selection.bar')}
        data-testid="edit-bar"
        className={styles.bar}
      >
        {ui.canEdit && edit !== null ? (
          <>
            {command('undo', 'undo', 'office.selection.undo', ui.canUndo, () => edit.undo())}
            {command('redo', 'redo', 'office.selection.redo', ui.canRedo, () => edit.redo())}
            {separator}
            {command('delete', 'delete', 'office.selection.delete', ui.hasSelection, () =>
              edit.deleteSelection(),
            )}
            {command(
              'duplicate',
              'content_copy',
              'office.selection.duplicate',
              ui.hasSelection,
              () => edit.duplicate('center'),
            )}
            {separator}
          </>
        ) : null}
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
        {ui.canEdit && edit !== null ? (
          <>
            {separator}
            {command('copy', 'content_paste_go', 'office.selection.copy', ui.hasSelection, () =>
              edit.copy(),
            )}
            {command('paste', 'content_paste', 'office.selection.paste', ui.hasClip, () =>
              edit.paste('center'),
            )}
          </>
        ) : null}
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
