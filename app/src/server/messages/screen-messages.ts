// EZD-1995 (AC-EZD-1995-1): a lazy screen's own messages, the English office messages under its prefixes
// (screen-prefixes.ts). Tests and the server use this; in the browser build each
// app/src/lib/messages/screens/<screen>.messages.ts is replaced by the slice itself.
import type { Message } from '../../lib/messages/types';
import { catalogFor } from './catalog';
import { SCREEN_MESSAGES } from './screen-prefixes';
import type { MessageScreen } from './screen-prefixes';

export { SCREEN_MESSAGES } from './screen-prefixes';
export type { MessageScreen } from './screen-prefixes';

export function screenSlice(screen: MessageScreen): Readonly<Record<string, Message>> {
  const prefixes: readonly string[] = SCREEN_MESSAGES[screen];
  const all: Readonly<Record<string, Message | undefined>> = catalogFor('office', 'en');
  const out: Record<string, Message> = {};
  for (const key of Object.keys(all)) {
    const value = all[key];
    if (value !== undefined && prefixes.some((p) => key.startsWith(p))) out[key] = value;
  }
  return Object.freeze(out);
}
