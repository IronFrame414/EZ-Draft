'use client';
// EZD-108 Step 12a (vault/plans/EZD-108.md Decided "Menu primitive"; WAI-ARIA APG Menu Button,
// https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/): a small non-modal menu button for the office,
// field-pack and client-link entries, written by hand because Radix DropdownMenu does not fit the 200 KB
// budget (11 Budgets). Closed, only the trigger renders; open, the menu is portalled into document.body,
// fixed below the anchor (the trigger's closest `anchorSelector` match, else the trigger), right edges
// lined up. No typeahead, no submenus.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type MenuProps = {
  label: string;
  trigger: ReactNode;
  triggerClassName: string;
  triggerTestId: string;
  contentClassName: string;
  contentTestId: string;
  sideOffset?: number;
  anchorSelector?: string;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

type Focus = 'first' | 'last';
type Place = { top: number; right: number };

const MenuContext = createContext<((onSelect: () => void) => void) | null>(null);

function itemsOf(menu: HTMLElement | null): HTMLElement[] {
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}

export function Menu({
  label,
  trigger,
  triggerClassName,
  triggerTestId,
  contentClassName,
  contentTestId,
  sideOffset = 8,
  anchorSelector,
  onOpenChange,
  children,
}: MenuProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [focus, setFocus] = useState<Focus>('first');
  const open = place !== null;

  const show = (to: Focus) => {
    const button = triggerRef.current;
    if (!button) return;
    const anchor = (anchorSelector === undefined ? null : button.closest(anchorSelector)) ?? button;
    const rect = anchor.getBoundingClientRect();
    setFocus(to);
    setPlace({
      top: rect.bottom + sideOffset,
      right: document.documentElement.clientWidth - rect.right,
    });
    onOpenChange?.(true);
  };

  const close = useCallback(
    (refocus: boolean) => {
      setPlace(null);
      onOpenChange?.(false);
      if (refocus) triggerRef.current?.focus();
    },
    [onOpenChange],
  );

  const select = useCallback(
    (onSelect: () => void) => {
      close(true);
      onSelect();
    },
    [close],
  );

  // Focus the first or last item once the menu is in the page.
  useEffect(() => {
    if (!open) return;
    const items = itemsOf(menuRef.current);
    (focus === 'first' ? items[0] : items[items.length - 1])?.focus();
  }, [open, focus]);

  // A press or focus outside the trigger and the menu closes it; so does a window resize.
  useEffect(() => {
    if (!open) return;
    const inside = (target: EventTarget | null) =>
      target instanceof Node &&
      (triggerRef.current?.contains(target) === true || menuRef.current?.contains(target) === true);
    const onPointerDown = (e: PointerEvent) => {
      if (!inside(e.target)) close(false);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (!inside(e.target)) close(false);
    };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('focusin', onFocusIn);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('focusin', onFocusIn);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      show('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      show('last');
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = itemsOf(menuRef.current);
    const at = items.indexOf(document.activeElement as HTMLElement);
    const move = (i: number) => {
      e.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(at + 1);
    else if (e.key === 'ArrowUp') move(at < 0 ? items.length - 1 : at - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(items.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      // The browser default then moves focus on from the trigger.
      close(true);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={label}
        data-state={open ? 'open' : 'closed'}
        data-testid={triggerTestId}
        className={triggerClassName}
        onClick={() => (open ? close(false) : show('first'))}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>
      {place === null
        ? null
        : createPortal(
            <MenuContext.Provider value={select}>
              <div
                ref={menuRef}
                id={id}
                role="menu"
                aria-label={label}
                data-testid={contentTestId}
                className={contentClassName}
                style={{ position: 'fixed', top: place.top, right: place.right }}
                onKeyDown={onMenuKeyDown}
              >
                {children}
              </div>
            </MenuContext.Provider>,
            document.body,
          )}
    </>
  );
}

export function MenuItem({
  onSelect,
  className,
  testId,
  children,
}: {
  onSelect: () => void;
  className?: string;
  testId: string;
  children: ReactNode;
}) {
  const select = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      data-testid={testId}
      className={className}
      onClick={() => select?.(onSelect)}
    >
      {children}
    </button>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={className} />;
}
