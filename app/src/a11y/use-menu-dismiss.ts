'use client';
// EZD-2004 (audit 2026-11-27 A9; WAI-ARIA APG Menu Button, https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/):
// what a hand-made menu needs to behave like the avatar menu (components/menu/Menu.tsx) without changing its look.
// On open, focus goes to the first item that can be used (the menu itself when none can). Escape closes it and puts
// focus back on its button; a press outside the menu and its button closes it; Tab closes it and lets focus move on.
// Up and down arrows, Home and End move between the items. When an item closes the menu, focus goes back to the button.
import { useEffect, useRef, type RefObject } from 'react';

function itemsOf(menu: HTMLElement | null): HTMLElement[] {
  return menu
    ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(
        (el) => !(el as HTMLButtonElement).disabled,
      )
    : [];
}

export function useMenuDismiss({
  open,
  onClose,
  triggerRef,
  menuRef,
}: {
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  menuRef: RefObject<HTMLElement | null>;
}): void {
  const wasOpen = useRef(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        wasOpen.current = false;
        // The menu is gone: focus that was inside it is now on the page body; put it back on the button.
        const active = document.activeElement;
        if (active === null || active === document.body) triggerRef.current?.focus();
      }
      return;
    }
    wasOpen.current = true;
    const menu = menuRef.current;
    (itemsOf(menu)[0] ?? menu)?.focus();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target === null) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close.current();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const m = menuRef.current;
      if (m === null) return;
      const inside = m.contains(document.activeElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close.current();
        triggerRef.current?.focus();
        return;
      }
      if (!inside) return;
      if (e.key === 'Tab') {
        close.current();
        return;
      }
      const items = itemsOf(m);
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const to =
        e.key === 'ArrowDown'
          ? (at + 1) % items.length
          : e.key === 'ArrowUp'
            ? (at - 1 + items.length) % items.length
            : e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? items.length - 1
                : null;
      if (to === null) return;
      e.preventDefault();
      items[to]?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, menuRef, triggerRef]);
}
