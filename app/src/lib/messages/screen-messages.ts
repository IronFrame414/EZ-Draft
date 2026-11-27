// EZD-1995 (AC-EZD-1995-1; audit 2026-11-26 F1; Q-0814): a page sends only its own messages (pageMessages), so a
// lazy screen loads its own with its code: `lazyModule(() => withScreenMessages(import('../lib/messages/screens/
// x.messages'), import('../lazy/x')))`. The slice is a small script file of its own, fetched in parallel with the
// screen's code and kept by the browser and the service worker like any other script. Every English
// MessagesProvider reads the loaded slices on a miss. A failed load of either fails the screen's load, so its Retry
// tries both again.
import type { Message } from './types';

export type ScreenSlice = Readonly<Record<string, Message>>;

let loaded: Record<string, Message> = {};
let version = 0;

/** Adds a screen's messages to the ones every English provider can read. */
export function addScreenMessages(slice: ScreenSlice): void {
  let changed = false;
  for (const key of Object.keys(slice)) {
    if (!Object.hasOwn(loaded, key)) {
      loaded[key] = slice[key];
      changed = true;
    }
  }
  if (changed) version++;
}

/** The screen's code, once its messages have loaded too. */
export function withScreenMessages<T>(
  messages: Promise<{ default: ScreenSlice }>,
  code: Promise<T>,
): Promise<T> {
  return Promise.all([messages, code]).then(([m, c]) => {
    addScreenMessages(m.default);
    return c;
  });
}

/** The messages loaded so far, and a number that changes when more arrive. */
export function screenMessages(): { messages: ScreenSlice; version: number } {
  return { messages: loaded, version };
}

/** Tests only: forgets the loaded messages. */
export function resetScreenMessagesForTest(): void {
  loaded = {};
  version++;
}
