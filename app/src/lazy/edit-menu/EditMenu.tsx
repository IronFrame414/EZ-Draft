'use client';
// EZD-233 (S03 Canvas interactions "Right-click / long-press: Context menu: Copy, Paste, Duplicate, Mirror, Align,
// Group, Save as group, Set status (Existing / Demo / New), Delete"; S03 Inspector "More (…): Menu: Copy, Mirror,
// Align, Group, Save as group, Delete"; S03 Decisions "Save as group is in the context menu and More"; Q-0630 "More
// waits for EZD-233"; Q-0664 Set status in the context menu; vault/build/assumptions.md EZD-233): the context menu, the
// inspector More menu and the Save as group dialog. Align and Set status open their choices in place. Every command is
// one edit (one undo step).
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { ObjectStatus, Point } from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import {
  ALIGN_EDGES,
  alignChanges,
  groupChanges,
  mirrorChanges,
  savedGroupPayload,
  statusChanges,
  ungroupChanges,
  type AlignEdge,
  type SavedGroupPayload,
} from '../../editor/edit/arrange-changes';
import type { EditController } from '../../editor/edit/edit-controller';
import type { ModelStore } from '../../editor/model/model-store';
import { openFloorId } from '../../editor/plan/batches';
import { inAnyGroup } from '../../editor/selection/groups';
import type { SelectionController } from '../../editor/selection/selection-controller';
import styles from './EditMenu.module.css';

export type EditMenuRequest = { kind: 'canvas' | 'more'; at: Point };

export type EditMenusProps = {
  request: EditMenuRequest | null;
  edit: EditController;
  selection: Pick<SelectionController, 'getUi'>;
  store: Pick<ModelStore, 'getState'>;
  onClose: () => void;
  onMessage: (key: MessageKey) => void;
  // Tests pass their own; the page uses fetch.
  saveGroup?: (name: string, payload: SavedGroupPayload) => Promise<SaveResult>;
};

export type SaveResult = { ok: true } | { ok: false; messageKey: MessageKey };

const STATUSES: readonly ObjectStatus[] = ['existing', 'demo', 'new'];
const NAME_CODES = new Set(['library_name_required', 'library_name_too_long']);

export async function postSavedGroup(
  name: string,
  payload: SavedGroupPayload,
): Promise<SaveResult> {
  try {
    const res = await fetch('/api/saved-groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, data: payload }),
    });
    if (res.status === 201) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    const code = body?.error?.code;
    return {
      ok: false,
      messageKey:
        code !== undefined && NAME_CODES.has(code)
          ? (`error.${code}` as MessageKey)
          : 'office.saved_groups.save_failed',
    };
  } catch {
    return { ok: false, messageKey: 'office.saved_groups.save_failed' };
  }
}

export function EditMenus(props: EditMenusProps): ReactElement | null {
  const { request, store, selection, onClose, onMessage } = props;
  const [dialog, setDialog] = useState<SavedGroupPayload | null>(null);
  const openSave = () => {
    const objects = store.getState().objects;
    const level = openFloorId(objects);
    const payload =
      level === null ? null : savedGroupPayload({ objects, level, ids: selection.getUi().ids });
    onClose();
    if (payload === null) onMessage('office.saved_groups.nothing');
    else setDialog(payload);
  };
  return (
    <>
      {request !== null ? <EditMenu {...props} request={request} onSaveGroup={openSave} /> : null}
      {dialog !== null ? (
        <SaveGroupDialog
          payload={dialog}
          save={props.saveGroup ?? postSavedGroup}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onMessage('office.saved_groups.saved');
          }}
        />
      ) : null}
    </>
  );
}

function EditMenu({
  request,
  edit,
  selection,
  store,
  onClose,
  onMessage,
  onSaveGroup,
}: EditMenusProps & { request: EditMenuRequest; onSaveGroup: () => void }): ReactElement {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<'align' | 'status' | null>(null);
  const ids = selection.getUi().ids;
  const ui = edit.getUi();
  const some = ids.length > 0;
  const many = ids.length > 1;
  const grouped = inAnyGroup(store.getState().objects, ids);
  const canvas = request.kind === 'canvas';

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, []);

  // A press outside the menu closes it; so does a resize.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || ref.current?.contains(e.target) !== true) onClose();
    };
    const onResize = () => onClose();
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onResize);
    };
  }, [onClose]);

  const done = (run: () => MessageKey | null | void) => {
    onClose();
    const key = run();
    if (typeof key === 'string') onMessage(key);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const item = (
    id: string,
    label: MessageKey,
    enabled: boolean,
    onSelect: () => void,
    extra: { sub?: boolean; expanded?: boolean } = {},
  ) => (
    <button
      key={id}
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-testid={`menu-${id}`}
      className={extra.sub === true ? `${styles.item} ${styles.sub}` : styles.item}
      disabled={!enabled}
      aria-expanded={extra.expanded}
      onClick={onSelect}
    >
      <span>{t(label)}</span>
      {extra.expanded !== undefined ? (
        <span aria-hidden="true">{extra.expanded ? '▾' : '▸'}</span>
      ) : null}
    </button>
  );
  const separator = (key: string) => (
    <div key={key} className={styles.separator} role="separator" />
  );

  const alignItems =
    open === 'align'
      ? ALIGN_EDGES.map((edge: AlignEdge) =>
          item(
            `align-${edge}`,
            `office.edit.align.${edge}` as MessageKey,
            true,
            () => done(() => edit.run((c) => alignChanges(c, edge))),
            { sub: true },
          ),
        )
      : [];
  const statusItems =
    open === 'status'
      ? STATUSES.map((s) =>
          item(
            `status-${s}`,
            `office.edit.status.${s}` as MessageKey,
            true,
            () => done(() => edit.run((c) => statusChanges(c, s))),
            { sub: true },
          ),
        )
      : [];

  // A menu near the right or bottom edge opens back toward the middle.
  const style = {
    left: Math.max(8, Math.min(request.at.x, window.innerWidth - 220)),
    top: Math.max(8, Math.min(request.at.y, window.innerHeight - 360)),
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={t('office.edit.menu')}
      data-testid={canvas ? 'context-menu' : 'more-menu'}
      className={styles.menu}
      style={style}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {item('copy', 'office.selection.copy', some, () => done(() => edit.copy()))}
      {canvas
        ? [
            item('paste', 'office.selection.paste', ui.hasClip, () =>
              done(() => edit.paste('cursor')),
            ),
            item('duplicate', 'office.selection.duplicate', some, () =>
              done(() => edit.duplicate('center')),
            ),
          ]
        : null}
      {separator('s1')}
      {item('mirror', 'office.edit.mirror', some, () => done(() => edit.run(mirrorChanges)))}
      {item('align', 'office.edit.align', many, () => setOpen(open === 'align' ? null : 'align'), {
        expanded: open === 'align',
      })}
      {alignItems}
      {grouped
        ? item('ungroup', 'office.edit.ungroup', true, () => done(() => edit.run(ungroupChanges)))
        : item('group', 'office.edit.group', many, () => done(() => edit.run(groupChanges)))}
      {item('save-group', 'office.edit.save_group', some, onSaveGroup)}
      {canvas
        ? [
            item(
              'status',
              'office.edit.set_status',
              some,
              () => setOpen(open === 'status' ? null : 'status'),
              { expanded: open === 'status' },
            ),
            ...statusItems,
          ]
        : null}
      {separator('s2')}
      {item('delete', 'office.selection.delete', some, () => done(() => edit.deleteSelection()))}
    </div>,
    document.body,
  );
}

function SaveGroupDialog({
  payload,
  save,
  onClose,
  onSaved,
}: {
  payload: SavedGroupPayload;
  save: (name: string, payload: SavedGroupPayload) => Promise<SaveResult>;
  onClose: () => void;
  onSaved: () => void;
}): ReactElement {
  const t = useT();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await save(name, payload);
    setBusy(false);
    if (r.ok) onSaved();
    else setError(r.messageKey);
  };
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-group-title"
      data-testid="save-group-dialog"
      className={styles.dialog}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <h2 id="save-group-title" className={styles.heading}>
        {t('office.saved_groups.dialog_title')}
      </h2>
      <form
        className={styles.field}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className={styles.field}>
          <span className={styles.label}>{t('office.saved_groups.name')}</span>
          <input
            className={styles.input}
            data-testid="save-group-name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {error !== null ? (
          <p className={styles.error} role="alert" data-testid="save-group-error">
            {t(error)}
          </p>
        ) : null}
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onClose}>
            {t('office.saved_groups.cancel')}
          </button>
          <button
            type="submit"
            className={styles.primary}
            data-testid="save-group-save"
            disabled={busy}
          >
            {t('office.saved_groups.save')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
