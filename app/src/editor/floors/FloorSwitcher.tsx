'use client';
// EZD-6001 Build step 11 (vault/plans/EZD-6001.md Decided D-Switcher, D-Keys, D-Add, D-Rename, D-Rename-UI,
// D-Delete; section 3; Q-0509; Q-0508; Q-0666; Q-0667; Q-0630 tablet rule): the Floor control at the left end of the
// status bar. Its list shows every floor with the open one marked; choosing one shows that floor. With Edit model the
// list also has Add floor, Rename floor and Delete floor; a view-only user only switches. Styled as the status bar's
// Scale and Snap popovers (PlanStatus.module.css).
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { useConfirm } from '../../components/states/ConfirmProvider';
import { useT } from '../../lib/messages';
import touch from '../../styles/touch.module.css';
import type { ModelStore } from '../model/model-store';
import status from '../status/PlanStatus.module.css';
import { newObjectId } from '../tools/model-changes';
import styles from './FloorSwitcher.module.css';
import {
  addFloorChange,
  deleteFloorChanges,
  listFloors,
  nextFloorOrder,
  renameFloorChange,
  resolveOpenFloor,
  type FloorView,
} from './floors';

export type FloorSwitcherProps = {
  store: ModelStore;
  floors: FloorView;
  canEdit: boolean;
  newId?: () => string;
};

const triggerClass = `${status.trigger} ${styles.trigger} ${touch.hitArea}`;
const itemClass = `${status.option} ${styles.item} ${touch.target}`;

export function FloorSwitcher({
  store,
  floors,
  canEdit,
  newId = newObjectId,
}: FloorSwitcherProps): ReactElement | null {
  const t = useT();
  const confirm = useConfirm();
  const objects = useSyncExternalStore(
    store.subscribe,
    () => store.getState().objects,
    () => store.getState().objects,
  );
  const chosen = useSyncExternalStore(
    floors.subscribe,
    () => floors.getState().chosenId,
    () => floors.getState().chosenId,
  );
  const list = listFloors(objects);
  const openId = resolveOpenFloor(objects, chosen);
  const open = list.find((f) => f.id === openId) ?? null;
  const lastFloor = list.length <= 1;

  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const itemRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [focusTrigger, setFocusTrigger] = useState(0);

  useEffect(() => {
    if (focusTrigger > 0) triggerRef.current?.focus();
  }, [focusTrigger]);

  const menuItems = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);

  // D-Keys: opened on the open floor's option; a press or focus outside closes.
  useEffect(() => {
    if (!expanded) return;
    const items = menuItems();
    (items.find((el) => el.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
    const outside = (target: EventTarget | null) =>
      !(target instanceof Node) || !(itemRef.current?.contains(target) ?? false);
    const onPointerDown = (e: PointerEvent) => {
      if (outside(e.target)) setExpanded(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (outside(e.target)) setExpanded(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [expanded]);

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  const closeToTrigger = () => {
    setExpanded(false);
    setFocusTrigger((n) => n + 1);
  };

  const choose = (id: string) => {
    floors.setOpenFloor(id);
    closeToTrigger();
  };

  const add = () => {
    const now = store.getState().objects;
    const id = newId();
    const name = t('office.floors.default_name', { n: nextFloorOrder(now) });
    store.applyEdit([addFloorChange(now, id, name)]);
    floors.setOpenFloor(id);
    closeToTrigger();
  };

  // The field's blur after Enter or Escape ends nothing more.
  const renamingRef = useRef(false);
  const startRename = () => {
    if (open === null) return;
    setExpanded(false);
    setDraft(open.name);
    renamingRef.current = true;
    setRenaming(true);
  };

  const endRename = (commit: boolean) => {
    if (!renamingRef.current) return;
    renamingRef.current = false;
    setRenaming(false);
    setFocusTrigger((n) => n + 1);
    if (!commit || open === null) return;
    const change = renameFloorChange(store.getState().objects, open.id, draft);
    if (change !== null) store.applyEdit([change]);
  };

  const remove = async () => {
    if (open === null || lastFloor) return;
    const first = deleteFloorChanges(store.getState().objects, open.id);
    if (first === null) return;
    closeToTrigger();
    const count = first.length - 1;
    if (count > 0) {
      const choice = await confirm({
        title: 'office.floors.delete_title',
        message: 'office.floors.delete_message',
        params: { name: open.name, count },
        confirmLabel: 'office.floors.delete_confirm',
        tone: 'danger',
      });
      if (choice !== 'confirm') return;
    }
    // The model may have changed while the question was open; the floor and its objects are read again.
    const changes = deleteFloorChanges(store.getState().objects, open.id);
    if (changes === null) return;
    store.applyEdit(changes);
    floors.setOpenFloor(resolveOpenFloor(store.getState().objects, null));
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setExpanded(true);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') go(at + 1);
    else if (e.key === 'ArrowUp') go(at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape') closeToTrigger();
    else if (e.key === 'Tab') {
      setExpanded(false);
      return;
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  if (open === null) return null;
  const label = t('office.floors.label');

  return (
    <div ref={itemRef} className={status.item} data-status-item="" data-testid="floor-control">
      <span className={status.label} data-status-label="">
        {label}
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          data-testid="floor-name-input"
          aria-label={t('office.floors.name_label')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => endRename(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              endRename(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              endRename(false);
            }
          }}
        />
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={triggerClass}
          data-testid="floor-switcher"
          data-floor-id={open.id}
          aria-label={label}
          title={label}
          aria-haspopup="menu"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={onTriggerKey}
        >
          <span className={`${status.value} ${styles.name}`} data-status-value="">
            {open.name}
          </span>
        </button>
      )}
      {expanded ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          className={status.popover}
          data-testid="floor-list"
          onKeyDown={onMenuKey}
        >
          {list.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={f.id === open.id}
              className={itemClass}
              data-testid="floor-option"
              data-floor-id={f.id}
              onClick={() => choose(f.id)}
            >
              <span className={styles.name}>{f.name}</span>
            </button>
          ))}
          {canEdit ? (
            <div className={styles.actions} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={itemClass}
                data-testid="floor-add"
                onClick={add}
              >
                {t('office.floors.add')}
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={itemClass}
                data-testid="floor-rename"
                onClick={startRename}
              >
                {t('office.floors.rename')}
              </button>
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={itemClass}
                data-testid="floor-delete"
                aria-disabled={lastFloor ? true : undefined}
                aria-describedby={lastFloor ? 'floor-delete-reason' : undefined}
                onClick={() => void remove()}
              >
                {t('office.floors.delete')}
              </button>
              {lastFloor ? (
                <p id="floor-delete-reason" className={styles.reason} data-testid="floor-delete-reason">
                  {t('office.floors.last_floor')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
