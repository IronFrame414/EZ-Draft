'use client';
// EZD-2004 (audit 2026-11-27 A28): a dialog or layer drawn where it already sits in the page (no portal, no overlay, so
// it looks as before), built on Radix Dialog as the other dialogs are. While it is open, focus stays inside it (modal),
// Escape closes it, and on close focus goes back to what had it when the dialog opened (Radix sends it to a
// Dialog.Trigger, which these dialogs do not have). A press outside does not close it unless `outsideCloses` is set.
// The screens' own Escape keys skip events from inside it (isInsideInlineDialog), so Escape closes the layer only.
import { Dialog } from 'radix-ui';
import { useState, type ComponentPropsWithoutRef, type ReactElement, type ReactNode } from 'react';

export const INLINE_DIALOG_ATTR = 'data-inline-dialog';

export function isInsideInlineDialog(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(`[${INLINE_DIALOG_ATTR}]`) !== null;
}

type ContentProps = Omit<ComponentPropsWithoutRef<typeof Dialog.Content>, 'children'>;

export function InlineDialog({
  onClose,
  modal = true,
  outsideCloses = false,
  children,
  ...content
}: ContentProps & {
  onClose: () => void;
  modal?: boolean;
  outsideCloses?: boolean;
  children: ReactNode;
}): ReactElement {
  // What had focus when the dialog opened, read before Radix moves focus into it.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null),
  );
  return (
    <Dialog.Root
      open
      modal={modal}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Content
        aria-describedby={undefined}
        aria-modal={modal ? true : undefined}
        {...content}
        {...{ [INLINE_DIALOG_ATTR]: '' }}
        onKeyDown={(e) => {
          content.onKeyDown?.(e);
          // Radix has closed the dialog on this Escape; the page's own Escape keys must not act on it as well.
          if (e.key === 'Escape') e.stopPropagation();
        }}
        onInteractOutside={(e) => {
          content.onInteractOutside?.(e);
          if (!outsideCloses) e.preventDefault();
        }}
        onCloseAutoFocus={(e) => {
          content.onCloseAutoFocus?.(e);
          e.preventDefault();
          if (opener !== null && opener !== document.body && opener.isConnected) opener.focus();
        }}
      >
        {children}
      </Dialog.Content>
    </Dialog.Root>
  );
}
