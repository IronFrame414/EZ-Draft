// Confirm controller: plain module, no React (vault/plans/EZD-015b.md Step 6).
import type { MessageKey } from '../../server/messages/catalog';
import type { MessageParams } from '../../lib/messages';

export type ConfirmChoice = 'confirm' | 'cancel';
export type ConfirmTone = 'primary' | 'danger';
export type ConfirmOptions = {
  title: MessageKey;
  message?: MessageKey;
  params?: MessageParams;
  confirmLabel: MessageKey;
  cancelLabel?: MessageKey;
  tone?: ConfirmTone;
};
export type ConfirmRequest = {
  id: number;
  title: MessageKey;
  message: MessageKey | null;
  params?: MessageParams;
  confirmLabel: MessageKey;
  cancelLabel: MessageKey;
  tone: ConfirmTone;
};
export type ConfirmController = {
  open(o: ConfirmOptions): Promise<ConfirmChoice>;
  choose(choice: ConfirmChoice): void;
  subscribe(onChange: () => void): () => void;
  getSnapshot(): ConfirmRequest | null;
};

export function createConfirmController(): ConfirmController {
  let current: ConfirmRequest | null = null;
  let resolveCurrent: ((choice: ConfirmChoice) => void) | null = null;
  let counter = 0;
  const listeners = new Set<() => void>();

  function notify() {
    for (const l of [...listeners]) l();
  }

  function choose(choice: ConfirmChoice) {
    if (!current) return;
    const resolve = resolveCurrent;
    current = null;
    resolveCurrent = null;
    notify();
    resolve?.(choice);
  }

  function open(o: ConfirmOptions): Promise<ConfirmChoice> {
    if (current && resolveCurrent) {
      resolveCurrent('cancel');
    }
    counter += 1;
    const request: ConfirmRequest = Object.freeze({
      id: counter,
      title: o.title,
      message: o.message ?? null,
      ...(o.params ? { params: o.params } : {}),
      confirmLabel: o.confirmLabel,
      cancelLabel: o.cancelLabel ?? 'common.cancel',
      tone: o.tone ?? 'primary',
    });
    const promise = new Promise<ConfirmChoice>((resolve) => {
      resolveCurrent = resolve;
    });
    current = request;
    notify();
    return promise;
  }

  return {
    open,
    choose,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    getSnapshot: () => current,
  };
}
