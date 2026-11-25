'use client';
// EZD-602 (S06 Controls "Canvas right-click | Canvas | Context menu: assign to circuit, set GFCI/AFCI, delete. | Edit
// model."; phase-06 EZD-602 "right-click (assign circuit, GFCI/AFCI, delete)"; vault/build/assumptions.md EZD-602
// "Right-click opens the EZD-233 context menu, with its long-press form"): the context menu over a device in
// electrical mode, in the EZD-233 menu's look. Assign to circuit and Set GFCI/AFCI open their choices in place. It
// acts on the selected devices; each command is one edit (one undo step).
import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { Point } from '@ezdraft/geometry';
import { useT } from '../../lib/messages';
import type { MessageKey } from '../../server/messages/catalog';
import styles from './DeviceMenu.module.css';
import type { ModelStore } from '../model/model-store';
import type { Change } from '../model/patches';
import {
  assignCircuitChanges,
  deleteDeviceChanges,
  protectionChanges,
  selectedDevices,
} from './device-toolbar';
import { PROTECTION_CHOICES } from './DeviceToolbar';
import { circuitRows, panelRows } from './electrical';

export type DeviceMenuRequest = { at: Point; ids: readonly string[] };

export type DeviceMenuProps = {
  request: DeviceMenuRequest;
  store: Pick<ModelStore, 'getState' | 'applyEdit'>;
  onClose: () => void;
  onMessage: (key: MessageKey) => void;
};

export function DeviceMenu({ request, store, onClose, onMessage }: DeviceMenuProps): ReactElement {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<'circuit' | 'protection' | null>(null);
  const objects = store.getState().objects;
  const ids = selectedDevices(objects, request.ids);
  const circuits = panelRows(objects).flatMap((p) =>
    circuitRows(objects, p.id).map((c) => ({ ...c, panel: p.name })),
  );
  const manyPanels = panelRows(objects).length > 1;

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }, []);

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

  const run = (make: () => Change[] | null) => {
    onClose();
    const changes = make();
    if (changes === null) onMessage('office.electrical.menu.failed');
    else store.applyEdit(changes);
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
    label: string,
    onSelect: () => void,
    extra: { sub?: boolean; expanded?: boolean; enabled?: boolean } = {},
  ) => (
    <button
      key={id}
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-testid={`menu-${id}`}
      className={extra.sub === true ? `${styles.item} ${styles.sub}` : styles.item}
      disabled={extra.enabled === false}
      aria-expanded={extra.expanded}
      onClick={onSelect}
    >
      <span>{label}</span>
      {extra.expanded !== undefined ? (
        <span aria-hidden="true">{extra.expanded ? '▾' : '▸'}</span>
      ) : null}
    </button>
  );

  const some = ids.length > 0;
  const circuitItems =
    open === 'circuit'
      ? [
          item(
            'circuit-none',
            t('office.electrical.device.no_circuit'),
            () => run(() => assignCircuitChanges(objects, ids, null)),
            { sub: true },
          ),
          ...circuits.map((c) =>
            item(
              `circuit-${c.number}`,
              [
                manyPanels ? c.panel : null,
                t('office.electrical.device.circuit', { number: c.number }),
                c.name === '' ? null : c.name,
              ]
                .filter((x) => x !== null)
                .join(' · '),
              () => run(() => assignCircuitChanges(objects, ids, c.id)),
              { sub: true },
            ),
          ),
        ]
      : [];
  const protectionItems =
    open === 'protection'
      ? PROTECTION_CHOICES.map((p) =>
          item(
            `protection-${p.value ?? 'none'}`,
            t(p.key),
            () => run(() => protectionChanges(objects, ids, p.value)),
            { sub: true },
          ),
        )
      : [];

  const style = {
    left: Math.max(8, Math.min(request.at.x, window.innerWidth - 220)),
    top: Math.max(8, Math.min(request.at.y, window.innerHeight - 360)),
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={t('office.edit.menu')}
      data-testid="device-menu"
      className={styles.menu}
      style={style}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {item(
        'assign-circuit',
        t('office.electrical.menu.assign'),
        () => setOpen(open === 'circuit' ? null : 'circuit'),
        { expanded: open === 'circuit', enabled: some },
      )}
      {circuitItems}
      {item(
        'set-protection',
        t('office.electrical.menu.protection'),
        () => setOpen(open === 'protection' ? null : 'protection'),
        { expanded: open === 'protection', enabled: some },
      )}
      {protectionItems}
      <div className={styles.separator} role="separator" />
      {item(
        'delete',
        t('office.electrical.menu.delete'),
        () => run(() => deleteDeviceChanges(objects, ids)),
        { enabled: some },
      )}
    </div>,
    document.body,
  );
}
