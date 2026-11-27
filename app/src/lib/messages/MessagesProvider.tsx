'use client';

// EZD-1995 (AC-EZD-1995-1): an English provider also reads the messages lazy screens have loaded with their code
// (screen-messages.ts), so a page that sent only its own messages can show a screen's. The lookup happens on each
// call, so messages arriving re-render nothing (11 rule 4: no React commit during a pan).
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { MessageKey } from '../../server/messages/catalog';
import { screenMessages } from './screen-messages';
import { createT } from './t';
import type { T } from './t';
import type { Language, Message, MessageParams } from './types';

const MessagesContext = createContext<T<MessageKey> | null>(null);

/** The page's messages first, then (English only) the messages lazy screens have loaded. */
export function withScreenSlices(
  language: Language,
  messages: Readonly<Partial<Record<MessageKey, Message>>>,
): T<MessageKey> {
  const own = createT(language, messages as Readonly<Record<MessageKey, Message>>);
  if (language !== 'en') return own;
  let more: { version: number; t: T<MessageKey> } | null = null;
  const moreT = (): T<MessageKey> => {
    const now = screenMessages();
    if (more === null || more.version !== now.version) {
      more = {
        version: now.version,
        t: createT(language, now.messages as Readonly<Record<MessageKey, Message>>),
      };
    }
    return more.t;
  };
  const t = (key: MessageKey, params?: MessageParams): string => {
    if (own.has(key)) return own(key, params);
    const screens = moreT();
    return (screens.has(key) ? screens : own)(key, params);
  };
  const has = (key: string): key is MessageKey => own.has(key) || moreT().has(key);
  return Object.assign(t, { has, language }) as T<MessageKey>;
}

export function MessagesProvider({
  language,
  messages,
  children,
}: {
  language: Language;
  messages: Readonly<Partial<Record<MessageKey, Message>>>;
  children?: ReactNode;
}) {
  const t = useMemo(() => withScreenSlices(language, messages), [language, messages]);
  return (
    <MessagesContext.Provider value={t}>
      <div lang={language} style={{ display: 'contents' }}>
        {children}
      </div>
    </MessagesContext.Provider>
  );
}

export function useT(): T<MessageKey> {
  const t = useContext(MessagesContext);
  if (!t) throw new Error('useT must be used inside a MessagesProvider');
  return t;
}
