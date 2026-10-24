'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { MessageKey } from '../../server/messages/catalog';
import { createT } from './t';
import type { T } from './t';
import type { Language, Message } from './types';

const MessagesContext = createContext<T<MessageKey> | null>(null);

export function MessagesProvider({
  language,
  messages,
  children,
}: {
  language: Language;
  messages: Readonly<Partial<Record<MessageKey, Message>>>;
  children?: ReactNode;
}) {
  const t = useMemo(
    () => createT(language, messages as Readonly<Record<MessageKey, Message>>),
    [language, messages],
  );
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
