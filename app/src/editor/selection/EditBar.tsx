'use client';
// EZD-208b Build step 5 (vault/plans/EZD-208b.md section 3 C1-C3; DB2, DB4, DB8-DB10; S03dStates, S03dTablet; Q-0633
// G9, G13): the tablet edit bar (Select more, Select all). EZD-217 Build step 7 (vault/plans/EZD-217.md section 3 B1,
// B2; Decided "Bar", "Bar actions"): editors get Undo, Redo, Delete, Duplicate, Copy and Paste on the bar.
// EZD-233 (11 Budgets editor route): moved out of SelectionLayer.tsx so the editor loads it lazily, on touch screens only.
import { useSyncExternalStore, type ReactElement } from 'react';
import { Icon } from '../../components/icon/Icon';
import type { IconName } from '../../components/icon/icon-names.generated';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import type { EditController, EditUi } from '../edit/edit-controller';
import type { SelectionController } from './selection-controller';
import styles from './SelectionLayer.module.css';

export type EditBarProps = { selection: SelectionController; edit?: EditController | null };

const NO_UI: EditUi = Object.freeze({
  canEdit: false,
  canUndo: false,
  canRedo: false,
  hasSelection: false,
  hasClip: false,
});
const noUi = () => NO_UI;
const noSub = () => () => {};

export function EditBar({ selection, edit = null }: EditBarProps): ReactElement {
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
